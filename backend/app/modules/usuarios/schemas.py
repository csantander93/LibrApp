import uuid
from pydantic import BaseModel, ConfigDict, Field


# ─── Roles ────────────────────────────────────────────────────────────────────

class PermisoInfo(BaseModel):
    """Un permiso del catálogo (para pintar las casillas del editor de roles)."""
    key: str
    etiqueta: str
    descripcion: str
    grupo: str


class RolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    descripcion: str | None
    permisos: list[str]
    es_sistema: bool
    usuarios_count: int = 0


class RolCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=50)
    descripcion: str | None = Field(default=None, max_length=255)
    permisos: list[str] = Field(default_factory=list)


class RolUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=50)
    descripcion: str | None = Field(default=None, max_length=255)
    permisos: list[str] | None = None


# ─── Usuarios ─────────────────────────────────────────────────────────────────

class UsuarioCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    nombre: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    rol_id: uuid.UUID
    activo: bool = True


class UsuarioUpdate(BaseModel):
    """Edición parcial. El `username` es inmutable (identidad de login).
    `password` vacío/ausente = no se cambia."""
    nombre: str | None = Field(default=None, max_length=120)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    rol_id: uuid.UUID | None = None
    activo: bool | None = None
