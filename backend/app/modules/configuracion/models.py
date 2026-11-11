from datetime import datetime

from sqlalchemy import Boolean, Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.shared.models import Base, UUIDMixin, TimestampMixin


class Configuracion(UUIDMixin, TimestampMixin, Base):
    """Ajustes generales de la aplicación (fila única / singleton).

    Se lee/edita desde el panel admin (/admin/configuracion). Al agregar un
    ajuste, sumá la columna acá, la migración correspondiente y el schema.
    """
    __tablename__ = "configuracion"

    # RN-01/RN-02: cuando está activo, el ISBN es obligatorio al alta/edición de
    # libros (además de único). El admin puede desactivarlo desde Configuración.
    isbn_obligatorio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class BackupConfig(UUIDMixin, TimestampMixin, Base):
    """Configuración y estado del respaldo de la base a Google Drive (fila única).

    El admin conecta su Drive desde Configuración → Respaldos (flujo OAuth): el
    callback guarda acá el `drive_refresh_token`, el `drive_folder_id` (carpeta
    "LibrApp Backups") y el email de la cuenta. Un task in-process sube un dump
    diario; también se puede disparar a mano. Ver `configuracion/backup.py`.

    Seguridad: el refresh token queda en claro en la DB (mismo nivel de confianza
    que el resto de los datos). Mitigante: el scope OAuth es `drive.file`, así que
    la app solo ve/gestiona los archivos que ella misma sube, nada más del Drive.
    """
    __tablename__ = "backup_config"

    # ── Conexión con Google Drive (la setea el callback OAuth) ──
    drive_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    drive_folder_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    drive_cuenta_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    # ── Agenda ──
    habilitado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    hora_utc: Mapped[int] = mapped_column(Integer, default=6, nullable=False)   # 06:00 UTC ≈ 03:00 AR
    retencion: Mapped[int] = mapped_column(Integer, default=7, nullable=False)  # copias a conservar

    # ── Estado del último respaldo (para mostrar en la UI) ──
    ultimo_backup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_estado: Mapped[str | None] = mapped_column(String(16), nullable=True)   # "ok" | "error"
    ultimo_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ultimo_nombre: Mapped[str | None] = mapped_column(String(128), nullable=True)
