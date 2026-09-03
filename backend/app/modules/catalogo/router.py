import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.modules.catalogo import service, importer
from app.modules.catalogo.schemas import (
    LibroResponse, EstanteResponse, ColeccionResponse, ZonaResponse,
    LibroCreate, LibroUpdate, PrecioUpdate,
    EstanteCreate, EstanteUpdate, ColeccionCreate, ImportResultado,
    PosicionesUpdate, ZonaCreate, ZonaUpdate,
    NivelResponse, NivelCreate, NivelUpdate,
    AnotacionResponse, AnotacionCreate, AnotacionesUpdate,
)

# Lectura: pública (RF-07). Escritura (ABM): protegida con require_admin (RN-05).
router = APIRouter(prefix="/catalogo", tags=["Catálogo"])

ADMIN = Depends(require_admin)


# ─── Lectura ──────────────────────────────────────────────────────────────────

@router.get("/libros", response_model=list[LibroResponse])
def listar_libros(
    q: str | None = None,
    coleccion_id: uuid.UUID | None = None,
    estante_id: uuid.UUID | None = None,
    nivel_id: uuid.UUID | None = None,
    sin_ubicar: bool | None = None,
    db: Session = Depends(get_db),
):
    return service.listar_libros(
        db, q=q, coleccion_id=coleccion_id, estante_id=estante_id,
        nivel_id=nivel_id, sin_ubicar=sin_ubicar,
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


# ─── Escritura: Libros (RF-04 / RF-09) ────────────────────────────────────────

@router.post("/libros", response_model=LibroResponse, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN])
def crear_libro(data: LibroCreate, db: Session = Depends(get_db)):
    return service.crear_libro(db, data)


@router.put("/libros/{libro_id}", response_model=LibroResponse, dependencies=[ADMIN])
def actualizar_libro(libro_id: uuid.UUID, data: LibroUpdate, db: Session = Depends(get_db)):
    return service.actualizar_libro(db, libro_id, data)


@router.patch("/libros/{libro_id}/precio", response_model=LibroResponse, dependencies=[ADMIN])
def actualizar_precio(libro_id: uuid.UUID, data: PrecioUpdate, db: Session = Depends(get_db)):
    return service.actualizar_precio(db, libro_id, data.precio)


@router.delete("/libros/{libro_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN])
def eliminar_libro(libro_id: uuid.UUID, db: Session = Depends(get_db)):
    service.eliminar_libro(db, libro_id)


# ─── Escritura: Estantes (RF-02) ──────────────────────────────────────────────

@router.post("/estantes", response_model=EstanteResponse, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN])
def crear_estante(data: EstanteCreate, db: Session = Depends(get_db)):
    return service.crear_estante(db, data)


# Declarado ANTES de /estantes/{estante_id} para que "posiciones" no se intente
# parsear como UUID (RF-10 / CU-05: guardado en lote del drag & drop).
@router.put("/estantes/posiciones", dependencies=[ADMIN])
def guardar_posiciones(data: PosicionesUpdate, db: Session = Depends(get_db)):
    actualizados = service.actualizar_posiciones(db, data.posiciones)
    return {"actualizados": actualizados}


@router.put("/estantes/{estante_id}", response_model=EstanteResponse, dependencies=[ADMIN])
def actualizar_estante(estante_id: uuid.UUID, data: EstanteUpdate, db: Session = Depends(get_db)):
    return service.actualizar_estante(db, estante_id, data)


@router.delete("/estantes/{estante_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN])
def eliminar_estante(estante_id: uuid.UUID, db: Session = Depends(get_db)):
    service.eliminar_estante(db, estante_id)


# ─── Escritura: Niveles ("pisos" del estante — RF-02) ─────────────────────────

@router.post("/niveles", response_model=NivelResponse, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN])
def crear_nivel(data: NivelCreate, db: Session = Depends(get_db)):
    return service.crear_nivel(db, data)


@router.put("/niveles/{nivel_id}", response_model=NivelResponse, dependencies=[ADMIN])
def actualizar_nivel(nivel_id: uuid.UUID, data: NivelUpdate, db: Session = Depends(get_db)):
    return service.actualizar_nivel(db, nivel_id, data)


@router.delete("/niveles/{nivel_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN])
def eliminar_nivel(nivel_id: uuid.UUID, db: Session = Depends(get_db)):
    service.eliminar_nivel(db, nivel_id)


# ─── Escritura: Anotaciones del mapa (flechas / textos) ───────────────────────

@router.post("/anotaciones", response_model=AnotacionResponse, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN])
def crear_anotacion(data: AnotacionCreate, db: Session = Depends(get_db)):
    return service.crear_anotacion(db, data)


# Literal antes de /{anotacion_id} para que "posiciones" no se parsee como UUID.
@router.put("/anotaciones/posiciones", dependencies=[ADMIN])
def guardar_anotaciones(data: AnotacionesUpdate, db: Session = Depends(get_db)):
    actualizados = service.actualizar_anotaciones(db, data.anotaciones)
    return {"actualizados": actualizados}


@router.delete("/anotaciones/{anotacion_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN])
def eliminar_anotacion(anotacion_id: uuid.UUID, db: Session = Depends(get_db)):
    service.eliminar_anotacion(db, anotacion_id)


# ─── Escritura: Zonas (RF-11) ─────────────────────────────────────────────────

@router.post("/zonas", response_model=ZonaResponse, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN])
def crear_zona(data: ZonaCreate, db: Session = Depends(get_db)):
    return service.crear_zona(db, data)


@router.put("/zonas/{zona_id}", response_model=ZonaResponse, dependencies=[ADMIN])
def actualizar_zona(zona_id: uuid.UUID, data: ZonaUpdate, db: Session = Depends(get_db)):
    return service.actualizar_zona(db, zona_id, data)


@router.delete("/zonas/{zona_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[ADMIN])
def eliminar_zona(zona_id: uuid.UUID, db: Session = Depends(get_db)):
    service.eliminar_zona(db, zona_id)


# ─── Escritura: Colecciones (RN-10) ───────────────────────────────────────────

@router.post("/colecciones", response_model=ColeccionResponse, status_code=status.HTTP_201_CREATED, dependencies=[ADMIN])
def crear_coleccion(data: ColeccionCreate, db: Session = Depends(get_db)):
    return service.crear_coleccion(db, data)


# ─── Importación (RF-05 / CU-04) ──────────────────────────────────────────────

@router.post("/libros/importar", response_model=ImportResultado, dependencies=[ADMIN])
async def importar_libros(
    archivo: UploadFile = File(...),
    dry_run: bool = Query(True, description="True = solo previsualiza (no persiste)."),
    db: Session = Depends(get_db),
):
    """Sube un .csv/.xlsx y lo importa. Con dry_run=true devuelve el reporte de
    lo que se haría sin guardar (preview); con dry_run=false persiste los cambios."""
    contenido = await archivo.read()
    return importer.importar(db, contenido, archivo.filename or "", dry_run=dry_run)
