import uuid
from decimal import Decimal
from sqlalchemy import String, Text, Integer, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.shared.models import Base, UUIDMixin, TimestampMixin


class Zona(UUIDMixin, TimestampMixin, Base):
    """Piso o sala del local (escalabilidad — RF-11). Ej: Planta Baja, Piso 1."""
    __tablename__ = "zonas"

    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    estantes: Mapped[list["Estante"]] = relationship(back_populates="zona")


class Coleccion(UUIDMixin, TimestampMixin, Base):
    """Categoría taxonómica del libro (RN-10). Ej: Humanidades, Sistemas."""
    __tablename__ = "colecciones"

    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    libros: Mapped[list["Libro"]] = relationship(back_populates="coleccion")


class Estante(UUIDMixin, TimestampMixin, Base):
    """Estante/sección representado en el mapa 2D (RF-01, RF-02).

    codigo: identificador visible (E1, MESA-FUTBOL, ENTRADA) — único por zona (RN-04).
    pos_x/pos_y/ancho/alto: geometría del bloque en el plano (drag & drop, RF-10/CU-05).
    """
    __tablename__ = "estantes"
    __table_args__ = (
        UniqueConstraint("zona_id", "codigo", name="uq_estante_zona_codigo"),
    )

    codigo: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    etiqueta: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zona_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("zonas.id", ondelete="SET NULL"), nullable=True,
    )
    pos_x: Mapped[float] = mapped_column(Numeric(8, 2), default=0, nullable=False)
    pos_y: Mapped[float] = mapped_column(Numeric(8, 2), default=0, nullable=False)
    ancho: Mapped[float] = mapped_column(Numeric(8, 2), default=10, nullable=False)
    alto: Mapped[float] = mapped_column(Numeric(8, 2), default=10, nullable=False)
    # Color del bloque en el mapa (hex, ej #3B82F6) para diferenciar categorías
    # de un vistazo. Nulo = color derivado de la zona en el front.
    color: Mapped[str | None] = mapped_column(String(9), nullable=True)

    zona: Mapped["Zona | None"] = relationship(back_populates="estantes")
    libros: Mapped[list["Libro"]] = relationship(back_populates="estante")
    # Niveles ("pisos") del estante — se muestran a la izquierda de los libros en el mapa.
    niveles: Mapped[list["Nivel"]] = relationship(
        back_populates="estante",
        cascade="all, delete-orphan",
        order_by="Nivel.numero",
    )


class Nivel(UUIDMixin, TimestampMixin, Base):
    """Nivel/estante físico ("piso") dentro de un Estante.

    Numerados 1..N de abajo hacia arriba (RF-02). Un libro se ubica en un nivel;
    seleccionar estante → nivel muestra los libros de ese nivel en el mapa.
    """
    __tablename__ = "niveles"
    __table_args__ = (
        UniqueConstraint("estante_id", "numero", name="uq_nivel_estante_numero"),
    )

    estante_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("estantes.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    numero: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..N, abajo→arriba
    etiqueta: Mapped[str | None] = mapped_column(String(100), nullable=True)

    estante: Mapped["Estante"] = relationship(back_populates="niveles")
    libros: Mapped[list["Libro"]] = relationship(back_populates="nivel")


class AnotacionMapa(UUIDMixin, TimestampMixin, Base):
    """Marca de referencia sobre el plano: flechas y textos que orientan al
    visitante (ENTRADA, SALIDA, ESCALERA, VENTANA, etc.). No es un estante ni
    guarda libros — sólo geometría y estilo sobre el mapa 2D.

    tipo: 'texto' (etiqueta) | 'flecha' (indicador direccional, usa rotacion).
    """
    __tablename__ = "anotaciones_mapa"

    zona_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("zonas.id", ondelete="SET NULL"), nullable=True,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="texto")
    texto: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pos_x: Mapped[float] = mapped_column(Numeric(8, 2), default=0, nullable=False)
    pos_y: Mapped[float] = mapped_column(Numeric(8, 2), default=0, nullable=False)
    ancho: Mapped[float] = mapped_column(Numeric(8, 2), default=14, nullable=False)
    alto: Mapped[float] = mapped_column(Numeric(8, 2), default=6, nullable=False)
    rotacion: Mapped[float] = mapped_column(Numeric(6, 2), default=0, nullable=False)
    color: Mapped[str | None] = mapped_column(String(9), nullable=True)


class Libro(UUIDMixin, TimestampMixin, Base):
    """Ejemplar del catálogo (entidad central — RF-04).

    isbn: identificador editorial, único si está presente (RN-01).
    titulo/autor/editorial: obligatorios (RN-02).
    estante_id nulo = 'Sin ubicar' (RN-07).
    """
    __tablename__ = "libros"

    isbn: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    autor: Mapped[str] = mapped_column(String(255), nullable=False)
    editorial: Mapped[str] = mapped_column(String(100), nullable=False)
    precio: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    coleccion_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("colecciones.id", ondelete="SET NULL"), nullable=True,
    )
    estante_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("estantes.id", ondelete="SET NULL"), nullable=True,
    )
    # Nivel dentro del estante (RF-02). Nulo = ubicado en el estante sin nivel asignado.
    nivel_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("niveles.id", ondelete="SET NULL"), nullable=True,
    )

    coleccion: Mapped["Coleccion | None"] = relationship(back_populates="libros")
    estante: Mapped["Estante | None"] = relationship(back_populates="libros")
    nivel: Mapped["Nivel | None"] = relationship(back_populates="libros")
