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
}
