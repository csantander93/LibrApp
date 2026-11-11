"""
Respaldo de la base a Google Drive + descarga manual.

Adapta la lógica de Operix (`superadmin/backup.py` + `get_gdrive_token.py`) al
caso de LibrApp, con dos diferencias:

  * El admin conecta su Drive desde la UI (flujo OAuth): el refresh token y la
    carpeta quedan en la tabla `backup_config` (no en variables de entorno). El
    *cliente* OAuth de la app (client_id/secret) sí va por entorno.
  * Las imágenes de LibrApp viven en la propia DB (columnas BYTEA), así que un
    `pg_dump` ya incluye TODO: no hay carpeta de uploads que empaquetar.

Un dump completo (`pg_dump --clean --if-exists --no-owner --no-privileges`) se
comprime a .sql.gz y se sube a la carpeta "LibrApp Backups" con el protocolo
*resumable* de Drive v3. Al terminar se podan los backups que excedan la
retención. Scope `drive.file` (mínimo): la app solo ve/gestiona lo que ella sube.
"""
import gzip
import logging
import os
import shutil
import subprocess
import tempfile
import urllib.parse
from datetime import datetime, timezone

import httpx
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import _normalize_db_url

logger = logging.getLogger("librapp.backup")

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_ABOUT_URL = "https://www.googleapis.com/drive/v3/about"
_SCOPE = "https://www.googleapis.com/auth/drive.file"
_NOMBRE_CARPETA = "LibrApp Backups"
# Prefijo de los archivos de backup en Drive. Se usa para listarlos al podar,
# sin tocar ningún otro archivo que pudiera estar en la carpeta.
_PREFIJO = "librapp_backup_"


class BackupError(RuntimeError):
    """Error de negocio del backup (configuración/Drive/pg_dump). El router lo
    traduce a una respuesta con mensaje en español."""


# ─── Dump de la base (pg_dump) ────────────────────────────────────────────────

def _exportar_dump(ts: str) -> str:
    """
    Genera un dump SQL COMPLETO de la base con `pg_dump` en un archivo temporal y
    devuelve su ruta. Incluye las imágenes (están en columnas BYTEA de la DB).

    Usa `--clean --if-exists --no-owner --no-privileges` para que el restore entre
    limpio en cualquier base. La contraseña va por PGPASSWORD (env), nunca en los
    argumentos (no se filtra en el listado de procesos).
    """
    url = make_url(_normalize_db_url(get_settings().DATABASE_URL))

    env = {**os.environ}
    if url.password:
        env["PGPASSWORD"] = url.password

    fd, ruta = tempfile.mkstemp(prefix="librapp_dump_", suffix=".sql")
    os.close(fd)

    cmd = [
        "pg_dump",
        "-h", url.host or "localhost",
        "-p", str(url.port or 5432),
        "-U", url.username or "postgres",
        "-d", url.database or "",
        "--no-owner", "--no-privileges",
        "--clean", "--if-exists",
        "-f", ruta,
    ]
    try:
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        _borrar_silencioso(ruta)
        raise BackupError(
            "pg_dump no está disponible en el servidor. Reconstruí la imagen del "
            "backend (debe incluir postgresql-client) y reintentá."
        )
    except subprocess.TimeoutExpired:
        _borrar_silencioso(ruta)
        raise BackupError("El export de la base tardó demasiado y se canceló.")

    if proc.returncode != 0:
        _borrar_silencioso(ruta)
        raise BackupError(f"pg_dump falló: {(proc.stderr or '').strip()[:500]}")

    return ruta


def _gzip(origen: str, destino: str) -> int:
    """Comprime el .sql a .sql.gz (el dump SQL es muy compresible) y devuelve el
    tamaño resultante en bytes."""
    with open(origen, "rb") as fi, gzip.open(destino, "wb", compresslevel=6) as fo:
        shutil.copyfileobj(fi, fo)
    return os.path.getsize(destino)


def _borrar_silencioso(ruta: str) -> None:
    try:
        os.unlink(ruta)
    except OSError:
        pass


