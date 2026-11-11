from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.configuracion.models import BackupConfig, Configuracion
from app.modules.configuracion.schemas import BackupConfigUpdate, ConfiguracionUpdate


def obtener_configuracion(db: Session) -> Configuracion:
    """Devuelve la fila única de configuración; la crea con los valores por
    defecto si todavía no existe (singleton lazy)."""
    cfg = db.query(Configuracion).first()
    if cfg is None:
        cfg = Configuracion()  # isbn_obligatorio = True por defecto
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def actualizar_configuracion(db: Session, data: ConfiguracionUpdate) -> Configuracion:
    cfg = obtener_configuracion(db)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(cfg, campo, valor)
    db.commit()
    db.refresh(cfg)
    return cfg


# ─── Respaldo a Google Drive ──────────────────────────────────────────────────

def obtener_backup_config(db: Session) -> BackupConfig:
    """Fila única de configuración de respaldo (singleton lazy, como la general)."""
    cfg = db.query(BackupConfig).first()
    if cfg is None:
        cfg = BackupConfig()  # habilitado=True, hora_utc=6, retencion=7 por defecto
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def actualizar_backup_config(db: Session, data: BackupConfigUpdate) -> BackupConfig:
    """Actualiza solo la agenda (habilitado / hora_utc / retencion). La conexión
    con Drive se gestiona por el flujo OAuth, no por acá."""
    cfg = obtener_backup_config(db)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(cfg, campo, valor)
    db.commit()
    db.refresh(cfg)
    return cfg


def guardar_conexion_drive(
    db: Session, refresh_token: str, folder_id: str, email: str | None,
) -> BackupConfig:
    """Persiste la conexión obtenida por el callback OAuth."""
    cfg = obtener_backup_config(db)
    cfg.drive_refresh_token = refresh_token
    cfg.drive_folder_id = folder_id
    cfg.drive_cuenta_email = email
    db.commit()
    db.refresh(cfg)
    return cfg


def desconectar_drive(db: Session) -> BackupConfig:
    """Borra la conexión con Drive (no toca los backups ya subidos)."""
    cfg = obtener_backup_config(db)
    cfg.drive_refresh_token = None
    cfg.drive_folder_id = None
    cfg.drive_cuenta_email = None
    db.commit()
    db.refresh(cfg)
    return cfg


# ─── State CSRF del flujo OAuth ───────────────────────────────────────────────
# El callback llega como un redirect del navegador (sin sesión), así que la
# identidad/anti-CSRF viaja en un `state` firmado con el secreto JWT de la app.

_STATE_PURPOSE = "drive_oauth"


def firmar_state(user_id: str) -> str:
    s = get_settings()
    payload = {
        "purpose": _STATE_PURPOSE,
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    return jwt.encode(payload, s.JWT_SECRET_KEY, algorithm=s.JWT_ALGORITHM)


def validar_state(state: str) -> bool:
    s = get_settings()
    try:
        payload = jwt.decode(state, s.JWT_SECRET_KEY, algorithms=[s.JWT_ALGORITHM])
    except JWTError:
        return False
    return payload.get("purpose") == _STATE_PURPOSE
