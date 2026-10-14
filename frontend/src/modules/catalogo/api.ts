import { api } from "@/lib/api";
import type {
  Libro, Coleccion, Zona, Estante, Nivel, LibroInput, ImportResultado,
  Anotacion, AnotacionTipo, LibroImagen, CampoLibro, CampoLibroInput, TexturaPiso,
} from "@/shared/types";

// ─── Lectura ──────────────────────────────────────────────────────────────────

export interface LibroFiltros {
  q?: string;
  coleccion_id?: string;
  estante_id?: string;
  nivel_id?: string;
  sin_ubicar?: boolean;
  precio_min?: string;
  precio_max?: string;
  autor?: string;
  editorial?: string;
}

export async function listarLibros(filtros: LibroFiltros = {}): Promise<Libro[]> {
  const params: Record<string, string> = {};
  if (filtros.q) params.q = filtros.q;
  if (filtros.coleccion_id) params.coleccion_id = filtros.coleccion_id;
  if (filtros.estante_id) params.estante_id = filtros.estante_id;
  if (filtros.nivel_id) params.nivel_id = filtros.nivel_id;
  if (filtros.sin_ubicar) params.sin_ubicar = "true";
  if (filtros.precio_min) params.precio_min = filtros.precio_min;
  if (filtros.precio_max) params.precio_max = filtros.precio_max;
  if (filtros.autor) params.autor = filtros.autor;
  if (filtros.editorial) params.editorial = filtros.editorial;
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
  textura?: TexturaPiso | null;
}

export async function crearZona(input: ZonaInput): Promise<Zona> {
  const { data } = await api.post<Zona>("/catalogo/zonas", input);
  return data;
}

export async function actualizarZona(id: string, input: Partial<ZonaInput>): Promise<Zona> {
  const { data } = await api.put<Zona>(`/catalogo/zonas/${id}`, input);
  return data;
}

/** Elimina una zona. Si tiene estantes: `moverA` = id de otra zona donde moverlos,
 *  o null/undefined para dejarlos sin zona (RN-08 análogo). */
