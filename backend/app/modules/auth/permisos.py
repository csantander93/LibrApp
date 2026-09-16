"""Catálogo de permisos del sistema (RF-08 / RN-05).

Los roles son dinámicos (se crean/editan desde Configuración → Roles), pero el
conjunto de permisos posibles es fijo: cada permiso habilita ver y operar una
sección del panel. Un rol guarda una lista de estas claves; el comodín "*"
(usado por el rol de sistema "Administrador") otorga acceso total.

Este módulo es Python puro (sin SQLAlchemy) para que lo puedan importar tanto los
modelos como las dependencias de autorización sin ciclos.
"""

# ─── Claves de permiso (una por sección del panel) ────────────────────────────
CATALOGO = "catalogo.gestionar"
ESTANTES = "estantes.gestionar"
MAPA = "mapa.gestionar"
IMPORTAR = "importar.ejecutar"
REGISTROS = "registros.ver"
CONFIGURACION = "configuracion.editar"
USUARIOS = "usuarios.gestionar"

# Comodín: acceso total. Lo usa el rol de sistema "Administrador".
WILDCARD = "*"

# Catálogo consumido por el frontend (endpoint GET /roles/permisos) para pintar
# las casillas del editor de roles agrupadas.
PERMISOS: list[dict] = [
    {"key": CATALOGO, "etiqueta": "Catálogo", "grupo": "Contenido",
     "descripcion": "Alta, baja y edición de libros, colecciones, campos personalizados e imágenes."},
    {"key": ESTANTES, "etiqueta": "Estantes", "grupo": "Contenido",
     "descripcion": "Alta, baja y edición de estantes, niveles y zonas."},
    {"key": MAPA, "etiqueta": "Mapa", "grupo": "Contenido",
     "descripcion": "Editar el mapa 2D: posiciones, anotaciones y orden de los libros."},
    {"key": IMPORTAR, "etiqueta": "Importar", "grupo": "Contenido",
     "descripcion": "Importar libros desde archivos Excel/CSV."},
    {"key": REGISTROS, "etiqueta": "Registros", "grupo": "Administración",
     "descripcion": "Ver la auditoría de accesos y acciones del panel."},
    {"key": CONFIGURACION, "etiqueta": "Configuración", "grupo": "Administración",
     "descripcion": "Editar los ajustes generales de la aplicación."},
    {"key": USUARIOS, "etiqueta": "Usuarios y roles", "grupo": "Administración",
     "descripcion": "Crear y administrar los usuarios y roles del sistema."},
]

# Set de claves válidas (para validar lo que llega del cliente).
PERMISOS_KEYS: set[str] = {p["key"] for p in PERMISOS}


def expandir(permisos: list[str] | None) -> set[str]:
    """Traduce la lista guardada en el rol a las claves concretas efectivas.
    El comodín "*" se expande a todos los permisos existentes."""
    permisos = permisos or []
    if WILDCARD in permisos:
        return set(PERMISOS_KEYS)
    return {p for p in permisos if p in PERMISOS_KEYS}


def tiene(permisos_rol: list[str] | None, *requeridos: str) -> bool:
    """True si el rol (por su lista cruda de permisos, con comodín) cumple con
    al menos uno de los permisos requeridos."""
    permisos_rol = permisos_rol or []
    if WILDCARD in permisos_rol:
        return True
    return any(r in permisos_rol for r in requeridos)
