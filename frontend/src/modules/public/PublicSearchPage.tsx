import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Search, Lock, Loader2, MapPinOff, ImageOff, List, LayoutList, LayoutGrid,
  BookOpen, Map as MapIcon,
} from "lucide-react";
import { Select } from "@/shared/components/ui/Select";
import { TablePagination, PAGE_SIZE_DEFAULT } from "@/shared/components/ui/TablePagination";
import {
  listarLibros, listarEstantes, listarZonas, listarAnotaciones, listarColecciones, urlImagenLibro,
} from "@/modules/catalogo/api";
import { LibroDetalleModal } from "@/modules/catalogo/LibroDetalleModal";
import { MapaCanvas } from "@/modules/mapa/MapaCanvas";
import { EstantePanelInline } from "@/modules/mapa/EstantePanelInline";
import { cn } from "@/lib/utils";
import type { Estante, Libro } from "@/shared/types";

type Solapa = "catalogo" | "mapa";
type Vista = "lista" | "detalles" | "cuadricula";

/** Miniatura de portada (o placeholder) reutilizable en las vistas. */
function Portada({ libro, className }: { libro: Libro; className?: string }) {
  if (libro.imagenes.length > 0) {
    return (
      <img
        src={urlImagenLibro(libro.imagenes[0])}
        alt={libro.titulo}
        className={cn("object-cover", className)}
      />
    );
  }
  return (
    <div className={cn("flex items-center justify-center bg-slate-100 text-slate-300", className)}>
      <ImageOff className="h-5 w-5" />
    </div>
  );
}

function formatearPrecio(precio: string | null): string {
  if (precio === null) return "—";
  const n = Number(precio);
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function UbicacionBadge({ libro }: { libro: Libro }) {
  if (!libro.estante_codigo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <MapPinOff className="h-3 w-3" /> Sin ubicar
      </span>
    );
  }
  return (
    <span className="rounded-full bg-unla/10 px-2 py-0.5 text-xs font-medium text-unla">
      {libro.estante_codigo}
    </span>
  );
}

