import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import type { Coleccion } from "@/shared/types";
import { crearColeccion, actualizarColeccion } from "./api";

interface Props {
  onClose: () => void;
  /** null = alta. */
  categoria: Coleccion | null;
}

export function CategoriaFormModal({ onClose, categoria }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const esAlta = !categoria;

  const [nombre, setNombre] = useState(categoria?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(categoria?.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const desc = descripcion.trim() || null;
      if (esAlta) return crearColeccion(nombre.trim(), desc);
      return actualizarColeccion(categoria!.id, { nombre: nombre.trim(), descripcion: desc });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["colecciones"] });
      qc.invalidateQueries({ queryKey: ["libros"] });
      toast.success(esAlta ? "Categoría creada" : "Categoría actualizada");
      onClose();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo guardar la categoría");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) { setError("El nombre es obligatorio"); return; }
    mutation.mutate();
  }

  return (
    <Modal abierto onClose={onClose} titulo={esAlta ? "Nueva categoría" : "Editar categoría"} ancho="max-w-md">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nombre *</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Política, Novela, Terror…"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Opcional"
          />
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
