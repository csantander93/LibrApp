import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import audit_ctx, AuditContext, require_permiso
from app.modules.auth import permisos as P
from app.modules.auth.models import Usuario
from app.modules.catalogo import service, importer
from app.modules.catalogo.schemas import (
    LibroResponse, EstanteResponse, ColeccionResponse, ZonaResponse,
    LibroCreate, LibroUpdate, PrecioUpdate,
    EstanteCreate, EstanteUpdate, ColeccionCreate, ColeccionUpdate, ImportResultado,
    PosicionesUpdate, ZonaCreate, ZonaUpdate, LibrosOrdenUpdate, IdsRequest,
    CategoriaLoteRequest, UbicarLoteRequest,
    NivelResponse, NivelCreate, NivelUpdate,
    AnotacionResponse, AnotacionCreate, AnotacionesUpdate,
    LibroImagenResponse,
    CampoLibroResponse, CampoLibroCreate, CampoLibroUpdate,
)

# Lectura: pública (RF-07). Escritura (ABM): protegida por permiso de sección (RN-05).
router = APIRouter(prefix="/catalogo", tags=["Catálogo"])

# Contextos de auditoría por sección: cada uno exige el permiso correspondiente y
# arma el log de acción en una sola línea (quién, qué, cuándo, desde qué IP).
# Este router mezcla tres secciones del panel: catálogo, estantes y mapa.
AUDIT = Depends(audit_ctx(P.CATALOGO))        # libros, colecciones, campos, imágenes
AUDIT_EST = Depends(audit_ctx(P.ESTANTES))    # estantes, niveles, zonas
AUDIT_MAPA = Depends(audit_ctx(P.MAPA))       # posiciones, anotaciones, orden de libros
AUDIT_IMP = Depends(audit_ctx(P.IMPORTAR))    # importación Excel/CSV
AUDIT_DEL = Depends(audit_ctx(P.ELIMINAR))    # borrado en lote y purga (acciones peligrosas)

# Módulo con el que se etiquetan todas las acciones de este router en el log.
_MODULO = "Catálogo"


def _con_cambios(detalle: str, obj) -> str:
    """Anexa al detalle la descripción de campos modificados, si la hay (la deja
    el service en `_audit_cambios`)."""
    cambios = getattr(obj, "_audit_cambios", "")
    return f"{detalle} — {cambios}" if cambios else detalle


# ─── Lectura ──────────────────────────────────────────────────────────────────

@router.get("/libros", response_model=list[LibroResponse])
def listar_libros(
    q: str | None = None,
    coleccion_id: uuid.UUID | None = None,
    estante_id: uuid.UUID | None = None,
    nivel_id: uuid.UUID | None = None,
    sin_ubicar: bool | None = None,
    precio_min: float | None = None,
    precio_max: float | None = None,
    autor: str | None = None,
    editorial: str | None = None,
    db: Session = Depends(get_db),
):
    return service.listar_libros(
        db, q=q, coleccion_id=coleccion_id, estante_id=estante_id,
        nivel_id=nivel_id, sin_ubicar=sin_ubicar,
        precio_min=precio_min, precio_max=precio_max, autor=autor, editorial=editorial,
    )


@router.get("/estantes", response_model=list[EstanteResponse])
def listar_estantes(db: Session = Depends(get_db)):
    return service.listar_estantes(db)


@router.get("/colecciones", response_model=list[ColeccionResponse])
def listar_colecciones(db: Session = Depends(get_db)):
    return service.listar_colecciones(db)


@router.get("/zonas", response_model=list[ZonaResponse])
def listar_zonas(db: Session = Depends(get_db)):
    return service.listar_zonas(db)


@router.get("/anotaciones", response_model=list[AnotacionResponse])
def listar_anotaciones(db: Session = Depends(get_db)):
    return service.listar_anotaciones(db)


# Campos personalizados: lectura pública (el form del admin y el detalle público
# los necesitan para renderizar la ficha del libro).
@router.get("/campos", response_model=list[CampoLibroResponse])
def listar_campos(db: Session = Depends(get_db)):
    return service.listar_campos(db)


