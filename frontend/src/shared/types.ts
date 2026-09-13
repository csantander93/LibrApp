export type Rol = "admin" | "publico";

export interface Usuario {
  id: string;
  username: string;
  nombre: string | null;
  rol: Rol;
}

export interface DashboardStats {
  total_libros: number;
  total_estantes: number;
  total_colecciones: number;
  libros_sin_ubicar: number;
}

export interface Libro {
  id: string;
  isbn: string | null;
  titulo: string;
  autor: string;
  editorial: string;
  precio: string | null;
  coleccion_id: string | null;
  estante_id: string | null;
  nivel_id: string | null;
  estante_codigo: string | null;
  nivel_numero: number | null;
  coleccion_nombre: string | null;
  /** Ids de las imágenes ordenadas; la primera es la portada/principal. */
  imagenes: string[];
  /** Valores de los campos personalizados: { codigo_campo: valor }. */
  datos_extra: Record<string, unknown>;
}

/** Tipo de dato de un campo personalizado (dinámico) de libro. */
export type TipoCampo = "texto" | "numero" | "select" | "booleano" | "fecha";

/** Definición de un campo personalizado que se agrega a la ficha del libro. */
export interface CampoLibro {
  id: string;
  /** Clave usada en Libro.datos_extra (autogenerada a partir de la etiqueta). */
  codigo: string;
  etiqueta: string;
  tipo: TipoCampo;
  /** Opciones del selector (solo para tipo "select"). */
  opciones: string[] | null;
  requerido: boolean;
  orden: number;
  activo: boolean;
}

/** Payload de alta/edición de un campo personalizado. */
export interface CampoLibroInput {
  etiqueta: string;
  tipo: TipoCampo;
  opciones?: string[] | null;
  requerido?: boolean;
  orden?: number;
  activo?: boolean;
}

/** Metadatos de una imagen de libro (el binario se pide por su URL). */
export interface LibroImagen {
  id: string;
  orden: number;
  content_type: string;
}

export interface Coleccion {
  id: string;
  nombre: string;
  descripcion: string | null;
}

export interface Zona {
  id: string;
  nombre: string;
  orden: number;
}

/** Nivel ("piso") dentro de un estante. Numerados 1..N de abajo hacia arriba. */
export interface Nivel {
  id: string;
  estante_id: string;
  numero: number;
  etiqueta: string | null;
  total_libros: number;
}

export interface Estante {
  id: string;
  codigo: string;
  etiqueta: string | null;
  zona_id: string | null;
  pos_x: number;
  pos_y: number;
  ancho: number;
  alto: number;
  /** Giro del bloque en grados (se rota desde el editor sin alterar el tamaño). */
  rotacion: number;
  /** Color del bloque en el mapa (hex). null = color derivado de la zona. */
  color: string | null;
  total_libros: number;
  niveles: Nivel[];
}

export type AnotacionTipo = "texto" | "flecha";

/** Marca de referencia sobre el plano (ENTRADA, ESCALERA, VENTANA, flechas). */
export interface Anotacion {
  id: string;
  zona_id: string | null;
  tipo: AnotacionTipo;
  texto: string | null;
  pos_x: number;
  pos_y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  color: string | null;
}

export interface ImportFilaError {
  fila: number;
  motivo: string;
  titulo: string | null;
}

export interface ImportResultado {
  dry_run: boolean;
  total_filas: number;
  creados: number;
  actualizados: number;
  sin_ubicar: number;
  errores: ImportFilaError[];
  columnas_detectadas: Record<string, string>;
}

/** Ajustes generales de la app (editables en /admin/configuracion). */
export interface Configuracion {
  isbn_obligatorio: boolean;
}

/** Respuesta paginada genérica del backend (Page[T]). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Registro de acceso al sistema (intento de login, exitoso o fallido). */
export interface LogAcceso {
  id: string;
  usuario_id: string | null;
  username: string;
  ip: string | null;
  agente: string | null;
  exito: boolean;
  fecha: string;
}

/** Registro de una acción del panel (alta / edición / baja / importación). */
export interface LogAccion {
  id: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  username: string | null;
  detalle: string;
  modulo: string | null;
  accion: string | null;
  ip: string | null;
  fecha: string;
}

/** Filtros de los listados de logs (auditoría). */
export interface LogsFilter {
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
  usuario?: string; // busca por username / nombre
  page?: number;
  size?: number;
}

/** Payload de alta/edición de un libro. */
export interface LibroInput {
  titulo: string;
  autor: string;
  editorial: string;
  isbn: string | null;
  precio: string | null;
  coleccion_id: string | null;
  estante_id: string | null;
  nivel_id: string | null;
  /** Valores de los campos personalizados: { codigo_campo: valor }. */
  datos_extra: Record<string, unknown>;
}
