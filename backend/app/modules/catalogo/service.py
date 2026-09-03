import uuid
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.modules.catalogo.models import Zona, Coleccion, Estante, Libro, AnotacionMapa, Nivel
from app.modules.catalogo.schemas import (
    LibroResponse, EstanteResponse, NivelResponse, LibroCreate, LibroUpdate,
    EstanteCreate, EstanteUpdate, ColeccionCreate, ZonaCreate, ZonaUpdate,
    NivelCreate, NivelUpdate,
    AnotacionResponse, AnotacionCreate,
)
from app.modules.configuracion.service import obtener_configuracion
from app.shared.exceptions import NotFoundError, ConflictError, ValidationError


def _to_nivel_response(n: Nivel, total_libros: int = 0) -> NivelResponse:
    return NivelResponse(
        id=n.id, estante_id=n.estante_id, numero=n.numero,
        etiqueta=n.etiqueta, total_libros=total_libros,
    )


def _to_estante_response(
    e: Estante, total_libros: int = 0, conteos_nivel: dict | None = None,
) -> EstanteResponse:
    conteos_nivel = conteos_nivel or {}
    niveles = [
        _to_nivel_response(n, conteos_nivel.get(n.id, 0))
        for n in sorted(e.niveles, key=lambda n: n.numero)
    ]
    return EstanteResponse(
        id=e.id, codigo=e.codigo, etiqueta=e.etiqueta, zona_id=e.zona_id,
        pos_x=float(e.pos_x), pos_y=float(e.pos_y),
        ancho=float(e.ancho), alto=float(e.alto), color=e.color,
        total_libros=total_libros, niveles=niveles,
    )


# ─── Lectura ──────────────────────────────────────────────────────────────────

def listar_zonas(db: Session) -> list[Zona]:
    return db.query(Zona).order_by(Zona.orden, Zona.nombre).all()


def listar_colecciones(db: Session) -> list[Coleccion]:
    return db.query(Coleccion).order_by(Coleccion.nombre).all()


def listar_estantes(db: Session) -> list[EstanteResponse]:
    # Conteo de libros por estante en una sola query (para RN-08 en la UI).
    conteos = dict(
        db.query(Libro.estante_id, func.count(Libro.id))
        .filter(Libro.estante_id.isnot(None))
        .group_by(Libro.estante_id)
        .all()
    )
    # Conteo de libros por nivel (para el selector de niveles del mapa).
    conteos_nivel = dict(
        db.query(Libro.nivel_id, func.count(Libro.id))
        .filter(Libro.nivel_id.isnot(None))
        .group_by(Libro.nivel_id)
        .all()
    )
    estantes = (
        db.query(Estante).options(selectinload(Estante.niveles)).order_by(Estante.codigo).all()
    )
    return [_to_estante_response(e, conteos.get(e.id, 0), conteos_nivel) for e in estantes]


def _to_libro_response(lb: Libro) -> LibroResponse:
    return LibroResponse(
        id=lb.id, isbn=lb.isbn, titulo=lb.titulo, autor=lb.autor,
        editorial=lb.editorial, precio=lb.precio,
        coleccion_id=lb.coleccion_id, estante_id=lb.estante_id, nivel_id=lb.nivel_id,
        estante_codigo=lb.estante.codigo if lb.estante else None,
        nivel_numero=lb.nivel.numero if lb.nivel else None,
        coleccion_nombre=lb.coleccion.nombre if lb.coleccion else None,
    )


