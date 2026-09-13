"""
Utilidades para describir, en lenguaje humano, los cambios de una operación de
edición. Se usan en los `service.actualizar_*` para dejar en el log de acciones
un detalle específico ("qué cambió y de qué valor a qué valor"), no solo "editó X".

Tomado del proyecto Operix y adaptado al dominio de LibrApp (libros, estantes,
zonas, colecciones, niveles, anotaciones y configuración).
"""
from typing import Any

# Etiquetas amigables para los campos del dominio. Si un campo no está acá se usa
# su nombre crudo (con guiones bajos → espacios y capitalizado).
_ETIQUETAS: dict[str, str] = {
    "titulo": "Título",
    "autor": "Autor",
    "editorial": "Editorial",
    "isbn": "ISBN",
    "precio": "Precio",
    "coleccion_id": "Colección",
    "estante_id": "Estante",
    "nivel_id": "Nivel",
    "codigo": "Código",
    "etiqueta": "Etiqueta",
    "zona_id": "Zona",
    "color": "Color",
    "rotacion": "Rotación",
    "nombre": "Nombre",
    "descripcion": "Descripción",
    "orden": "Orden",
    "numero": "Número",
    "texto": "Texto",
    "tipo": "Tipo",
    "isbn_obligatorio": "ISBN obligatorio",
}


def _etiqueta(campo: str) -> str:
    return _ETIQUETAS.get(campo, campo.replace("_", " ").capitalize())


def _fmt_valor(campo: str, valor: Any) -> str:
    if valor is None or valor == "":
        return "vacío"
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    return str(valor)


def diff_cambios(obj: Any, cambios: dict[str, Any]) -> dict[str, tuple[Any, Any]]:
    """
    Compara los valores actuales de `obj` contra los nuevos en `cambios`
    (típicamente `data.model_dump(exclude_unset=True)`) y devuelve solo los campos
    que realmente cambian, como {campo: (antes, despues)}.

    IMPORTANTE: llamar ANTES de aplicar los `setattr` sobre `obj`.
    """
    resultado: dict[str, tuple[Any, Any]] = {}
    for campo, nuevo in cambios.items():
        antes = getattr(obj, campo, None)
        if antes != nuevo:
            resultado[campo] = (antes, nuevo)
    return resultado


def describir_cambios(diff: dict[str, tuple[Any, Any]]) -> str:
    """
    Convierte el resultado de `diff_cambios` en un texto legible.
    Ej: "Precio: 100 → 120; Título: A → B"
    """
    partes = [
        f"{_etiqueta(campo)}: {_fmt_valor(campo, antes)} → {_fmt_valor(campo, despues)}"
        for campo, (antes, despues) in diff.items()
    ]
    return "; ".join(partes)
