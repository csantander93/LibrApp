import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Loader2, MapPinOff, ArrowUp, ArrowDown, ArrowUpDown, ImageOff, List, LayoutList, LayoutGrid, SlidersHorizontal, Upload, Bomb, Filter, X } from "lucide-react";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useAuth } from "@/modules/auth/AuthContext";
import { cn } from "@/lib/utils";
import type { Libro } from "@/shared/types";
import { listarLibros, listarColecciones, listarEstantes, eliminarLibro, eliminarLibrosLote, asignarCategoriaLote, purgarCatalogo, urlImagenLibro } from "./api";
import { LibroFormModal } from "./LibroFormModal";
import { LibroDetalleModal } from "./LibroDetalleModal";
import { CamposLibroManager } from "./CamposLibroManager";
import { ImportarModal } from "./ImportarModal";
import { TablePagination, PAGE_SIZE_DEFAULT } from "@/shared/components/ui/TablePagination";

/** Columnas ordenables del catálogo. */
type CampoOrden = "titulo" | "autor" | "editorial" | "coleccion_nombre" | "estante_codigo" | "precio";
type Orden = { campo: CampoOrden; dir: "asc" | "desc" };
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

/** Badge de ubicación: solo la mesa/estante (el nivel se ve al abrir el detalle). */
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

