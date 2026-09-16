import uuid
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.shared.models import Base, UUIDMixin, TimestampMixin
from app.modules.auth.permisos import expandir, tiene


class Rol(UUIDMixin, TimestampMixin, Base):
    """Rol dinámico con un conjunto de permisos (RF-08 / RN-05).

    Los roles se crean y editan desde Configuración → Roles. `permisos` guarda una
    lista de claves del catálogo de `permisos.py` (o el comodín "*"). El rol de
    sistema ("Administrador", `es_sistema=True`) tiene acceso total y no puede
    eliminarse ni editarse.
    """
    __tablename__ = "roles"

    nombre: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permisos: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    # Rol protegido del sistema: no se puede eliminar ni modificar (RN-usuarios).
    es_sistema: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="rol")

    @property
    def permisos_efectivos(self) -> list[str]:
        """Claves concretas que otorga el rol (con el comodín ya expandido)."""
        return sorted(expandir(self.permisos))


class Usuario(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "usuarios"

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # ondelete RESTRICT: no se puede borrar un rol con usuarios asignados (RN-usuarios).
    rol_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    activo: Mapped[bool] = mapped_column(default=True, nullable=False)

    # joined: el rol se carga junto con el usuario (lo necesitan get_current_user y
    # las respuestas, que exponen nombre del rol + permisos efectivos).
    rol: Mapped["Rol"] = relationship(back_populates="usuarios", lazy="joined")

    @property
    def permisos(self) -> list[str]:
        """Permisos efectivos del usuario (los de su rol)."""
        return self.rol.permisos_efectivos if self.rol else []

    def tiene_permiso(self, *keys: str) -> bool:
        """True si el rol del usuario cumple con al menos uno de los permisos."""
        return tiene(self.rol.permisos if self.rol else [], *keys)
