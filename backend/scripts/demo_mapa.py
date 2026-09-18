"""Genera un mapa de demostración completo (para mostrar al cliente).

Arma un local de dos plantas (Planta Baja + Planta Alta) con estantes temáticos,
niveles, mobiliario/señalética, y **ubica los libros reales que estén "Sin ubicar"**
repartiéndolos por colección en los estantes que les corresponden.

Idempotente y no destructivo:
  - crea cada estante solo si no existe (por zona + código);
  - crea 4 niveles por estante solo si aún no tiene;
  - crea las anotaciones (mobiliario/señalética) solo si el mapa no tiene ninguna;
  - reubica únicamente libros con estante_id NULL (no toca lo ya ubicado).

Correr dentro del contenedor backend:
    docker compose exec -T backend python scripts/demo_mapa.py
"""
from collections import defaultdict

from app.core.database import SessionLocal
from app.modules.catalogo.models import Zona, Coleccion, Estante, Nivel, Libro, AnotacionMapa

NIVELES_POR_ESTANTE = 4

# ── Layout de estantes por zona ──────────────────────────────────────────────
# (codigo, etiqueta, pos_x, pos_y, ancho, alto, color)  — coordenadas en % (0-100)
ESTANTES_BAJA = [
    # Pared del fondo (arriba): humanidades
    ("E06", "Humanidades",           6,  4, 26,  8, "#A855F7"),
    ("E07", "Filosofía",            37,  4, 26,  8, "#8B5CF6"),
    ("E08", "Historia",             68,  4, 26,  8, "#F59E0B"),
    # Paredes laterales: literatura (verticales)
    ("E02", "Literatura Argentina",  3, 18,  9, 24, "#22C55E"),
    ("E04", "Narrativa",             3, 46,  9, 24, "#14B8A6"),
    ("E03", "Literatura Universal", 88, 18,  9, 24, "#22C55E"),
    ("E05", "Poesía y Teatro",      88, 46,  9, 24, "#14B8A6"),
    # Góndolas centrales
    ("E09", "Ciencias Sociales",    24, 22, 26,  7, "#F97316"),
    ("E10", "Ensayo",               24, 34, 26,  7, "#EF4444"),
    ("E01", "Novedades",            57, 22, 26,  7, "#3B82F6"),
]

ESTANTES_ALTA = [
    ("E11", "Sistemas y Programación", 6,  5, 27,  8, "#6366F1"),
    ("E12", "Redes y Bases de Datos", 37,  5, 27,  8, "#6366F1"),
    ("E13", "Matemática y Cálculo",   68,  5, 27,  8, "#06B6D4"),
    ("E14", "Economía y Gestión",      3, 22,  9, 26, "#10B981"),
    ("E15", "Derecho",                88, 22,  9, 26, "#64748B"),
    ("E16", "Infantil y Escolar",     30, 26, 30,  8, "#EC4899"),
]

# ── Mobiliario y señalética por zona ─────────────────────────────────────────
# (tipo, texto, pos_x, pos_y, ancho, alto, rotacion, color)
ANOTACIONES_BAJA = [
    ("ventana",   None,            40,  1, 20,  3,  0, "#2E6B9E"),
    ("mesa_rect", "Novedades",     40, 47, 22, 11,  0, "#8A5A2B"),
    ("planta",    None,            50, 60,  7,  7,  0, "#3F7A3F"),
    ("mostrador", "Caja",          60, 73, 26,  9,  0, "#7A5230"),
    ("texto",     "CAJA",          63, 66, 12,  5,  0, "#7A1C30"),
    ("puerta",    None,            10, 84, 12, 12,  0, "#8A5A2B"),
    ("texto",     "ENTRADA",       24, 88, 16,  6,  0, "#7A1C30"),
    ("flecha",    None,            26, 80, 12,  5,  0, "#7A1C30"),
    ("planta",    None,             4, 74,  7,  7,  0, "#3F7A3F"),
    ("escalera",  None,            84, 78, 12, 16,  0, "#64748B"),
    ("texto",     "↑ PLANTA ALTA", 76, 72, 22,  5,  0, "#64748B"),
]

ANOTACIONES_ALTA = [
    ("ventana",      None,              40,  1, 20,  3,  0, "#2E6B9E"),
    ("texto",        "SALA DE LECTURA", 36, 66, 28,  5,  0, "#7A1C30"),
    ("mesa_redonda", "Lectura",         42, 48, 16, 16,  0, "#8A5A2B"),
    ("sillon",       None,              30, 50,  9,  8,  0, "#6B4A2B"),
    ("sillon",       None,              61, 50,  9,  8,  0, "#6B4A2B"),
    ("silla",        None,              44, 39,  5,  5,  0, "#6B4A2B"),
    ("silla",        None,              51, 39,  5,  5,  0, "#6B4A2B"),
    ("planta",       None,              68, 44,  7,  7,  0, "#3F7A3F"),
    ("planta",       None,               6, 74,  7,  7,  0, "#3F7A3F"),
    ("escalera",     None,              84, 76, 12, 16,  0, "#64748B"),
    ("texto",        "↓ PLANTA BAJA",   76, 70, 22,  5,  0, "#64748B"),
]

# ── Reparto de libros: colección → temática → estantes ───────────────────────
TEMA_POR_COLECCION = {
    "Humanidades":           "humanidades",
    "Ciencias Sociales":     "sociales",
    "Sistemas":              "sistemas",
    "Desarrollo Productivo": "desarrollo",
    "Sin colección":         "general",
}
ESTANTES_POR_TEMA = {
    "humanidades": ["E06", "E07", "E08"],
    "sociales":    ["E09", "E15"],
    "sistemas":    ["E11", "E12"],
    "desarrollo":  ["E14"],
    # Los muchos libros sin colección van a los estantes generales (literatura, etc).
    "general":     ["E01", "E02", "E03", "E04", "E05", "E10", "E13", "E16"],
}