export function CatalogoPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const { tienePermiso } = useAuth();
  const [q, setQ] = useState("");
  const [coleccionId, setColeccionId] = useState("");
  const [estanteId, setEstanteId] = useState("");
  const [soloSinUbicar, setSoloSinUbicar] = useState(false);
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [autorFiltro, setAutorFiltro] = useState("");
  const [editorialFiltro, setEditorialFiltro] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [vista, setVista] = useState<Vista>("lista");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [libroEdit, setLibroEdit] = useState<Libro | null>(null);
  const [libroDetalle, setLibroDetalle] = useState<Libro | null>(null);
  const [camposAbierto, setCamposAbierto] = useState(false);
  const [importarAbierto, setImportarAbierto] = useState(false);
  const puedeEliminar = tienePermiso("eliminar.ejecutar");
  const puedeGestionar = tienePermiso("catalogo.gestionar");
  // La selección múltiple sirve para dos acciones: asignar categoría (gestionar) y
  // borrar en lote (eliminar). Se muestra si el usuario puede alguna de las dos.
  const puedeSeleccionar = puedeEliminar || puedeGestionar;
  // Selección múltiple (ids de libros).
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const filtros = {
    q: q.trim().length >= 2 ? q.trim() : undefined,
    coleccion_id: coleccionId || undefined,
    estante_id: estanteId || undefined,
    sin_ubicar: soloSinUbicar || undefined,
    precio_min: precioMin.trim() || undefined,
    precio_max: precioMax.trim() || undefined,
    autor: autorFiltro.trim() || undefined,
    editorial: editorialFiltro.trim() || undefined,
  };

  // Filtros "avanzados" activos (todos menos la búsqueda rápida `q`), para el badge.
  const filtrosActivos = [
    coleccionId, estanteId, soloSinUbicar ? "x" : "",
    precioMin.trim(), precioMax.trim(), autorFiltro.trim(), editorialFiltro.trim(),
  ].filter(Boolean).length;

  function limpiarFiltros() {
    setQ("");
    setColeccionId(""); setEstanteId(""); setSoloSinUbicar(false);
    setPrecioMin(""); setPrecioMax(""); setAutorFiltro(""); setEditorialFiltro("");
    setPagina(1);
  }

  const { data: libros, isLoading } = useQuery({
    queryKey: ["libros", filtros],
    queryFn: () => listarLibros(filtros),
  });
  const { data: colecciones = [] } = useQuery({ queryKey: ["colecciones"], queryFn: listarColecciones });
  const { data: estantes = [] } = useQuery({ queryKey: ["estantes"], queryFn: listarEstantes });

  const eliminar = useMutation({
    mutationFn: eliminarLibro,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success("Libro eliminado");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el libro"),
  });

  // Invalidaciones comunes tras un borrado (lista, dashboard y conteos de estantes).
  const invalidarTrasBorrado = () => {
    qc.invalidateQueries({ queryKey: ["libros"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["estantes"] });
  };

  const eliminarLote = useMutation({
    mutationFn: () => eliminarLibrosLote([...seleccion]),
    onSuccess: (n) => {
      invalidarTrasBorrado();
      setSeleccion(new Set());
      toast.success(`${n} libro(s) eliminado(s)`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudieron eliminar los libros"),
  });

  // Asignar (o quitar, con null) la categoría a los libros seleccionados.
  const asignarCategoria = useMutation({
    mutationFn: (coleccionId: string | null) => asignarCategoriaLote([...seleccion], coleccionId),
    onSuccess: (n, coleccionId) => {
      qc.invalidateQueries({ queryKey: ["libros"] });
      qc.invalidateQueries({ queryKey: ["estantes"] });
      const nombre = colecciones.find((c) => c.id === coleccionId)?.nombre;
      toast.success(
        coleccionId
          ? `Categoría "${nombre}" asignada a ${n} libro(s)`
          : `Categoría quitada a ${n} libro(s)`,
      );
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudo asignar la categoría"),
  });

  const purgar = useMutation({
    mutationFn: purgarCatalogo,
    onSuccess: (n) => {
      invalidarTrasBorrado();
      setSeleccion(new Set());
      toast.success(`Catálogo purgado · ${n} libro(s) eliminado(s)`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo purgar el catálogo"),
  });

  // Helpers de selección.
  const toggleSel = (id: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  // Al cambiar los filtros, la selección previa deja de ser visible: se limpia.
  useEffect(() => { setSeleccion(new Set()); }, [
    q, coleccionId, estanteId, soloSinUbicar, precioMin, precioMax, autorFiltro, editorialFiltro,
  ]);

  async function confirmarEliminarLote() {
    const n = seleccion.size;
    const ok = await confirmar({
      tono: "danger",
      titulo: "Eliminar seleccionados",
      confirmar: `Eliminar ${n}`,
      mensaje: (
        <>
          ¿Eliminar <strong className="font-semibold text-stone-800">{n}</strong> libro(s)
          seleccionado(s)? Esta acción no se puede deshacer.
        </>
      ),
    });
    if (ok) eliminarLote.mutate();
  }

  async function confirmarPurgar() {
    const ok = await confirmar({
      tono: "danger",
      titulo: "Purgar catálogo",
      confirmar: "Purgar todo",
      mensaje: (
        <>
          <strong className="font-semibold text-red-600">Acción peligrosa e irreversible.</strong>{" "}
          Vas a borrar <strong>todos</strong> los libros del catálogo, incluidas sus imágenes.
          Las colecciones, campos personalizados, estantes y zonas se conservan.
        </>
      ),
    });
    if (ok) purgar.mutate();
  }

  // Ordenamiento en 3 estados por columna (desc → asc → sin orden). Los nulos van al final.
  const librosOrdenados = useMemo(() => {
    const base = libros ?? [];
    if (!orden) return base;
    const { campo, dir } = orden;
    const factor = dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (campo === "precio") {
        const va = a.precio === null ? null : Number(a.precio);
        const vb = b.precio === null ? null : Number(b.precio);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * factor;
      }
      const va = a[campo] ?? "";
      const vb = b[campo] ?? "";
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return va.localeCompare(vb, "es", { sensitivity: "base" }) * factor;
    });
  }, [libros, orden]);

  function ordenarPor(campo: CampoOrden) {
    setPagina(1);
    setOrden((prev) => {
      if (!prev || prev.campo !== campo) return { campo, dir: "desc" };
      if (prev.dir === "desc") return { campo, dir: "asc" };
      return null; // asc → vuelve al orden original
    });
  }

  const total = librosOrdenados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => librosOrdenados.slice((paginaActual - 1) * pageSize, paginaActual * pageSize),
    [librosOrdenados, paginaActual, pageSize],
  );

  // Selección de "todos los visibles" (de la página actual).
  const todosVisiblesSel = visibles.length > 0 && visibles.every((l) => seleccion.has(l.id));
  function toggleTodosVisibles() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (todosVisiblesSel) visibles.forEach((l) => next.delete(l.id));
      else visibles.forEach((l) => next.add(l.id));
      return next;
    });
  }

  function abrirAlta() {
    setLibroEdit(null);
    setModalAbierto(true);
  }
  function abrirEdicion(libro: Libro) {
    setLibroEdit(libro);
    setModalAbierto(true);
  }
  function EncabezadoOrden({
    campo,
    children,
    alinear = "left",
  }: {
    campo: CampoOrden;
    children: React.ReactNode;
    alinear?: "left" | "right";
  }) {
    const activo = orden?.campo === campo;
    const Icono = !activo ? ArrowUpDown : orden!.dir === "desc" ? ArrowDown : ArrowUp;
    return (
      <th className={cn("px-4 py-3 font-medium", alinear === "right" && "text-right")}>
        <button
          type="button"
          onClick={() => ordenarPor(campo)}
          className={cn(
            "inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-700",
            activo && "text-unla",
          )}
        >
          {children}
          <Icono className={cn("h-3.5 w-3.5", !activo && "text-slate-300")} />
        </button>
      </th>
    );
  }

  async function confirmarEliminar(libro: Libro) {
    const ok = await confirmar({
      mensaje: (
        <>
          ¿Eliminar <strong className="font-semibold text-stone-800">“{libro.titulo}”</strong>?
          Esta acción no se puede deshacer.
        </>
      ),
    });
    if (ok) eliminar.mutate(libro.id);
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900">Catálogo</h1>
          <p className="text-sm text-stone-500">{total} libro(s) en el inventario.</p>
        </div>
        <div className="flex items-center gap-2">
          {puedeEliminar && (
            <Button variant="danger" onClick={confirmarPurgar} disabled={purgar.isPending} title="Borrar todos los libros del catálogo">
              {purgar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bomb className="h-4 w-4" />}
              Purgar catálogo
            </Button>
          )}
          {tienePermiso("importar.ejecutar") && (
            <Button variant="outline" onClick={() => setImportarAbierto(true)}>
              <Upload className="h-4 w-4" /> Importar
            </Button>
          )}
          <Button variant="outline" onClick={() => setCamposAbierto(true)}>
            <SlidersHorizontal className="h-4 w-4" /> Campos personalizados
          </Button>
          <Button onClick={abrirAlta}>
            <Plus className="h-4 w-4" /> Nuevo libro
          </Button>
        </div>
      </header>

      {/* Toolbar: búsqueda rápida + botón Filtros + alternar vista (RF-06 / RF-12) */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPagina(1); }}
            placeholder="Buscar por título, autor o ISBN…"
            className="pl-9"
          />
        </div>

        <Button
          variant={mostrarFiltros || filtrosActivos > 0 ? "primary" : "outline"}
          onClick={() => setMostrarFiltros((v) => !v)}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {filtrosActivos > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold">
              {filtrosActivos}
            </span>
          )}
        </Button>

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

      {/* Panel de filtros desplegable */}
      {mostrarFiltros && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Categoría</label>
              <Select value={coleccionId} onChange={(e) => { setColeccionId(e.target.value); setPagina(1); }}>
                <option value="">Todas las categorías</option>
                {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Ubicación (estante)</label>
              <Select value={estanteId} onChange={(e) => { setEstanteId(e.target.value); setPagina(1); }}>
                <option value="">Todos los estantes</option>
                {estantes.map((e) => <option key={e.id} value={e.id}>{e.codigo}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Precio</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} inputMode="decimal"
                  value={precioMin}
                  onChange={(e) => { setPrecioMin(e.target.value); setPagina(1); }}
                  placeholder="Desde"
                />
                <span className="text-slate-400">–</span>
                <Input
                  type="number" min={0} inputMode="decimal"
                  value={precioMax}
                  onChange={(e) => { setPrecioMax(e.target.value); setPagina(1); }}
                  placeholder="Hasta"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Autor</label>
              <Input
                value={autorFiltro}
                onChange={(e) => { setAutorFiltro(e.target.value); setPagina(1); }}
                placeholder="Ej: Cortázar"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Editorial</label>
              <Input
                value={editorialFiltro}
                onChange={(e) => { setEditorialFiltro(e.target.value); setPagina(1); }}
                placeholder="Ej: Siglo XXI"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={soloSinUbicar}
                  onChange={(e) => { setSoloSinUbicar(e.target.checked); setPagina(1); }}
                  className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
                />
                Solo sin ubicar
              </label>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">
              {filtrosActivos > 0 ? `${filtrosActivos} filtro(s) activo(s)` : "Sin filtros aplicados"}
            </span>
            <Button variant="outline" onClick={limpiarFiltros} disabled={filtrosActivos === 0 && !q.trim()}>
              <X className="h-4 w-4" /> Limpiar filtros
            </Button>
          </div>
        </div>
      )}

      {/* Barra contextual de la selección: categorizar (gestionar) y/o borrar (eliminar) */}
      {puedeSeleccionar && seleccion.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-unla/30 bg-unla/5 px-4 py-2.5">
          <span className="text-sm font-medium text-stone-800">
            {seleccion.size} libro(s) seleccionado(s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setSeleccion(new Set())}>Limpiar</Button>
            {puedeGestionar && (
              <Select
                value=""
                disabled={asignarCategoria.isPending}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  asignarCategoria.mutate(v === "__quitar__" ? null : v);
                  e.currentTarget.value = "";
                }}
                className="w-56"
                aria-label="Asignar categoría a los seleccionados"
              >
                <option value="">Asignar categoría…</option>
                {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value="__quitar__">— Quitar categoría —</option>
              </Select>
            )}
            {puedeEliminar && (
              <Button variant="danger" onClick={confirmarEliminarLote} disabled={eliminarLote.isPending}>
                {eliminarLote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar seleccionados ({seleccion.size})
              </Button>
            )}
          </div>
        </div>
      )}

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

      {/* Vista LISTA (tabla; la imagen se ve al abrir el detalle) */}
      {!isLoading && visibles.length > 0 && vista === "lista" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {puedeSeleccionar && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={todosVisiblesSel}
                      onChange={toggleTodosVisibles}
                      aria-label="Seleccionar todos"
                      className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
                    />
                  </th>
                )}
                <EncabezadoOrden campo="titulo">Título</EncabezadoOrden>
                <EncabezadoOrden campo="autor">Autor</EncabezadoOrden>
                <EncabezadoOrden campo="editorial">Editorial</EncabezadoOrden>
                <EncabezadoOrden campo="coleccion_nombre">Categoría</EncabezadoOrden>
                <EncabezadoOrden campo="estante_codigo">Ubicación</EncabezadoOrden>
                <EncabezadoOrden campo="precio" alinear="right">Precio</EncabezadoOrden>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((libro) => (
                <tr
                  key={libro.id}
                  className={cn("cursor-pointer hover:bg-slate-50", seleccion.has(libro.id) && "bg-unla/5")}
                  onClick={() => setLibroDetalle(libro)}
                >
                  {puedeSeleccionar && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={seleccion.has(libro.id)}
                        onChange={() => toggleSel(libro.id)}
                        aria-label={`Seleccionar ${libro.titulo}`}
                        className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-slate-900">{libro.titulo}</td>
                  <td className="px-4 py-3 text-slate-600">{libro.autor}</td>
                  <td className="px-4 py-3 text-slate-600">{libro.editorial}</td>
                  <td className="px-4 py-3 text-slate-600">{libro.coleccion_nombre ?? "—"}</td>
                  <td className="px-4 py-3"><UbicacionBadge libro={libro} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatearPrecio(libro.precio)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirEdicion(libro); }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-unla"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmarEliminar(libro); }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vista LISTA CON DETALLES (filas más altas, con portada al inicio) */}
      {!isLoading && visibles.length > 0 && vista === "detalles" && (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {visibles.map((libro) => (
            <div
              key={libro.id}
              onClick={() => setLibroDetalle(libro)}
              className={cn(
                "flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50",
                seleccion.has(libro.id) && "bg-unla/5",
              )}
            >
              {puedeSeleccionar && (
                <input
                  type="checkbox"
                  checked={seleccion.has(libro.id)}
                  onChange={() => toggleSel(libro.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Seleccionar ${libro.titulo}`}
                  className="h-4 w-4 shrink-0 rounded border-stone-300 text-unla focus:ring-unla/40"
                />
              )}
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
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); abrirEdicion(libro); }}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-unla"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); confirmarEliminar(libro); }}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vista CUADRÍCULA (la portada distingue el libro de un vistazo) */}
      {!isLoading && visibles.length > 0 && vista === "cuadricula" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((libro) => (
            <div
              key={libro.id}
              onClick={() => setLibroDetalle(libro)}
              className={cn(
                "group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md",
                seleccion.has(libro.id) ? "border-unla ring-1 ring-unla" : "border-slate-200",
              )}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                {puedeSeleccionar && (
                  <input
                    type="checkbox"
                    checked={seleccion.has(libro.id)}
                    onChange={() => toggleSel(libro.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Seleccionar ${libro.titulo}`}
                    className="absolute left-1.5 top-1.5 z-10 h-4 w-4 rounded border-stone-300 bg-white/90 text-unla shadow-sm focus:ring-unla/40"
                  />
                )}
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
                {/* Acciones flotantes */}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); abrirEdicion(libro); }}
                    className="rounded-lg bg-white/90 p-1.5 text-slate-600 shadow-sm backdrop-blur hover:text-unla"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); confirmarEliminar(libro); }}
                    className="rounded-lg bg-white/90 p-1.5 text-slate-600 shadow-sm backdrop-blur hover:text-red-600"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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

      <LibroDetalleModal
        libro={libroDetalle}
        onClose={() => setLibroDetalle(null)}
        onEditar={(libro) => { setLibroDetalle(null); abrirEdicion(libro); }}
      />

      <LibroFormModal
        abierto={modalAbierto}
        onClose={() => setModalAbierto(false)}
        libro={libroEdit}
        colecciones={colecciones}
        estantes={estantes}
      />

      <CamposLibroManager abierto={camposAbierto} onClose={() => setCamposAbierto(false)} />

      <ImportarModal abierto={importarAbierto} onClose={() => setImportarAbierto(false)} />
    </div>
  );
}
