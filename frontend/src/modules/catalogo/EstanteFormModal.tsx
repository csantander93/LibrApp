import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { ColorPicker } from "@/shared/components/ui/ColorPicker";
import type { Estante, Zona } from "@/shared/types";
import { crearEstante, actualizarEstante, type EstanteInput } from "./api";

/** Próximo código secuencial libre con formato E{n} (E1, E2, E3…). */
export function siguienteCodigoEstante(estantes: Estante[]): string {
  let max = 0;
  for (const e of estantes) {
    const m = /^E(\d+)$/i.exec(e.codigo.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `E${max + 1}`;
}

interface Props {
  onClose: () => void;
  /** null = alta. */
  estante: Estante | null;
  zonas: Zona[];
  /** Listado para sugerir el próximo código en alta. */
  estantes?: Estante[];
  /** Zona preseleccionada en alta (ej: la zona activa del editor de mapa). */
  zonaIdDefault?: string | null;
  /** Callback tras crear, para alta optimista (editor de mapa). */
  onCreado?: (nuevo: Estante) => void;
}

export function EstanteFormModal({
  onClose, estante, zonas, estantes = [], zonaIdDefault, onCreado,
}: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const esAlta = !estante;

  const [codigo, setCodigo] = useState(
    estante?.codigo ?? siguienteCodigoEstante(estantes),
  );
  const [etiqueta, setEtiqueta] = useState(estante?.etiqueta ?? "");
  const [zonaId, setZonaId] = useState<string | null>(
    estante?.zona_id ?? zonaIdDefault ?? (zonas[0]?.id ?? null),
  );
  const [color, setColor] = useState<string | null>(estante?.color ?? null);
  const [niveles, setNiveles] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const base: EstanteInput = {
        codigo: codigo.trim().toUpperCase(),
        etiqueta: etiqueta.trim() || null,
        zona_id: zonaId || null,
        color,
      };
      if (esAlta) {
        return crearEstante({ ...base, cantidad_niveles: niveles });
      }
      return actualizarEstante(estante!.id, base);
    },
    onSuccess: (guardado) => {
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success(esAlta ? "Estante creado" : "Estante actualizado");
      if (esAlta) onCreado?.(guardado);
      onClose();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo guardar el estante");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal abierto onClose={onClose} titulo={esAlta ? "Nuevo estante" : "Editar estante"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Código *</label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="E1, MESA-CENTRAL…"
              required
              autoFocus
            />
            {esAlta && (
              <p className="mt-1 text-[11px] text-slate-400">Sugerido automáticamente; podés cambiarlo.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Zona</label>
            <Select value={zonaId ?? ""} onChange={(e) => setZonaId(e.target.value || null)}>
              <option value="">— Sin zona —</option>
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Etiqueta (categoría)</label>
          <Input
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="Ej: Humanidades, Novedades… (opcional)"
          />
        </div>

        {esAlta && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad de niveles</label>
            <Input
              type="number"
              min={1}
              max={20}
              value={niveles}
              onChange={(e) => setNiveles(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              "Pisos" del estante (1 = abajo). Podés agregar o quitar más adelante.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Color en el mapa</label>
          <ColorPicker value={color} onChange={setColor} />
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
