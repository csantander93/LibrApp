"""Seed idempotente para desarrollo.

Crea (si no existen):
  - El usuario administrador (credenciales de .env: ADMIN_USERNAME / ADMIN_PASSWORD).
  - Una zona "Planta Baja".
  - Colecciones base (categorías taxonómicas — RN-10).
  - Unos estantes de ejemplo posicionados en el plano.
  - ~20 libros por estante del inventario Rodolfo Walsh.

Corre en el lifespan del backend (ver app/main.py). Es seguro reejecutarlo:
solo inserta lo que falta (idempotente por ISBN o título+editorial).
"""
from decimal import Decimal

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.modules.auth.models import Usuario, RolEnum
from app.modules.catalogo.models import Zona, Coleccion, Estante, Libro, AnotacionMapa, Nivel

settings = get_settings()


def bootstrap_dev() -> None:
    db = SessionLocal()
    try:
        _seed_admin(db)
        zona = _seed_zona(db)
        colecciones = _seed_colecciones(db)
        estantes = _seed_estantes(db, zona)
        _seed_libros(db, colecciones, estantes)
        _seed_anotaciones(db, zona)
        db.commit()
    finally:
        db.close()


def _seed_admin(db) -> None:
    existe = db.query(Usuario).filter(Usuario.username == settings.ADMIN_USERNAME).first()
    if existe:
        return
    db.add(Usuario(
        username=settings.ADMIN_USERNAME,
        nombre="Administrador",
        password_hash=hash_password(settings.ADMIN_PASSWORD),
        rol=RolEnum.admin,
        activo=True,
    ))
    db.flush()
    print(f"[seed] Usuario admin '{settings.ADMIN_USERNAME}' creado.", flush=True)


def _seed_zona(db) -> Zona:
    zona = db.query(Zona).filter(Zona.nombre == "Planta Baja").first()
    if not zona:
        zona = Zona(nombre="Planta Baja", orden=0)
        db.add(zona)
        db.flush()
    if not db.query(Zona).filter(Zona.nombre == "Planta Alta").first():
        db.add(Zona(nombre="Planta Alta", orden=1))
        db.flush()
    return zona


def _seed_colecciones(db) -> dict[str, Coleccion]:
    nombres = ["Humanidades", "Sistemas", "Desarrollo Productivo", "Ciencias Sociales", "Sin colección"]
    out: dict[str, Coleccion] = {}
    for nombre in nombres:
        col = db.query(Coleccion).filter(Coleccion.nombre == nombre).first()
        if not col:
            col = Coleccion(nombre=nombre)
            db.add(col)
            db.flush()
        out[nombre] = col
    return out


def _seed_estantes(db, zona: Zona) -> dict[str, Estante]:
    base = [
        ("E1", "Novedades", 10, 10, 18, 12, "#3B82F6"),
        ("E2", "Humanidades", 32, 10, 18, 12, "#22C55E"),
        ("E3", "Sistemas", 54, 10, 18, 12, "#A855F7"),
        ("MESA-CENTRAL", "Mesa central", 30, 40, 30, 18, "#F97316"),
        ("ENTRADA", "Entrada / Kiosko", 10, 72, 20, 12, "#EC4899"),
    ]
    out: dict[str, Estante] = {}
    for codigo, etiqueta, x, y, w, h, color in base:
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
        # 3 niveles por estante (para mostrar la feature); idempotente.
        if not db.query(Nivel).filter(Nivel.estante_id == est.id).first():
            for numero in range(1, 4):
                db.add(Nivel(estante_id=est.id, numero=numero))
            db.flush()
        out[codigo] = est
    return out


def _seed_anotaciones(db, zona: Zona) -> None:
    if db.query(AnotacionMapa).count() > 0:
        return
    base = [
        ("texto",  "ENTRADA / SALIDA", 4, 60, 18, 6, 0, "#7A1C30"),
        ("flecha", None,               6, 68, 12, 6, 0, "#7A1C30"),
        ("texto",  "ESCALERA",         82, 4, 15, 6, 0, "#64748B"),
        ("texto",  "VENTANAL",         40, 2, 20, 5, 0, "#0EA5E9"),
    ]
    for tipo, texto, x, y, w, h, rot, color in base:
        db.add(AnotacionMapa(
            zona_id=zona.id, tipo=tipo, texto=texto,
            pos_x=x, pos_y=y, ancho=w, alto=h, rotacion=rot, color=color,
        ))
    print("[seed] Anotaciones de mapa cargadas.", flush=True)


