import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import type { Zona, Estante, TexturaPiso } from "@/shared/types";
import { crearZona, actualizarZona, eliminarZona } from "@/modules/catalogo/api";
import { TEXTURAS_PISO } from "./elementos";
import { ReubicarEliminarModal } from "./ReubicarEliminarModal";

/** ABM de zonas/pisos del mapa (RF-11). */
export function ZonasModal({ zonas, estantes, onClose }: { zonas: Zona[]; estantes: Estante[]; onClose: () => void }) {
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
          <ZonaRow
            key={z.id}
            zona={z}
            otrasZonas={zonas.filter((o) => o.id !== z.id)}
            cantidadEstantes={estantes.filter((e) => e.zona_id === z.id).length}
            onError={alertar}
            onDone={invalidar}
          />
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

function ZonaRow({
  zona, otrasZonas, cantidadEstantes, onError, onDone,
}: {
  zona: Zona;
  otrasZonas: Zona[];
  cantidadEstantes: number;
  onError: (e: any) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const confirmar = useConfirm();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(zona.nombre);
  const [borrarModal, setBorrarModal] = useState(false);
  const cambiado = nombre.trim() !== zona.nombre && nombre.trim().length > 0;

  const renombrar = useMutation({
    mutationFn: () => actualizarZona(zona.id, { nombre: nombre.trim() }),
    onSuccess: () => { onDone(); toast.success("Zona actualizada"); },
    onError,
  });
  const cambiarTextura = useMutation({
    mutationFn: (textura: TexturaPiso) => actualizarZona(zona.id, { textura }),
    onSuccess: () => { onDone(); toast.success("Piso actualizado"); },
    onError,
  });
  const eliminar = useMutation({
    mutationFn: (moverA: string | null) => eliminarZona(zona.id, moverA),
    onSuccess: () => {
      setBorrarModal(false);
      onDone();
      // Los estantes movidos/desvinculados cambian su zona → refrescar catálogo.
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success("Zona eliminada");
    },
    onError,
  });

  async function pedirEliminar() {
    // Con estantes: modal con opciones (mover a otra zona o dejar sin zona).
    if (cantidadEstantes > 0) { setBorrarModal(true); return; }
    const ok = await confirmar({
      mensaje: (
        <>
          ¿Eliminar la zona <strong className="font-semibold text-stone-800">“{zona.nombre}”</strong>?
        </>
      ),
    });
    if (ok) eliminar.mutate(null);
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-2">
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
          onClick={pedirEliminar}
          disabled={eliminar.isPending}
          title="Eliminar zona"
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {borrarModal && (
        <ReubicarEliminarModal
          titulo={`Eliminar zona “${zona.nombre}”`}
          advertencia={
            <>
              Esta zona tiene <strong className="font-semibold text-stone-800">{cantidadEstantes} estante(s)</strong>.
              Al eliminarla no se borra ningún estante (ni sus libros): elegí qué hacer con ellos.
            </>
          }
          dejar={{
            label: "Dejar los estantes sin zona",
            descripcion: "Quedan sin zona; los reasignás después desde el ABM de estantes.",
          }}
          mover={{
            label: "Mover los estantes a otra zona",
            descripcion: "Se reasignan a la zona que elijas.",
            placeholder: "Elegí una zona…",
            opciones: otrasZonas.map((z) => ({ id: z.id, label: z.nombre })),
            sinOpciones: "No hay otra zona a la que mover los estantes.",
          }}
          onClose={() => setBorrarModal(false)}
          onConfirmar={(moverA) => eliminar.mutate(moverA)}
          pending={eliminar.isPending}
        />
      )}
      <div className="mt-1.5 flex items-center gap-2 pl-1">
        <span className="text-[11px] font-medium text-slate-400">Piso del mapa</span>
        <Select
          value={zona.textura ?? "grilla"}
          onChange={(e) => cambiarTextura.mutate(e.target.value as TexturaPiso)}
          disabled={cambiarTextura.isPending}
          className="w-44 py-1 text-xs"
        >
          {TEXTURAS_PISO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
    </div>
  );
}
