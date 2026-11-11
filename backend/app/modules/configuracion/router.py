import os

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_permiso, audit_ctx, AuditContext
from app.modules.auth.models import Usuario
from app.modules.auth import permisos as P
from app.modules.configuracion import service
from app.modules.configuracion import backup as backup_mod
from app.modules.configuracion.backup import BackupError
from app.modules.configuracion.schemas import (
    ConfiguracionResponse, ConfiguracionUpdate,
    BackupEstado, BackupConfigUpdate, OAuthUrlResponse,
)
from app.shared.audit_utils import diff_cambios, describir_cambios
from app.shared.exceptions import ValidationError

# Lectura: requiere sesión (solo el panel admin la consume). Escritura: admin (RN-05).
router = APIRouter(prefix="/configuracion", tags=["Configuración"])

_MODULO = "Configuración"


@router.get("", response_model=ConfiguracionResponse)
def obtener(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return service.obtener_configuracion(db)


@router.put("", response_model=ConfiguracionResponse)
def actualizar(data: ConfiguracionUpdate, db: Session = Depends(get_db), audit: AuditContext = Depends(audit_ctx(P.CONFIGURACION))):
    # Diff calculado ANTES de aplicar los cambios (compara la fila actual vs el payload).
    actual = service.obtener_configuracion(db)
    desc = describir_cambios(diff_cambios(actual, data.model_dump(exclude_unset=True)))
    obj = service.actualizar_configuracion(db, data)
    detalle = f"Actualizó la configuración — {desc}" if desc else "Actualizó la configuración"
    audit.registrar_accion(detalle, modulo=_MODULO, accion="Edición")
    return obj


# ─── Respaldo a Google Drive ──────────────────────────────────────────────────

def _estado(cfg, settings) -> BackupEstado:
    return BackupEstado(
        conectado=bool(cfg.drive_refresh_token and cfg.drive_folder_id),
        oauth_configurado=settings.gdrive_configurado,
        drive_cuenta_email=cfg.drive_cuenta_email,
        habilitado=cfg.habilitado,
        hora_utc=cfg.hora_utc,
        retencion=cfg.retencion,
        ultimo_backup_at=cfg.ultimo_backup_at,
        ultimo_estado=cfg.ultimo_estado,
        ultimo_error=cfg.ultimo_error,
        ultimo_nombre=cfg.ultimo_nombre,
    )


@router.get("/backup", response_model=BackupEstado)
def backup_estado(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Estado de la conexión con Drive y del último respaldo (sin secretos)."""
    cfg = service.obtener_backup_config(db)
    return _estado(cfg, get_settings())


@router.put("/backup", response_model=BackupEstado)
def backup_actualizar(
    data: BackupConfigUpdate,
    db: Session = Depends(get_db),
    audit: AuditContext = Depends(audit_ctx(P.CONFIGURACION)),
):
    """Actualiza la agenda del respaldo (habilitado / hora / retención)."""
    cfg = service.actualizar_backup_config(db, data)
    audit.registrar_accion("Actualizó la configuración de respaldo", modulo=_MODULO, accion="Edición")
    return _estado(cfg, get_settings())


@router.get("/backup/oauth/url", response_model=OAuthUrlResponse)
def backup_oauth_url(user: Usuario = Depends(require_permiso(P.CONFIGURACION))):
    """URL del consentimiento de Google para conectar el Drive (state firmado)."""
    try:
        url = backup_mod.construir_url_consentimiento(service.firmar_state(str(user.id)))
    except BackupError as e:
        raise ValidationError(str(e))
    return OAuthUrlResponse(url=url)


@router.get("/backup/oauth/callback", include_in_schema=False)
def backup_oauth_callback(
    db: Session = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Callback del OAuth. SIN dependencia de sesión (es un redirect del navegador
    desde Google); la identidad/anti-CSRF se valida con el `state` firmado."""
    s = get_settings()
    destino = f"{s.FRONTEND_URL}/admin/configuracion"

    def _volver(ok: bool) -> RedirectResponse:
        return RedirectResponse(f"{destino}?drive={'ok' if ok else 'error'}")

    if error or not code or not state or not service.validar_state(state):
        return _volver(False)
    try:
        refresh_token, folder_id, email = backup_mod.canjear_codigo(code)
        service.guardar_conexion_drive(db, refresh_token, folder_id, email)
    except BackupError:
        return _volver(False)
    return _volver(True)


@router.post("/backup/desconectar", response_model=BackupEstado)
def backup_desconectar(
    db: Session = Depends(get_db),
    audit: AuditContext = Depends(audit_ctx(P.CONFIGURACION)),
):
    """Desvincula el Drive conectado (no borra los backups ya subidos)."""
    cfg = service.desconectar_drive(db)
    audit.registrar_accion("Desconectó el Google Drive de respaldo", modulo=_MODULO, accion="Edición")
    return _estado(cfg, get_settings())


@router.post("/backup/run")
def backup_run(db: Session = Depends(get_db), audit: AuditContext = Depends(audit_ctx(P.CONFIGURACION))):
    """Dispara un respaldo a Drive ahora (dump → gzip → subida → poda)."""
    try:
        resultado = backup_mod.ejecutar_backup(db)
    except BackupError as e:
        raise ValidationError(str(e))
    audit.registrar_accion("Ejecutó un respaldo manual a Google Drive", modulo=_MODULO, accion="Exportación")
    return resultado


@router.get("/backup/descargar")
def backup_descargar(audit: AuditContext = Depends(audit_ctx(P.CONFIGURACION))):
    """Descarga un dump completo de la base (.sql.gz) — incluye las imágenes, que
    viven en la propia DB. Para guardar una copia local cuando se quiera."""
    try:
        ruta_gz, nombre = backup_mod.generar_dump_descarga()
    except BackupError as e:
        raise ValidationError(str(e))
    audit.registrar_accion("Descargó un respaldo de la base de datos", modulo=_MODULO, accion="Exportación")
    return FileResponse(
        ruta_gz,
        media_type="application/gzip",
        filename=nombre,
        background=BackgroundTask(os.remove, ruta_gz),
    )
