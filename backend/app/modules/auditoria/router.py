"""
Endpoints de consulta de logs de auditoría (Registros).

  - GET /auditoria/accesos   → logs de accesos (login).
  - GET /auditoria/acciones  → logs de acciones (ABM y operaciones).

Ambos filtran por rango de fecha (`desde`/`hasta`) y por usuario. Solo lectura y
protegidos con `require_admin` (RN-05): la auditoría es material sensible.
"""
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.shared.pagination import Page
from app.modules.auditoria.schemas import LogAccesoResponse, LogAccionResponse
from app.modules.auditoria.service import auditoria_service

router = APIRouter(prefix="/auditoria", tags=["Auditoría"], dependencies=[Depends(require_admin)])


@router.get("/accesos", response_model=Page[LogAccesoResponse])
def listar_accesos(
    desde: date | None = None,
    hasta: date | None = None,
    usuario: str | None = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
):
    return auditoria_service.listar_accesos(db, desde, hasta, usuario, page, size)


@router.get("/acciones", response_model=Page[LogAccionResponse])
def listar_acciones(
    desde: date | None = None,
    hasta: date | None = None,
    usuario: str | None = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
):
    return auditoria_service.listar_acciones(db, desde, hasta, usuario, page, size)
