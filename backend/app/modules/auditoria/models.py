"""
Modelos de auditoría: registro de accesos (login) y de acciones (ABM y
operaciones sensibles) del panel de administración.

Ambas tablas guardan `fecha con hora` (columna `created_at` del TimestampMixin,
expuesta como propiedad `fecha`). Adaptado de Operix: como LibrApp es
single-tenant y con un único administrador, no hay `empresa_id` ni `sucursal`;
el usuario se identifica por su `username`.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.shared.models import Base, UUIDMixin, TimestampMixin


class LogAcceso(UUIDMixin, TimestampMixin, Base):
    """
    Registro de accesos al sistema (intentos de login, exitosos o fallidos).
    `usuario_id` puede ser null en un intento fallido con un usuario inexistente;
    `username` guarda siempre el identificador tipeado en el login.
    """
    __tablename__ = "log_accesos"

    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    username: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agente: Mapped[str | None] = mapped_column(String(512), nullable=True)
    exito: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    @property
    def fecha(self) -> datetime:
        """Fecha con hora del acceso (alias de created_at)."""
        return self.created_at


class LogAccion(UUIDMixin, TimestampMixin, Base):
    """
    Registro reutilizable de acciones del panel (altas/bajas/modificaciones y
    operaciones sensibles como la importación). `usuario_nombre` y `username`
    quedan "congelados" al momento de la acción (por si luego se borra/renombra
    el usuario). `modulo` y `accion` son opcionales y sirven para filtrar.
    """
    __tablename__ = "log_acciones"

    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    usuario_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)
    username: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    detalle: Mapped[str] = mapped_column(Text, nullable=False)
    modulo: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    accion: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    @property
    def fecha(self) -> datetime:
        """Fecha con hora de la acción (alias de created_at)."""
        return self.created_at
