"""Dependencias de autenticación/autorización.

- get_current_user: valida el Bearer token y devuelve el Usuario.
- require_permiso(*claves): exige que el rol del usuario cumpla al menos uno de
  los permisos indicados (RN-05). Reemplaza al viejo `require_admin`.
- audit_ctx(*claves): igual que require_permiso pero además arma el AuditContext
  del request para dejar un log de acción en una sola línea. Se usa en escrituras.
"""
from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.modules.auth.models import Usuario
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


def require_permiso(*permisos: str):
    """Fábrica de dependencia: exige que el usuario tenga al menos uno de los
    permisos. Sin permisos, solo exige sesión válida (útil para lecturas)."""
    def dependencia(user: Usuario = Depends(get_current_user)) -> Usuario:
        if permisos and not user.tiene_permiso(*permisos):
            raise ForbiddenError("No tenés permisos para esta operación")
        return user
    return dependencia


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


def audit_ctx(*permisos: str):
    """Fábrica de dependencia: valida los permisos requeridos y arma el
    AuditContext (usuario + IP) del request. Para endpoints de escritura."""
    def dependencia(
        request: Request,
        db: Session = Depends(get_db),
        current_user: Usuario = Depends(require_permiso(*permisos)),
    ) -> AuditContext:
        return AuditContext(db=db, usuario=current_user, ip=get_client_ip(request))
    return dependencia