export async function eliminarZona(id: string, moverA?: string | null): Promise<void> {
  await api.delete(`/catalogo/zonas/${id}`, {
    params: moverA ? { mover_a: moverA } : undefined,
  });
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

// ─── Borrado en lote y purga (permiso eliminar.ejecutar) ──────────────────────

/** Borra en lote los libros indicados. Devuelve cuántos se eliminaron. */
export async function eliminarLibrosLote(ids: string[]): Promise<number> {
  const { data } = await api.post<{ eliminados: number }>("/catalogo/libros/eliminar-lote", { ids });
  return data.eliminados;
}

/** Purga TODO el catálogo de libros (acción peligrosa). Devuelve cuántos se eliminaron. */
export async function purgarCatalogo(): Promise<number> {
  const { data } = await api.post<{ eliminados: number }>("/catalogo/libros/purgar");
  return data.eliminados;
}

/** Asigna (o quita, con coleccion_id=null) la categoría a los libros indicados.
 *  Devuelve cuántos se actualizaron. */
export async function asignarCategoriaLote(ids: string[], coleccion_id: string | null): Promise<number> {
  const { data } = await api.post<{ actualizados: number }>(
    "/catalogo/libros/categoria-lote",
    { ids, coleccion_id },
  );
  return data.actualizados;
}

/** Ubica en lote los libros indicados en un estante (y opcionalmente un nivel).
 *  estante_id=null los deja 'Sin ubicar'. Devuelve cuántos se actualizaron. */
export async function ubicarLibrosLote(
  ids: string[], estante_id: string | null, nivel_id: string | null,
): Promise<number> {
  const { data } = await api.post<{ actualizados: number }>(
    "/catalogo/libros/ubicar-lote",
    { ids, estante_id, nivel_id },
  );
  return data.actualizados;
}

/** Borra en lote los estantes indicados; sus libros quedan 'Sin ubicar'. */
export async function eliminarEstantesLote(ids: string[]): Promise<{ eliminados: number; desubicados: number }> {
  const { data } = await api.post<{ eliminados: number; desubicados: number }>(
    "/catalogo/estantes/eliminar-lote",
    { ids },
  );
  return data;
}

// ─── Orden manual de libros (drag & drop de lomos en el mapa) ──────────────────

export interface LibroOrden {
  id: string;
  orden: number;
}

/** Guarda en lote el orden de los libros (menor `orden` = primero). */
export async function guardarOrdenLibros(libros: LibroOrden[]): Promise<number> {
  const { data } = await api.put<{ actualizados: number }>(
    "/catalogo/libros/orden",
    { libros },
  );
  return data.actualizados;
}

// ─── Imágenes de libros ───────────────────────────────────────────────────────

/** URL pública para mostrar una imagen en un <img src>. */
export function urlImagenLibro(imagenId: string): string {
  return `${api.defaults.baseURL}/catalogo/imagenes/${imagenId}`;
}

export async function subirImagenesLibro(libroId: string, archivos: File[]): Promise<LibroImagen[]> {
  const form = new FormData();
  archivos.forEach((f) => form.append("archivos", f));
  const { data } = await api.post<LibroImagen[]>(`/catalogo/libros/${libroId}/imagenes`, form);
  return data;
}

export async function hacerPrincipalImagen(imagenId: string): Promise<LibroImagen> {
  const { data } = await api.patch<LibroImagen>(`/catalogo/imagenes/${imagenId}/principal`);
  return data;
}

export async function eliminarImagenLibro(imagenId: string): Promise<void> {
  await api.delete(`/catalogo/imagenes/${imagenId}`);
}

// ─── Estantes (escritura) ─────────────────────────────────────────────────────

export interface EstanteInput {
  codigo: string;
  etiqueta: string | null;
  zona_id: string | null;
  coleccion_id?: string | null;
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

/** Elimina un estante. Si tiene libros: `reasignarA` = id de otro estante donde
 *  moverlos, o null/undefined para dejarlos 'Sin ubicar' (RN-08 revisado). */
export async function eliminarEstante(id: string, reasignarA?: string | null): Promise<void> {
  await api.delete(`/catalogo/estantes/${id}`, {
    params: reasignarA ? { reasignar_a: reasignarA } : undefined,
  });
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

/** Elimina un nivel. Si tiene libros: `moverA` = id de otro nivel del mismo estante
 *  donde moverlos, o null/undefined para dejarlos en el estante sin nivel. */
export async function eliminarNivel(id: string, moverA?: string | null): Promise<void> {
  await api.delete(`/catalogo/niveles/${id}`, {
    params: moverA ? { mover_a: moverA } : undefined,
  });
}

export interface PosicionEstante {
  id: string;
  pos_x: number;
  pos_y: number;
  ancho?: number;
  alto?: number;
  rotacion?: number;
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

// ─── Campos personalizados (dinámicos) de libros ──────────────────────────────

export async function listarCampos(): Promise<CampoLibro[]> {
  const { data } = await api.get<CampoLibro[]>("/catalogo/campos");
  return data;
}

export async function crearCampo(input: CampoLibroInput): Promise<CampoLibro> {
  const { data } = await api.post<CampoLibro>("/catalogo/campos", input);
  return data;
}

export async function actualizarCampo(id: string, input: Partial<CampoLibroInput>): Promise<CampoLibro> {
  const { data } = await api.put<CampoLibro>(`/catalogo/campos/${id}`, input);
  return data;
}

export async function eliminarCampo(id: string): Promise<void> {
  await api.delete(`/catalogo/campos/${id}`);
}

// ─── Colecciones (escritura) ──────────────────────────────────────────────────

export interface ColeccionInput {
  nombre: string;
  descripcion?: string | null;
}

export async function crearColeccion(nombre: string, descripcion?: string | null): Promise<Coleccion> {
  const { data } = await api.post<Coleccion>("/catalogo/colecciones", { nombre, descripcion });
  return data;
}

export async function actualizarColeccion(id: string, input: Partial<ColeccionInput>): Promise<Coleccion> {
  const { data } = await api.put<Coleccion>(`/catalogo/colecciones/${id}`, input);
  return data;
}

/** Elimina una categoría. Si tiene libros: `moverA` = id de otra categoría donde
 *  reasignarlos, o null/undefined para dejarlos sin categoría (RN-08 análogo). */
export async function eliminarColeccion(id: string, moverA?: string | null): Promise<void> {
  await api.delete(`/catalogo/colecciones/${id}`, {
    params: moverA ? { mover_a: moverA } : undefined,
  });
}

// ─── Importación ──────────────────────────────────────────────────────────────

/** Descarga la plantilla ("bandeja") vacía a completar, en CSV o XLSX. */
export async function descargarPlantilla(formato: "csv" | "xlsx"): Promise<void> {
  const { data, headers } = await api.get("/catalogo/libros/plantilla", {
    params: { formato },
    responseType: "blob",
  });
  // Nombre del archivo: el que manda el backend (Content-Disposition) o uno por defecto.
  const disp = (headers["content-disposition"] as string | undefined) ?? "";
  const match = disp.match(/filename="?([^"]+)"?/);
  const nombre = match?.[1] ?? `plantilla_importacion_librapp.${formato}`;
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importarLibros(archivo: File, dryRun: boolean): Promise<ImportResultado> {
  const form = new FormData();
  form.append("archivo", archivo);
  const { data } = await api.post<ImportResultado>(
    `/catalogo/libros/importar?dry_run=${dryRun}`,
    form,
  );
  return data;
}
