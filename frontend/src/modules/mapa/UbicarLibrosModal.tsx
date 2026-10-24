import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, MapPin, ImageOff } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { listarLibros, ubicarLibrosLote, urlImagenLibro } from "@/modules/catalogo/api";
import type { Estante, Nivel, Libro } from "@/shared/types";

interface Props {
  estante: Estante;
  /** Nivel destino (o null si el estante no tiene niveles). */
  nivel: Nivel | null;
  onClose: () => void;
}

/** Coincidencia por título, autor o ISBN (CU-01). */
function coincide(l: Libro, filtro: string): boolean {
  return (
    l.titulo.toLowerCase().includes(filtro) ||
    l.autor.toLowerCase().includes(filtro) ||
    (l.isbn ?? "").toLowerCase().includes(filtro)
  );
}

/**
 * Selector de libros "sin ubicar" para colocarlos en un estante/nivel de una.
 * Pre-filtra por la categoría del estante (blando): se puede destildar para ver todas.
 */
export function UbicarLibrosModal({ estante, nivel, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const tieneCategoria = !!estante.coleccion_id;
  const [soloCategoria, setSoloCategoria] = useState(tieneCategoria);
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  // Libros sin ubicar; pre-filtrados por la categoría del estante si el toggle está activo.
  const coleccionFiltro = soloCategoria ? estante.coleccion_id ?? undefined : undefined;
  const { data: libros = [], isLoading } = useQuery({
    queryKey: ["libros", { sin_ubicar: true, coleccion_id: coleccionFiltro }],
    queryFn: () => listarLibros({ sin_ubicar: true, coleccion_id: coleccionFiltro }),
  });

  const filtro = busqueda.trim().toLowerCase();
  const mostrados = useMemo(
    () => (filtro ? libros.filter((l) => coincide(l, filtro)) : libros),
    [libros, filtro],
  );

  const todosSel = mostrados.length > 0 && mostrados.every((l) => seleccion.has(l.id));
  function toggleTodos() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (todosSel) mostrados.forEach((l) => next.delete(l.id));
      else mostrados.forEach((l) => next.add(l.id));
      return next;
    });
  }
  function toggle(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const ubicar = useMutation({
    mutationFn: () => ubicarLibrosLote([...seleccion], estante.id, nivel?.id ?? null),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["libros"] });
      qc.invalidateQueries({ queryKey: ["estantes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        `${n} libro(s) ubicado(s) en ${estante.codigo}${nivel ? ` · Nivel ${nivel.numero}` : ""}`,
      );
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudieron ubicar los libros"),
  });

  return (
    <Modal abierto onClose={onClose} titulo="Agregar libros al estante" ancho="max-w-2xl">
      <div className="space-y-3">
        {/* Destino */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-unla px-2 py-0.5 text-xs font-semibold text-white">
            <MapPin className="h-3 w-3" /> {estante.codigo}
          </span>
          <span className="text-stone-600">{nivel ? `Nivel ${nivel.numero}` : "sin nivel"}</span>
          {estante.coleccion_nombre && (
            <span className="ml-auto rounded-full bg-unla/10 px-2 py-0.5 text-xs font-medium text-unla">
              {estante.coleccion_nombre}
            </span>
          )}
        </div>

        {/* Buscador + filtro de categoría */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título, autor o ISBN…"
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-unla/40 focus:outline-none focus:ring-2 focus:ring-unla/15"
            />
          </div>
          {tieneCategoria && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!soloCategoria}
                onChange={(e) => { setSoloCategoria(!e.target.checked); setSeleccion(new Set()); }}
                className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
              />
              Mostrar todas las categorías
            </label>
          )}
        </div>

        {/* Lista de libros sin ubicar */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando libros…
          </div>
        ) : mostrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">
            No hay libros sin ubicar{soloCategoria && tieneCategoria ? " en esta categoría" : ""}.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stone-200">
            <label className="flex items-center gap-2 border-b border-stone-100 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-500">
              <input
                type="checkbox"
                checked={todosSel}
                onChange={toggleTodos}
                className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
              />
              Seleccionar todos ({mostrados.length})
            </label>
            <div className="max-h-72 divide-y divide-stone-100 overflow-y-auto">
              {mostrados.map((libro) => (
                <label
                  key={libro.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-stone-50",
                    seleccion.has(libro.id) && "bg-unla/5",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={seleccion.has(libro.id)}
                    onChange={() => toggle(libro.id)}
                    className="h-4 w-4 shrink-0 rounded border-stone-300 text-unla focus:ring-unla/40"
                  />
                  {libro.imagenes.length > 0 ? (
                    <img
                      src={urlImagenLibro(libro.imagenes[0])}
                      alt={libro.titulo}
                      className="h-10 w-7 shrink-0 rounded object-cover ring-1 ring-black/5"
                    />
                  ) : (
                    <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                      <ImageOff className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-900">{libro.titulo}</p>
                    <p className="truncate text-xs text-stone-500">
                      {libro.autor}
                      {libro.coleccion_nombre ? ` · ${libro.coleccion_nombre}` : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            type="button"
            onClick={() => ubicar.mutate()}
            disabled={seleccion.size === 0 || ubicar.isPending}
          >
            {ubicar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Ubicar {seleccion.size > 0 ? `${seleccion.size} libro(s)` : "libros"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
