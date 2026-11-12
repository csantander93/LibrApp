"""
Diccionario de SINÓNIMOS para la búsqueda del catálogo de libros.

Es un catálogo GLOBAL y **code-level**: agregar un sinónimo es sumar una palabra a
un grupo de esta lista — no requiere migración ni datos. Pensado para el dominio de
una librería (géneros, temáticas y jerga que el público usa aunque no coincida con
el término exacto del catálogo).

Cómo funciona
-------------
Cada entrada de `GRUPOS` es un conjunto de términos **equivalentes entre sí** y
**bidireccionales**: buscar cualquiera trae los libros que mencionan cualquier otro.
Ej: quien busca "comic" también matchea "historieta", "manga" o "novela grafica".

Los términos se comparan ya NORMALIZADOS (minúsculas y sin acentos — ver
`busqueda.normalizar`), así que acá se escriben en su forma normal, sin tildes.
"""
from __future__ import annotations

import unicodedata


def _norm(texto: str) -> str:
    """Normalización mínima e idéntica a `busqueda.normalizar`, replicada acá para
    no crear un import circular (este módulo es una hoja sin dependencias)."""
    nfkd = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


# Grupos de términos equivalentes. Escribir en minúscula y sin acentos.
# Para sumar sinónimos: agregá la palabra al grupo que corresponda, o creá un
# grupo nuevo. No hace falta nada más.
GRUPOS: list[list[str]] = [
    # ── Géneros narrativos ────────────────────────────────────────────────────
    ["novela", "ficcion"],
    ["cuento", "cuentos", "relato", "relatos"],
    ["poesia", "poema", "poemas", "poemario", "verso", "versos"],
    ["teatro", "obra teatral", "dramaturgia", "drama"],
    ["ensayo", "no ficcion"],
    ["antologia", "compilacion", "recopilacion"],
    # ── Temáticas / categorías ────────────────────────────────────────────────
    ["infantil", "ninos", "nino", "niñez", "infancia", "chicos"],
    ["juvenil", "adolescentes", "young adult", "ya"],
    ["historieta", "comic", "comics", "manga", "novela grafica", "tira"],
    ["policial", "policiaco", "thriller", "suspenso", "intriga", "novela negra", "negra"],
    ["terror", "horror", "miedo"],
    ["ciencia ficcion", "sci fi", "scifi", "distopia", "futurista"],
    ["fantasia", "fantastico", "epica"],
    ["romantica", "romance", "amor", "romantico"],
    ["aventura", "aventuras"],
    ["biografia", "biografico", "memorias", "autobiografia", "vida de"],
    ["historia", "historico"],
    ["autoayuda", "superacion personal", "desarrollo personal", "motivacion"],
    ["cocina", "recetas", "recetario", "gastronomia", "culinaria"],
    ["arte", "artistico", "bellas artes"],
    ["filosofia", "filosofico", "pensamiento"],
    ["psicologia", "psicologico"],
    ["religion", "religioso", "espiritualidad", "espiritual"],
    ["derecho", "juridico", "leyes", "legal"],
    ["economia", "economico", "finanzas"],
    ["politica", "politico"],
    ["ciencia", "cientifico", "divulgacion"],
    ["matematica", "matematicas", "calculo"],
    ["medicina", "medico", "salud"],
    ["tecnologia", "informatica", "computacion", "programacion", "sistemas"],
    ["educacion", "pedagogia", "didactica", "docencia", "escolar"],
    ["diccionario", "glosario", "lexico"],
    ["manual", "guia", "handbook"],
    ["texto", "libro de texto", "apunte", "apuntes"],
    ["escolar", "colegio", "primaria", "secundaria"],
    ["universitario", "universidad", "facultad", "academico"],
]


def _construir_indice() -> dict[str, set[str]]:
    """termino_normalizado -> set de todos los términos equivalentes (incluido él).

    Un mismo término puede vivir en más de un grupo: se acumulan sus equivalentes
    (la relación 'sinónimo' es transitiva dentro de lo que declaramos)."""
    indice: dict[str, set[str]] = {}
    for grupo in GRUPOS:
        equivalentes = {_norm(t) for t in grupo}
        for termino in equivalentes:
            indice.setdefault(termino, set()).update(equivalentes)
    return indice


# term -> {equivalentes}. Se calcula una sola vez al importar el módulo.
GRUPOS_POR_TERMINO: dict[str, set[str]] = _construir_indice()


def expandir(termino: str) -> list[str]:
    """Devuelve `termino` + sus sinónimos conocidos (todos normalizados, sin
    duplicados). Si no tiene sinónimos, devuelve solo `[termino]`.

    El propio término va SIEMPRE primero: es la coincidencia más fuerte y el
    ranking lo aprovecha para no perder precisión frente a los sinónimos."""
    t = _norm(termino)
    if not t:
        return []
    equivalentes = GRUPOS_POR_TERMINO.get(t)
    if not equivalentes:
        return [t]
    otros = sorted(equivalentes - {t})
    return [t, *otros]
