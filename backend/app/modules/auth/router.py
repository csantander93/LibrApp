from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_client_ip
from app.core.security import create_access_token
from app.modules.auth.models import Usuario
from app.modules.auth.schemas import LoginRequest, TokenResponse, UsuarioResponse
from app.modules.auth.service import autenticar
from app.modules.auditoria.service import auditoria_service
from app.shared.exceptions import UnauthorizedError

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """CU-02: valida credenciales y devuelve el JWT + datos del usuario.

    Todo intento de acceso (exitoso o fallido) queda registrado en el log de
    accesos con IP y user-agent (auditoría)."""
    ip = get_client_ip(request)
    agente = request.headers.get("user-agent")
    try:
        user = autenticar(db, data.username, data.password)
    except UnauthorizedError:
        auditoria_service.registrar_acceso(
            db, username=data.username, ip=ip, agente=agente, exito=False,
        )
        raise
    auditoria_service.registrar_acceso(
        db, username=user.username, ip=ip, agente=agente,
        usuario_id=user.id, exito=True,
    )
    token = create_access_token(subject=user.username, extra={"rol": user.rol.value})
    return TokenResponse(access_token=token, usuario=UsuarioResponse.model_validate(user))


@router.get("/me", response_model=UsuarioResponse)
def me(user: Usuario = Depends(get_current_user)):
    """Devuelve el usuario del token (para rehidratar la sesión en el frontend)."""
    return user
