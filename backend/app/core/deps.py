"""Dependencias de autenticación/autorización.

- get_current_user: valida el Bearer token y devuelve el Usuario.
- require_admin:     exige rol admin (operaciones de escritura — RN-05).
- AuditContext / get_audit_context: contexto de auditoría inyectable en cualquier
  endpoint de escritura para dejar un log de acción en una sola línea.
"""
from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.modules.auth.models import Usuario, RolEnum
from app.shared.exceptions import UnauthorizedError, ForbiddenError

# auto_error=False: manejamos nosotros el 401 con mensaje en español.
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if creds is None or not creds.credentials:
        raise UnauthorizedError("Falta el token de autenticación")
    try:
        payload = decode_access_token(creds.credentials)
    except JWTError:
        raise UnauthorizedError("Token inválido o expirado")

    username = payload.get("sub")
    if not username:
        raise UnauthorizedError("Token sin sujeto")

    user = db.query(Usuario).filter(Usuario.username == username).first()
    if user is None or not user.activo:
        raise UnauthorizedError("Usuario inexistente o deshabilitado")
    return user


def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    if user.rol != RolEnum.admin:
        raise ForbiddenError("Se requiere rol administrador")
    return user


# ─── Auditoría ────────────────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str | None:
    """
    IP del cliente. Respeta `X-Forwarded-For` (primer valor) cuando la app corre
    detrás de un proxy/reverse-proxy; si no, usa la IP directa de la conexión.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


class AuditContext:
    """
    Contexto de auditoría inyectable en cualquier endpoint de escritura. Encapsula
    el usuario actual y la IP del request, y expone `registrar_accion` para dejar
    un log de auditoría de forma reutilizable (una línea por endpoint ABM).
    """

    def __init__(self, db: Session, usuario: Usuario, ip: str | None):
        self.db = db
        self.usuario = usuario
        self.ip = ip

    def registrar_accion(
        self,
        detalle: str,
        modulo: str | None = None,
        accion: str | None = None,
    ) -> None:
        # Import diferido para evitar dependencia circular (auditoria → deps).
        from app.modules.auditoria.service import auditoria_service
        auditoria_service.registrar_accion(
            self.db,
            detalle=detalle,
            usuario_id=self.usuario.id,
            usuario_nombre=self.usuario.nombre,
            username=self.usuario.username,
            modulo=modulo,
            accion=accion,
            ip=self.ip,
        )


def get_audit_context(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
) -> AuditContext:
    """Arma el `AuditContext` del request (usuario admin + IP). Solo escrituras."""
    return AuditContext(db=db, usuario=current_user, ip=get_client_ip(request))