def listar_libros(
    db: Session,
    q: str | None = None,
    coleccion_id=None,
    estante_id=None,
    nivel_id=None,
    sin_ubicar: bool | None = None,
) -> list[LibroResponse]:
    """Listado con filtros (RF-06). Búsqueda case-insensitive por título/autor/ISBN (CU-01)."""
    query = db.query(Libro).options(
        selectinload(Libro.estante), selectinload(Libro.coleccion), selectinload(Libro.nivel),
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            Libro.titulo.ilike(like) | Libro.autor.ilike(like) | Libro.isbn.ilike(like)
        )
    if coleccion_id:
        query = query.filter(Libro.coleccion_id == coleccion_id)
    if estante_id:
        query = query.filter(Libro.estante_id == estante_id)
    if nivel_id:
        query = query.filter(Libro.nivel_id == nivel_id)
    if sin_ubicar is True:
        query = query.filter(Libro.estante_id.is_(None))
    return [_to_libro_response(lb) for lb in query.order_by(Libro.titulo).all()]


# ─── Escritura: Libro ─────────────────────────────────────────────────────────

def _validar_isbn_unico(db: Session, isbn: str | None, excluir_id: uuid.UUID | None = None) -> None:
    """RN-01: no puede haber dos libros con el mismo ISBN."""
    if not isbn:
        return
    query = db.query(Libro).filter(Libro.isbn == isbn)
    if excluir_id:
        query = query.filter(Libro.id != excluir_id)
    if query.first():
        raise ConflictError(f"Ya existe un libro con el ISBN {isbn}")


def _validar_isbn_obligatorio(db: Session, isbn: str | None) -> None:
    """RN-01/RN-02: si Configuración marca el ISBN como obligatorio, no se puede
    crear/editar un libro sin ISBN. El admin puede desactivarlo en Configuración."""
    if not isbn and obtener_configuracion(db).isbn_obligatorio:
        raise ValidationError(
            "El ISBN es obligatorio. Para cargar libros sin ISBN, "
            "desactivá esa opción en Configuración."
        )


def _validar_fk(db: Session, coleccion_id, estante_id) -> None:
    if coleccion_id and not db.get(Coleccion, coleccion_id):
        raise NotFoundError("La colección indicada no existe")
    if estante_id and not db.get(Estante, estante_id):
        raise NotFoundError("El estante indicado no existe")


def _resolver_nivel(db: Session, estante_id, nivel_id, nivel_explicito: bool):
    """Valida la coherencia estante↔nivel y devuelve el nivel_id normalizado.

    Un nivel debe pertenecer al estante del libro. Si no coincide: error cuando el
    nivel vino explícito en el request; si se arrastró de un valor previo (p. ej. el
    estante cambió), se limpia silenciosamente a None.
    """
    if nivel_id is None:
        return None
    nivel = db.get(Nivel, nivel_id)
    if not nivel:
        raise NotFoundError("El nivel indicado no existe")
    if nivel.estante_id != estante_id:
        if nivel_explicito:
            raise ConflictError("El nivel seleccionado no pertenece al estante indicado")
        return None
    return nivel_id


def obtener_libro(db: Session, libro_id: uuid.UUID) -> Libro:
    lb = db.get(Libro, libro_id)
    if not lb:
        raise NotFoundError("Libro no encontrado")
    return lb


def crear_libro(db: Session, data: LibroCreate) -> LibroResponse:
    _validar_isbn_obligatorio(db, data.isbn)
    _validar_isbn_unico(db, data.isbn)
    _validar_fk(db, data.coleccion_id, data.estante_id)
    payload = data.model_dump()
    payload["nivel_id"] = _resolver_nivel(db, data.estante_id, data.nivel_id, nivel_explicito=True)
    lb = Libro(**payload)
    db.add(lb)
    db.commit()
    db.refresh(lb)
    return _to_libro_response(lb)


