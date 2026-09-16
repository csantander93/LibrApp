"""Lógica de negocio de usuarios y roles (RF-08 / RN-05).

Reglas (anti-bloqueo del sistema):
  - RN-U1: username único (409).
  - RN-U2: no podés eliminar tu propia cuenta.
  - RN-U3: siempre debe quedar al menos un usuario activo que pueda administrar
           usuarios y roles (permiso `usuarios.gestionar`).
  - RN-U4: no podés quitarte a vos mismo ese permiso (ni desactivarte).
  - RN-R1: nombre de rol único (409).
  - RN-R2: el rol de sistema no se edita ni se elimina.
  - RN-R3: no se puede eliminar un rol que tenga usuarios asignados (409).
  - RN-R4: los permisos deben pertenecer al catálogo (`permisos.py`).
"""
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.auth.models import Usuario, Rol
from app.modules.auth import permisos as P
from app.modules.usuarios.schemas import (
    RolCreate, RolUpdate, UsuarioCreate, UsuarioUpdate,
)
from app.shared.exceptions import NotFoundError, ConflictError, ValidationError


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validar_permisos(permisos: list[str]) -> None:
    invalidos = [p for p in permisos if p not in P.PERMISOS_KEYS]
    if invalidos:
        raise ValidationError(f"Permisos inválidos: {', '.join(invalidos)}")


def _puede_gestionar(u: Usuario) -> bool:
    """El usuario está activo y su rol puede administrar usuarios/roles."""
    return u.activo and u.tiene_permiso(P.USUARIOS)


def _existe_otro_gestor(db: Session, excluir_id: uuid.UUID) -> bool:
    """¿Hay algún otro usuario (distinto de excluir_id) que pueda gestionar
    usuarios y esté activo? Se evalúa en Python (son pocos usuarios)."""
    otros = db.query(Usuario).filter(Usuario.id != excluir_id).all()
    return any(_puede_gestionar(u) for u in otros)


# ─── Roles ────────────────────────────────────────────────────────────────────

def listar_roles(db: Session) -> list[Rol]:
    """Roles con la cantidad de usuarios asignados anotada en `usuarios_count`."""
    filas = (
        db.query(Rol, func.count(Usuario.id))
        .outerjoin(Usuario, Usuario.rol_id == Rol.id)
        .group_by(Rol.id)
        .order_by(Rol.es_sistema.desc(), Rol.nombre)
        .all()
    )
    roles: list[Rol] = []
    for rol, count in filas:
        rol.usuarios_count = count  # atributo transitorio para el response
        roles.append(rol)
    return roles


def obtener_rol(db: Session, rol_id: uuid.UUID) -> Rol:
    rol = db.query(Rol).filter(Rol.id == rol_id).first()
    if rol is None:
        raise NotFoundError("Rol no encontrado")
    return rol


def crear_rol(db: Session, data: RolCreate) -> Rol:
    _validar_permisos(data.permisos)
    if db.query(Rol).filter(func.lower(Rol.nombre) == data.nombre.lower()).first():
        raise ConflictError("Ya existe un rol con ese nombre")
    rol = Rol(
        nombre=data.nombre.strip(),
        descripcion=data.descripcion,
        permisos=data.permisos,
        es_sistema=False,
    )
    db.add(rol)
    db.commit()
    db.refresh(rol)
    rol.usuarios_count = 0
    return rol


def actualizar_rol(db: Session, rol_id: uuid.UUID, data: RolUpdate) -> Rol:
    rol = obtener_rol(db, rol_id)
    if rol.es_sistema:
        raise ConflictError("El rol de sistema no se puede modificar")
    if data.permisos is not None:
        _validar_permisos(data.permisos)
        rol.permisos = data.permisos
    if data.nombre is not None and data.nombre.strip().lower() != rol.nombre.lower():
        if db.query(Rol).filter(func.lower(Rol.nombre) == data.nombre.strip().lower()).first():
            raise ConflictError("Ya existe un rol con ese nombre")
        rol.nombre = data.nombre.strip()
    if data.descripcion is not None:
        rol.descripcion = data.descripcion
    db.commit()
    db.refresh(rol)
    rol.usuarios_count = db.query(func.count(Usuario.id)).filter(Usuario.rol_id == rol.id).scalar()
    return rol


