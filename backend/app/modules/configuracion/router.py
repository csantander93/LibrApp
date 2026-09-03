from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.modules.auth.models import Usuario
from app.modules.configuracion import service
from app.modules.configuracion.schemas import ConfiguracionResponse, ConfiguracionUpdate

# Lectura: requiere sesión (solo el panel admin la consume). Escritura: admin (RN-05).
router = APIRouter(prefix="/configuracion", tags=["Configuración"])


@router.get("", response_model=ConfiguracionResponse)
def obtener(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return service.obtener_configuracion(db)


@router.put("", response_model=ConfiguracionResponse, dependencies=[Depends(require_admin)])
def actualizar(data: ConfiguracionUpdate, db: Session = Depends(get_db)):
    return service.actualizar_configuracion(db, data)