def actualizar_libro(db: Session, libro_id: uuid.UUID, data: LibroUpdate) -> LibroResponse:
    lb = obtener_libro(db, libro_id)
    cambios = data.model_dump(exclude_unset=True)
    if "isbn" in cambios:
        _validar_isbn_obligatorio(db, cambios["isbn"])
        _validar_isbn_unico(db, cambios["isbn"], excluir_id=libro_id)
    _validar_fk(db, cambios.get("coleccion_id"), cambios.get("estante_id"))
    # Coherencia estante↔nivel: recalcula el nivel según el estante final.
    estante_final = cambios.get("estante_id", lb.estante_id)
    nivel_final = cambios.get("nivel_id", lb.nivel_id)
    cambios["nivel_id"] = _resolver_nivel(
        db, estante_final, nivel_final, nivel_explicito="nivel_id" in cambios,
    )
    for campo, valor in cambios.items():
        setattr(lb, campo, valor)
    db.commit()
    db.refresh(lb)
    return _to_libro_response(lb)


def actualizar_precio(db: Session, libro_id: uuid.UUID, precio) -> LibroResponse:
    """RF-09 / HU-03: actualiza solo el precio sin tocar el resto (RN-06)."""
    lb = obtener_libro(db, libro_id)
    lb.precio = precio
    db.commit()
    db.refresh(lb)
    return _to_libro_response(lb)


def eliminar_libro(db: Session, libro_id: uuid.UUID) -> None:
    lb = obtener_libro(db, libro_id)
    db.delete(lb)
    db.commit()


# ─── Escritura: Estante ───────────────────────────────────────────────────────

def _validar_codigo_estante(db: Session, codigo: str, zona_id, excluir_id=None) -> None:
    """RN-04: el código de estante es único dentro de una misma zona."""
    query = db.query(Estante).filter(Estante.codigo == codigo, Estante.zona_id == zona_id)
    if excluir_id:
        query = query.filter(Estante.id != excluir_id)
    if query.first():
        raise ConflictError(f"Ya existe un estante '{codigo}' en esa zona")


def obtener_estante(db: Session, estante_id: uuid.UUID) -> Estante:
    e = db.get(Estante, estante_id)
    if not e:
        raise NotFoundError("Estante no encontrado")
    return e


def crear_estante(db: Session, data: EstanteCreate) -> EstanteResponse:
    if data.zona_id and not db.get(Zona, data.zona_id):
        raise NotFoundError("La zona indicada no existe")
    _validar_codigo_estante(db, data.codigo, data.zona_id)
    campos = data.model_dump()
    cantidad = campos.pop("cantidad_niveles", 1)
    e = Estante(**campos)
    db.add(e)
    db.flush()
    # Niveles 1..N (abajo→arriba) creados junto con el estante (RF-02).
    for numero in range(1, cantidad + 1):
        db.add(Nivel(estante_id=e.id, numero=numero))
    db.commit()
    db.refresh(e)
    return _to_estante_response(e, 0)


def actualizar_estante(db: Session, estante_id: uuid.UUID, data: EstanteUpdate) -> EstanteResponse:
    e = obtener_estante(db, estante_id)
    cambios = data.model_dump(exclude_unset=True)
    nuevo_codigo = cambios.get("codigo", e.codigo)
    nueva_zona = cambios.get("zona_id", e.zona_id)
    if "zona_id" in cambios and cambios["zona_id"] and not db.get(Zona, cambios["zona_id"]):
        raise NotFoundError("La zona indicada no existe")
    if "codigo" in cambios or "zona_id" in cambios:
        _validar_codigo_estante(db, nuevo_codigo, nueva_zona, excluir_id=estante_id)
    for campo, valor in cambios.items():
        setattr(e, campo, valor)
    db.commit()
    db.refresh(e)
    total = db.query(func.count(Libro.id)).filter(Libro.estante_id == e.id).scalar() or 0
    return _to_estante_response(e, total)


def actualizar_posiciones(db: Session, posiciones) -> int:
    """Guarda en lote la geometría (y color) de los estantes editados en el mapa
    (drag & drop / resize — RF-10 / CU-05). Devuelve cuántos se actualizaron."""
    actualizados = 0
    for pos in posiciones:
        e = db.get(Estante, pos.id)
        if not e:
            continue
        e.pos_x = pos.pos_x
        e.pos_y = pos.pos_y
        if pos.ancho is not None:
            e.ancho = pos.ancho
        if pos.alto is not None:
            e.alto = pos.alto
        # color viene siempre en el payload; None limpia el color (vuelve al de zona).
        e.color = pos.color
        actualizados += 1
    db.commit()
    return actualizados


