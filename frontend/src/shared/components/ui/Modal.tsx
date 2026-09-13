import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  abierto: boolean;
  onClose: () => void;
  titulo: string;
  children: ReactNode;
  ancho?: string;
}

export function Modal({ abierto, onClose, titulo, children, ancho = "max-w-lg" }: ModalProps) {
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${ancho} flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-stone-900/20`}
        onClick={(e) => e.stopPropagation()}
      >
        {titulo && (
          // Encabezado fijo: la X de cierre queda siempre visible aunque el cuerpo scrollee.
          <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-papel/60 px-6 py-4">
            <h2 className="font-serif text-lg font-semibold text-stone-900">{titulo}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-unla"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {/* Cuerpo con scroll propio: en formularios largos (nuevo libro, campos
            personalizados) los botones de abajo quedan accesibles sin cortarse. */}
        <div className="min-h-0 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
