import { cn, COLORES_ESTANTE } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (c: string | null) => void;
  /** Muestra el botón "Aa" (color automático / derivado de la zona). */
  allowAuto?: boolean;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * Selector de color reutilizable: swatches recomendados para elegir rápido +
 * el selector nativo del navegador (rueda de color) para un color personalizado.
 */
export function ColorPicker({ value, onChange, allowAuto = true }: Props) {
  const paleta = COLORES_ESTANTE.map((c) => c.toLowerCase());
  const esPersonalizado = !!value && !paleta.includes(value.toLowerCase());
  // El <input type="color"> requiere un hex válido; si no, arranca en el bordó UNLa.
  const valorInput = value && HEX_RE.test(value) ? value : "#7a1c30";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORES_ESTANTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={cn(
            "h-6 w-6 rounded-full border transition-transform hover:scale-110",
            value?.toLowerCase() === c.toLowerCase() ? "border-stone-900 ring-2 ring-ambar" : "border-black/10",
          )}
          style={{ background: c }}
        />
      ))}

      {allowAuto && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Automático (color de zona)"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border bg-white text-[9px] font-bold text-stone-500 transition-transform hover:scale-110",
            value === null ? "border-stone-900 ring-2 ring-ambar" : "border-stone-300",
          )}
        >
          Aa
        </button>
      )}

      {/* Color personalizado: abre la rueda de color del navegador. */}
      <label
        title="Color personalizado"
        className={cn(
          "relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-transform hover:scale-110",
          esPersonalizado ? "border-stone-900 ring-2 ring-ambar" : "border-stone-300",
        )}
        style={esPersonalizado ? { background: value! } : undefined}
      >
        {!esPersonalizado && (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ background: "conic-gradient(red, orange, yellow, lime, aqua, blue, magenta, red)" }}
          />
        )}
        <input
          type="color"
          value={valorInput}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
