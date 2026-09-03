from sqlalchemy.orm import Session

from app.modules.configuracion.models import Configuracion
from app.modules.configuracion.schemas import ConfiguracionUpdate


def obtener_configuracion(db: Session) -> Configuracion:
    """Devuelve la fila única de configuración; la crea con los valores por
    defecto si todavía no existe (singleton lazy)."""
    cfg = db.query(Configuracion).first()
    if cfg is None:
        cfg = Configuracion()  # isbn_obligatorio = True por defecto
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def actualizar_configuracion(db: Session, data: ConfiguracionUpdate) -> Configuracion:
    cfg = obtener_configuracion(db)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(cfg, campo, valor)
    db.commit()
    db.refresh(cfg)
    return cfg
