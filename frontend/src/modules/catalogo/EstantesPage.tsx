import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useAuth } from "@/modules/auth/AuthContext";
import { cn } from "@/lib/utils";
import type { Estante } from "@/shared/types";
import { listarEstantes, listarZonas, eliminarEstante, eliminarEstantesLote } from "./api";
import { EstanteFormModal } from "./EstanteFormModal";
import { TablePagination, PAGE_SIZE_DEFAULT } from "@/shared/components/ui/TablePagination";

/** Columnas ordenables de estantes. */
type CampoOrden = "codigo" | "etiqueta" | "zona" | "niveles" | "libros";
type Orden = { campo: CampoOrden; dir: "asc" | "desc" };

export function EstantesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const { tienePermiso } = useAuth();
  const puedeEliminar = tienePermiso("eliminar.ejecutar");
  const { data: estantes, isLoading } = useQuery({ queryKey: ["estantes"], queryFn: listarEstantes });
  const { data: zonas = [] } = useQuery({ queryKey: ["zonas"], queryFn: listarZonas });

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Estante | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  // Selección múltiple para borrado en lote (ids de estantes).
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const eliminar = useMutation({
    mutationFn: eliminarEstante,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success("Estante eliminado");
    },
    onError: (err: any) => {
      // RN-08: el backend rechaza si el estante tiene libros asignados.
      toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el estante");
    },
  });

  const eliminarLote = useMutation({
    mutationFn: () => eliminarEstantesLote([...seleccion]),
    onSuccess: ({ eliminados, desubicados }) => {
      qc.invalidateQueries({ queryKey: ["estantes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["libros"] });
      setSeleccion(new Set());
      toast.success(`${eliminados} estante(s) eliminado(s) · ${desubicados} libro(s) sin ubicar`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudieron eliminar los estantes"),
  });

  const toggleSel = (id: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function confirmarEliminarLote() {
    const seleccionados = (estantes ?? []).filter((e) => seleccion.has(e.id));
    const desubicados = seleccionados.reduce((acc, e) => acc + e.total_libros, 0);
    const ok = await confirmar({
      tono: "danger",
      titulo: "Eliminar seleccionados",
      confirmar: `Eliminar ${seleccionados.length}`,
      mensaje: (
        <>
          ¿Eliminar <strong className="font-semibold text-stone-800">{seleccionados.length}</strong> estante(s)?
          {desubicados > 0 && (
            <> <strong>{desubicados}</strong> libro(s) de esos estantes quedarán <strong>"Sin ubicar"</strong>.</>
          )}{" "}
          Esta acción no se puede deshacer.
        </>
      ),
    });
    if (ok) eliminarLote.mutate();
  }

  const nombreZona = (id: string | null) => zonas.find((z) => z.id === id)?.nombre ?? "—";

  // Ordenamiento en 3 estados por columna (desc → asc → sin orden).
  const estantesOrdenados = useMemo(() => {
    const base = estantes ?? [];
    if (!orden) return base;
    const { campo, dir } = orden;
    const factor = dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (campo) {
        case "niveles":
          return ((a.niveles?.length ?? 0) - (b.niveles?.length ?? 0)) * factor;
        case "libros":
          return (a.total_libros - b.total_libros) * factor;
        case "zona":
          return nombreZona(a.zona_id).localeCompare(nombreZona(b.zona_id), "es", { sensitivity: "base" }) * factor;
        case "etiqueta": {
          const va = a.etiqueta ?? "";
          const vb = b.etiqueta ?? "";
          if (!va && !vb) return 0;
          if (!va) return 1;
          if (!vb) return -1;
          return va.localeCompare(vb, "es", { sensitivity: "base" }) * factor;
        }
        default:
          return a.codigo.localeCompare(b.codigo, "es", { sensitivity: "base" }) * factor;
      }
    });
  }, [estantes, zonas, orden]);

  const total = estantesOrdenados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => estantesOrdenados.slice((paginaActual - 1) * pageSize, paginaActual * pageSize),
    [estantesOrdenados, paginaActual, pageSize],
  );

  const todosVisiblesSel = visibles.length > 0 && visibles.every((e) => seleccion.has(e.id));
  function toggleTodosVisibles() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (todosVisiblesSel) visibles.forEach((e) => next.delete(e.id));
      else visibles.forEach((e) => next.add(e.id));
      return next;
    });
  }

  function ordenarPor(campo: CampoOrden) {
    setOrden((prev) => {
      if (!prev || prev.campo !== campo) return { campo, dir: "desc" };
      if (prev.dir === "desc") return { campo, dir: "asc" };
      return null; // asc → vuelve al orden original
    });
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

  async function confirmarEliminar(e: Estante) {
    if (e.total_libros > 0) {
      toast.error(
        `El estante "${e.codigo}" tiene ${e.total_libros} libro(s) asignado(s). ` +
        "Reasignalos o dejalos 'Sin ubicar' antes de eliminarlo.",
      );
      return;
    }
    const ok = await confirmar({
      mensaje: (
        <>
          ¿Eliminar el estante <strong className="font-semibold text-stone-800">“{e.codigo}”</strong>?
        </>
      ),
    });
    if (ok) eliminar.mutate(e.id);
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900">Estantes</h1>
          <p className="text-sm text-stone-500">Secciones físicas del local (RF-02).</p>
        </div>
        <div className="flex items-center gap-2">
          {puedeEliminar && seleccion.size > 0 && (
            <Button variant="danger" onClick={confirmarEliminarLote} disabled={eliminarLote.isPending}>
              {eliminarLote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Eliminar seleccionados ({seleccion.size})
            </Button>
          )}
          <Button onClick={() => { setEdit(null); setModal(true); }}>
            <Plus className="h-4 w-4" /> Nuevo estante
          </Button>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {puedeEliminar && (
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
              <EncabezadoOrden campo="codigo">Código</EncabezadoOrden>
              <EncabezadoOrden campo="etiqueta">Etiqueta</EncabezadoOrden>
              <EncabezadoOrden campo="zona">Zona</EncabezadoOrden>
              <EncabezadoOrden campo="niveles" alinear="right">Niveles</EncabezadoOrden>
              <EncabezadoOrden campo="libros" alinear="right">Libros</EncabezadoOrden>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={puedeEliminar ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            )}
            {visibles.map((e) => (
              <tr key={e.id} className={cn("hover:bg-slate-50", seleccion.has(e.id) && "bg-unla/5")}>
                {puedeEliminar && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={seleccion.has(e.id)}
                      onChange={() => toggleSel(e.id)}
                      aria-label={`Seleccionar ${e.codigo}`}
                      className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className="rounded-full bg-unla/10 px-2 py-0.5 text-xs font-medium text-unla">{e.codigo}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{e.etiqueta ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{nombreZona(e.zona_id)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{e.niveles?.length ?? 0}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{e.total_libros}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => { setEdit(e); setModal(true); }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-unla"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => confirmarEliminar(e)}
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

      {!isLoading && (
        <TablePagination
          page={paginaActual}
          pages={totalPaginas}
          total={total}
          pageSize={pageSize}
          onPage={setPagina}
          onPageSize={(n) => { setPageSize(n); setPagina(1); }}
          unidad="estante"
        />
      )}

      {modal && (
        <EstanteFormModal
          onClose={() => setModal(false)}
          estante={edit}
          zonas={zonas}
          estantes={estantes ?? []}
        />
      )}
    </div>
  );
}