# Imagen de libro: lectura pública (RF-07) — se sirve el binario tal cual. Los ids
# vienen en cada LibroResponse (campo `imagenes`).
@router.get("/imagenes/{imagen_id}")
def obtener_imagen(imagen_id: uuid.UUID, db: Session = Depends(get_db)):
    img = service.obtener_imagen(db, imagen_id)
    return Response(
        content=img.contenido,
        media_type=img.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ─── Escritura: Libros (RF-04 / RF-09) ────────────────────────────────────────

# Declarado ANTES de /libros/{libro_id} para que "orden" no se parsee como UUID
# (guardado en lote del reordenamiento de lomos en el mapa — RF-01/RF-03).
@router.put("/libros/orden")
def guardar_orden_libros(data: LibrosOrdenUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_MAPA):
    actualizados = service.actualizar_orden_libros(db, data.libros)
    audit.registrar_accion(
        f"Reordenó libros en el mapa ({actualizados})", modulo="Mapa", accion="Edición",
    )
    return {"actualizados": actualizados}


# Declarado ANTES de /libros/{libro_id} para que "plantilla" no se parsee como UUID.
# Descarga la "bandeja" vacía a completar para importar (RF-05 / CU-04).
@router.get("/libros/plantilla")
def descargar_plantilla(
    formato: str = Query("csv", pattern="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_permiso(P.IMPORTAR)),
):
    contenido, filename, content_type = importer.generar_plantilla(db, formato)
    return Response(
        content=contenido,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/libros", response_model=LibroResponse, status_code=status.HTTP_201_CREATED)
def crear_libro(data: LibroCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.crear_libro(db, data)
    audit.registrar_accion(f"Creó el libro '{obj.titulo}'", modulo=_MODULO, accion="Creación")
    return obj


@router.put("/libros/{libro_id}", response_model=LibroResponse)
def actualizar_libro(libro_id: uuid.UUID, data: LibroUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.actualizar_libro(db, libro_id, data)
    audit.registrar_accion(_con_cambios(f"Editó el libro '{obj.titulo}'", obj), modulo=_MODULO, accion="Edición")
    return obj


@router.patch("/libros/{libro_id}/precio", response_model=LibroResponse)
def actualizar_precio(libro_id: uuid.UUID, data: PrecioUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.actualizar_precio(db, libro_id, data.precio)
    precio_txt = "vacío" if obj.precio is None else str(obj.precio)
    audit.registrar_accion(f"Actualizó el precio del libro '{obj.titulo}' a {precio_txt}", modulo=_MODULO, accion="Edición")
    return obj


@router.delete("/libros/{libro_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_libro(libro_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    libro = service.obtener_libro(db, libro_id)
    titulo = libro.titulo
    service.eliminar_libro(db, libro_id)
    audit.registrar_accion(f"Eliminó el libro '{titulo}'", modulo=_MODULO, accion="Eliminación")


# ─── Borrado en lote y purga (acciones peligrosas — permiso eliminar.ejecutar) ─

@router.post("/libros/eliminar-lote")
def eliminar_libros_lote(data: IdsRequest, db: Session = Depends(get_db), audit: AuditContext = AUDIT_DEL):
    n = service.eliminar_libros_lote(db, data.ids)
    audit.registrar_accion(f"Eliminó {n} libro(s) en lote", modulo=_MODULO, accion="Eliminación")
    return {"eliminados": n}


@router.post("/libros/purgar")
def purgar_catalogo(db: Session = Depends(get_db), audit: AuditContext = AUDIT_DEL):
    n = service.purgar_catalogo(db)
    audit.registrar_accion(f"Purgó el catálogo ({n} libros eliminados)", modulo=_MODULO, accion="Eliminación")
    return {"eliminados": n}


# ─── Acciones en lote sobre la selección: categorizar y ubicar ────────────────

@router.post("/libros/categoria-lote")
def asignar_categoria_lote(data: CategoriaLoteRequest, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    n = service.asignar_categoria_lote(db, data.ids, data.coleccion_id)
    if data.coleccion_id is None:
        detalle = f"Quitó la categoría a {n} libro(s)"
    else:
        col = service.obtener_coleccion(db, data.coleccion_id)
        detalle = f"Asignó la categoría '{col.nombre}' a {n} libro(s)"
    audit.registrar_accion(detalle, modulo=_MODULO, accion="Edición")
    return {"actualizados": n}


@router.post("/libros/ubicar-lote")
def ubicar_libros_lote(data: UbicarLoteRequest, db: Session = Depends(get_db), audit: AuditContext = AUDIT_MAPA):
    n = service.ubicar_libros_lote(db, data.ids, data.estante_id, data.nivel_id)
    if data.estante_id is None:
        detalle = f"Dejó sin ubicar {n} libro(s)"
    else:
        est = service.obtener_estante(db, data.estante_id)
        detalle = f"Ubicó {n} libro(s) en el estante '{est.codigo}'"
    audit.registrar_accion(detalle, modulo="Mapa", accion="Edición")
    return {"actualizados": n}


# ─── Imágenes del libro (RF-04) ───────────────────────────────────────────────

@router.post(
    "/libros/{libro_id}/imagenes",
    response_model=list[LibroImagenResponse],
    status_code=status.HTTP_201_CREATED,
)
async def subir_imagenes(
    libro_id: uuid.UUID,
    archivos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    audit: AuditContext = AUDIT,
):
    """Sube una o varias imágenes y las agrega a la galería del libro (portada u
    otras vistas). La primera imagen del libro queda como portada."""
    libro = service.obtener_libro(db, libro_id)
    creadas: list[LibroImagenResponse] = []
    for archivo in archivos:
        contenido = await archivo.read()
        img = service.agregar_imagen(
            db, libro_id, archivo.content_type or "", contenido,
        )
        creadas.append(LibroImagenResponse.model_validate(img))
    audit.registrar_accion(
        f"Agregó {len(creadas)} imagen(es) al libro '{libro.titulo}'",
        modulo=_MODULO, accion="Edición",
    )
    return creadas


@router.patch("/imagenes/{imagen_id}/principal", response_model=LibroImagenResponse)
def hacer_principal_imagen(imagen_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    img = service.hacer_principal_imagen(db, imagen_id)
    audit.registrar_accion("Definió la portada de un libro", modulo=_MODULO, accion="Edición")
    return LibroImagenResponse.model_validate(img)


@router.delete("/imagenes/{imagen_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_imagen(imagen_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    service.eliminar_imagen(db, imagen_id)
    audit.registrar_accion("Eliminó una imagen de un libro", modulo=_MODULO, accion="Eliminación")


# ─── Escritura: Estantes (RF-02) ──────────────────────────────────────────────

@router.post("/estantes", response_model=EstanteResponse, status_code=status.HTTP_201_CREATED)
def crear_estante(data: EstanteCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_EST):
    obj = service.crear_estante(db, data)
    audit.registrar_accion(f"Creó el estante '{obj.codigo}'", modulo=_MODULO, accion="Creación")
    return obj


# Declarado ANTES de /estantes/{estante_id} para que "posiciones" no se intente
# parsear como UUID (RF-10 / CU-05: guardado en lote del drag & drop).
@router.put("/estantes/posiciones")
def guardar_posiciones(data: PosicionesUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_MAPA):
    actualizados = service.actualizar_posiciones(db, data.posiciones)
    audit.registrar_accion(
        f"Guardó posiciones del mapa ({actualizados} estante(s))", modulo="Mapa", accion="Edición",
    )
    return {"actualizados": actualizados}


@router.put("/estantes/{estante_id}", response_model=EstanteResponse)
def actualizar_estante(estante_id: uuid.UUID, data: EstanteUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_EST):
    obj = service.actualizar_estante(db, estante_id, data)
    audit.registrar_accion(_con_cambios(f"Editó el estante '{obj.codigo}'", obj), modulo=_MODULO, accion="Edición")
    return obj


@router.delete("/estantes/{estante_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_estante(
    estante_id: uuid.UUID,
    reasignar_a: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    audit: AuditContext = AUDIT_EST,
):
    estante = service.obtener_estante(db, estante_id)
    codigo = estante.codigo
    movidos, destino = service.eliminar_estante(db, estante_id, reasignar_a)
    if movidos and destino:
        detalle = f" y movió {movidos} libro(s) al estante '{destino}'"
    elif movidos:
        detalle = f" y dejó {movidos} libro(s) sin ubicar"
    else:
        detalle = ""
    audit.registrar_accion(f"Eliminó el estante '{codigo}'{detalle}", modulo=_MODULO, accion="Eliminación")


@router.post("/estantes/eliminar-lote")
def eliminar_estantes_lote(data: IdsRequest, db: Session = Depends(get_db), audit: AuditContext = AUDIT_DEL):
    eliminados, desubicados = service.eliminar_estantes_lote(db, data.ids)
    audit.registrar_accion(
        f"Eliminó {eliminados} estante(s) en lote y dejó {desubicados} libro(s) sin ubicar",
        modulo=_MODULO, accion="Eliminación",
    )
    return {"eliminados": eliminados, "desubicados": desubicados}


# ─── Escritura: Niveles ("pisos" del estante — RF-02) ─────────────────────────

@router.post("/niveles", response_model=NivelResponse, status_code=status.HTTP_201_CREATED)
def crear_nivel(data: NivelCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_EST):
    obj = service.crear_nivel(db, data)
    audit.registrar_accion(f"Creó el nivel N.º {obj.numero}", modulo=_MODULO, accion="Creación")
    return obj


@router.put("/niveles/{nivel_id}", response_model=NivelResponse)
def actualizar_nivel(nivel_id: uuid.UUID, data: NivelUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_EST):
    obj = service.actualizar_nivel(db, nivel_id, data)
    audit.registrar_accion(_con_cambios(f"Editó el nivel N.º {obj.numero}", obj), modulo=_MODULO, accion="Edición")
    return obj


@router.delete("/niveles/{nivel_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_nivel(
    nivel_id: uuid.UUID,
    mover_a: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    audit: AuditContext = AUDIT_EST,
):
    nivel = service.obtener_nivel(db, nivel_id)
    numero = nivel.numero
    movidos = service.eliminar_nivel(db, nivel_id, mover_a)
    if movidos and mover_a:
        detalle = f" y movió {movidos} libro(s) a otro nivel"
    elif movidos:
        detalle = f" y dejó {movidos} libro(s) sin nivel"
    else:
        detalle = ""
    audit.registrar_accion(f"Eliminó el nivel N.º {numero}{detalle}", modulo=_MODULO, accion="Eliminación")


# ─── Escritura: Anotaciones del mapa (flechas / textos) ───────────────────────

@router.post("/anotaciones", response_model=AnotacionResponse, status_code=status.HTTP_201_CREATED)
def crear_anotacion(data: AnotacionCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_MAPA):
    obj = service.crear_anotacion(db, data)
    etiqueta = obj.texto or obj.tipo
    audit.registrar_accion(f"Creó una anotación del mapa ('{etiqueta}')", modulo="Mapa", accion="Creación")
    return obj


# Literal antes de /{anotacion_id} para que "posiciones" no se parsee como UUID.
@router.put("/anotaciones/posiciones")
def guardar_anotaciones(data: AnotacionesUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_MAPA):
    actualizados = service.actualizar_anotaciones(db, data.anotaciones)
    audit.registrar_accion(
        f"Guardó anotaciones del mapa ({actualizados})", modulo="Mapa", accion="Edición",
    )
    return {"actualizados": actualizados}


@router.delete("/anotaciones/{anotacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_anotacion(anotacion_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT_MAPA):
    anotacion = service.obtener_anotacion(db, anotacion_id)
    etiqueta = anotacion.texto or anotacion.tipo
    service.eliminar_anotacion(db, anotacion_id)
    audit.registrar_accion(f"Eliminó una anotación del mapa ('{etiqueta}')", modulo="Mapa", accion="Eliminación")


# ─── Escritura: Zonas (RF-11) ─────────────────────────────────────────────────

@router.post("/zonas", response_model=ZonaResponse, status_code=status.HTTP_201_CREATED)
def crear_zona(data: ZonaCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_EST):
    obj = service.crear_zona(db, data)
    audit.registrar_accion(f"Creó la zona '{obj.nombre}'", modulo=_MODULO, accion="Creación")
    return obj


@router.put("/zonas/{zona_id}", response_model=ZonaResponse)
def actualizar_zona(zona_id: uuid.UUID, data: ZonaUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT_EST):
    obj = service.actualizar_zona(db, zona_id, data)
    audit.registrar_accion(_con_cambios(f"Editó la zona '{obj.nombre}'", obj), modulo=_MODULO, accion="Edición")
    return obj


@router.delete("/zonas/{zona_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_zona(
    zona_id: uuid.UUID,
    mover_a: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    audit: AuditContext = AUDIT_EST,
):
    zona = service.obtener_zona(db, zona_id)
    nombre = zona.nombre
    movidos, destino = service.eliminar_zona(db, zona_id, mover_a)
    if movidos and destino:
        detalle = f" y movió {movidos} estante(s) a la zona '{destino}'"
    elif movidos:
        detalle = f" y dejó {movidos} estante(s) sin zona"
    else:
        detalle = ""
    audit.registrar_accion(f"Eliminó la zona '{nombre}'{detalle}", modulo=_MODULO, accion="Eliminación")


# ─── Escritura: Colecciones (RN-10) ───────────────────────────────────────────

@router.post("/colecciones", response_model=ColeccionResponse, status_code=status.HTTP_201_CREATED)
def crear_coleccion(data: ColeccionCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.crear_coleccion(db, data)
    audit.registrar_accion(f"Creó la categoría '{obj.nombre}'", modulo=_MODULO, accion="Creación")
    return obj


@router.put("/colecciones/{coleccion_id}", response_model=ColeccionResponse)
def actualizar_coleccion(coleccion_id: uuid.UUID, data: ColeccionUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.actualizar_coleccion(db, coleccion_id, data)
    audit.registrar_accion(_con_cambios(f"Editó la categoría '{obj.nombre}'", obj), modulo=_MODULO, accion="Edición")
    return obj


@router.delete("/colecciones/{coleccion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_coleccion(
    coleccion_id: uuid.UUID,
    mover_a: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    audit: AuditContext = AUDIT,
):
    col = service.obtener_coleccion(db, coleccion_id)
    nombre = col.nombre
    movidos, destino = service.eliminar_coleccion(db, coleccion_id, mover_a)
    if movidos and destino:
        detalle = f" y movió {movidos} libro(s) a la categoría '{destino}'"
    elif movidos:
        detalle = f" y dejó {movidos} libro(s) sin categoría"
    else:
        detalle = ""
    audit.registrar_accion(f"Eliminó la categoría '{nombre}'{detalle}", modulo=_MODULO, accion="Eliminación")


# ─── Escritura: Campos personalizados (dinámicos) de libros ───────────────────

@router.post("/campos", response_model=CampoLibroResponse, status_code=status.HTTP_201_CREATED)
def crear_campo(data: CampoLibroCreate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.crear_campo(db, data)
    audit.registrar_accion(f"Creó el campo personalizado '{obj.etiqueta}'", modulo=_MODULO, accion="Creación")
    return obj


@router.put("/campos/{campo_id}", response_model=CampoLibroResponse)
def actualizar_campo(campo_id: uuid.UUID, data: CampoLibroUpdate, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    obj = service.actualizar_campo(db, campo_id, data)
    audit.registrar_accion(_con_cambios(f"Editó el campo personalizado '{obj.etiqueta}'", obj), modulo=_MODULO, accion="Edición")
    return obj


@router.delete("/campos/{campo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_campo(campo_id: uuid.UUID, db: Session = Depends(get_db), audit: AuditContext = AUDIT):
    campo = service.obtener_campo(db, campo_id)
    etiqueta = campo.etiqueta
    service.eliminar_campo(db, campo_id)
    audit.registrar_accion(f"Eliminó el campo personalizado '{etiqueta}'", modulo=_MODULO, accion="Eliminación")


# ─── Importación (RF-05 / CU-04) ──────────────────────────────────────────────

@router.post("/libros/importar", response_model=ImportResultado)
async def importar_libros(
    archivo: UploadFile = File(...),
    dry_run: bool = Query(True, description="True = solo previsualiza (no persiste)."),
    db: Session = Depends(get_db),
    audit: AuditContext = AUDIT_IMP,
):
    """Sube un .csv/.xlsx y lo importa. Con dry_run=true devuelve el reporte de
    lo que se haría sin guardar (preview); con dry_run=false persiste los cambios."""
    contenido = await archivo.read()
    resultado = importer.importar(db, contenido, archivo.filename or "", dry_run=dry_run)
    # Solo se audita la importación real (no la previsualización/dry-run).
    if not resultado.dry_run:
        audit.registrar_accion(
            f"Importó '{archivo.filename or 'archivo'}': "
            f"{resultado.creados} creado(s), {resultado.actualizados} actualizado(s), "
            f"{resultado.sin_ubicar} sin ubicar",
            modulo="Importación", accion="Importación",
        )
    return resultado
