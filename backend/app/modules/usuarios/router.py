"""Gestión de usuarios y roles (Configuración → Usuarios / Roles).

Todo el módulo exige el permiso `usuarios.gestionar` (RN-05). Las escrituras
quedan auditadas (quién creó/editó/eliminó qué). El catálogo de permisos posibles
se expone en GET /roles/permisos para que el frontend pinte las casillas.
"""
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permiso, audit_ctx, AuditContext
from app.modules.auth import permisos as P
from app.modules.auth.schemas import UsuarioResponse
from app.modules.usuarios import service
from app.modules.usuarios.schemas import (
    RolResponse, RolCreate, RolUpdate, PermisoInfo,
    UsuarioCreate, UsuarioUpdate,
)

# Lectura y escritura: requieren el permiso de gestión de usuarios.
router = APIRouter(
    tags=["Usuarios y roles"],
    dependencies=[Depends(require_permiso(P.USUARIOS))],
)

AUDIT = Depends(audit_ctx(P.USUARIOS))


# ─── Roles ────────────────────────────────────────────────────────────────────

# Literal antes de /roles/{rol_id} para que "permisos" no se parsee como UUID.
@router.get("/roles/permisos", response_model=list[PermisoInfo])
def catalogo_permisos():
    """Catálogo de permisos posibles (para el editor de roles)."""
    return P.PERMISOS


@router.get("/roles", response_model=list[RolResponse])
def listar_roles(db: Session = Depends(get_db)):
    return service.listar_roles(db)


@router.post("/roles", response_model=RolResponse, status_code=201)
def crear_rol(data: RolCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    rol = service.crear_rol(db, data)
    audit.registrar_accion(f"Creó el rol '{rol.nombre}'", modulo="Roles", accion="Creación")
    return rol


@router.put("/roles/{rol_id}", response_model=RolResponse)
def actualizar_rol(rol_id: uuid.UUID, data: RolUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    rol = service.actualizar_rol(db, rol_id, data)
    audit.registrar_accion(f"Editó el rol '{rol.nombre}'", modulo="Roles", accion="Edición")
    return rol


@router.delete("/roles/{rol_id}", status_code=204)
def eliminar_rol(rol_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    rol = service.obtener_rol(db, rol_id)
    nombre = rol.nombre
    service.eliminar_rol(db, rol_id)
    audit.registrar_accion(f"Eliminó el rol '{nombre}'", modulo="Roles", accion="Eliminación")


# ─── Usuarios ─────────────────────────────────────────────────────────────────

@router.get("/usuarios", response_model=list[UsuarioResponse])
def listar_usuarios(db: Session = Depends(get_db)):
    return [UsuarioResponse.desde(u) for u in service.listar_usuarios(db)]


@router.post("/usuarios", response_model=UsuarioResponse, status_code=201)
def crear_usuario(data: UsuarioCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    u = service.crear_usuario(db, data)
    audit.registrar_accion(
        f"Creó el usuario '{u.username}' (rol: {u.rol.nombre})",
        modulo="Usuarios", accion="Creación",
    )
    return UsuarioResponse.desde(u)


@router.put("/usuarios/{usuario_id}", response_model=UsuarioResponse)
def actualizar_usuario(
    usuario_id: uuid.UUID, data: UsuarioUpdate,
    db: Session = Depends(get_db), audit: AuditContext = AUDIT,
):
    u = service.actualizar_usuario(db, usuario_id, data, actor=audit.usuario)
    audit.registrar_accion(f"Editó el usuario '{u.username}'", modulo="Usuarios", accion="Edición")
    return UsuarioResponse.desde(u)


@router.delete("/usuarios/{usuario_id}", status_code=204)
def eliminar_usuario(usuario_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    u = service.obtener_usuario(db, usuario_id)
    username = u.username
    service.eliminar_usuario(db, usuario_id, actor=audit.usuario)
    audit.registrar_accion(f"Eliminó el usuario '{username}'", modulo="Usuarios", accion="Eliminación")
