import type { ReactNode } from "react";
import {
  Circle, Square, RectangleHorizontal, Armchair, Sofa, Table,
  Flower2, Sprout, Frame, Type, ArrowRight, ArrowLeftRight,
  DoorOpen, Rows3, CircleDot, Minus, PersonStanding,
  type LucideIcon,
} from "lucide-react";
import type { Anotacion, AnotacionTipo, TexturaPiso } from "@/shared/types";

/**
 * Catálogo de elementos que se pueden soltar sobre el plano (mobiliario, plantas,
 * señalética y estructura). Todos comparten geometría (pos/ancho/alto/rotación) y
 * color con las anotaciones; acá viven sus defaults, su ícono de paleta y su dibujo
 * SVG cenital. Dibujar en vector (no imágenes) los mantiene nítidos al redimensionar,
 * livianos y recoloreables — ver decisión en la conversación de diseño.
 */

const COLOR_DEFAULT = "#7A1C30";

interface ElementoDef {
  tipo: AnotacionTipo;
  label: string;
  Icon: LucideIcon;
  /** Defaults al crear: geometría en % del canvas y color sugerido. */
  ancho: number;
  alto: number;
  color: string;
}

interface GrupoElementos {
  grupo: string;
  items: ElementoDef[];
}

// Paleta agrupada del editor. El orden acá es el orden en que se muestran.
export const PALETA_ELEMENTOS: GrupoElementos[] = [
  {
    grupo: "Señalética",
    items: [
      { tipo: "texto", label: "Texto", Icon: Type, ancho: 18, alto: 6, color: COLOR_DEFAULT },
      { tipo: "flecha", label: "Flecha", Icon: ArrowRight, ancho: 14, alto: 6, color: COLOR_DEFAULT },
      { tipo: "flecha_doble", label: "Flecha doble", Icon: ArrowLeftRight, ancho: 16, alto: 6, color: COLOR_DEFAULT },
      { tipo: "ventana", label: "Ventana", Icon: Minus, ancho: 14, alto: 3, color: "#2E6B9E" },
      { tipo: "bano", label: "Baño", Icon: PersonStanding, ancho: 7, alto: 8, color: "#2E6B9E" },
    ],
  },
  {
    grupo: "Mobiliario",
    items: [
      { tipo: "mesa_redonda", label: "Mesa redonda", Icon: Circle, ancho: 12, alto: 12, color: "#8A5A2B" },
      { tipo: "mesa_cuadrada", label: "Mesa cuadrada", Icon: Square, ancho: 12, alto: 12, color: "#8A5A2B" },
      { tipo: "mesa_rect", label: "Mesa rectangular", Icon: RectangleHorizontal, ancho: 22, alto: 12, color: "#8A5A2B" },
      { tipo: "silla", label: "Silla", Icon: Armchair, ancho: 5, alto: 5, color: "#6B4A2B" },
      { tipo: "sillon", label: "Sillón", Icon: Sofa, ancho: 9, alto: 8, color: "#6B4A2B" },
      { tipo: "mostrador", label: "Mostrador", Icon: Table, ancho: 24, alto: 8, color: "#7A5230" },
    ],
  },
  {
    grupo: "Plantas y deco",
    items: [
      { tipo: "planta", label: "Planta", Icon: Flower2, ancho: 8, alto: 8, color: "#3F7A3F" },
      { tipo: "maceta", label: "Maceta", Icon: Sprout, ancho: 5, alto: 5, color: "#A15A2B" },
      { tipo: "alfombra", label: "Alfombra", Icon: Frame, ancho: 22, alto: 14, color: COLOR_DEFAULT },
    ],
  },
  {
    grupo: "Estructura",
    items: [
      { tipo: "escalera", label: "Escalera", Icon: Rows3, ancho: 12, alto: 16, color: "#64748B" },
      { tipo: "columna", label: "Columna", Icon: CircleDot, ancho: 5, alto: 5, color: "#64748B" },
      { tipo: "pared", label: "Pared", Icon: Minus, ancho: 22, alto: 3, color: "#57534E" },
      { tipo: "puerta", label: "Puerta", Icon: DoorOpen, ancho: 10, alto: 10, color: "#8A5A2B" },
    ],
  },
];