# Estantes del demo viejo (app/seed.py) que este layout reemplaza: se borran si
# quedaron vacíos, para que no se solapen con los E01..E16.
CODIGOS_SEED_VIEJO = ["E1", "E2", "E3", "MESA-CENTRAL", "ENTRADA"]

TOTAL_ANOTACIONES = len(ANOTACIONES_BAJA) + len(ANOTACIONES_ALTA)


def _get_zona(db, nombre, orden):
    zona = db.query(Zona).filter(Zona.nombre == nombre).first()
    if not zona:
        zona = Zona(nombre=nombre, orden=orden)
        db.add(zona)
        db.flush()
    return zona


def _crear_estantes(db, zona, layout):
    for codigo, etiqueta, x, y, w, h, color in layout:
        est = db.query(Estante).filter(
            Estante.zona_id == zona.id, Estante.codigo == codigo,
        ).first()
        if not est:
            est = Estante(
                codigo=codigo, etiqueta=etiqueta, zona_id=zona.id,
                pos_x=x, pos_y=y, ancho=w, alto=h, color=color,
            )
            db.add(est)
            db.flush()
        if not db.query(Nivel).filter(Nivel.estante_id == est.id).first():
            for numero in range(1, NIVELES_POR_ESTANTE + 1):
                db.add(Nivel(estante_id=est.id, numero=numero))
            db.flush()


def _limpiar_estantes_seed_viejo(db):
    """Borra los estantes del demo anterior si quedaron sin libros (evita solapes)."""
    borrados = 0
    for est in db.query(Estante).filter(Estante.codigo.in_(CODIGOS_SEED_VIEJO)).all():
        if db.query(Libro).filter(Libro.estante_id == est.id).count() == 0:
            db.delete(est)  # los niveles caen por cascade (FK ondelete CASCADE)
            borrados += 1
    return borrados


def _crear_anotaciones(db, zona, items):
    for tipo, texto, x, y, w, h, rot, color in items:
        db.add(AnotacionMapa(
            zona_id=zona.id, tipo=tipo, texto=texto,
            pos_x=x, pos_y=y, ancho=w, alto=h, rotacion=rot, color=color,
        ))


def _ubicar_libros(db):
    """Reparte los libros sin ubicar por temática en sus estantes y niveles."""
    est_by_code = {e.codigo: e for e in db.query(Estante).all()}
    niv_by_code = {
        code: db.query(Nivel).filter(Nivel.estante_id == est.id).order_by(Nivel.numero).all()
        for code, est in est_by_code.items()
    }
    col_name = {c.id: c.nombre for c in db.query(Coleccion).all()}

    sin_ubicar = db.query(Libro).filter(Libro.estante_id.is_(None)).order_by(Libro.titulo).all()
    buckets = defaultdict(list)
    for libro in sin_ubicar:
        tema = TEMA_POR_COLECCION.get(col_name.get(libro.coleccion_id), "general")
        buckets[tema].append(libro)

    nivel_cursor = defaultdict(int)   # codigo estante -> índice de nivel (round-robin)
    orden_cursor = defaultdict(int)   # nivel_id      -> próximo orden dentro del nivel
    ubicados = 0
    for tema, libros in buckets.items():
        codigos = [c for c in ESTANTES_POR_TEMA[tema] if c in niv_by_code]
        if not codigos:
            continue
        for i, libro in enumerate(libros):
            codigo = codigos[i % len(codigos)]
            niveles = niv_by_code[codigo]
            nivel = niveles[nivel_cursor[codigo] % len(niveles)]
            nivel_cursor[codigo] += 1
            libro.estante_id = est_by_code[codigo].id
            libro.nivel_id = nivel.id
            libro.orden = orden_cursor[nivel.id]
            orden_cursor[nivel.id] += 1
            ubicados += 1
    return ubicados


def main():
    db = SessionLocal()
    try:
        baja = _get_zona(db, "Planta Baja", 0)
        alta = _get_zona(db, "Planta Alta", 1)

        _crear_estantes(db, baja, ESTANTES_BAJA)
        _crear_estantes(db, alta, ESTANTES_ALTA)

        borrados = _limpiar_estantes_seed_viejo(db)
        if borrados:
            print(f"[demo] Estantes del demo viejo eliminados: {borrados}.", flush=True)

        # (Re)cargar mobiliario/señalética si falta el set completo (p.ej. sólo estaban
        # las 4 anotaciones del seed viejo). Si ya está completo, no se toca.
        if db.query(AnotacionMapa).count() < TOTAL_ANOTACIONES:
            db.query(AnotacionMapa).delete()
            _crear_anotaciones(db, baja, ANOTACIONES_BAJA)
            _crear_anotaciones(db, alta, ANOTACIONES_ALTA)
            print(f"[demo] Mobiliario y señalética cargados ({TOTAL_ANOTACIONES}).", flush=True)
        else:
            print("[demo] Mobiliario ya estaba completo; no se toca.", flush=True)

        ubicados = _ubicar_libros(db)
        db.commit()

        total_est = db.query(Estante).count()
        total_niv = db.query(Nivel).count()
        print(f"[demo] Estantes: {total_est} · Niveles: {total_niv} · "
              f"Libros ubicados en esta corrida: {ubicados}", flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()
