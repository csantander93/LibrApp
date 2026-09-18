import { useState, type ReactNode } from "react";
import { Trash2, Loader2, AlertTriangle, ArrowRightLeft, PackageOpen } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Button } from "@/shared/components/ui/Button";
import { Select } from "@/shared/components/ui/Select";
import { cn } from "@/lib/utils";

export interface OpcionDestino {
  id: string;
  label: string;
}

interface Props {
  titulo: string;
  /** Advertencia que explica cuántos elementos hay y que no se pierde nada. */
  advertencia: ReactNode;
  /** Opción "dejar" (sin ubicar / sin nivel / sin zona). Es la opción segura por defecto. */
  dejar: { label: string; descripcion: string };
  /** Opción "mover a otro …": selector de destinos. */
  mover: {
    label: string;
    descripcion: string;
    placeholder: string;
    opciones: OpcionDestino[];
    /** Mensaje cuando no hay destinos posibles (ej: es la única zona). */
    sinOpciones?: string;
  };
  onClose: () => void;
  onConfirmar: (moverA: string | null) => void;
  pending?: boolean;
}

/**
 * Diálogo reutilizable para eliminar un contenedor (estante / nivel / zona) que
 * tiene contenido, sin perderlo: se elige moverlo a otro contenedor o dejarlo
 * "suelto" para reacomodarlo después (RN-08 y análogos).
 */
export function ReubicarEliminarModal({ titulo, advertencia, dejar, mover, onClose, onConfirmar, pending }: Props) {
  const [modo, setModo] = useState<"dejar" | "mover">("dejar");
  const [moverA, setMoverA] = useState("");

  const faltaDestino = modo === "mover" && !moverA;

  function confirmar() {
    if (pending || faltaDestino) return;
    onConfirmar(modo === "mover" ? moverA : null);
  }

  return (
    <Modal abierto onClose={onClose} titulo={titulo} ancho="max-w-md">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="pt-1 text-sm leading-relaxed text-stone-600">{advertencia}</div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {/* Opción segura: dejar suelto */}
        <button
          type="button"
          onClick={() => setModo("dejar")}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
            modo === "dejar"
              ? "border-unla bg-unla/5 ring-1 ring-unla/30"
              : "border-stone-200 hover:border-stone-300 hover:bg-stone-50",
          )}
        >
          <PackageOpen className={cn("mt-0.5 h-4 w-4 shrink-0", modo === "dejar" ? "text-unla" : "text-stone-400")} />
          <span>
            <span className="block text-sm font-medium text-stone-800">{dejar.label}</span>
            <span className="block text-xs text-stone-500">{dejar.descripcion}</span>
          </span>
        </button>

        {/* Opción: mover a otro contenedor */}
        <button
          type="button"
          onClick={() => setModo("mover")}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
            modo === "mover"
              ? "border-unla bg-unla/5 ring-1 ring-unla/30"
              : "border-stone-200 hover:border-stone-300 hover:bg-stone-50",
          )}
        >
          <ArrowRightLeft className={cn("mt-0.5 h-4 w-4 shrink-0", modo === "mover" ? "text-unla" : "text-stone-400")} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-stone-800">{mover.label}</span>
            <span className="block text-xs text-stone-500">{mover.descripcion}</span>
            {modo === "mover" && mover.opciones.length > 0 && (
              <Select
                value={moverA}
                onChange={(e) => setMoverA(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="mt-2 w-full text-sm"
              >
                <option value="">{mover.placeholder}</option>
                {mover.opciones.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
            )}
            {modo === "mover" && mover.opciones.length === 0 && (
              <span className="mt-1 block text-xs text-amber-600">
                {mover.sinOpciones ?? "No hay destinos disponibles."}
              </span>
            )}
          </span>
        </button>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
        <Button
          variant="danger"
          onClick={confirmar}
          disabled={pending || faltaDestino}
          className="border-red-600 bg-red-600 text-white shadow-sm shadow-red-600/30 hover:border-red-700 hover:bg-red-700 hover:text-white"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Eliminar
        </Button>
      </div>
    </Modal>
  );
}