def _agregar_libro(db, isbn, titulo, autor, editorial, precio, coleccion, estante, nivel=None) -> bool:
    """Inserta el libro solo si no existe (por ISBN o por título+editorial). Devuelve True si creó."""
    if isbn and db.query(Libro).filter(Libro.isbn == isbn).first():
        return False
    if db.query(Libro).filter(Libro.titulo == titulo, Libro.editorial == editorial).first():
        return False
    db.add(Libro(
        isbn=isbn, titulo=titulo, autor=autor, editorial=editorial,
        precio=Decimal(str(precio)) if precio else None,
        coleccion_id=coleccion.id if coleccion else None,
        estante_id=estante.id if estante else None,
        nivel_id=nivel.id if nivel else None,
    ))
    db.flush()  # hace visible el INSERT para los checks siguientes dentro de la misma transacción
    return True


def _seed_libros(db, colecciones: dict[str, Coleccion], estantes: dict[str, Estante]) -> None:
    hum = colecciones["Humanidades"]
    soc = colecciones["Ciencias Sociales"]
    sis = colecciones["Sistemas"]
    dev = colecciones["Desarrollo Productivo"]
    sin = colecciones["Sin colección"]

    E1 = estantes["E1"]
    E2 = estantes["E2"]
    E3 = estantes["E3"]
    MC = estantes["MESA-CENTRAL"]
    EN = estantes["ENTRADA"]

    # isbn, titulo, autor, editorial, precio, coleccion, estante
    libros = [
        # ── E1: Novedades (literatura argentina e iberoamericana) ────────────────
        ("978-987-693-770-2", "¡Perón vive!", "Varios", "Ciccus", 25000, soc, E1),
        ("978-950-728-421-3", "Rayuela", "Julio Cortázar", "Alfaguara", 18500, hum, E1),
        ("978-950-491-055-6", "Ficciones", "Jorge Luis Borges", "Alianza", 16000, hum, E1),
        ("978-987-566-230-1", "El túnel", "Ernesto Sábato", "Seix Barral", 14000, hum, E1),
        ("978-950-07-0399-3", "Cien años de soledad", "Gabriel García Márquez", "Sudamericana", 22000, hum, E1),
        ("978-950-07-0512-6", "El coronel no tiene quien le escriba", "Gabriel García Márquez", "Sudamericana", 13500, hum, E1),
        ("978-950-07-1234-7", "Sobre héroes y tumbas", "Ernesto Sábato", "Seix Barral", 17500, hum, E1),
        ("978-950-491-201-7", "Adán Buenosayres", "Leopoldo Marechal", "Sudamericana", 21000, hum, E1),
        ("978-987-723-345-2", "La traición de Rita Hayworth", "Manuel Puig", "Seix Barral", 15000, hum, E1),
        ("978-950-670-112-4", "El juguete rabioso", "Roberto Arlt", "Losada", 12000, hum, E1),
        ("978-950-670-098-1", "Los siete locos", "Roberto Arlt", "Losada", 14000, hum, E1),
        ("978-987-566-789-4", "Respiración artificial", "Ricardo Piglia", "Seix Barral", 18000, hum, E1),
        ("978-987-566-412-1", "Plata quemada", "Ricardo Piglia", "Anagrama", 16500, hum, E1),
        ("978-950-04-0023-5", "Martín Fierro", "José Hernández", "Eudeba", 9500, hum, E1),
        ("978-987-723-089-5", "La casa de los espíritus", "Isabel Allende", "Sudamericana", 19000, hum, E1),
        ("978-950-630-201-8", "Pedro Páramo", "Juan Rulfo", "RM", 13000, hum, E1),
        ("978-950-491-188-1", "Los pasos perdidos", "Alejo Carpentier", "Alianza", 15500, hum, E1),
        ("978-987-723-456-5", "Conversación en La Catedral", "Mario Vargas Llosa", "Seix Barral", 24000, hum, E1),
        ("978-950-491-200-0", "Bestiario", "Julio Cortázar", "Alfaguara", 14500, hum, E1),
        ("978-987-723-567-8", "La región más transparente", "Carlos Fuentes", "FCE", 18000, hum, E1),

        # ── E2: Humanidades (filosofía, historia, ciencias sociales) ────────────
        ("978-987-693-743-6", "¿De quién es la culpa?", "Varios", "Ciccus", 18500, soc, E2),
        ("978-987-1599-88-2", "Agua y territorio", "Varios", "Ciccus", 18500, soc, E2),
        ("978-950-557-234-1", "Breve historia de la Argentina", "José Luis Romero", "FCE", 16000, hum, E2),
        ("978-950-557-412-3", "La Argentina en el siglo XX", "Luis Alberto Romero", "Ariel", 20000, hum, E2),
        ("978-950-557-089-7", "El ser y la nada", "Jean-Paul Sartre", "Losada", 28000, hum, E2),
        ("978-950-557-156-6", "Crítica de la razón pura", "Immanuel Kant", "Alfaguara", 32000, hum, E2),
        ("978-950-12-6789-2", "La condición humana", "Hannah Arendt", "Paidós", 22000, hum, E2),
        ("978-950-557-278-5", "Historia de la locura", "Michel Foucault", "FCE", 25000, hum, E2),
        ("978-950-557-345-4", "Vigilar y castigar", "Michel Foucault", "Siglo XXI", 21000, hum, E2),
        ("978-950-518-034-2", "El malestar en la cultura", "Sigmund Freud", "Amorrortu", 14000, hum, E2),
        ("978-950-518-078-6", "Tótem y tabú", "Sigmund Freud", "Amorrortu", 15000, hum, E2),
        ("978-950-491-312-0", "Masa y poder", "Elias Canetti", "Alianza", 26000, hum, E2),
        ("978-950-491-423-3", "La ética protestante", "Max Weber", "Alianza", 18500, hum, E2),
        ("978-950-557-456-7", "Economía y sociedad", "Max Weber", "FCE", 35000, hum, E2),
        ("978-950-12-7890-3", "La distinción", "Pierre Bourdieu", "Taurus", 28000, hum, E2),
        ("978-950-557-567-8", "La imaginación sociológica", "C. Wright Mills", "FCE", 17000, hum, E2),
        ("978-950-12-8901-4", "Orientalismo", "Edward Said", "Debolsillo", 22000, hum, E2),
        ("978-950-557-678-9", "Historia Argentina", "Roberto Cortés Conde", "Sudamericana", 30000, soc, E2),
        ("978-950-12-5678-1", "Filosofía latinoamericana", "Leopoldo Zea", "FCE", 19000, hum, E2),

        # ── E3: Sistemas (informática, programación, redes) ──────────────────────
        ("978-987-1599-54-7", "América Latina en perspectiva", "Varios", "Ciccus", 20000, hum, E3),
        ("978-987-507-134-5", "Ingeniería del software", "Ian Sommerville", "Pearson", 45000, sis, E3),
        ("978-987-507-256-4", "Sistemas operativos modernos", "Andrew Tanenbaum", "Pearson", 48000, sis, E3),
        ("978-987-507-378-3", "Redes de computadoras", "Andrew Tanenbaum", "Pearson", 46000, sis, E3),
        ("978-987-507-490-2", "Fundamentos de bases de datos", "Abraham Silberschatz", "McGraw-Hill", 52000, sis, E3),
        ("978-987-507-512-1", "Inteligencia artificial", "Stuart Russell", "Pearson", 55000, sis, E3),
        ("978-987-507-634-0", "Arquitectura de computadoras", "William Stallings", "Pearson", 49000, sis, E3),
        ("978-987-507-756-9", "El lenguaje de programación C", "Kernighan & Ritchie", "Prentice Hall", 38000, sis, E3),
        ("978-987-507-878-8", "Código limpio", "Robert C. Martin", "Anaya", 34000, sis, E3),
        ("978-987-507-990-7", "El programador pragmático", "Hunt & Thomas", "Addison-Wesley", 36000, sis, E3),
        ("978-987-508-012-6", "Patrones de diseño", "Gamma, Helm, Johnson, Vlissides", "Addison-Wesley", 42000, sis, E3),
        ("978-987-508-134-5", "Refactoring", "Martin Fowler", "Addison-Wesley", 38000, sis, E3),
        ("978-987-508-256-4", "Domain-Driven Design", "Eric Evans", "Addison-Wesley", 44000, sis, E3),
        ("978-987-508-378-3", "Python para análisis de datos", "Wes McKinney", "O'Reilly", 39000, sis, E3),
        ("978-987-508-490-2", "Aprendizaje automático con Python", "Aurélien Géron", "O'Reilly", 52000, sis, E3),
        ("978-987-508-512-1", "Algoritmos y estructuras de datos", "Aho, Hopcroft, Ullman", "Addison-Wesley", 46000, sis, E3),
        ("978-987-508-634-0", "Compiladores: principios y práctica", "Aho, Sethi, Ullman", "Addison-Wesley", 50000, sis, E3),
        ("978-987-508-756-9", "Cálculo diferencial e integral", "James Stewart", "Thomson", 58000, sis, E3),
        ("978-987-508-878-8", "Álgebra lineal", "Gilbert Strang", "Reverte", 48000, sis, E3),
        ("978-987-508-990-7", "Probabilidad y estadística", "Walpole & Myers", "Pearson", 44000, sis, E3),
        ("978-987-509-012-6", "Metodologías ágiles", "Ken Schwaber", "Agile Alliance", 28000, sis, E3),

        # ── MESA-CENTRAL: Mesa central (destacados, ensayo, multidisciplinario) ──
        ("978-987-693-784-9", "Argentina en su laberinto", "Varios", "Ciccus", 39000, hum, MC),
        ("978-987-693-386-5", "Del péndulo al precipicio", "Varios", "Ciccus", 29500, hum, MC),
        ("978-950-557-789-0", "El capital", "Karl Marx", "Siglo XXI", 36000, soc, MC),
        ("978-950-557-890-1", "Teoría general del empleo", "John M. Keynes", "FCE", 34000, dev, MC),
        ("978-950-491-534-6", "El proceso", "Franz Kafka", "Alianza", 14000, hum, MC),
        ("978-950-491-645-7", "La metamorfosis", "Franz Kafka", "Alianza", 11000, hum, MC),
        ("978-950-830-234-5", "1984", "George Orwell", "Debolsillo", 13500, hum, MC),
        ("978-950-830-345-6", "Un mundo feliz", "Aldous Huxley", "Debolsillo", 12000, hum, MC),
        ("978-950-491-756-8", "El príncipe", "Nicolás Maquiavelo", "Alianza", 10000, hum, MC),
        ("978-950-491-867-9", "El contrato social", "Jean-Jacques Rousseau", "Alianza", 11500, hum, MC),
        ("978-950-12-3456-9", "Sociología", "Anthony Giddens", "Alianza", 35000, soc, MC),
        ("978-950-12-4567-0", "Microeconomía", "Robert Pindyck", "Pearson", 52000, dev, MC),
        ("978-950-12-5678-2", "Fundamentos de marketing", "Philip Kotler", "Pearson", 48000, dev, MC),
        ("978-950-12-6789-3", "Administración", "Harold Koontz", "McGraw-Hill", 50000, dev, MC),
        ("978-950-12-7890-4", "Contabilidad de costos", "Charles Horngren", "Pearson", 46000, dev, MC),
        ("978-950-12-8901-5", "Derecho constitucional", "Germán Bidart Campos", "Ediar", 38000, soc, MC),
        ("978-950-12-9012-6", "Metodología de la investigación", "Roberto Hernández Sampieri", "McGraw-Hill", 40000, sin, MC),
        ("978-950-13-0123-7", "Cómo hacer una tesis", "Umberto Eco", "Gedisa", 18000, sin, MC),
        ("978-950-13-1234-8", "Psicología social", "Serge Moscovici", "Paidós", 30000, soc, MC),
        ("978-950-13-2345-9", "Estadística para administración", "Berenson & Levine", "Pearson", 44000, dev, MC),
        ("978-950-13-3456-0", "Derecho civil - Parte general", "Jorge Joaquín Llambías", "Abeledo-Perrot", 42000, soc, MC),
        ("978-950-13-4567-1", "Investigación de operaciones", "Hillier & Lieberman", "McGraw-Hill", 55000, dev, MC),

        # ── ENTRADA: Entrada / Kiosko (destacados, novedades, promocionados) ─────
        ("978-987-693-6939-0", "Educar y gastar en cultura", "Varios", "Ciccus", 22000, hum, EN),
        ("978-950-04-1234-6", "Nunca más", "CONADEP", "Eudeba", 18000, soc, EN),
        ("978-987-723-678-9", "La noche de los lápices", "María Seoane", "Planeta", 16000, soc, EN),
        ("978-987-723-789-0", "El secreto de sus ojos", "Eduardo Sacheri", "Alfaguara", 14500, hum, EN),
        ("978-987-723-890-1", "La pregunta de sus ojos", "Eduardo Sacheri", "Alfaguara", 15000, hum, EN),
        ("978-987-723-901-2", "Papeles en el viento", "Eduardo Sacheri", "Alfaguara", 16500, hum, EN),
        ("978-950-04-0234-4", "Facundo", "Domingo F. Sarmiento", "Emecé", 13000, hum, EN),
        ("978-950-04-0345-5", "La vuelta de Martín Fierro", "José Hernández", "Eudeba", 10500, hum, EN),
        ("978-987-566-890-5", "Historia de América Latina", "Leslie Bethell", "Cambridge", 45000, soc, EN),
        ("978-987-566-901-6", "Malvinas: soberanía y memoria", "Varios", "Ciccus", 24000, soc, EN),
        ("978-987-566-012-7", "Literatura y mal", "Georges Bataille", "Taurus", 19000, hum, EN),
        ("978-987-566-123-8", "El laberinto de la soledad", "Octavio Paz", "FCE", 17000, hum, EN),
        ("978-987-566-234-9", "Los condenados de la tierra", "Frantz Fanon", "FCE", 20000, soc, EN),
        ("978-987-566-345-0", "Pedagogía del oprimido", "Paulo Freire", "Siglo XXI", 16000, hum, EN),
        ("978-987-566-456-1", "Las venas abiertas de América Latina", "Eduardo Galeano", "Siglo XXI", 18000, soc, EN),
        ("978-987-566-567-2", "Memoria del fuego", "Eduardo Galeano", "Siglo XXI", 22000, soc, EN),

        # Sin ubicar
        ("978-987-693-6939-1", "Educar y gastar en cultura II", "Varios", "Ciccus", 22000, hum, None),
        ("978-987-566-678-3", "Nuestra América", "José Martí", "Losada", 12000, hum, None),
        ("978-950-670-345-6", "Antología poética", "Pablo Neruda", "Losada", 14000, hum, None),
    ]

    # Niveles por estante, ordenados 1..N, para repartir los libros round-robin.
    niveles_por_estante: dict = {}
    def _niveles(estante) -> list:
        if estante is None:
            return []
        if estante.id not in niveles_por_estante:
            niveles_por_estante[estante.id] = (
                db.query(Nivel).filter(Nivel.estante_id == estante.id).order_by(Nivel.numero).all()
            )
        return niveles_por_estante[estante.id]

    contador: dict = {}  # estante_id -> índice de nivel para el round-robin
    insertados = 0
    for isbn, titulo, autor, editorial, precio, coleccion, estante in libros:
        nivel = None
        niveles = _niveles(estante)
        if niveles:
            idx = contador.get(estante.id, 0)
            nivel = niveles[idx % len(niveles)]
            contador[estante.id] = idx + 1
        if _agregar_libro(db, isbn, titulo, autor, editorial, precio, coleccion, estante, nivel):
            insertados += 1
    if insertados:
        print(f"[seed] {insertados} libros nuevos cargados.", flush=True)