export function PublicSearchPage() {
  const [solapa, setSolapa] = useState<Solapa>("catalogo");

  // ── Estado del catálogo ─────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [coleccionId, setColeccionId] = useState("");
  const [estanteId, setEstanteId] = useState("");
  const [vista, setVista] = useState<Vista>("cuadricula");
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [libroDetalle, setLibroDetalle] = useState<Libro | null>(null);

  // ── Estado del mapa ──────────────────────────────────────────────────────────
  const [estantePanel, setEstantePanel] = useState<Estante | null>(null);
  const [zonaId, setZonaId] = useState("");

  // Búsqueda desde 2 caracteres (CU-01). Compartida entre catálogo y mapa.
  const busqueda = q.trim().length >= 2 ? q.trim() : "";

  const filtros = {
    q: busqueda || undefined,
    coleccion_id: coleccionId || undefined,
    estante_id: estanteId || undefined,
  };

  const { data: libros, isLoading } = useQuery({
    queryKey: ["public-libros", filtros],
    queryFn: () => listarLibros(filtros),
  });
  const { data: colecciones = [] } = useQuery({ queryKey: ["colecciones"], queryFn: listarColecciones });
  const { data: estantes = [] } = useQuery({ queryKey: ["estantes"], queryFn: listarEstantes });
  const { data: zonas = [] } = useQuery({ queryKey: ["zonas"], queryFn: listarZonas });
  const { data: anotaciones = [] } = useQuery({ queryKey: ["anotaciones"], queryFn: listarAnotaciones });

  // Zona por defecto: la primera.
  useEffect(() => {
    if (!zonaId && zonas.length) setZonaId(zonas[0].id);
  }, [zonas, zonaId]);

  // Paginación del catálogo.
  const total = libros?.length ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => (libros ?? []).slice((paginaActual - 1) * pageSize, paginaActual * pageSize),
    [libros, paginaActual, pageSize],
  );

  // RF-13: resaltar en el plano los estantes que contienen resultados de la búsqueda.
  const resaltados = useMemo(() => {
    if (!busqueda || !libros) return new Set<string>();
    return new Set(libros.map((l) => l.estante_id).filter((id): id is string => !!id));
  }, [busqueda, libros]);

  // Estantes/anotaciones de la zona seleccionada (RF-11: mapa multi-piso).
  const estantesZona = useMemo(
    () => estantes.filter((e) => (zonaId ? e.zona_id === zonaId : true)),
    [estantes, zonaId],
  );
  const anotacionesZona = useMemo(
    () => anotaciones.filter((a) => (zonaId ? a.zona_id === zonaId : true)),
    [anotaciones, zonaId],
  );
  const zonaActual = zonas.find((z) => z.id === zonaId) ?? null;

  // Zonas que contienen coincidencias (para orientar cuando están en otro piso).
  const zonasConMatch = useMemo(() => {
    if (resaltados.size === 0) return [];
    return zonas.filter((z) => estantes.some((e) => e.zona_id === z.id && resaltados.has(e.id)));
  }, [zonas, estantes, resaltados]);

  return (
    <div className="min-h-full">
      {/* Barra superior institucional */}
      <div className="border-b border-stone-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-librapp.png"
              alt="LibrApp"
              className="h-9 w-9 rounded-xl object-cover shadow-sm shadow-black/20"
            />
            <div>
              <p className="font-serif text-sm font-bold leading-tight text-stone-900">LibrApp</p>
              <p className="text-[11px] text-stone-500">Librería Rodolfo Walsh — UNLa</p>
            </div>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-unla"
          >
            <Lock className="h-3.5 w-3.5" /> Acceso administrador
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Título / presentación de la vista */}
        <header className="mb-5">
          <h1 className="font-serif text-2xl font-bold text-stone-900 sm:text-3xl">
            Catálogo de la Librería
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Explorá y buscá libros por título, autor, editorial o ISBN, y ubicalos en el mapa de la sala.
          </p>
        </header>

        {/* Buscador (compartido por ambas solapas) */}
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-lg shadow-stone-900/5 ring-1 ring-black/[0.02] focus-within:border-unla/40 focus-within:ring-2 focus-within:ring-unla/20">
          <Search className="ml-2 h-5 w-5 shrink-0 text-stone-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPagina(1); }}
            placeholder="Buscar por título, autor, editorial o ISBN…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
        </div>

        {/* Solapas: Catálogo (por defecto) · Mapa */}
        <div className="mb-5 inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
          {([
            { s: "catalogo", Icono: BookOpen, titulo: "Catálogo" },
            { s: "mapa", Icono: MapIcon, titulo: "Mapa" },
          ] as const).map(({ s, Icono, titulo }) => (
            <button
              key={s}
              type="button"
              onClick={() => setSolapa(s)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                solapa === s ? "bg-unla text-white shadow-sm" : "text-stone-500 hover:text-stone-800",
              )}
            >
              <Icono className="h-4 w-4" /> {titulo}
            </button>
          ))}
        </div>

        {/* ══════════════════════ SOLAPA CATÁLOGO ══════════════════════ */}
        {solapa === "catalogo" && (
          <div>
            {/* Filtros + selector de vista */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Select
                value={coleccionId}
                onChange={(e) => { setColeccionId(e.target.value); setPagina(1); }}
                className="w-52"
              >
                <option value="">Todas las colecciones</option>
                {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
              <Select
                value={estanteId}
                onChange={(e) => { setEstanteId(e.target.value); setPagina(1); }}
                className="w-48"
              >
                <option value="">Todos los estantes</option>
                {estantes.map((e) => <option key={e.id} value={e.id}>{e.codigo}</option>)}
              </Select>

              {/* Alternar vista: lista · lista con detalles · cuadrícula */}
              <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {([
                  { v: "lista", Icono: List, titulo: "Lista" },
                  { v: "detalles", Icono: LayoutList, titulo: "Lista con detalles" },
                  { v: "cuadricula", Icono: LayoutGrid, titulo: "Cuadrícula" },
                ] as const).map(({ v, Icono, titulo }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVista(v)}
                    title={titulo}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      vista === v ? "bg-unla/10 text-unla" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    <Icono className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {isLoading && (
              <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {!isLoading && visibles.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
                Sin resultados.
              </div>
            )}

            {/* Vista LISTA (tabla) */}
            {!isLoading && visibles.length > 0 && vista === "lista" && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Título</th>
                      <th className="px-4 py-3 font-medium">Autor</th>
                      <th className="px-4 py-3 font-medium">Editorial</th>
                      <th className="px-4 py-3 font-medium">Colección</th>
                      <th className="px-4 py-3 font-medium">Ubicación</th>
                      <th className="px-4 py-3 text-right font-medium">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibles.map((libro) => (
                      <tr
                        key={libro.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setLibroDetalle(libro)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">{libro.titulo}</td>
                        <td className="px-4 py-3 text-slate-600">{libro.autor}</td>
                        <td className="px-4 py-3 text-slate-600">{libro.editorial}</td>
                        <td className="px-4 py-3 text-slate-600">{libro.coleccion_nombre ?? "—"}</td>
                        <td className="px-4 py-3"><UbicacionBadge libro={libro} /></td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatearPrecio(libro.precio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Vista LISTA CON DETALLES */}
            {!isLoading && visibles.length > 0 && vista === "detalles" && (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {visibles.map((libro) => (
                  <div
                    key={libro.id}
                    onClick={() => setLibroDetalle(libro)}
                    className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <Portada
                      libro={libro}
                      className="h-20 w-14 shrink-0 rounded-md shadow-sm ring-1 ring-black/5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{libro.titulo}</p>
                      <p className="truncate text-sm text-slate-600">{libro.autor}</p>
                      <p className="truncate text-xs text-slate-400">
                        {libro.editorial}
                        {libro.coleccion_nombre ? ` · ${libro.coleccion_nombre}` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <UbicacionBadge libro={libro} />
                        <span className="tabular-nums text-sm text-slate-600">{formatearPrecio(libro.precio)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Vista CUADRÍCULA */}
            {!isLoading && visibles.length > 0 && vista === "cuadricula" && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibles.map((libro) => (
                  <div
                    key={libro.id}
                    onClick={() => setLibroDetalle(libro)}
                    className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                      {libro.imagenes.length > 0 ? (
                        <img
                          src={urlImagenLibro(libro.imagenes[0])}
                          alt={libro.titulo}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-300">
                          <ImageOff className="h-7 w-7" />
                          <span className="text-[10px]">Sin portada</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 font-medium leading-snug text-slate-900">{libro.titulo}</p>
                      <p className="text-xs text-slate-500">{libro.autor}</p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <UbicacionBadge libro={libro} />
                        <span className="tabular-nums text-xs text-slate-600">{formatearPrecio(libro.precio)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Paginación */}
            {!isLoading && (
              <TablePagination
                page={paginaActual}
                pages={totalPaginas}
                total={total}
                pageSize={pageSize}
                onPage={setPagina}
                onPageSize={(n) => { setPageSize(n); setPagina(1); }}
                unidad="libro"
              />
            )}
          </div>
        )}

        {/* ══════════════════════ SOLAPA MAPA ══════════════════════ */}
        {solapa === "mapa" && (
          <div className="mx-auto max-w-4xl">
            {/* Encabezado del mapa */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold text-stone-900">Mapa de la sala</h2>
              {zonas.length > 1 && (
                <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className="w-44">
                  {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                </Select>
              )}
            </div>

            {/* Pista: coincidencias en otra zona */}
            {zonasConMatch.length > 0 && !zonasConMatch.some((z) => z.id === zonaId) && (
              <p className="mb-2 rounded-lg bg-unla/10 px-3 py-2 text-xs font-medium text-unla">
                Hay coincidencias en: {zonasConMatch.map((z) => z.nombre).join(", ")}. Cambiá de zona para verlas.
              </p>
            )}

            {/* Mapa (RF-01 / RF-13 / RF-11) — solo lectura */}
            <div className="h-[42vh]">
              <MapaCanvas
                estantes={estantesZona}
                anotaciones={anotacionesZona}
                textura={zonaActual?.textura ?? null}
                modo="ver"
                resaltados={resaltados}
                seleccionadoId={estantePanel?.id}
                onSeleccionar={(e) =>
                  setEstantePanel((prev) => (prev?.id === e.id ? null : e))
                }
              />
            </div>
            <p className={cn("mt-2 text-xs", busqueda ? "text-unla" : "text-stone-400")}>
              {busqueda
                ? "Los estantes con brillo dorado contienen tu búsqueda. Tocá uno para ver sus libros."
                : "Tocá un estante para ver qué libros tiene."}
            </p>

            {/* Panel inline: siempre reservado debajo del mapa (RF-03). */}
            <div className="mt-3 h-72">
              {estantePanel ? (
                <EstantePanelInline
                  estante={estantePanel}
                  zonas={zonas}
                  onCerrar={() => setEstantePanel(null)}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/60 text-sm text-stone-400">
                  Tocá un estante para ver sus libros
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detalle del libro — solo lectura (sin botón editar). */}
      <LibroDetalleModal libro={libroDetalle} onClose={() => setLibroDetalle(null)} />
    </div>
  );
}
