import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import type { Estante } from "@/shared/types";
import { listarEstantes, listarZonas, eliminarEstante } from "./api";
import { EstanteFormModal } from "./EstanteFormModal";

export function EstantesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: estantes, isLoading } = useQuery({ queryKey: ["estantes"], queryFn: listarEstantes });
  const { data: zonas = [] } = useQuery({ queryKey: ["zonas"], queryFn: listarZonas });

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Estante | null>(null);

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

  const nombreZona = (id: string | null) => zonas.find((z) => z.id === id)?.nombre ?? "—";

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
        <Button onClick={() => { setEdit(null); setModal(true); }}>
          <Plus className="h-4 w-4" /> Nuevo estante
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Etiqueta</th>
              <th className="px-4 py-3 font-medium">Zona</th>
              <th className="px-4 py-3 text-right font-medium">Niveles</th>
              <th className="px-4 py-3 text-right font-medium">Libros</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            )}
            {estantes?.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
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
