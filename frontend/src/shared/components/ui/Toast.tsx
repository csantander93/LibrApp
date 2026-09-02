import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTipo = "success" | "error";

interface Toast {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
}

interface ToastAPI {
  success: (mensaje: string) => void;
  error: (mensaje: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

/** Hook para disparar notificaciones desde cualquier componente. */
export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

const DURACION_MS = 3600; // tiempo visible antes de auto-cerrar
const SALIDA_MS = 320; // duración de la animación de salida

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const quitar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tipo: ToastTipo, mensaje: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, tipo, mensaje }]);
  }, []);

  const api = useRef<ToastAPI>({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
  });
  api.current.success = (m) => push("success", m);
  api.current.error = (m) => push("error", m);

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {/* Pila de notificaciones — arriba a la derecha, por encima de modales. */}
      <div className="pointer-events-none fixed top-4 right-4 z-[60] flex w-full max-w-xs flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => quitar(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const esExito = toast.tipo === "success";
  const [saliendo, setSaliendo] = useState(false);

  // Cierra con animación: primero reproduce la salida, luego se quita del árbol.
  const cerrar = useCallback(() => setSaliendo(true), []);

  // Auto-cierre tras la duración; se cancela si el usuario cierra antes.
  useEffect(() => {
    const t = window.setTimeout(cerrar, DURACION_MS);
    return () => window.clearTimeout(t);
  }, [cerrar]);

  // Una vez que arranca la salida, esperamos a que termine para desmontar.
  useEffect(() => {
    if (!saliendo) return;
    const t = window.setTimeout(onDismiss, SALIDA_MS);
    return () => window.clearTimeout(t);
  }, [saliendo, onDismiss]);

  return (
    <div
      role="status"
      style={{
        animation: saliendo
          ? `toast-out ${SALIDA_MS}ms ease-in forwards`
          : "toast-in 0.24s cubic-bezier(0.21, 1.02, 0.73, 1)",
      }}
      className={cn(
        "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border bg-white/95 px-4 py-3",
        "shadow-lg shadow-stone-900/10 backdrop-blur-sm",
        esExito ? "border-emerald-200" : "border-red-200",
      )}
    >
      <span
        style={{ animation: "toast-badge-pop 0.4s cubic-bezier(0.18, 1.25, 0.4, 1) both" }}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          esExito ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600",
        )}
      >
        {esExito ? <CheckAnimado /> : <AlertTriangle className="h-4 w-4" />}
      </span>

      <p className="flex-1 pt-0.5 text-sm font-medium text-stone-700">{toast.mensaje}</p>

      <button
        onClick={cerrar}
        className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Barra de "recarga": se vacía a medida que corre el tiempo. */}
      {!saliendo && (
        <span
          style={{ animation: `toast-progress ${DURACION_MS}ms linear forwards` }}
          className={cn(
            "absolute bottom-0 left-0 h-0.5 w-full origin-left",
            esExito ? "bg-emerald-500/60" : "bg-red-500/60",
          )}
        />
      )}
    </div>
  );
}

/** Check dibujado con un trazo que se va completando. */
function CheckAnimado() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M4.5 12.5l5 5 10-11"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 30,
          strokeDashoffset: 30,
          animation: "toast-check-draw 0.4s ease-out 0.15s forwards",
        }}
      />
    </svg>
  );
}
