import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import type { Libro, Coleccion, Estante, LibroInput } from "@/shared/types";
import { crearLibro, actualizarLibro } from "./api";

interface Props {
  abierto: boolean;
  onClose: () => void;
  libro: Libro | null; // null = alta
  colecciones: Coleccion[];
  estantes: Estante[];
}

function estadoInicial(libro: Libro | null): LibroInput {
  return {
    titulo: libro?.titulo ?? "",
    autor: libro?.autor ?? "",
    editorial: libro?.editorial ?? "",
    isbn: libro?.isbn ?? "",
    precio: libro?.precio ?? "",
    coleccion_id: libro?.coleccion_id ?? "",
    estante_id: libro?.estante_id ?? "",
  };
}

export function LibroFormModal({ abierto, onClose, libro, colecciones, estantes }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<LibroInput>(estadoInicial(libro));
  const [error, setError] = useState<string | null>(null);

  // Reinicia el form cuando cambia el libro objetivo (abrir alta vs edición).
  const [libroId, setLibroId] = useState<string | null>(libro?.id ?? null);
  if ((libro?.id ?? null) !== libroId) {
    setLibroId(libro?.id ?? null);
    setForm(estadoInicial(libro));
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: LibroInput = {
        ...form,
        isbn: form.isbn?.trim() || null,
        precio: form.precio?.toString().trim() || null,
        coleccion_id: form.coleccion_id || null,
        estante_id: form.estante_id || null,
      };
      return libro ? actualizarLibro(libro.id, payload) : crearLibro(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success(libro ? "Libro actualizado" : "Libro creado");
      onClose();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo guardar el libro");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const set = (campo: keyof LibroInput) => (v: string) => setForm((f) => ({ ...f, [campo]: v }));

  return (
    <Modal abierto={abierto} onClose={onClose} titulo={libro ? "Editar libro" : "Nuevo libro"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Campo label="Título *">
          <Input value={form.titulo} onChange={(e) => set("titulo")(e.target.value)} required autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Autor *">
            <Input value={form.autor} onChange={(e) => set("autor")(e.target.value)} required />
          </Campo>
          <Campo label="Editorial *">
            <Input value={form.editorial} onChange={(e) => set("editorial")(e.target.value)} required />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="ISBN">
            <Input value={form.isbn ?? ""} onChange={(e) => set("isbn")(e.target.value)} placeholder="Opcional" />
          </Campo>
          <Campo label="Precio">
            <Input
              type="number"
              step="0.01"
              value={form.precio ?? ""}
              onChange={(e) => set("precio")(e.target.value)}
              placeholder="Opcional"
            />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Colección">
            <Select value={form.coleccion_id ?? ""} onChange={(e) => set("coleccion_id")(e.target.value)}>
              <option value="">— Sin colección —</option>
              {colecciones.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Select>
          </Campo>
          <Campo label="Ubicación (estante)">
            <Select value={form.estante_id ?? ""} onChange={(e) => set("estante_id")(e.target.value)}>
              <option value="">— Sin ubicar —</option>
              {estantes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo}{e.etiqueta ? ` · ${e.etiqueta}` : ""}
                </option>
              ))}
            </Select>
          </Campo>
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
