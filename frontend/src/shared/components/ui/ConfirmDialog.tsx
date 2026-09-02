import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

type ConfirmTono = "danger" | "default";

interface ConfirmOptions {
  titulo?: string;
  /** Cuerpo del diálogo. Acepta texto o JSX (ej: resaltar el nombre a eliminar). */
  mensaje: ReactNode;
  confirmar?: string;
  cancelar?: string;
  tono?: ConfirmTono;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Hook para pedir confirmación con un diálogo propio (reemplaza `window.confirm`).
 * Uso: `if (await confirmar({ mensaje: "¿Eliminar X?" })) mutar()`.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}

interface Estado extends ConfirmOptions {
  resolver: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado | null>(null);

  const confirmar = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setEstado({ ...opts, resolver: resolve });
    });
  }, []);

  const cerrar = useCallback(
    (ok: boolean) => {
      setEstado((actual) => {
        actual?.resolver(ok);
        return null;
      });
    },
    [],
  );

  const api = useRef(confirmar);
  api.current = confirmar;

  return (
    <ConfirmContext.Provider value={api.current}>
      {children}
      {estado && <ConfirmDialog estado={estado} onResolver={cerrar} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  estado,
  onResolver,
}: {
  estado: Estado;
  onResolver: (ok: boolean) => void;
}) {
  const {
    titulo = "Confirmar eliminación",
    mensaje,
    confirmar = "Eliminar",
    cancelar = "Cancelar",
    tono = "danger",
  } = estado;

  const esPeligro = tono === "danger";
  const btnConfirmarRef = useRef<HTMLButtonElement>(null);

  // Enter confirma, Escape cancela; foco inicial en el botón de acción.
  useEffect(() => {
    btnConfirmarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onResolver(false);
      if (e.key === "Enter") onResolver(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolver]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm"
      style={{ animation: "toast-in 0.16s ease-out" }}
      onClick={() => onResolver(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-stone-900/25"
        style={{ animation: "dialog-in 0.2s cubic-bezier(0.18, 1.15, 0.5, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4 p-6">
          <span
            style={{ animation: "toast-badge-pop 0.4s cubic-bezier(0.18, 1.25, 0.4, 1) both" }}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              esPeligro ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600",
            )}
          >
            {esPeligro ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div className="pt-0.5">
            <h2 className="font-serif text-lg font-semibold text-stone-900">{titulo}</h2>
            <div className="mt-1.5 text-sm leading-relaxed text-stone-600">{mensaje}</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-200 bg-papel/60 px-6 py-4">
          <Button variant="outline" onClick={() => onResolver(false)}>
            {cancelar}
          </Button>
          <Button
            ref={btnConfirmarRef}
            variant="danger"
            onClick={() => onResolver(true)}
            className={
              esPeligro
                ? "border-red-600 bg-red-600 text-white shadow-sm shadow-red-600/30 hover:border-red-700 hover:bg-red-700 hover:text-white"
                : undefined
            }
          >
            {confirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}
