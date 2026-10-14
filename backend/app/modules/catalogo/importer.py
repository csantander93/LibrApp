"""Importador masivo de catálogo desde Excel/CSV (RF-05 / CU-04 / HU-02).

Diseñado para tolerar los archivos reales de la librería, que son planillas
operativas (no exports limpios):
  - Filas de título/metadata antes del encabezado.
  - Delimitador ';' (Excel en español) o ','.
  - Precios en formato argentino: "$ 25.000,00".
  - Columnas faltantes (ej: sin autor, sin editorial, sin ubicación).

Reglas aplicadas:
  - RN-02: si falta autor/editorial se completa con "Sin especificar" (no se rechaza la fila).
  - RN-07/RN-09: sin estante o estante inexistente → el libro queda 'Sin ubicar'.
  - RN-01 / P-04: si el ISBN ya existe, se ACTUALIZA el registro (upsert); si no, se crea.
  - RN-10: si viene una colección que no existe, se crea.
"""
import csv
import io
import unicodedata
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.modules.catalogo.models import Coleccion, Estante, Libro, CampoLibro
from app.modules.catalogo.schemas import ImportResultado, ImportFilaError
from app.modules.configuracion.service import obtener_configuracion

# Sinónimos aceptados por campo destino (comparados sobre el header normalizado).
_ALIAS = {
    "titulo": {"titulo", "title", "nombre"},
    "autor": {"autor", "autores", "author"},
    "editorial": {"editorial", "edit"},
    "isbn": {"isbn", "isbn13", "cod", "codigo"},
    "precio": {"precio", "price", "importe"},
    "coleccion": {"coleccion", "categoria", "collection"},
    "estante": {"estante", "ubicacion", "estantecodigo", "estante_codigo", "sector", "seccion"},
}


