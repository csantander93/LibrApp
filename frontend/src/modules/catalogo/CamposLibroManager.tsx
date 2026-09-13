import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2, Plus, X, GripVertical } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { CampoLibro, CampoLibroInput, TipoCampo } from "@/shared/types";
import { listarCampos, crearCampo, actualizarCampo, eliminarCampo } from "./api";

interface Props {
  abierto: boolean;
  onClose: () => void;
}

const TIPOS: { value: TipoCampo; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "select", label: "Selector (opciones)" },
  { value: "booleano", label: "Sí / No" },
  { value: "fecha", label: "Fecha" },
];

const TIPO_LABEL: Record<TipoCampo, string> = {
  texto: "Texto",
  numero: "Número",
  select: "Selector",
  booleano: "Sí / No",
  fecha: "Fecha",
};

interface FormState {
  etiqueta: string;
  tipo: TipoCampo;
  opcionesTexto: string; // una opción por línea (se parsea al guardar)
  requerido: boolean;
}

const FORM_VACIO: FormState = { etiqueta: "", tipo: "texto", opcionesTexto: "", requerido: false };

export function CamposLibroManager({ abierto, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();

  const { data: campos = [], isLoading } = useQuery({
    queryKey: ["campos-libro"],
    queryFn: listarCampos,
  });

  // null = alta; string = id del campo en edición.
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["campos-libro"] });
    qc.invalidateQueries({ queryKey: ["libros"] });
  };

  function resetForm() {
    setEditId(null);
    setForm(FORM_VACIO);
    setError(null);
  }

  function editar(campo: CampoLibro) {
    setEditId(campo.id);
    setForm({
      etiqueta: campo.etiqueta,
      tipo: campo.tipo,
      opcionesTexto: (campo.opciones ?? []).join("\n"),
      requerido: campo.requerido,
    });
    setError(null);
  }

  const guardar = useMutation({
    mutationFn: () => {
      const opciones =
        form.tipo === "select"
          ? form.opcionesTexto.split("\n").map((o) => o.trim()).filter(Boolean)
          : null;
      const payload: CampoLibroInput = {
        etiqueta: form.etiqueta.trim(),
        tipo: form.tipo,
        opciones,
        requerido: form.requerido,
      };
      return editId ? actualizarCampo(editId, payload) : crearCampo(payload);
    },
    onSuccess: () => {
      invalidar();
      toast.success(editId ? "Campo actualizado" : "Campo creado");
      resetForm();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo guardar el campo");
    },
  });

  const borrar = useMutation({
    mutationFn: eliminarCampo,
    onSuccess: () => {
      invalidar();
      toast.success("Campo eliminado");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el campo"),
  });

  const alternarActivo = useMutation({
    mutationFn: (campo: CampoLibro) => actualizarCampo(campo.id, { activo: !campo.activo }),
    onSuccess: () => invalidar(),
    onError: () => toast.error("No se pudo cambiar el estado del campo"),
  });

  async function confirmarBorrar(campo: CampoLibro) {
    const ok = await confirmar({
      mensaje: (
        <>
          ¿Eliminar el campo <strong className="font-semibold text-stone-800">“{campo.etiqueta}”</strong>?
          Los libros que ya tengan un valor cargado lo conservarán guardado, pero dejará de
          mostrarse. Esta acción no se puede deshacer.
        </>
      ),
    });
    if (ok) borrar.mutate(campo.id);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.etiqueta.trim()) {
      setError("La etiqueta es obligatoria");
      return;
    }
    if (form.tipo === "select" && form.opcionesTexto.split("\n").every((o) => !o.trim())) {
      setError("Un selector necesita al menos una opción");
      return;
    }
    guardar.mutate();
  }

  const set = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Campos personalizados" ancho="max-w-2xl">
      <p className="mb-4 text-sm text-stone-500">
        Definí campos extra para tus libros (texto, número, selector, sí/no o fecha). Aparecerán
        en el formulario al cargar o editar libros.
      </p>

      {/* Lista de campos existentes */}
      {isLoading ? (
        <div className="flex justify-center py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : campos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 py-8 text-center text-sm text-stone-400">
          Todavía no hay campos personalizados.
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
          {campos.map((campo) => (
            <li
              key={campo.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                editId === campo.id && "bg-unla/5",
                !campo.activo && "opacity-60",
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-stone-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800">
                  {campo.etiqueta}
                  {campo.requerido && <span className="ml-1 text-unla" title="Obligatorio">*</span>}
                </p>
                <p className="truncate text-xs text-stone-400">
                  {TIPO_LABEL[campo.tipo]}
                  {campo.tipo === "select" && campo.opciones?.length
                    ? ` · ${campo.opciones.join(", ")}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => alternarActivo.mutate(campo)}
                title={campo.activo ? "Activo (clic para ocultar)" : "Oculto (clic para activar)"}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                  campo.activo
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-stone-200 text-stone-500 hover:bg-stone-300",
                )}
              >
                {campo.activo ? "Activo" : "Oculto"}
              </button>
              <button
                type="button"
                onClick={() => editar(campo)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-unla"
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => confirmarBorrar(campo)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Formulario alta / edición */}
      <form onSubmit={onSubmit} className="mt-5 space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">
            {editId ? "Editar campo" : "Nuevo campo"}
          </h3>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-unla"
            >
              <X className="h-3.5 w-3.5" /> Cancelar edición
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre del campo *</label>
            <Input
              value={form.etiqueta}
              onChange={(e) => set("etiqueta", e.target.value)}
              placeholder="Ej: Año de edición"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
            <Select value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoCampo)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {form.tipo === "select" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Opciones (una por línea)</label>
            <textarea
              value={form.opcionesTexto}
              onChange={(e) => set("opcionesTexto", e.target.value)}
              rows={4}
              placeholder={"Nuevo\nUsado\nMuy bueno"}
              className={cn(
                "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900",
                "shadow-sm transition-colors focus:border-unla focus:outline-none focus:ring-2 focus:ring-unla/25",
              )}
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.requerido}
            onChange={(e) => set("requerido", e.target.checked)}
          />
          Obligatorio al cargar un libro
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editId ? "Guardar cambios" : "Agregar campo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