def generar_dump_descarga() -> tuple[str, str]:
    """
    Dump + gzip a un temporal para la descarga manual. Devuelve (ruta_gz, nombre).
    El router lo transmite con FileResponse y lo borra con un BackgroundTask.
    """
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    ruta_sql = _exportar_dump(ts)
    ruta_gz = ruta_sql + ".gz"
    try:
        _gzip(ruta_sql, ruta_gz)
    finally:
        _borrar_silencioso(ruta_sql)
    return ruta_gz, f"{_PREFIJO}{ts}.sql.gz"


# ─── OAuth (conectar el Drive del usuario desde la UI) ────────────────────────

def construir_url_consentimiento(state: str) -> str:
    """URL del consentimiento de Google. `state` es un token firmado (CSRF) que el
    callback valida. `access_type=offline` + `prompt=consent` fuerzan el refresh
    token aunque el usuario ya haya autorizado antes."""
    s = get_settings()
    if not s.gdrive_configurado:
        raise BackupError(
            "Falta configurar el cliente OAuth de Google (GDRIVE_CLIENT_ID / "
            "GDRIVE_CLIENT_SECRET) en el servidor."
        )
    params = {
        "client_id": s.GDRIVE_CLIENT_ID,
        "redirect_uri": s.BACKUP_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return _AUTH_URL + "?" + urllib.parse.urlencode(params)


def canjear_codigo(code: str) -> tuple[str, str, str | None]:
    """
    Intercambia el code del callback por tokens, asegura la carpeta "LibrApp
    Backups" en el Drive del usuario y lee el email de la cuenta.
    Devuelve (refresh_token, folder_id, email).
    """
    s = get_settings()
    resp = httpx.post(_TOKEN_URL, data={
        "code": code,
        "client_id": s.GDRIVE_CLIENT_ID,
        "client_secret": s.GDRIVE_CLIENT_SECRET,
        "redirect_uri": s.BACKUP_OAUTH_REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=60)
    if resp.status_code != 200:
        raise BackupError(f"Google rechazó el código: {resp.status_code} {resp.text[:300]}")
    tokens = resp.json()
    refresh_token = tokens.get("refresh_token")
    access_token = tokens.get("access_token")
    if not refresh_token:
        raise BackupError(
            "Google no devolvió un refresh token. Revocá el acceso previo en "
            "myaccount.google.com/permissions y reintentá."
        )

    folder_id = _asegurar_carpeta(access_token)
    email = _email_cuenta(access_token)
    return refresh_token, folder_id, email


def _asegurar_carpeta(access_token: str) -> str:
    """Busca la carpeta "LibrApp Backups" (que la app haya creado) y la reutiliza;
    si no existe, la crea. Con scope drive.file solo ve lo que ella misma creó."""
    headers = {"Authorization": f"Bearer {access_token}"}
    q = (
        f"name = '{_NOMBRE_CARPETA}' and "
        "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    r = httpx.get(_FILES_URL, params={"q": q, "fields": "files(id)", "pageSize": 1},
                  headers=headers, timeout=60)
    if r.status_code == 200 and r.json().get("files"):
        return r.json()["files"][0]["id"]

    cf = httpx.post(_FILES_URL, headers={**headers, "Content-Type": "application/json"},
                    json={"name": _NOMBRE_CARPETA,
                          "mimeType": "application/vnd.google-apps.folder"},
                    params={"fields": "id"}, timeout=60)
    if cf.status_code not in (200, 201):
        raise BackupError(f"No se pudo crear la carpeta en Drive: {cf.status_code} {cf.text[:300]}")
    return cf.json()["id"]


def _email_cuenta(access_token: str) -> str | None:
    """Email de la cuenta conectada (para mostrar "Conectado como…"). `about.get`
    funciona con scope drive.file. Si falla, no es crítico: devuelve None."""
    try:
        r = httpx.get(_ABOUT_URL, params={"fields": "user(emailAddress)"},
                      headers={"Authorization": f"Bearer {access_token}"}, timeout=30)
        if r.status_code == 200:
            return r.json().get("user", {}).get("emailAddress")
    except httpx.HTTPError:
        pass
    return None


# ─── Subida a Drive ───────────────────────────────────────────────────────────

def _access_token(refresh_token: str) -> str:
    """Canjea el refresh token (guardado en la DB) por un access token efímero."""
    s = get_settings()
    resp = httpx.post(_TOKEN_URL, data={
        "client_id": s.GDRIVE_CLIENT_ID,
        "client_secret": s.GDRIVE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=30)
    if resp.status_code != 200:
        raise BackupError(
            f"No se pudo renovar el acceso a Google Drive ({resp.status_code}). "
            "Puede que la conexión haya sido revocada; reconectá tu Drive."
        )
    return resp.json()["access_token"]


def _subir(token: str, ruta: str, nombre: str, folder_id: str) -> str:
    """Sube el archivo con el protocolo *resumable* de Drive (dos requests: una
    crea la sesión con la metadata, otra manda los bytes)."""
    init = httpx.post(
        _UPLOAD_URL,
        params={"uploadType": "resumable", "fields": "id"},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "application/gzip",
        },
        json={"name": nombre, "parents": [folder_id]},
        timeout=60,
    )
    if init.status_code not in (200, 201):
        raise BackupError(f"Drive rechazó el inicio de la subida ({init.status_code}): {init.text[:300]}")
    session_uri = init.headers["Location"]

    with open(ruta, "rb") as f:
        contenido = f.read()
    up = httpx.put(session_uri, content=contenido,
                   headers={"Content-Type": "application/gzip"}, timeout=600)
    if up.status_code not in (200, 201):
        raise BackupError(f"Falló la subida del contenido a Drive ({up.status_code}): {up.text[:300]}")
    return up.json()["id"]


def _podar(token: str, folder_id: str, retencion: int) -> int:
    """Borra los backups que excedan `retencion` (mantiene los N más nuevos).
    retencion <= 0 desactiva la poda."""
    if retencion <= 0:
        return 0
    q = f"'{folder_id}' in parents and name contains '{_PREFIJO}' and trashed = false"
    resp = httpx.get(_FILES_URL, params={
        "q": q,
        "fields": "files(id,name,createdTime)",
        "orderBy": "createdTime desc",
        "pageSize": 1000,
    }, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    if resp.status_code != 200:
        raise BackupError(f"No se pudo listar los backups para podar ({resp.status_code}): {resp.text[:300]}")
    viejos = resp.json().get("files", [])[retencion:]
    borrados = 0
    for f in viejos:
        d = httpx.delete(f"{_FILES_URL}/{f['id']}",
                         headers={"Authorization": f"Bearer {token}"}, timeout=60)
        if d.status_code in (200, 204):
            borrados += 1
        else:
            logger.warning("No se pudo borrar el backup viejo %s (%s)", f.get("name"), d.status_code)
    return borrados


# ─── Orquestación ─────────────────────────────────────────────────────────────

def ejecutar_backup(db: Session) -> dict:
    """
    Corre el backup completo (dump → gzip → subir → podar) usando la conexión
    guardada en `backup_config`, y actualiza el estado del último respaldo.
    Lanza BackupError si no hay Drive conectado o si algo falla (y lo deja
    registrado en la fila).
    """
    from app.modules.configuracion import service

    cfg = service.obtener_backup_config(db)
    if not cfg.drive_refresh_token or not cfg.drive_folder_id:
        raise BackupError("No hay ningún Google Drive conectado. Conectá tu Drive primero.")

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    ruta_sql = _exportar_dump(ts)
    ruta_gz = ruta_sql + ".gz"
    try:
        tam = _gzip(ruta_sql, ruta_gz)
        nombre_gz = f"{_PREFIJO}{ts}.sql.gz"
        token = _access_token(cfg.drive_refresh_token)
        file_id = _subir(token, ruta_gz, nombre_gz, cfg.drive_folder_id)
        borrados = _podar(token, cfg.drive_folder_id, cfg.retencion)
    except Exception as e:
        cfg.ultimo_backup_at = datetime.now(timezone.utc)
        cfg.ultimo_estado = "error"
        cfg.ultimo_error = str(e)[:1000]
        db.commit()
        raise
    finally:
        _borrar_silencioso(ruta_sql)
        _borrar_silencioso(ruta_gz)

    cfg.ultimo_backup_at = datetime.now(timezone.utc)
    cfg.ultimo_estado = "ok"
    cfg.ultimo_error = None
    cfg.ultimo_nombre = nombre_gz
    db.commit()

    logger.info("Backup subido a Drive: %s (%.1f KB), %d viejos borrados",
                nombre_gz, tam / 1024, borrados)
    return {"status": "ok", "nombre": nombre_gz, "file_id": file_id,
            "bytes": tam, "borrados": borrados}
