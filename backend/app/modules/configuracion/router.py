from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_audit_context, AuditContext
from app.modules.auth.models import Usuario
from app.modules.configuracion import service
from app.modules.configuracion.schemas import ConfiguracionResponse, ConfiguracionUpdate
from app.shared.audit_utils import diff_cambios, describir_cambios

# Lectura: requiere sesión (solo el panel admin la consume). Escritura: admin (RN-05).
router = APIRouter(prefix="/configuracion", tags=["Configuración"])


@router.get("", response_model=ConfiguracionResponse)
def obtener(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return service.obtener_configuracion(db)


@router.put("", response_model=ConfiguracionResponse)
def actualizar(data: ConfiguracionUpdate, db: Session = Depends(get_db), audit: AuditContext = Depends(get_audit_context)):
    # Diff calculado ANTES de aplicar los cambios (compara la fila actual vs el payload).
    actual = service.obtener_configuracion(db)
    desc = describir_cambios(diff_cambios(actual, data.model_dump(exclude_unset=True)))
    obj = service.actualizar_configuracion(db, data)
    detalle = f"Actualizó la configuración — {desc}" if desc else "Actualizó la configuración"
    audit.registrar_accion(detalle, modulo="Configuración", accion="Edición")
    return obj
