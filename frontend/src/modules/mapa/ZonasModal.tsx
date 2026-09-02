import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import type { Zona } from "@/shared/types";
import { crearZona, actualizarZona, eliminarZona } from "@/modules/catalogo/api";

/** ABM de zonas/pisos del mapa (RF-11). */
export function ZonasModal({ zonas, onClose }: { zonas: Zona[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nuevo, setNuevo] = useState("");
  const invalidar = () => qc.invalidateQueries({ queryKey: ["zonas"] });
  const alertar = (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo completar la operación");

  const agregar = useMutation({
    mutationFn: (nombre: string) => crearZona({ nombre, orden: zonas.length }),
    onSuccess: () => { setNuevo(""); invalidar(); toast.success("Zona creada"); },
    onError: alertar,
  });

  return (
    <Modal abierto onClose={onClose} titulo="Zonas / pisos">
      <p className="mb-3 text-sm text-slate-500">
        Organizá el local en zonas (ej: Planta Baja, Piso 1). Cada estante pertenece a una zona.
      </p>

      <div className="space-y-2">
        {zonas.map((z) => (
          <ZonaRow key={z.id} zona={z} onError={alertar} onDone={invalidar} />
        ))}
      </div>

      <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Nueva zona (ej: Planta Alta)"
          onKeyDown={(e) => { if (e.key === "Enter" && nuevo.trim()) agregar.mutate(nuevo.trim()); }}
        />
        <Button onClick={() => nuevo.trim() && agregar.mutate(nuevo.trim())} disabled={agregar.isPending}>
          {agregar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar
        </Button>
      </div>
    </Modal>
  );
}

function ZonaRow({ zona, onError, onDone }: { zona: Zona; onError: (e: any) => void; onDone: () => void }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [nombre, setNombre] = useState(zona.nombre);
  const cambiado = nombre.trim() !== zona.nombre && nombre.trim().length > 0;

  const renombrar = useMutation({
    mutationFn: () => actualizarZona(zona.id, { nombre: nombre.trim() }),
    onSuccess: () => { onDone(); toast.success("Zona actualizada"); },
    onError,
  });
  const eliminar = useMutation({
    mutationFn: () => eliminarZona(zona.id),
    onSuccess: () => { onDone(); toast.success("Zona eliminada"); },
    onError, // RN: bloquea si tiene estantes
  });

  return (
    <div className="flex items-center gap-2">
      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <button
        onClick={() => cambiado && renombrar.mutate()}
        disabled={!cambiado || renombrar.isPending}
        title="Guardar nombre"
        className="rounded-lg p-2 text-slate-400 enabled:hover:bg-emerald-50 enabled:hover:text-emerald-600 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={async () => {
          const ok = await confirmar({
            mensaje: (
              <>
                ¿Eliminar la zona <strong className="font-semibold text-stone-800">“{zona.nombre}”</strong>?
              </>
            ),
          });
          if (ok) eliminar.mutate();
        }}
        disabled={eliminar.isPending}
        title="Eliminar zona"
        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