def _norm(s: str) -> str:
    """Minúsculas, sin acentos, sin espacios/puntos, para comparar encabezados."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(ch for ch in s.lower() if ch.isalnum())


def _detectar_campo(header: str) -> str | None:
    n = _norm(header)
    if not n:
        return None
    for campo, alias in _ALIAS.items():
        if n in alias or any(n.startswith(a) for a in alias):
            return campo
    return None


def parse_precio(raw) -> Decimal | None:
    """Convierte "$ 25.000,00" / "25000" / "25.5" a Decimal. None si no se puede."""
    if raw is None:
        return None
    if isinstance(raw, (int, float, Decimal)):
        try:
            return Decimal(str(raw))
        except InvalidOperation:
            return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace("$", "").replace(" ", "").replace("\xa0", "")
    tiene_coma = "," in s
    tiene_punto = "." in s
    if tiene_coma and tiene_punto:
        # Formato AR: punto = miles, coma = decimales.
        s = s.replace(".", "").replace(",", ".")
    elif tiene_coma:
        s = s.replace(",", ".")
    elif tiene_punto:
        # "25.000" (miles) vs "25.5" (decimal): si lo que sigue al último punto
        # son 3 dígitos, lo tratamos como separador de miles.
        entero, _, dec = s.rpartition(".")
        if len(dec) == 3 and entero.isdigit():
            s = entero + dec
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _leer_filas(contenido: bytes, filename: str) -> list[list[str]]:
    """Devuelve todas las filas como listas de strings, sea CSV o XLSX."""
    nombre = (filename or "").lower()
    if nombre.endswith(".xlsx") or nombre.endswith(".xlsm"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
        ws = wb.active
        filas: list[list[str]] = []
        for row in ws.iter_rows(values_only=True):
            filas.append(["" if c is None else str(c) for c in row])
        wb.close()
        return filas
    # CSV: decodificar tolerante y detectar delimitador.
    texto = None
    for enc in ("utf-8-sig", "latin-1"):
        try:
            texto = contenido.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if texto is None:
        texto = contenido.decode("utf-8", errors="replace")
    muestra = "\n".join(texto.splitlines()[:20])
    delim = ";" if muestra.count(";") >= muestra.count(",") else ","
    return [row for row in csv.reader(io.StringIO(texto), delimiter=delim)]


def _encontrar_header(filas: list[list[str]]) -> tuple[int, dict[str, int]]:
    """Busca la fila de encabezado (la que tiene una columna 'título') en las
    primeras filas. Devuelve (índice_fila, {campo: índice_columna})."""
    for i, fila in enumerate(filas[:15]):
        mapeo: dict[str, int] = {}
        for j, celda in enumerate(fila):
            campo = _detectar_campo(celda)
            if campo and campo not in mapeo:
                mapeo[campo] = j
        if "titulo" in mapeo:
            return i, mapeo
    raise ValueError(
        "No se encontró una columna de 'título' en el archivo. "
        "Revisá que tenga un encabezado con al menos la columna Título."
    )


def _coerce_extra(campo: CampoLibro, valor: str):
    """Coerción SUAVE del valor de una columna → campo dinámico en la importación.

    Según la regla acordada, en el import los campos dinámicos se validan "solo si
    son obligatorios o no": no se rechaza por tipo. Se intenta una conversión
    razonable (numero→float, booleano→bool) y, si no se puede, se guarda el texto
    tal cual. La validación estricta de tipo sigue viviendo en el ABM del libro."""
    if campo.tipo == "numero":
        try:
            return float(str(valor).replace(",", "."))
        except (TypeError, ValueError):
            return valor
    if campo.tipo == "booleano":
        return str(valor).strip().lower() in ("true", "1", "si", "sí", "x", "verdadero")
    return valor


def _detectar_campos_dinamicos(
    db: Session, header: list[str], usados: set[int],
) -> list[tuple[CampoLibro, int]]:
    """Asocia columnas del archivo (no usadas por los campos base) con campos
    personalizados activos, matcheando el header por etiqueta o código normalizados."""
    campos = db.query(CampoLibro).filter(CampoLibro.activo.is_(True)).all()
    por_norm: dict[str, CampoLibro] = {}
    for c in campos:
        por_norm[_norm(c.etiqueta)] = c
        por_norm.setdefault(_norm(c.codigo), c)
    resultado: list[tuple[CampoLibro, int]] = []
    vistos: set[str] = set()
    for idx, celda in enumerate(header):
        if idx in usados:
            continue
        campo = por_norm.get(_norm(celda))
        if campo and campo.codigo not in vistos:
            resultado.append((campo, idx))
            vistos.add(campo.codigo)
    return resultado


def importar(db: Session, contenido: bytes, filename: str, dry_run: bool) -> ImportResultado:
    filas = _leer_filas(contenido, filename)
    if not filas:
        raise ValueError("El archivo está vacío")

    isbn_obligatorio = obtener_configuracion(db).isbn_obligatorio

    header_idx, mapeo = _encontrar_header(filas)
    columnas_detectadas = {
        campo: (filas[header_idx][idx].strip() or f"col{idx}") for campo, idx in mapeo.items()
    }
    # Columnas extra que matchean con un campo dinámico activo (RF-08): su valor va
    # a Libro.datos_extra. Las columnas que no matchean (ej. stock) se ignoran.
    campos_cols = _detectar_campos_dinamicos(db, filas[header_idx], set(mapeo.values()))
    for campo, idx in campos_cols:
        columnas_detectadas[campo.codigo] = filas[header_idx][idx].strip() or campo.etiqueta

    # Índices de estantes y colecciones existentes (por nombre/código normalizado).
    estantes = {_norm(e.codigo): e for e in db.query(Estante).all()}
    colecciones = {_norm(c.nombre): c for c in db.query(Coleccion).all()}

    # Índices de libros existentes para el upsert. Por ISBN (RN-01) y, para los
    # libros sin ISBN (buena parte del inventario real), por (título+editorial):
    # así reimportar el mismo archivo actualiza en vez de duplicar el catálogo.
    por_isbn: dict[str, Libro] = {}
    por_titulo: dict[tuple[str, str], Libro] = {}
    for lb in db.query(Libro).all():
        if lb.isbn:
            por_isbn[lb.isbn] = lb
        else:
            por_titulo[(_norm(lb.titulo), _norm(lb.editorial))] = lb

    creados = actualizados = sin_ubicar = 0
    total_filas = 0
    errores: list[ImportFilaError] = []

    def celda(fila: list[str], campo: str) -> str | None:
        idx = mapeo.get(campo)
        if idx is None or idx >= len(fila):
            return None
        val = (fila[idx] or "").strip()
        return val or None

    for n, fila in enumerate(filas[header_idx + 1:], start=header_idx + 2):
        if not any((c or "").strip() for c in fila):
            continue  # fila totalmente vacía
        titulo = celda(fila, "titulo")
        if not titulo:
            continue  # sin título (probable fila de subtotal/metadata): se ignora
        total_filas += 1

        isbn = celda(fila, "isbn")
        # RN-01: si la configuración exige ISBN, las filas sin ISBN se reportan y
        # no se importan (no se crean ni actualizan).
        if not isbn and isbn_obligatorio:
            errores.append(ImportFilaError(fila=n, motivo="Falta el ISBN (obligatorio)", titulo=titulo))
            continue
        autor = celda(fila, "autor") or "Sin especificar"
        editorial = celda(fila, "editorial") or "Sin especificar"
        precio = parse_precio(celda(fila, "precio"))

        # Campos dinámicos (datos_extra): solo se valida "obligatorio o no" (RF-08).
        extra: dict = {}
        falta_requerido = None
        for campo, idx in campos_cols:
            val = (fila[idx] or "").strip() if idx < len(fila) else ""
            if not val:
                if campo.requerido:
                    falta_requerido = campo.etiqueta
                    break
                continue
            extra[campo.codigo] = _coerce_extra(campo, val)
        if falta_requerido is not None:
            errores.append(ImportFilaError(
                fila=n, motivo=f"Falta el campo obligatorio '{falta_requerido}'", titulo=titulo,
            ))
            continue

        # Colección: se resuelve o se crea (RN-10).
        coleccion = None
        nom_col = celda(fila, "coleccion")
        if nom_col:
            coleccion = colecciones.get(_norm(nom_col))
            if not coleccion and not dry_run:
                coleccion = Coleccion(nombre=nom_col)
                db.add(coleccion)
                db.flush()
                colecciones[_norm(nom_col)] = coleccion

        # Estante: match por código; si no existe → Sin ubicar (RN-09).
        estante = None
        cod_est = celda(fila, "estante")
        if cod_est:
            estante = estantes.get(_norm(cod_est))
        if estante is None:
            sin_ubicar += 1

        # Upsert: por ISBN (RN-01 / P-04) o, sin ISBN, por (título+editorial).
        titulo_key = (_norm(titulo), _norm(editorial))
        existente = por_isbn.get(isbn) if isbn else por_titulo.get(titulo_key)
        if existente is not None:
            actualizados += 1
            if not dry_run:
                existente.titulo = titulo
                existente.autor = autor
                existente.editorial = editorial
                if precio is not None:
                    existente.precio = precio
                if coleccion is not None:
                    existente.coleccion_id = coleccion.id
                if estante is not None:
                    existente.estante_id = estante.id
                if extra:
                    # Merge: conserva los valores previos de otros campos dinámicos.
                    existente.datos_extra = {**(existente.datos_extra or {}), **extra}
        else:
            creados += 1
            nuevo = Libro(
                isbn=isbn, titulo=titulo, autor=autor, editorial=editorial, precio=precio,
                coleccion_id=coleccion.id if coleccion else None,
                estante_id=estante.id if estante else None,
                datos_extra=extra,
            )
            if not dry_run:
                db.add(nuevo)
            # Registrar en los índices para no duplicar dentro del mismo archivo.
            if isbn:
                por_isbn[isbn] = nuevo
            else:
                por_titulo[titulo_key] = nuevo

    if dry_run:
        db.rollback()
    else:
        db.commit()

    return ImportResultado(
        dry_run=dry_run,
        total_filas=total_filas,
        creados=creados,
        actualizados=actualizados,
        sin_ubicar=sin_ubicar,
        errores=errores,
        columnas_detectadas=columnas_detectadas,
    )


# ─── Plantilla de importación ("bandeja" a completar — RF-05 / CU-04) ──────────

# Columnas base. El ISBN es obligatorio.
_COLUMNAS_BASE = ["Isbn", "Titulo", "Autor", "Editorial", "Precio"]


def _columnas_plantilla(db: Session) -> list[str]:
    """Columnas de la plantilla: las base + una por cada campo dinámico activo."""
    campos = (
        db.query(CampoLibro)
        .filter(CampoLibro.activo.is_(True))
        .order_by(CampoLibro.orden, CampoLibro.etiqueta)
        .all()
    )
    return _COLUMNAS_BASE + [c.etiqueta for c in campos]


def generar_plantilla(db: Session, formato: str) -> tuple[bytes, str, str]:
    """Genera la plantilla vacía a completar. Devuelve (contenido, filename, content_type).

    La fila 1 es el encabezado de columnas (Isbn, Titulo, …); los datos se cargan a
    partir de la fila 2. Soporta 'csv' (delimitador ';', BOM UTF-8 para Excel en
    español) y 'xlsx'."""
    columnas = _columnas_plantilla(db)

    if formato == "xlsx":
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Importación"
        ws.append(columnas)
        buffer = io.BytesIO()
        wb.save(buffer)
        wb.close()
        return (
            buffer.getvalue(),
            "plantilla_importacion_librapp.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    # CSV (;) con BOM para que Excel-AR respete acentos y delimitador.
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(columnas)
    contenido = "﻿" + buffer.getvalue()
    return (
        contenido.encode("utf-8"),
        "plantilla_importacion_librapp.csv",
        "text/csv; charset=utf-8",
    )