# ─── Mapa: anotaciones (flechas / textos) ─────────────────────────────────────

def _to_anotacion_response(a: AnotacionMapa) -> AnotacionResponse:
    return AnotacionResponse(
        id=a.id, zona_id=a.zona_id, tipo=a.tipo, texto=a.texto,
        pos_x=float(a.pos_x), pos_y=float(a.pos_y),
        ancho=float(a.ancho), alto=float(a.alto),
        rotacion=float(a.rotacion), color=a.color,
    )


def listar_anotaciones(db: Session) -> list[AnotacionResponse]:
    filas = db.query(AnotacionMapa).order_by(AnotacionMapa.created_at).all()
    return [_to_anotacion_response(a) for a in filas]


def crear_anotacion(db: Session, data: AnotacionCreate) -> AnotacionResponse:
    if data.zona_id and not db.get(Zona, data.zona_id):
        raise NotFoundError("La zona indicada no existe")
    a = AnotacionMapa(**data.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return _to_anotacion_response(a)


def obtener_anotacion(db: Session, anotacion_id: uuid.UUID) -> AnotacionMapa:
    a = db.get(AnotacionMapa, anotacion_id)
    if not a:
        raise NotFoundError("Anotación no encontrada")
    return a


def actualizar_anotaciones(db: Session, anotaciones) -> int:
    """Guarda en lote texto/geometría/rotación/color de las anotaciones editadas."""
    actualizados = 0
    for item in anotaciones:
        a = db.get(AnotacionMapa, item.id)
        if not a:
            continue
        a.texto = item.texto
        a.pos_x = item.pos_x
        a.pos_y = item.pos_y
        a.ancho = item.ancho
        a.alto = item.alto
        a.rotacion = item.rotacion
        a.color = item.color
        actualizados += 1
    db.commit()
    return actualizados


def eliminar_anotacion(db: Session, anotacion_id: uuid.UUID) -> None:
    a = obtener_anotacion(db, anotacion_id)
    db.delete(a)
    db.commit()


def eliminar_estante(db: Session, estante_id: uuid.UUID) -> None:
    """RN-08: no se puede eliminar un estante con libros asignados."""
    e = obtener_estante(db, estante_id)
    total = db.query(func.count(Libro.id)).filter(Libro.estante_id == e.id).scalar() or 0
    if total > 0:
        raise ConflictError(
            f"El estante '{e.codigo}' tiene {total} libro(s) asignado(s). "
            "Reasignalos o dejalos 'Sin ubicar' antes de eliminarlo."
        )
    db.delete(e)
    db.commit()


# ─── Escritura: Niveles ("pisos" del estante) ─────────────────────────────────

def _conteo_libros_nivel(db: Session, nivel_id: uuid.UUID) -> int:
    return db.query(func.count(Libro.id)).filter(Libro.nivel_id == nivel_id).scalar() or 0


def obtener_nivel(db: Session, nivel_id: uuid.UUID) -> Nivel:
    n = db.get(Nivel, nivel_id)
    if not n:
        raise NotFoundError("Nivel no encontrado")
    return n


def crear_nivel(db: Session, data: NivelCreate) -> NivelResponse:
    estante = db.get(Estante, data.estante_id)
    if not estante:
        raise NotFoundError("El estante indicado no existe")
    # Numera al final (max + 1), manteniendo 1..N contiguo.
    max_num = (
        db.query(func.max(Nivel.numero)).filter(Nivel.estante_id == data.estante_id).scalar() or 0
    )
    n = Nivel(estante_id=data.estante_id, numero=max_num + 1, etiqueta=data.etiqueta)
    db.add(n)
    db.commit()
    db.refresh(n)
    return _to_nivel_response(n, 0)


def actualizar_nivel(db: Session, nivel_id: uuid.UUID, data: NivelUpdate) -> NivelResponse:
    n = obtener_nivel(db, nivel_id)
    cambios = data.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(n, campo, valor)
    db.commit()
    db.refresh(n)
    return _to_nivel_response(n, _conteo_libros_nivel(db, n.id))


def eliminar_nivel(db: Session, nivel_id: uuid.UUID) -> None:
    """Guarda análoga a RN-08: no se puede eliminar un nivel con libros.
    Tras borrar, renumera los niveles restantes del estante para mantenerlos 1..N."""
    n = obtener_nivel(db, nivel_id)
    total = _conteo_libros_nivel(db, n.id)
    if total > 0:
        raise ConflictError(
            f"El nivel {n.numero} tiene {total} libro(s) asignado(s). "
            "Reasignalos antes de eliminarlo."
        )
    estante_id = n.estante_id
    db.delete(n)
    db.flush()
    # Renumerar 1..N por orden actual (evita huecos tras el borrado).
    restantes = (
        db.query(Nivel).filter(Nivel.estante_id == estante_id).order_by(Nivel.numero).all()
    )
    for idx, nivel in enumerate(restantes, start=1):
        if nivel.numero != idx:
            nivel.numero = idx
    db.commit()


# ─── Escritura: Colección ─────────────────────────────────────────────────────

# ─── Escritura: Zona (RF-11) ──────────────────────────────────────────────────

def obtener_zona(db: Session, zona_id: uuid.UUID) -> Zona:
    z = db.get(Zona, zona_id)
    if not z:
        raise NotFoundError("Zona no encontrada")
    return z


def crear_zona(db: Session, data: ZonaCreate) -> Zona:
    existe = db.query(Zona).filter(func.lower(Zona.nombre) == data.nombre.lower()).first()
    if existe:
        raise ConflictError(f"Ya existe la zona '{data.nombre}'")
    z = Zona(nombre=data.nombre, orden=data.orden)
    db.add(z)
    db.commit()
    db.refresh(z)
    return z


def actualizar_zona(db: Session, zona_id: uuid.UUID, data: ZonaUpdate) -> Zona:
    z = obtener_zona(db, zona_id)
    cambios = data.model_dump(exclude_unset=True)
    if "nombre" in cambios:
        dup = (
            db.query(Zona)
            .filter(func.lower(Zona.nombre) == cambios["nombre"].lower(), Zona.id != zona_id)
            .first()
        )
        if dup:
            raise ConflictError(f"Ya existe la zona '{cambios['nombre']}'")
    for campo, valor in cambios.items():
        setattr(z, campo, valor)
    db.commit()
    db.refresh(z)
    return z


def eliminar_zona(db: Session, zona_id: uuid.UUID) -> None:
    """No se puede eliminar una zona con estantes (mismo criterio que RN-08)."""
    z = obtener_zona(db, zona_id)
    total = db.query(func.count(Estante.id)).filter(Estante.zona_id == z.id).scalar() or 0
    if total > 0:
        raise ConflictError(
            f"La zona '{z.nombre}' tiene {total} estante(s). "
            "Movelos a otra zona antes de eliminarla."
        )
    db.delete(z)
    db.commit()


# ─── Escritura: Colección (RN-10) ─────────────────────────────────────────────

def crear_coleccion(db: Session, data: ColeccionCreate) -> Coleccion:
    existe = db.query(Coleccion).filter(func.lower(Coleccion.nombre) == data.nombre.lower()).first()
    if existe:
        raise ConflictError(f"Ya existe la colección '{data.nombre}'")
    col = Coleccion(nombre=data.nombre, descripcion=data.descripcion)
    db.add(col)
    db.commit()
    db.refresh(col)
    return col