const POR_TIPO: Record<string, ElementoDef> = Object.fromEntries(
  PALETA_ELEMENTOS.flatMap((g) => g.items).map((it) => [it.tipo, it]),
);

/** Grilla de elementos agrupados para soltar en el mapa (usada en un popover). */
export function PaletaElementos({ onElegir }: { onElegir: (tipo: AnotacionTipo) => void }) {
  return (
    <div className="w-60 space-y-2">
      {PALETA_ELEMENTOS.map((g) => (
        <div key={g.grupo}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{g.grupo}</p>
          <div className="grid grid-cols-3 gap-1">
            {g.items.map(({ tipo, label, Icon }) => (
              <button
                key={tipo}
                type="button"
                onClick={() => onElegir(tipo)}
                title={label}
                className="flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-white px-1 py-1.5 text-[9px] font-medium text-stone-600 transition-colors hover:border-unla/40 hover:bg-unla/5 hover:text-unla"
              >
                <Icon className="h-4 w-4" />
                <span className="w-full truncate text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Defaults (geometría + color + texto inicial) para crear un elemento del tipo dado. */
export function defaultsElemento(tipo: AnotacionTipo) {
  const d = POR_TIPO[tipo] ?? POR_TIPO["texto"];
  return {
    ancho: d.ancho,
    alto: d.alto,
    color: d.color,
    texto: tipo === "texto" ? "NUEVO TEXTO" : null,
  };
}

/** Etiqueta legible del tipo (para el panel lateral). */
export function etiquetaTipo(tipo: AnotacionTipo): string {
  return POR_TIPO[tipo]?.label ?? "Elemento";
}

/** Ícono del tipo (para el panel lateral / chips). */
export function iconoTipo(tipo: AnotacionTipo): LucideIcon {
  return POR_TIPO[tipo]?.Icon ?? Type;
}

// ─── Texturas de piso (por zona) ──────────────────────────────────────────────

export const TEXTURAS_PISO: { id: TexturaPiso; label: string }[] = [
  { id: "grilla", label: "Grilla (por defecto)" },
  { id: "parquet", label: "Parquet" },
  { id: "madera", label: "Madera clara" },
  { id: "baldosa", label: "Baldosa" },
  { id: "cemento", label: "Cemento" },
];

/** Clase CSS del piso según la textura de la zona (ver index.css). */
export function claseTextura(textura: TexturaPiso | null | undefined): string {
  return textura && textura !== "grilla" ? `map-floor--${textura}` : "";
}

// ─── Dibujo (SVG cenital) ─────────────────────────────────────────────────────

/** SVG que llena su caja; el trazo mantiene ancho constante al redimensionar. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      {children}
    </svg>
  );
}

// Flechas: en CSS (flex) para que se adapten a cualquier proporción de caja.
function Flecha({ color, doble }: { color: string; doble?: boolean }) {
  const cabeza = (dir: "l" | "r") => (
    <div
      style={{
        width: 0, height: 0,
        borderTop: "9px solid transparent", borderBottom: "9px solid transparent",
        [dir === "r" ? "borderLeft" : "borderRight"]: `15px solid ${color}`,
      }}
    />
  );
  return (
    <div className="flex h-full w-full items-center" style={{ color }}>
      {doble && cabeza("l")}
      <div className="h-[4px] flex-1 rounded-full" style={{ background: color }} />
      {cabeza("r")}
    </div>
  );
}

function Texto({ color, texto }: { color: string; texto: string | null }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-md border-2 border-dashed bg-white/75 px-1 text-center font-sans text-[11px] font-bold uppercase leading-none tracking-wide backdrop-blur-[1px]"
      style={{ color, borderColor: `${color}66` }}
    >
      <span className="truncate">{texto || "Texto"}</span>
    </div>
  );
}

/** Dibuja el elemento correspondiente a la anotación, llenando su caja. */
export function renderElemento(a: Anotacion): ReactNode {
  const color = a.color ?? COLOR_DEFAULT;
  // Trazo/relleno base reutilizados por las formas de mobiliario.
  const linea = { stroke: color, strokeWidth: 2, fill: "none", vectorEffect: "non-scaling-stroke" as const };
  const relleno = { stroke: color, strokeWidth: 2, fill: color, fillOpacity: 0.16, vectorEffect: "non-scaling-stroke" as const };
  const solido = { stroke: color, strokeWidth: 2, fill: color, fillOpacity: 0.82, vectorEffect: "non-scaling-stroke" as const };

  switch (a.tipo) {
    case "texto":
      return <Texto color={color} texto={a.texto} />;
    case "flecha":
      return <Flecha color={color} />;
    case "flecha_doble":
      return <Flecha color={color} doble />;

    case "mesa_redonda":
      return <Svg><ellipse cx="50" cy="50" rx="46" ry="46" {...relleno} /></Svg>;
    case "mesa_cuadrada":
      return <Svg><rect x="5" y="5" width="90" height="90" rx="7" {...relleno} /></Svg>;
    case "mesa_rect":
      return <Svg><rect x="4" y="12" width="92" height="76" rx="7" {...relleno} /></Svg>;

    case "silla":
      return (
        <Svg>
          <rect x="16" y="30" width="68" height="62" rx="10" {...relleno} />
          <rect x="12" y="10" width="76" height="18" rx="8" {...solido} />
        </Svg>
      );
    case "sillon":
      return (
        <Svg>
          <rect x="6" y="20" width="88" height="74" rx="14" {...relleno} />
          <rect x="6" y="8" width="88" height="26" rx="12" {...solido} />
          <rect x="6" y="20" width="20" height="74" rx="10" {...solido} />
          <rect x="74" y="20" width="20" height="74" rx="10" {...solido} />
        </Svg>
      );
    case "mostrador":
      return (
        <Svg>
          <rect x="3" y="22" width="94" height="56" rx="6" {...relleno} />
          <rect x="12" y="34" width="76" height="32" rx="4" {...linea} />
        </Svg>
      );

    case "planta":
      return (
        <Svg>
          <circle cx="50" cy="50" r="46" {...relleno} />
          <circle cx="36" cy="40" r="16" {...linea} />
          <circle cx="62" cy="42" r="14" {...linea} />
          <circle cx="50" cy="64" r="15" {...linea} />
        </Svg>
      );
    case "maceta":
      return (
        <Svg>
          <rect x="18" y="18" width="64" height="64" rx="8" {...relleno} />
          <circle cx="50" cy="50" r="20" {...linea} />
        </Svg>
      );
    case "alfombra":
      return (
        <Svg>
          <rect x="4" y="6" width="92" height="88" rx="6" {...relleno} />
          <rect x="14" y="16" width="72" height="68" rx="4" {...linea} strokeDasharray="6 5" />
        </Svg>
      );

    case "escalera":
      return (
        <Svg>
          <rect x="6" y="6" width="88" height="88" rx="4" {...relleno} />
          {[22, 38, 54, 70, 86].map((y) => (
            <line key={y} x1="6" y1={y} x2="94" y2={y} {...linea} />
          ))}
        </Svg>
      );
    case "columna":
      return <Svg><circle cx="50" cy="50" r="34" {...solido} /></Svg>;
    case "pared":
      return <Svg><rect x="2" y="30" width="96" height="40" {...solido} /></Svg>;
    case "puerta":
      return (
        <Svg>
          <path d="M12 92 L12 12 A80 80 0 0 1 92 92" {...linea} />
          <line x1="12" y1="12" x2="12" y2="92" {...solido} strokeWidth={4} />
        </Svg>
      );

    case "ventana":
      return (
        <Svg>
          <rect x="2" y="24" width="96" height="52" {...relleno} />
          <line x1="2" y1="50" x2="98" y2="50" {...linea} />
        </Svg>
      );
    case "bano":
      return (
        <Svg>
          <rect x="8" y="8" width="84" height="84" rx="12" {...relleno} />
          <circle cx="50" cy="34" r="11" {...solido} />
          <path d="M38 84 L44 54 L56 54 L62 84" {...solido} />
        </Svg>
      );

    default:
      return <Texto color={color} texto={a.texto} />;
  }
}
