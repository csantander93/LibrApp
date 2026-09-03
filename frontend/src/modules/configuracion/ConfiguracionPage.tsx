import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { useToast } from "@/shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { Configuracion } from "@/shared/types";
import { obtenerConfiguracion, actualizarConfiguracion } from "./api";

export function ConfiguracionPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["configuracion"],
    queryFn: obtenerConfiguracion,
  });

  const mutation = useMutation({
    mutationFn: (cambios: Partial<Configuracion>) => actualizarConfiguracion(cambios),
    onSuccess: (nueva) => {
      qc.setQueryData(["configuracion"], nueva);
      toast.success("Configuración guardada");
    },
    onError: () => toast.error("No se pudo guardar la configuración"),
  });

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-900">Configuración</h1>
        <p className="text-sm text-stone-500">Ajustes generales de la aplicación.</p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando configuración…
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar la configuración.
        </p>
      )}

      {data && (
        <Card className="p-0">
          <SettingRow
            titulo="ISBN obligatorio al cargar libros"
            descripcion="Exige el ISBN al crear o editar un libro. Con esta opción activada, el campo ISBN aparece marcado con un asterisco (*) y no se puede guardar vacío."
            checked={data.isbn_obligatorio}
            disabled={mutation.isPending}
            onChange={(v) => mutation.mutate({ isbn_obligatorio: v })}
          />
        </Card>
      )}
    </div>
  );
}

function SettingRow({
  titulo,
  descripcion,
  checked,
  disabled,
  onChange,
}: {
  titulo: string;
  descripcion: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-semibold text-stone-800">{titulo}</p>
        <p className="mt-1 text-sm text-stone-500">{descripcion}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-unla/40 disabled:opacity-50",
        checked ? "bg-unla" : "bg-stone-300",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
