from sqlalchemy import Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.shared.models import Base, UUIDMixin, TimestampMixin


class Configuracion(UUIDMixin, TimestampMixin, Base):
    """Ajustes generales de la aplicación (fila única / singleton).

    Se lee/edita desde el panel admin (/admin/configuracion). Al agregar un
    ajuste, sumá la columna acá, la migración correspondiente y el schema.
    """
    __tablename__ = "configuracion"

    # RN-01/RN-02: cuando está activo, el ISBN es obligatorio al alta/edición de
    # libros (además de único). El admin puede desactivarlo desde Configuración.
    isbn_obligatorio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
