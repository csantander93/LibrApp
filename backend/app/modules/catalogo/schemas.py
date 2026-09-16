import uuid
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.modules.catalogo.models import TIPOS_CAMPO, TIPOS_ANOTACION, TEXTURAS_PISO


# ─── Respuestas de lectura ────────────────────────────────────────────────────

class ColeccionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    descripcion: str | None


def _textura_valida(v: str | None) -> str | None:
    """Normaliza la textura de piso; None/'' ⇒ None (grilla por defecto)."""
    if v is None:
        return None
    v = v.strip().lower()
    if not v or v == "grilla":
        return None
    if v not in TEXTURAS_PISO:
        raise ValueError(f"Textura inválida. Debe ser una de: {', '.join(TEXTURAS_PISO)}")
    return v


class ZonaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    orden: int
    textura: str | None = None


class ZonaCreate(BaseModel):
    nombre: str
    orden: int = 0
    textura: str | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre_norm(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v

    @field_validator("textura")
    @classmethod
    def _textura_norm(cls, v: str | None) -> str | None:
        return _textura_valida(v)


class ZonaUpdate(BaseModel):
    nombre: str | None = None
    orden: int | None = None
    textura: str | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre_norm(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede quedar vacío")
        return v

    @field_validator("textura")
    @classmethod
    def _textura_norm(cls, v: str | None) -> str | None:
        return _textura_valida(v)


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
    rotacion: float = 0
    color: str | None = None
    # Denormalizado para la UI.
    total_libros: int = 0
    niveles: list[NivelResponse] = []


class LibroImagenResponse(BaseModel):
    """Metadatos de una imagen de libro (sin el binario). El binario se pide
    aparte a GET /catalogo/imagenes/{id}."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    orden: int
    content_type: str


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
    # Orden manual dentro del nivel/estante (menor = primero).
    orden: int = 0
    estante_codigo: str | None = None
    nivel_numero: int | None = None
    coleccion_nombre: str | None = None
    # Ids de las imágenes ordenadas (la primera es la portada/principal).
    imagenes: list[uuid.UUID] = []
    # Valores de los campos personalizados: {codigo_campo: valor}.
    datos_extra: dict = {}


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
    # Valores de los campos personalizados (dinámicos). El service los valida
    # contra las definiciones activas (CampoLibro).
    datos_extra: dict | None = None

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
    datos_extra: dict | None = None

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


# ─── Reordenamiento de libros en el mapa (drag & drop de lomos) ────────────────

class LibroOrdenItem(BaseModel):
    id: uuid.UUID
    orden: int


class LibrosOrdenUpdate(BaseModel):
    libros: list[LibroOrdenItem]


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
    rotacion: float | None = None
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
    rotacion: float | None = None
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
        if v not in TIPOS_ANOTACION:
            raise ValueError(f"Tipo inválido. Debe ser uno de: {', '.join(TIPOS_ANOTACION)}")
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


# ─── Campos personalizados (dinámicos) de libros ──────────────────────────────

def _normalizar_opciones(opciones: list[str] | None) -> list[str] | None:
    """Limpia la lista de opciones de un select: descarta vacías, recorta espacios
    y elimina duplicados conservando el orden."""
    if opciones is None:
        return None
    vistas: list[str] = []
    for op in opciones:
        val = (op or "").strip()
        if val and val not in vistas:
            vistas.append(val)
    return vistas


class CampoLibroResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    etiqueta: str
    tipo: str
    opciones: list[str] | None = None
    requerido: bool
    orden: int
    activo: bool


class CampoLibroCreate(BaseModel):
    etiqueta: str
    tipo: str
    opciones: list[str] | None = None
    requerido: bool = False
    orden: int = 0

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta_norm(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("La etiqueta es obligatoria")
        return v

    @field_validator("tipo")
    @classmethod
    def _tipo_valido(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in TIPOS_CAMPO:
            raise ValueError(f"Tipo inválido. Debe ser uno de: {', '.join(TIPOS_CAMPO)}")
        return v

    @field_validator("opciones")
    @classmethod
    def _opciones_norm(cls, v: list[str] | None) -> list[str] | None:
        return _normalizar_opciones(v)

    @model_validator(mode="after")
    def _select_requiere_opciones(self):
        if self.tipo == "select" and not self.opciones:
            raise ValueError("Un campo de tipo selector necesita al menos una opción")
        # Las opciones solo tienen sentido para 'select'.
        if self.tipo != "select":
            self.opciones = None
        return self


class CampoLibroUpdate(BaseModel):
    etiqueta: str | None = None
    tipo: str | None = None
    opciones: list[str] | None = None
    requerido: bool | None = None
    orden: int | None = None
    activo: bool | None = None

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta_norm(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("La etiqueta no puede quedar vacía")
        return v

    @field_validator("tipo")
    @classmethod
    def _tipo_valido(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in TIPOS_CAMPO:
            raise ValueError(f"Tipo inválido. Debe ser uno de: {', '.join(TIPOS_CAMPO)}")
        return v

    @field_validator("opciones")
    @classmethod
    def _opciones_norm(cls, v: list[str] | None) -> list[str] | None:
        return _normalizar_opciones(v)


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
