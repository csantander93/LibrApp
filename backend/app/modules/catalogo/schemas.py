import uuid
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, field_validator


# ─── Respuestas de lectura ────────────────────────────────────────────────────

class ColeccionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    descripcion: str | None


class ZonaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    orden: int


class ZonaCreate(BaseModel):
    nombre: str
    orden: int = 0

    @field_validator("nombre")
    @classmethod
    def _nombre_norm(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v


class ZonaUpdate(BaseModel):
    nombre: str | None = None
    orden: int | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre_norm(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede quedar vacío")
        return v


class NivelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    estante_id: uuid.UUID
    numero: int
    etiqueta: str | None = None
    # Denormalizado para la UI.
    total_libros: int = 0


class EstanteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    etiqueta: str | None
    zona_id: uuid.UUID | None
    pos_x: float
    pos_y: float
    ancho: float
    alto: float
    color: str | None = None
    # Denormalizado para la UI.
    total_libros: int = 0
    niveles: list[NivelResponse] = []


class LibroResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    isbn: str | None
    titulo: str
    autor: str
    editorial: str
    precio: Decimal | None
    coleccion_id: uuid.UUID | None
    estante_id: uuid.UUID | None
    nivel_id: uuid.UUID | None = None
    estante_codigo: str | None = None
    nivel_numero: int | None = None
    coleccion_nombre: str | None = None


# ─── Escritura: Libro (RF-04) ─────────────────────────────────────────────────

def _limpiar(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class LibroCreate(BaseModel):
    # RN-02: título, autor y editorial obligatorios.
    titulo: str
    autor: str
    editorial: str
    isbn: str | None = None
    precio: Decimal | None = None
    coleccion_id: uuid.UUID | None = None
    estante_id: uuid.UUID | None = None  # None = 'Sin ubicar' (RN-07)
    nivel_id: uuid.UUID | None = None

    @field_validator("titulo", "autor", "editorial")
    @classmethod
    def _no_vacios(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Campo obligatorio")
        return v

    @field_validator("isbn")
    @classmethod
    def _isbn_norm(cls, v: str | None) -> str | None:
        return _limpiar(v)


class LibroUpdate(BaseModel):
    # Todos opcionales: edición parcial. Los obligatorios, si vienen, no pueden ser vacíos.
    titulo: str | None = None
    autor: str | None = None
    editorial: str | None = None
    isbn: str | None = None
    precio: Decimal | None = None
    coleccion_id: uuid.UUID | None = None
    estante_id: uuid.UUID | None = None
    nivel_id: uuid.UUID | None = None

    @field_validator("titulo", "autor", "editorial")
    @classmethod
    def _no_vacios(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("No puede quedar vacío")
        return v


class PrecioUpdate(BaseModel):
    """RF-09 / HU-03: actualizar solo el precio."""
    precio: Decimal | None


# ─── Escritura: Estante (RF-02) ───────────────────────────────────────────────

class EstanteCreate(BaseModel):
    codigo: str
    etiqueta: str | None = None
    zona_id: uuid.UUID | None = None
    pos_x: float = 0
    pos_y: float = 0
    ancho: float = 12
    alto: float = 10
    color: str | None = None
    cantidad_niveles: int = 1  # niveles a crear junto con el estante (1..N)

    @field_validator("codigo")
    @classmethod
    def _codigo_norm(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not v:
            raise ValueError("El código es obligatorio")
        return v

    @field_validator("cantidad_niveles")
    @classmethod
    def _cantidad_valida(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Debe crear al menos un nivel")
        return v


class EstanteUpdate(BaseModel):
    codigo: str | None = None
    etiqueta: str | None = None
    zona_id: uuid.UUID | None = None
    pos_x: float | None = None
    pos_y: float | None = None
    ancho: float | None = None
    alto: float | None = None
    color: str | None = None

    @field_validator("codigo")
    @classmethod
    def _codigo_norm(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().upper()
        if not v:
            raise ValueError("El código no puede quedar vacío")
        return v


# ─── Escritura: Niveles ("pisos" del estante — RF-02) ─────────────────────────

def _etiqueta_nivel(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class NivelCreate(BaseModel):
    estante_id: uuid.UUID
    etiqueta: str | None = None

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta_norm(cls, v: str | None) -> str | None:
        return _etiqueta_nivel(v)


class NivelUpdate(BaseModel):
    etiqueta: str | None = None

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta_norm(cls, v: str | None) -> str | None:
        return _etiqueta_nivel(v)


# ─── Mapa: guardado de posiciones (RF-10 / CU-05) ─────────────────────────────

class EstantePosicion(BaseModel):
    id: uuid.UUID
    pos_x: float
    pos_y: float
    ancho: float | None = None
    alto: float | None = None
    color: str | None = None


class PosicionesUpdate(BaseModel):
    posiciones: list[EstantePosicion]


# ─── Mapa: anotaciones (flechas / textos — ventanas, escaleras, puertas) ───────

class AnotacionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    zona_id: uuid.UUID | None
    tipo: str
    texto: str | None
    pos_x: float
    pos_y: float
    ancho: float
    alto: float
    rotacion: float
    color: str | None = None


class AnotacionCreate(BaseModel):
    tipo: str = "texto"
    texto: str | None = None
    zona_id: uuid.UUID | None = None
    pos_x: float = 40
    pos_y: float = 40
    ancho: float = 14
    alto: float = 6
    rotacion: float = 0
    color: str | None = None

    @field_validator("tipo")
    @classmethod
    def _tipo_valido(cls, v: str) -> str:
        v = (v or "texto").strip().lower()
        if v not in ("texto", "flecha"):
            raise ValueError("El tipo debe ser 'texto' o 'flecha'")
        return v


class AnotacionItem(BaseModel):
    """Estado completo de una anotación para el guardado en lote del editor."""
    id: uuid.UUID
    texto: str | None = None
    pos_x: float
    pos_y: float
    ancho: float
    alto: float
    rotacion: float = 0
    color: str | None = None


class AnotacionesUpdate(BaseModel):
    anotaciones: list[AnotacionItem]


# ─── Escritura: Colección (RN-10) ─────────────────────────────────────────────

class ColeccionCreate(BaseModel):
    nombre: str
    descripcion: str | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre_norm(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v


# ─── Importación (RF-05 / CU-04) ──────────────────────────────────────────────

class ImportFilaError(BaseModel):
    fila: int
    motivo: str
    titulo: str | None = None


class ImportResultado(BaseModel):
    dry_run: bool
    total_filas: int
    creados: int
    actualizados: int
    sin_ubicar: int
    errores: list[ImportFilaError]
    columnas_detectadas: dict[str, str]  # campo_destino -> nombre_columna_original