def eliminar_rol(db: Session, rol_id: uuid.UUID) -> None:
    rol = obtener_rol(db, rol_id)
    if rol.es_sistema:
        raise ConflictError("El rol de sistema no se puede eliminar")
    en_uso = db.query(func.count(Usuario.id)).filter(Usuario.rol_id == rol.id).scalar()
    if en_uso:
        raise ConflictError(
            f"No se puede eliminar: hay {en_uso} usuario(s) con este rol. "
            "Reasignalos a otro rol primero."
        )
    db.delete(rol)
    db.commit()


# ─── Usuarios ─────────────────────────────────────────────────────────────────

def listar_usuarios(db: Session) -> list[Usuario]:
    return db.query(Usuario).order_by(Usuario.username).all()


def obtener_usuario(db: Session, usuario_id: uuid.UUID) -> Usuario:
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if u is None:
        raise NotFoundError("Usuario no encontrado")
    return u


def crear_usuario(db: Session, data: UsuarioCreate) -> Usuario:
    username = data.username.strip()
    if db.query(Usuario).filter(func.lower(Usuario.username) == username.lower()).first():
        raise ConflictError("Ya existe un usuario con ese nombre de usuario")
    obtener_rol(db, data.rol_id)  # valida que el rol exista (404 si no)
    u = Usuario(
        username=username,
        nombre=data.nombre,
        password_hash=hash_password(data.password),
        rol_id=data.rol_id,
        activo=data.activo,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def actualizar_usuario(
    db: Session, usuario_id: uuid.UUID, data: UsuarioUpdate, actor: Usuario,
) -> Usuario:
    u = obtener_usuario(db, usuario_id)

    # Estado resultante tras el cambio (para validar el anti-bloqueo).
    nuevo_rol = u.rol
    if data.rol_id is not None and data.rol_id != u.rol_id:
        nuevo_rol = obtener_rol(db, data.rol_id)
    nuevo_activo = u.activo if data.activo is None else data.activo
    seguira_gestionando = nuevo_activo and P.tiene(nuevo_rol.permisos, P.USUARIOS)

    # RN-U4: no podés quitarte a vos mismo el acceso de gestión (ni desactivarte).
    if actor.id == u.id and not seguira_gestionando:
        raise ConflictError(
            "No podés quitarte tu propio acceso de administración de usuarios."
        )
    # RN-U3: debe quedar al menos un gestor activo.
    if _puede_gestionar(u) and not seguira_gestionando and not _existe_otro_gestor(db, u.id):
        raise ConflictError(
            "Debe quedar al menos un usuario activo que administre usuarios y roles."
        )

    if data.nombre is not None:
        u.nombre = data.nombre
    if data.rol_id is not None:
        u.rol_id = nuevo_rol.id
    if data.activo is not None:
        u.activo = data.activo
    if data.password:
        u.password_hash = hash_password(data.password)

    db.commit()
    db.refresh(u)
    return u


def eliminar_usuario(db: Session, usuario_id: uuid.UUID, actor: Usuario) -> None:
    u = obtener_usuario(db, usuario_id)
    # RN-U2: no podés eliminar tu propia cuenta.
    if actor.id == u.id:
        raise ConflictError("No podés eliminar tu propia cuenta.")
    # RN-U3: debe quedar al menos un gestor activo.
    if _puede_gestionar(u) and not _existe_otro_gestor(db, u.id):
        raise ConflictError(
            "Debe quedar al menos un usuario activo que administre usuarios y roles."
        )
    db.delete(u)
    db.commit()
