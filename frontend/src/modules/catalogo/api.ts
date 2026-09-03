import { api } from "@/lib/api";
import type {
  Libro, Coleccion, Zona, Estante, Nivel, LibroInput, ImportResultado,
  Anotacion, AnotacionTipo,
} from "@/shared/types";

// ─── Lectura ──────────────────────────────────────────────────────────────────

export interface LibroFiltros {
  q?: string;
  coleccion_id?: string;
  estante_id?: string;
  nivel_id?: string;
  sin_ubicar?: boolean;
}

export async function listarLibros(filtros: LibroFiltros = {}): Promise<Libro[]> {
  const params: Record<string, string> = {};
  if (filtros.q) params.q = filtros.q;
  if (filtros.coleccion_id) params.coleccion_id = filtros.coleccion_id;
  if (filtros.estante_id) params.estante_id = filtros.estante_id;
  if (filtros.nivel_id) params.nivel_id = filtros.nivel_id;
  if (filtros.sin_ubicar) params.sin_ubicar = "true";
  const { data } = await api.get<Libro[]>("/catalogo/libros", { params });
  return data;
}

export async function listarColecciones(): Promise<Coleccion[]> {
  const { data } = await api.get<Coleccion[]>("/catalogo/colecciones");
  return data;
}

export async function listarZonas(): Promise<Zona[]> {
  const { data } = await api.get<Zona[]>("/catalogo/zonas");
  return data;
}

// ─── Zonas (escritura, RF-11) ─────────────────────────────────────────────────

export interface ZonaInput {
  nombre: string;
  orden?: number;
}

export async function crearZona(input: ZonaInput): Promise<Zona> {
  const { data } = await api.post<Zona>("/catalogo/zonas", input);
  return data;
}

export async function actualizarZona(id: string, input: Partial<ZonaInput>): Promise<Zona> {
  const { data } = await api.put<Zona>(`/catalogo/zonas/${id}`, input);
  return data;
}

export async function eliminarZona(id: string): Promise<void> {
  await api.delete(`/catalogo/zonas/${id}`);
}

export async function listarEstantes(): Promise<Estante[]> {
  const { data } = await api.get<Estante[]>("/catalogo/estantes");
  return data;
}

// ─── Libros (escritura) ───────────────────────────────────────────────────────

export async function crearLibro(input: LibroInput): Promise<Libro> {
  const { data } = await api.post<Libro>("/catalogo/libros", input);
  return data;
}

export async function actualizarLibro(id: string, input: Partial<LibroInput>): Promise<Libro> {
  const { data } = await api.put<Libro>(`/catalogo/libros/${id}`, input);
  return data;
}

export async function actualizarPrecio(id: string, precio: string | null): Promise<Libro> {
  const { data } = await api.patch<Libro>(`/catalogo/libros/${id}/precio`, { precio });
  return data;
}

export async function eliminarLibro(id: string): Promise<void> {
  await api.delete(`/catalogo/libros/${id}`);
}

// ─── Estantes (escritura) ─────────────────────────────────────────────────────

export interface EstanteInput {
  codigo: string;
  etiqueta: string | null;
  zona_id: string | null;
  color?: string | null;
  cantidad_niveles?: number;
}

export async function crearEstante(input: EstanteInput): Promise<Estante> {
  const { data } = await api.post<Estante>("/catalogo/estantes", input);
  return data;
}

export async function actualizarEstante(id: string, input: Partial<EstanteInput>): Promise<Estante> {
  const { data } = await api.put<Estante>(`/catalogo/estantes/${id}`, input);
  return data;
}

export async function eliminarEstante(id: string): Promise<void> {
  await api.delete(`/catalogo/estantes/${id}`);
}

// ─── Niveles ("pisos" del estante) ────────────────────────────────────────────

export async function crearNivel(input: { estante_id: string; etiqueta?: string | null }): Promise<Nivel> {
  const { data } = await api.post<Nivel>("/catalogo/niveles", input);
  return data;
}

export async function actualizarNivel(id: string, input: { etiqueta: string | null }): Promise<Nivel> {
  const { data } = await api.put<Nivel>(`/catalogo/niveles/${id}`, input);
  return data;
}

export async function eliminarNivel(id: string): Promise<void> {
  await api.delete(`/catalogo/niveles/${id}`);
}

export interface PosicionEstante {
  id: string;
  pos_x: number;
  pos_y: number;
  ancho?: number;
  alto?: number;
  color?: string | null;
}

export async function guardarPosiciones(posiciones: PosicionEstante[]): Promise<number> {
  const { data } = await api.put<{ actualizados: number }>(
    "/catalogo/estantes/posiciones",
    { posiciones },
  );
  return data.actualizados;
}

// ─── Anotaciones del mapa (flechas / textos) ──────────────────────────────────

export async function listarAnotaciones(): Promise<Anotacion[]> {
  const { data } = await api.get<Anotacion[]>("/catalogo/anotaciones");
  return data;
}

export interface AnotacionInput {
  tipo: AnotacionTipo;
  texto?: string | null;
  zona_id?: string | null;
  pos_x?: number;
  pos_y?: number;
  ancho?: number;
  alto?: number;
  rotacion?: number;
  color?: string | null;
}

export async function crearAnotacion(input: AnotacionInput): Promise<Anotacion> {
  const { data } = await api.post<Anotacion>("/catalogo/anotaciones", input);
  return data;
}

export interface AnotacionPosicion {
  id: string;
  texto: string | null;
  pos_x: number;
  pos_y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  color: string | null;
}

export async function guardarAnotaciones(anotaciones: AnotacionPosicion[]): Promise<number> {
  const { data } = await api.put<{ actualizados: number }>(
    "/catalogo/anotaciones/posiciones",
    { anotaciones },
  );
  return data.actualizados;
}

export async function eliminarAnotacion(id: string): Promise<void> {
  await api.delete(`/catalogo/anotaciones/${id}`);
}

// ─── Colecciones (escritura) ──────────────────────────────────────────────────

export async function crearColeccion(nombre: string): Promise<Coleccion> {
  const { data } = await api.post<Coleccion>("/catalogo/colecciones", { nombre });
  return data;
}

// ─── Importación ──────────────────────────────────────────────────────────────

export async function importarLibros(archivo: File, dryRun: boolean): Promise<ImportResultado> {
  const form = new FormData();
  form.append("archivo", archivo);
  const { data } = await api.post<ImportResultado>(
    `/catalogo/libros/importar?dry_run=${dryRun}`,
    form,
  );
  return data;
}
