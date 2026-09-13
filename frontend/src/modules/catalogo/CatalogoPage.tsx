import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Loader2, MapPinOff, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { Libro } from "@/shared/types";
import { listarLibros, listarColecciones, listarEstantes, eliminarLibro } from "./api";
import { LibroFormModal } from "./LibroFormModal";
import { LibroDetalleModal } from "./LibroDetalleModal";

const PAGE_SIZE = 15;

/** Columnas ordenables del catálogo. */
type CampoOrden = "titulo" | "autor" | "editorial" | "coleccion_nombre" | "estante_codigo" | "precio";
type Orden = { campo: CampoOrden; dir: "asc" | "desc" };

function formatearPrecio(precio: string | null): string {
  if (precio === null) return "—";
  const n = Number(precio);
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

export function CatalogoPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const [q, setQ] = useState("");
  const [coleccionId, setColeccionId] = useState("");
  const [estanteId, setEstanteId] = useState("");
  const [soloSinUbicar, setSoloSinUbicar] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [libroEdit, setLibroEdit] = useState<Libro | null>(null);
  const [libroDetalle, setLibroDetalle] = useState<Libro | null>(null);

  const filtros = {
    q: q.trim().length >= 2 ? q.trim() : undefined,
    coleccion_id: coleccionId || undefined,
    estante_id: estanteId || undefined,
    sin_ubicar: soloSinUbicar || undefined,
  };

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
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => librosOrdenados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE),
    [librosOrdenados, paginaActual],
  );

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
        <Button onClick={abrirAlta}>
          <Plus className="h-4 w-4" /> Nuevo libro
        </Button>
      </header>

      {/* Filtros (RF-06 / RF-12) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPagina(1); }}
            placeholder="Buscar por título, autor o ISBN…"
            className="pl-9"
          />
        </div>
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={soloSinUbicar}
            onChange={(e) => { setSoloSinUbicar(e.target.checked); setPagina(1); }}
          />
          Solo sin ubicar
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <EncabezadoOrden campo="titulo">Título</EncabezadoOrden>
              <EncabezadoOrden campo="autor">Autor</EncabezadoOrden>
              <EncabezadoOrden campo="editorial">Editorial</EncabezadoOrden>
              <EncabezadoOrden campo="coleccion_nombre">Colección</EncabezadoOrden>
              <EncabezadoOrden campo="estante_codigo">Ubicación</EncabezadoOrden>
              <EncabezadoOrden campo="precio" alinear="right">Precio</EncabezadoOrden>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            )}
            {!isLoading && visibles.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sin resultados.</td></tr>
            )}
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
                <td className="px-4 py-3">
                  {libro.estante_codigo ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded-full bg-unla/10 px-2 py-0.5 text-xs font-medium text-unla">
                        {libro.estante_codigo}
                      </span>
                      {libro.nivel_numero !== null && (
                        <span className="text-xs text-slate-500">Nivel {libro.nivel_numero}</span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <MapPinOff className="h-3 w-3" /> Sin ubicar
                    </span>
                  )}
                </td>
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

      {/* Paginación */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Página {paginaActual} de {totalPaginas}</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={paginaActual <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" disabled={paginaActual >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
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
    </div>
  );
}
