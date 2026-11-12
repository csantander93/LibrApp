"""
Motor de BÚSQUEDA inteligente de libros (autoconsulta pública + ABM admin).

Objetivo: una búsqueda tolerante a errores de tipeo, acentos, sinónimos, palabras
en cualquier orden y coincidencias parciales — sin salir del stack (PostgreSQL +
`pg_trgm` + `unaccent`). El público de la librería rara vez sabe el título exacto
ni cómo se escribe; esta búsqueda "ayuda a encontrar" en vez de exigir exactitud.

Portado del motor de la tienda de Operix, adaptado a `Libro`.

Cómo está armada
----------------
1. **Documento de búsqueda materializado** (`Libro.busqueda`): un texto NORMALIZADO
   (minúsculas, sin acentos) que concatena titulo + autor + editorial + isbn +
   codigo + sinopsis. Se mantiene al crear/editar/importar el libro y se backfillea
   en la migración. Tener todo en UNA columna evita joins por término y permite
   indexarla con un solo GIN `gin_trgm_ops`.

2. **Tokenización + sinónimos**: la consulta se parte en palabras; cada palabra se
   expande con sus sinónimos (ver `busqueda_sinonimos`). El match exige que TODOS
   los tokens estén presentes (AND entre tokens), y cada token matchea si CUALQUIERA
   de sus variantes aparece — como substring (prefijos/parciales: "gab"→gabriel) o
   por similitud trigram (typos: "garcai"→garcia). El service hace fallback a OR si
   el AND no devuelve nada, para no dejar al usuario con la pantalla vacía.

3. **Ranking de relevancia** (`expresion_ranking`): puntúa coincidencia de frase
   completa (prefijo > contenida) por encima de la similitud trigram global.

Notas de rendimiento
--------------------
- El GIN trigram sobre `busqueda` acelera el `LIKE '%...%'`. La rama de similitud
  usa el operador `<%` (word_similarity), que SÍ usa el índice GIN; solo corre en el
  nivel 2 (cuando el nivel 1 substring dio 0), o sea ante typos, con pocos candidatos.
- La normalización se hace en Python (idéntica al build del documento), así la
  consulta y el documento se comparan "manzanas con manzanas" sin `unaccent` en runtime.
"""
from __future__ import annotations

import re
import unicodedata

from sqlalchemy import case, func, literal, or_, text
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.modules.catalogo.busqueda_sinonimos import expandir

# Umbral de similitud trigram para tolerar typos. 0.3 es permisivo (atrapa
# "garcai"→garcia); la precisión la recupera el AND entre tokens y el ranking.
UMBRAL_SIMILITUD = 0.3

# Tokens de 1 sola letra/dígito no aportan (ruido); 2+ sí ("it", "1984", "t1").
_LARGO_MIN_TOKEN = 2


