from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ConfiguracionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    isbn_obligatorio: bool


class ConfiguracionUpdate(BaseModel):
    # Edición parcial: solo se aplican los campos presentes.
    isbn_obligatorio: bool | None = None


# ─── Respaldo a Google Drive ──────────────────────────────────────────────────

class BackupEstado(BaseModel):
    """Estado del respaldo para la UI. NUNCA incluye el refresh token."""
    model_config = ConfigDict(from_attributes=True)

    conectado: bool
    oauth_configurado: bool          # si el servidor tiene el cliente OAuth cargado
    drive_cuenta_email: str | None
    habilitado: bool
    hora_utc: int
    retencion: int
    ultimo_backup_at: datetime | None
    ultimo_estado: str | None
    ultimo_error: str | None
    ultimo_nombre: str | None


class BackupConfigUpdate(BaseModel):
    # Edición parcial de la agenda. La conexión con Drive se gestiona por OAuth.
    habilitado: bool | None = None
    hora_utc: int | None = Field(default=None, ge=0, le=23)
    retencion: int | None = Field(default=None, ge=1, le=365)


class OAuthUrlResponse(BaseModel):
    url: str
