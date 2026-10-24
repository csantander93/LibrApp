import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Tags } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { Coleccion } from "@/shared/types";
import { listarColecciones, eliminarColeccion } from "./api";
import { CategoriaFormModal } from "./CategoriaFormModal";
import { ReubicarEliminarModal } from "@/modules/mapa/ReubicarEliminarModal";
import { TablePagination, PAGE_SIZE_DEFAULT } from "@/shared/components/ui/TablePagination";

type CampoOrden = "nombre" | "descripcion" | "libros";
type Orden = { campo: CampoOrden; dir: "asc" | "desc" };

export function CategoriasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: categorias, isLoading } = useQuery({ queryKey: ["colecciones"], queryFn: listarColecciones });

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Coleccion | null>(null);
  const [borrar, setBorrar] = useState<Coleccion | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["colecciones"] });
    qc.invalidateQueries({ queryKey: ["libros"] });
    qc.invalidateQueries({ queryKey: ["estantes"] });
  };

  const eliminar = useMutation({
    mutationFn: ({ id, moverA }: { id: string; moverA: string | null }) => eliminarColeccion(id, moverA),
    onSuccess: () => {
      invalidar();
      setBorrar(null);
      toast.success("Categoría eliminada");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo eliminar la categoría"),
  });

  async function pedirEliminar(c: Coleccion) {
    // Sin libros: confirmación simple. Con libros: modal de reasignación.
    if (c.total_libros === 0) {
      const ok = await confirmar({
        mensaje: (
          <>¿Eliminar la categoría <strong className="font-semibold text-stone-800">“{c.nombre}”</strong>?</>
        ),
      });
      if (ok) eliminar.mutate({ id: c.id, moverA: null });
      return;
    }
    setBorrar(c);
  }

  const categoriasOrdenadas = useMemo(() => {
    const base = categorias ?? [];
    if (!orden) return base;
    const { campo, dir } = orden;
    const factor = dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (campo === "libros") return (a.total_libros - b.total_libros) * factor;
      const va = (campo === "descripcion" ? a.descripcion : a.nombre) ?? "";
      const vb = (campo === "descripcion" ? b.descripcion : b.nombre) ?? "";
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return va.localeCompare(vb, "es", { sensitivity: "base" }) * factor;
    });
  }, [categorias, orden]);

  const total = categoriasOrdenadas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => categoriasOrdenadas.slice((paginaActual - 1) * pageSize, paginaActual * pageSize),
    [categoriasOrdenadas, paginaActual, pageSize],
  );

  function ordenarPor(campo: CampoOrden) {
    setOrden((prev) => {
      if (!prev || prev.campo !== campo) return { campo, dir: "desc" };
      if (prev.dir === "desc") return { campo, dir: "asc" };
      return null;
    });
  }

  function EncabezadoOrden({ campo, children, alinear = "left" }: {
    campo: CampoOrden; children: React.ReactNode; alinear?: "left" | "right";
  }) {
    const activo = orden?.campo === campo;
    const Icono = !activo ? ArrowUpDown : orden!.dir === "desc" ? ArrowDown : ArrowUp;
    return (
      <th className={cn("px-4 py-3 font-medium", alinear === "right" && "text-right")}>
        <button
          type="button"
          onClick={() => ordenarPor(campo)}
          className={cn("inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-700", activo && "text-unla")}
        >
          {children}
          <Icono className={cn("h-3.5 w-3.5", !activo && "text-slate-300")} />
        </button>
      </th>
    );
  }

  const otras = (categorias ?? []).filter((c) => c.id !== borrar?.id);

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900">Categorías</h1>
          <p className="text-sm text-stone-500">Categorías de los libros (RN-10). Se usan para filtrar y para ubicar por estante.</p>
        </div>
        <Button onClick={() => { setEdit(null); setModal(true); }}>
          <Plus className="h-4 w-4" /> Nueva categoría
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <EncabezadoOrden campo="nombre">Nombre</EncabezadoOrden>
              <EncabezadoOrden campo="descripcion">Descripción</EncabezadoOrden>
              <EncabezadoOrden campo="libros" alinear="right">Libros</EncabezadoOrden>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            )}
            {!isLoading && visibles.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                <Tags className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                Todavía no hay categorías. Creá la primera.
              </td></tr>
            )}
            {visibles.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="rounded-full bg-unla/10 px-2 py-0.5 text-xs font-medium text-unla">{c.nombre}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.descripcion ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.total_libros}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => { setEdit(c); setModal(true); }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-unla"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => pedirEliminar(c)}
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
          unidad="categoría"
        />
      )}

      {modal && (
        <CategoriaFormModal onClose={() => setModal(false)} categoria={edit} />
      )}

      {borrar && (
        <ReubicarEliminarModal
          titulo={`Eliminar categoría "${borrar.nombre}"`}
          advertencia={
            <>
              Esta categoría tiene <strong className="font-semibold text-stone-800">{borrar.total_libros} libro(s)</strong>.
              Al eliminarla no se borra ningún libro: elegí qué hacer con ellos.
            </>
          }
          dejar={{
            label: "Dejar los libros sin categoría",
            descripcion: "Quedan sin categoría; los reasignás después desde el catálogo.",
          }}
          mover={{
            label: "Mover los libros a otra categoría",
            descripcion: "Se reasignan a la categoría que elijas.",
            placeholder: "Elegí una categoría…",
            opciones: otras.map((c) => ({ id: c.id, label: c.nombre })),
            sinOpciones: "No hay otra categoría a la que mover los libros.",
          }}
          onClose={() => setBorrar(null)}
          onConfirmar={(moverA) => eliminar.mutate({ id: borrar.id, moverA })}
          pending={eliminar.isPending}
        />
      )}
    </div>
  );
}