def normalizar(texto: str | None) -> str:
    """minúsculas + sin acentos + espacios colapsados. Es la forma canónica en la
    que se guarda el documento y en la que se compara la consulta."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto).lower())
    sin_acentos = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_acentos).strip()


def tokenizar(q: str | None) -> list[str]:
    """Parte la consulta en tokens alfanuméricos normalizados, descartando los de
    1 carácter. "cien anos soledad" -> ['cien', 'anos', 'soledad']."""
    if not q:
        return []
    tokens = re.findall(r"[a-z0-9]+", normalizar(q))
    return [t for t in tokens if len(t) >= _LARGO_MIN_TOKEN]


def construir_texto_busqueda(libro) -> str:
    """Arma el documento de búsqueda normalizado de un libro a partir de sus campos
    propios. Se llama al crear/editar/importar el libro y en el seed. No incluye el
    nombre de la colección a propósito (el catálogo tiene un selector dedicado de
    colección), así los movimientos de categoría en lote no requieren reindexar."""
    partes: list[str] = [
        libro.titulo or "",
        libro.autor or "",
        libro.editorial or "",
        libro.isbn or "",
        libro.codigo or "",
        libro.sinopsis or "",
    ]
    return normalizar(" ".join(p for p in partes if p))


def _escape_like(termino: str) -> str:
    """Escapa los comodines de LIKE. Los tokens ya son alfanuméricos, pero se
    escapa por prolijidad/robustez ante cambios del tokenizador."""
    return termino.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def aplicar_umbral(db: Session) -> None:
    """Fija el umbral trigram (similarity + word_similarity) en ESTA transacción.
    SET LOCAL: se revierte al cerrar la transacción del request. Barato (~1ms) y
    mantiene coherente el umbral usado por el operador `<%` del fuzzy."""
    db.execute(text(f"SET LOCAL pg_trgm.word_similarity_threshold = {UMBRAL_SIMILITUD}"))
    db.execute(text(f"SET LOCAL pg_trgm.similarity_threshold = {UMBRAL_SIMILITUD}"))


def _condicion_variante(alt: str, columna: ColumnElement, fuzzy: bool) -> ColumnElement:
    """Una variante (token o sinónimo) matchea por substring (prefijo / parcial) y,
    si `fuzzy`, también por similitud trigram (typos).

    La búsqueda es de DOS NIVELES (ver `condiciones_and`): el nivel 1 pasa
    `fuzzy=False` → solo substring, 100% indexable por el GIN trigram y barato aun en
    términos muy comunes; el nivel 2 agrega tolerancia a typos con el OPERADOR `<%`
    (word_similarity), que usa el índice GIN. El nivel 2 solo corre cuando el nivel 1
    no encontró nada — o sea, ante un typo, donde los candidatos son pocos y el GIN
    vuela. El umbral lo fija `aplicar_umbral` por transacción."""
    substr = columna.like(f"%{_escape_like(alt)}%", escape="\\")
    if not fuzzy:
        return substr
    return or_(substr, literal(alt).op("<%")(columna))


def condiciones_and(q: str, columna: ColumnElement, fuzzy: bool = False) -> list[ColumnElement]:
    """Condiciones a combinar con AND: una por token (cada token expandido a sus
    sinónimos, unidos con OR). `fuzzy=False` (nivel 1) = solo substring; `fuzzy=True`
    (nivel 2) suma tolerancia a typos. Lista vacía si no hay tokens útiles."""
    condiciones: list[ColumnElement] = []
    for token in tokenizar(q):
        variantes = expandir(token)
        condiciones.append(or_(*[_condicion_variante(v, columna, fuzzy) for v in variantes]))
    return condiciones


def substring_norm(q: str, columna: ColumnElement) -> ColumnElement | None:
    """Cláusula `columna ILIKE '%q%'` con `q` normalizada y comodines ESCAPADOS.
    Es el fallback para consultas sin tokens útiles (1 carácter): sin escapar, un
    `q='%'` o `q='_'` actuaría como comodín y traería todo. None si `q` queda vacía."""
    qn = normalizar(q)
    if not qn:
        return None
    return columna.ilike(f"%{_escape_like(qn)}%", escape="\\")


def condicion_or(q: str, columna: ColumnElement, fuzzy: bool = True) -> ColumnElement | None:
    """Fallback laxo: matchea si CUALQUIER token (o su sinónimo) aparece. Se usa
    cuando el AND no devolvió resultados. None si no hay tokens."""
    todas: list[ColumnElement] = []
    for token in tokenizar(q):
        for v in expandir(token):
            todas.append(_condicion_variante(v, columna, fuzzy))
    return or_(*todas) if todas else None


def expresion_ranking(q: str, columna: ColumnElement) -> ColumnElement:
    """Score numérico de relevancia (mayor = más relevante), para el ORDER BY:

      +100  el documento EMPIEZA con la frase buscada (≈ el título arranca así)
      + 50  la frase buscada aparece contenida
      +  x  similitud trigram global de la frase (0..1) * 10

    La frase (todos los tokens juntos, normalizada) prioriza el match completo por
    sobre la suma de coincidencias sueltas."""
    qn = normalizar(q)
    esc = _escape_like(qn)
    empieza = case((columna.like(f"{esc}%", escape="\\"), 100.0), else_=0.0)
    contiene = case((columna.like(f"%{esc}%", escape="\\"), 50.0), else_=0.0)
    sim = func.coalesce(func.similarity(columna, qn), 0.0) * 10.0
    return empieza + contiene + sim
