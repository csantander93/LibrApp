import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { Modal } from "@/shared/components/ui/Modal";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import type { Estante, Zona } from "@/shared/types";
import {
  listarEstantes, listarZonas, crearEstante, actualizarEstante, eliminarEstante,
  type EstanteInput,
} from "./api";

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
              <th className="px-4 py-3 text-right font-medium">Libros</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">
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
        />
      )}
    </div>
  );
}

function EstanteFormModal({
  onClose, estante, zonas,
}: { onClose: () => void; estante: Estante | null; zonas: Zona[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<EstanteInput>({
    codigo: estante?.codigo ?? "",
    etiqueta: estante?.etiqueta ?? "",
    zona_id: estante?.zona_id ?? (zonas[0]?.id ?? null),
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: EstanteInput = {
        codigo: form.codigo.trim(),
        etiqueta: form.etiqueta?.trim() || null,
        zona_id: form.zona_id || null,
      };
      return estante ? actualizarEstante(estante.id, payload) : crearEstante(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success(estante ? "Estante actualizado" : "Estante creado");
      onClose();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo guardar el estante");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal abierto onClose={onClose} titulo={estante ? "Editar estante" : "Nuevo estante"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Código *</label>
          <Input
            value={form.codigo}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
            placeholder="E1, MESA-CENTRAL, ENTRADA…"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Etiqueta</label>
          <Input
            value={form.etiqueta ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, etiqueta: e.target.value }))}
            placeholder="Nombre descriptivo (opcional)"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Zona</label>
          <Select
            value={form.zona_id ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, zona_id: e.target.value || null }))}
          >
            <option value="">— Sin zona —</option>
            {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </Select>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
