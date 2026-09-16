import uuid
from typing import TYPE_CHECKING
from pydantic import BaseModel, ConfigDict

if TYPE_CHECKING:
    from app.modules.auth.models import Usuario


class LoginRequest(BaseModel):
    username: str
    password: str


class UsuarioResponse(BaseModel):
    """Usuario tal como lo consume el frontend: incluye el nombre del rol y los
    permisos efectivos (para pintar/gating de la navegación del panel)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    nombre: str | None
    activo: bool
    rol_id: uuid.UUID | None
    rol: str | None          # nombre del rol
    permisos: list[str]

    @classmethod
    def desde(cls, u: "Usuario") -> "UsuarioResponse":
        """Construye la respuesta a partir del ORM (el rol es una relación, no un
        string, por eso no usamos model_validate directo)."""
        return cls(
            id=u.id,
            username=u.username,
            nombre=u.nombre,
            activo=u.activo,
            rol_id=u.rol_id,
            rol=u.rol.nombre if u.rol else None,
            permisos=u.permisos,
        )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioResponse
