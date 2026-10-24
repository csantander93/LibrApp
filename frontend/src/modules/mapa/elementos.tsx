import { memo, type ReactNode } from "react";
import {
  Circle, Square, RectangleHorizontal, Armchair, Sofa, Table,
  Flower2, Sprout, Frame, Type, ArrowRight, ArrowLeftRight,
  DoorOpen, Rows3, CircleDot, Minus, PersonStanding,
  type LucideIcon,
} from "lucide-react";
import type { Anotacion, AnotacionTipo, TexturaPiso } from "@/shared/types";
import { SvgPlano, Sombra, aclarar, oscurecerHex } from "./SvgPlano";

/**
 * Catálogo de elementos que se pueden soltar sobre el plano (mobiliario, plantas,
 * señalética y estructura) + el dibujo de los estantes.
 *
 * Todo se dibuja en SVG nativo, en vista cenital (plano de arquitectura 2D), y llena
 * la caja que le da `MapaCanvas` (que es quien posiciona, redimensiona, gira y arrastra).
 * Los filtros/patrones compartidos (`shelf-shadow`, `plano-madera`…) viven en `PlanoDefs`,
 * montado una vez en el canvas.
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
      { tipo: "ventana", label: "Ventana", Icon: Minus, ancho: 14, alto: 3, color: "#6FA8C9" },
      { tipo: "bano", label: "Baño", Icon: PersonStanding, ancho: 5, alto: 7, color: "#2E6B9E" },
    ],
  },
  {
    grupo: "Mobiliario",
    items: [
      { tipo: "mesa_redonda", label: "Mesa redonda (con sillas)", Icon: Circle, ancho: 12, alto: 14, color: "#B98750" },
      { tipo: "mesa_cuadrada", label: "Mesa cuadrada (con sillas)", Icon: Square, ancho: 12, alto: 14, color: "#B98750" },
      { tipo: "mesa_rect", label: "Mesa rectangular", Icon: RectangleHorizontal, ancho: 22, alto: 12, color: "#B98750" },
      { tipo: "silla", label: "Silla", Icon: Armchair, ancho: 4, alto: 5, color: "#A8774A" },
      { tipo: "sillon", label: "Sillón", Icon: Sofa, ancho: 6, alto: 8, color: "#5F5B57" },
      { tipo: "mostrador", label: "Mostrador", Icon: Table, ancho: 24, alto: 8, color: "#B38250" },
    ],
  },
  {
    grupo: "Plantas y deco",
    items: [
      { tipo: "planta", label: "Planta", Icon: Flower2, ancho: 6, alto: 8, color: "#4F9443" },
      { tipo: "maceta", label: "Maceta / jardinera", Icon: Sprout, ancho: 5, alto: 7, color: "#B0683A" },
      { tipo: "alfombra", label: "Alfombra", Icon: Frame, ancho: 22, alto: 14, color: "#8A4B42" },
    ],
  },
  {
    grupo: "Estructura",
    items: [
      { tipo: "escalera", label: "Escalera", Icon: Rows3, ancho: 8, alto: 16, color: "#8E8A83" },
      { tipo: "columna", label: "Columna", Icon: CircleDot, ancho: 4, alto: 6, color: "#A39D93" },
      { tipo: "pared", label: "Pared", Icon: Minus, ancho: 22, alto: 3, color: "#6F6A63" },
      { tipo: "puerta", label: "Puerta", Icon: DoorOpen, ancho: 8, alto: 12, color: "#B38250" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// Dibujo (SVG cenital nativo)
// ═══════════════════════════════════════════════════════════════════════════════

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Dibuja en coordenadas (largo × fondo) y gira 90° si la caja es más alta que ancha. */
function Orientado({ w, h, children }: { w: number; h: number; children: (L: number, S: number) => ReactNode }) {
  const vertical = h > w;
  return (
    <g transform={vertical ? `translate(${w} 0) rotate(90)` : undefined}>
      {children(vertical ? h : w, vertical ? w : h)}
    </g>
  );
}

// ─── Estantes ─────────────────────────────────────────────────────────────────

/** Color por categoría (nombres del prototipo). Se usa si el estante no trae color propio. */
export const COLOR_CATEGORIA: Record<string, string> = {
  literatura: "#3B6FD8",
  historia: "#2F9E44",
  infantil: "#F08C00",
  ciencias: "#7048E8",
  filosofia: "#D6336C",
};

export function colorDeCategoria(categoria?: string | null): string | null {
  if (!categoria) return null;
  const k = categoria.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return COLOR_CATEGORIA[k] ?? null;
}

/** Badge con el código del estante. Se contra-gira para que el texto quede siempre derecho. */
function ChipCodigo({ x, y, texto, rot }: { x: number; y: number; texto: string; rot: number }) {
  const t = texto.toUpperCase();
  const cw = Math.max(30, t.length * 7.2 + 14);
  const ch = 15;
  return (
    <g transform={`translate(${x} ${y}) rotate(${-rot})`}>
      <rect x={-cw / 2 + 0.6} y={-ch / 2 + 1.6} width={cw} height={ch} rx={5} fill="#000" opacity={0.3} filter="url(#soft-shadow)" />
      <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={5} fill="#1f2937" fillOpacity={0.94} stroke="#fff" strokeWidth={1.2} />
      <text
        y={0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={10}
        fontWeight={700}
        letterSpacing={0.5}
        fill="#fff"
      >
        {t}
      </text>
    </g>
  );
}

export interface EstanteElementProps {
  /** Código visible en el badge (p. ej. "E-03"). */
  codigo: string;
  /** Color propio del estante (hex). Tiene prioridad sobre `categoria`. */
  color?: string | null;
  /** Categoría/zona ("Literatura", "Historia"…): define el color si no hay `color`. */
  categoria?: string | null;
  /** Giro CSS (grados) que aplica el contenedor; sirve para mantener la sombra y el badge derechos. */
  rotacion?: number;
  seleccionado?: boolean;
  resaltado?: boolean;
}

/**
 * Estante visto desde arriba: marco con esquinas redondeadas, sombra proyectada,
 * dos filas de libros con lomos, divisiones por módulo y badge con el código.
 * Llena la caja del padre; horizontal o vertical según su proporción real en px.
 */
export const EstanteElement = memo(function EstanteElement({
  codigo, color, categoria, rotacion = 0, seleccionado, resaltado,
}: EstanteElementProps) {
  const base = color ?? colorDeCategoria(categoria) ?? "#64748B";
  return (
    <SvgPlano>
      {(w, h) => {
        const vertical = h > w;
        const L = vertical ? h : w;   // largo
        const S = vertical ? w : h;   // fondo
        const marco = oscurecerHex(base, 0.38);
        const pad = clamp(S * 0.1, 1.6, 3.4);
        const filas = S >= 24 ? 2 : 1;
        const sep = filas === 2 ? 1.8 : 0;
        const filaH = (S - 2 * pad - sep) / filas;
        const modulos = Math.max(1, Math.round(L / 56));
        const rx = Math.min(4, S / 4);
        return (
          <>
            <Sombra w={w} h={h} rx={rx} rot={rotacion} op={0.32} />
            <g transform={vertical ? `translate(${w} 0) rotate(90)` : undefined}>
              <rect width={L} height={S} rx={rx} fill={marco} />
              {Array.from({ length: filas }, (_, i) => {
                const y = pad + i * (filaH + sep);
                return (
                  <g key={i}>
                    <rect x={pad} y={y} width={L - 2 * pad} height={filaH} rx={1.6} fill={base} />
                    <rect x={pad} y={y} width={L - 2 * pad} height={filaH} rx={1.6} fill="url(#plano-lomos)" />
                    <rect x={pad} y={y} width={L - 2 * pad} height={Math.min(2.2, filaH * 0.25)} fill="#000" opacity={0.22} />
                  </g>
                );
              })}
              {Array.from({ length: modulos - 1 }, (_, i) => {
                const x = ((i + 1) * L) / modulos;
                return (
                  <g key={i}>
                    <rect x={x - 1.1} y={pad - 0.5} width={2.2} height={S - 2 * pad + 1} fill={marco} />
                    <rect x={x - 1.1} y={pad - 0.5} width={0.7} height={S - 2 * pad + 1} fill="#fff" opacity={0.22} />
                  </g>
                );
              })}
              <rect width={L} height={S} rx={rx} fill="url(#plano-brillo)" />
              <rect x={1} y={0.6} width={Math.max(L - 2, 0)} height={1} rx={0.5} fill="#fff" opacity={0.4} />
              <rect width={L} height={S} rx={rx} fill="none" stroke="#000" strokeOpacity={0.28} />
              {(seleccionado || resaltado) && (
                <rect
                  x={0.8} y={0.8} width={Math.max(L - 1.6, 0)} height={Math.max(S - 1.6, 0)} rx={rx}
                  fill="none" stroke="#fff" strokeOpacity={0.95} strokeWidth={1.6}
                />
              )}
            </g>
            <ChipCodigo x={w / 2} y={h / 2} texto={codigo} rot={rotacion} />
          </>
        );
      }}
    </SvgPlano>
  );
});

// ─── Mobiliario ───────────────────────────────────────────────────────────────

/** Tablero de madera: color base + veta + brillo + filo claro + borde. */
function Tablero({
  x = 0, y = 0, w, h, rx = 4, ry, color,
}: { x?: number; y?: number; w: number; h: number; rx?: number; ry?: number; color: string }) {
  const c = aclarar(color, 0.12);
  const rY = ry ?? rx;
  const i = Math.min(1.6, Math.min(w, h) / 6);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={rx} ry={rY} fill={c} />
      <rect x={x} y={y} width={w} height={h} rx={rx} ry={rY} fill="url(#plano-madera)" />
      <rect x={x} y={y} width={w} height={h} rx={rx} ry={rY} fill="url(#plano-brillo)" />
      <rect
        x={x + i} y={y + i} width={Math.max(w - 2 * i, 0)} height={Math.max(h - 2 * i, 0)}
        rx={Math.max(rx - i, 0)} ry={Math.max(rY - i, 0)}
        fill="none" stroke="#fff" strokeOpacity={0.28}
      />
      <rect x={x} y={y} width={w} height={h} rx={rx} ry={rY} fill="none" stroke={oscurecerHex(c, 0.5)} strokeOpacity={0.7} />
    </>
  );
}

/** Silla vista desde arriba, centrada en (cx, cy), con el respaldo hacia -y (se gira con `ang`). */
function SillaDibujo({
  cx, cy, cw, cd, ang = 0, color,
}: { cx: number; cy: number; cw: number; cd: number; ang?: number; color: string }) {
  const asiento = aclarar(color, 0.08);
  const respaldo = oscurecerHex(asiento, 0.3);
  const bk = cd * 0.3;
  const sy = -cd / 2 + cd * 0.2;
  const sh = cd * 0.8;
  const r = cd * 0.22;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${ang})`}>
      <rect x={-cw / 2 + 0.8} y={-cd / 2 + 1.6} width={cw} height={cd} rx={r} fill="#000" opacity={0.28} filter="url(#soft-shadow)" />
      <rect x={-cw * 0.44} y={sy} width={cw * 0.88} height={sh} rx={r} fill={asiento} />
      <rect x={-cw * 0.44} y={sy} width={cw * 0.88} height={sh} rx={r} fill="url(#plano-madera)" />
      <rect x={-cw * 0.44} y={sy} width={cw * 0.88} height={sh} rx={r} fill="url(#plano-brillo)" />
      <rect x={-cw * 0.44} y={sy} width={cw * 0.88} height={sh} rx={r} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={0.8} />
      <rect x={-cw / 2} y={-cd / 2} width={cw} height={bk} rx={bk / 2} fill={respaldo} />
      <rect x={-cw / 2 + bk * 0.4} y={-cd / 2 + bk * 0.2} width={Math.max(cw - bk * 0.8, 0)} height={bk * 0.22} rx={bk * 0.11} fill="#fff" opacity={0.25} />
    </g>
  );
}

/** Mesa de lectura: mesa redonda o cuadrada con 4 sillas, una por lado (todo dentro de la caja). */
function MesaLectura({ color, rotacion, redonda }: { color: string; rotacion: number; redonda: boolean }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const s = Math.min(w, h);
        const cd = s * 0.2;
        const cw = s * 0.27;
        const ins = cd * 0.78;          // las sillas se meten un poco bajo la mesa
        const tw = w - 2 * ins;
        const th = h - 2 * ins;
        const silla = oscurecerHex(color, 0.06);
        return (
          <>
            <SillaDibujo cx={w / 2} cy={cd / 2} cw={cw} cd={cd} ang={0} color={silla} />
            <SillaDibujo cx={w / 2} cy={h - cd / 2} cw={cw} cd={cd} ang={180} color={silla} />
            <SillaDibujo cx={cd / 2} cy={h / 2} cw={cw} cd={cd} ang={-90} color={silla} />
            <SillaDibujo cx={w - cd / 2} cy={h / 2} cw={cw} cd={cd} ang={90} color={silla} />
            {redonda ? (
              <>
                <Sombra x={ins} y={ins} w={tw} h={th} rx={tw / 2} ry={th / 2} rot={rotacion} />
                <Tablero x={ins} y={ins} w={tw} h={th} rx={tw / 2} ry={th / 2} color={color} />
              </>
            ) : (
              <>
                <Sombra x={ins} y={ins} w={tw} h={th} rx={s * 0.06} rot={rotacion} />
                <Tablero x={ins} y={ins} w={tw} h={th} rx={s * 0.06} color={color} />
              </>
            )}
          </>
        );
      }}
    </SvgPlano>
  );
}

function MesaRect({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => (
        <>
          <Sombra w={w} h={h} rx={5} rot={rotacion} />
          <Tablero w={w} h={h} rx={5} color={color} />
        </>
      )}
    </SvgPlano>
  );
}

function SillaSuelta({ color }: { color: string }) {
  return (
    <SvgPlano>
      {(w, h) => <SillaDibujo cx={w / 2} cy={h / 2} cw={w * 0.94} cd={h * 0.94} color={color} />}
    </SvgPlano>
  );
}

function Sillon({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const rx = Math.min(10, w / 5, h / 5);
        const oscuro = oscurecerHex(color, 0.25);
        const claro = aclarar(color, 0.14);
        const back = h * 0.28;
        const arm = w * 0.17;
        return (
          <>
            <Sombra w={w} h={h} rx={rx} rot={rotacion} />
            <rect width={w} height={h} rx={rx} fill={color} />
            <rect width={w} height={h} rx={rx} fill="url(#plano-tela)" />
            <rect width={w} height={back + rx} rx={rx} fill={oscuro} />
            <rect y={back * 0.5} width={arm} height={h - back * 0.5} rx={arm / 2} fill={oscuro} />
            <rect x={w - arm} y={back * 0.5} width={arm} height={h - back * 0.5} rx={arm / 2} fill={oscuro} />
            <rect x={arm} y={back} width={Math.max(w - 2 * arm, 0)} height={Math.max(h - back - arm * 0.35, 0)} rx={Math.min(6, arm)} fill={claro} />
            <rect x={arm} y={back} width={Math.max(w - 2 * arm, 0)} height={Math.max(h - back - arm * 0.35, 0)} rx={Math.min(6, arm)} fill="url(#plano-tela)" />
            <rect x={arm} y={back} width={Math.max(w - 2 * arm, 0)} height={Math.max(h - back - arm * 0.35, 0)} rx={Math.min(6, arm)} fill="url(#plano-brillo-rad)" />
            <rect width={w} height={h} rx={rx} fill="none" stroke="#000" strokeOpacity={0.35} />
          </>
        );
      }}
    </SvgPlano>
  );
}

// Mostrador / recepción ───────────────────────────────────────────────────────

/** Monitor visto desde arriba + teclado + mouse. Origen arriba a la izquierda, ~38×22. */
function Pc({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M12 2.5 L22 2.5 L24.5 8 L9.5 8 Z" fill="#3a3c40" />
      <rect width="34" height="3.2" rx="1.2" fill="#1f2023" />
      <rect x="1" y="2.2" width="32" height="0.9" fill="#5f7087" />
      <rect x="4" y="12" width="26" height="8.5" rx="1.2" fill="#cdcdc9" stroke="#8d8d89" strokeWidth="0.5" />
      <rect x="5" y="13" width="24" height="6.5" fill="url(#plano-teclas)" />
      <ellipse cx="35.5" cy="16.5" rx="2.2" ry="3.3" fill="#e9e9e6" stroke="#8d8d89" strokeWidth="0.5" />
    </g>
  );
}

function Papeles({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-6) scale(${s})`}>
      <rect x="1" y="1" width="17" height="12" fill="#000" opacity="0.12" />
      <rect width="17" height="12" fill="#f7f5f0" stroke="#c9c4ba" strokeWidth="0.4" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="2" y={2.5 + i * 2} width={13 - (i % 2) * 4} height="0.5" fill="#b9b3a7" />
      ))}
    </g>
  );
}

function Caja({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect width="14" height="11" rx="1.5" fill="#2e3034" />
      <rect x="1.5" y="1.5" width="11" height="3.6" fill="#7f9ab0" />
      <rect x="1.5" y="6.2" width="11" height="3.3" fill="url(#plano-teclas)" opacity="0.7" />
      <rect width="14" height="11" rx="1.5" fill="url(#plano-brillo)" />
    </g>
  );
}

function SillaOficina({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <rect x="-9" y="-6.5" width="21" height="21" rx="7" fill="#000" opacity="0.28" filter="url(#soft-shadow)" />
      <rect x="-10" y="-9" width="20" height="19" rx="7" fill="#3c3e43" />
      <rect x="-10" y="-9" width="20" height="19" rx="7" fill="url(#plano-brillo-rad)" />
      <rect x="-12.5" y="-5" width="3" height="11" rx="1.4" fill="#26272a" />
      <rect x="9.5" y="-5" width="3" height="11" rx="1.4" fill="#26272a" />
      <rect x="-11" y="9" width="22" height="4" rx="2" fill="#2a2b2e" />
    </g>
  );
}

function MostradorRecto({ w, h, color, rotacion }: { w: number; h: number; color: string; rotacion: number }) {
  const s = clamp(Math.min(w, h) / 44, 0.5, 1.25);
  return (
    <>
      <Sombra w={w} h={h} rx={4} rot={rotacion} />
      <Orientado w={w} h={h}>
        {(L, S) => (
          <>
            <Tablero w={L} h={S} rx={4} color={color} />
            <rect x={1} y={S - 4} width={Math.max(L - 2, 0)} height={3} fill="#000" opacity={0.16} />
            <Pc x={L * 0.5 - 17 * s} y={S * 0.16} s={s} />
            {L > 110 * s && <Papeles x={L * 0.12} y={S * 0.3} s={s} />}
            {L > 110 * s && <Caja x={L * 0.8} y={S * 0.2} s={s} />}
          </>
        )}
      </Orientado>
    </>
  );
}

/** Mostrador en L (cuando la caja es más "cuadrada"): brazo superior + brazo izquierdo y silla adentro. */
function MostradorL({ w, h, color, rotacion }: { w: number; h: number; color: string; rotacion: number }) {
  const t = Math.min(w, h) * 0.42;
  const d = `M0 0H${w}V${t}H${t}V${h}H0Z`;
  const c = aclarar(color, 0.12);
  const s = clamp(t / 40, 0.55, 1.2);
  return (
    <>
      <Sombra w={w} h={h} d={d} rot={rotacion} />
      <path d={d} fill={c} />
      <path d={d} fill="url(#plano-madera)" />
      <path d={d} fill="url(#plano-brillo)" />
      <path d={`M${t} ${h - 1}V${t}H${w - 1}`} fill="none" stroke="#000" strokeOpacity={0.16} strokeWidth={3} />
      <path d={d} fill="none" stroke={oscurecerHex(c, 0.5)} strokeOpacity={0.7} strokeLinejoin="round" />
      <Pc x={t + (w - t) * 0.45 - 17 * s} y={t * 0.18} s={s} />
      {h - t >= 30 && <Papeles x={t * 0.18} y={t + (h - t) * 0.35} s={s * 0.9} />}
      {h - t >= 30 && w - t >= 34 && <SillaOficina cx={t + Math.min(26, (w - t) * 0.5)} cy={t + (h - t) * 0.5} s={s} />}
    </>
  );
}

function Mostrador({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const S = Math.min(w, h);
        const L = Math.max(w, h);
        return S >= 38 && L / S < 2.6
          ? <MostradorL w={w} h={h} color={color} rotacion={rotacion} />
          : <MostradorRecto w={w} h={h} color={color} rotacion={rotacion} />;
      }}
    </SvgPlano>
  );
}

// ─── Plantas y deco ───────────────────────────────────────────────────────────

/** Follaje visto desde arriba: masa oscura + 3 coronas de hojas con nervadura. */
function Hojas({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const oscuro = oscurecerHex(color, 0.32);
  const claro = aclarar(color, 0.28);
  const capas = [
    { n: 9, len: 1, ancho: 0.21, fill: oscuro, off: 0 },
    { n: 7, len: 0.74, ancho: 0.22, fill: color, off: 18 },
    { n: 5, len: 0.46, ancho: 0.24, fill: claro, off: 32 },
  ];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={r * 0.82} fill={oscuro} opacity={0.5} />
      {capas.map((c, ci) =>
        Array.from({ length: c.n }, (_, i) => {
          const L = r * c.len;
          return (
            <g key={`${ci}-${i}`} transform={`rotate(${c.off + (i * 360) / c.n})`}>
              <ellipse cy={-L / 2} rx={r * c.ancho} ry={L / 2} fill={c.fill} stroke="#000" strokeOpacity={0.28} strokeWidth={0.5} />
              <path d={`M0 ${-L * 0.06}V${-L * 0.9}`} stroke="#fff" strokeOpacity={0.28} strokeWidth={0.5} />
            </g>
          );
        }),
      )}
      <circle r={r * 0.1} fill={oscuro} />
    </g>
  );
}

function Planta({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const r = Math.max(Math.min(w, h) / 2 - 1, 2);
        return (
          <>
            <Sombra x={w / 2 - r} y={h / 2 - r} w={2 * r} h={2 * r} rx={r} rot={rotacion} />
            <Hojas cx={w / 2} cy={h / 2} r={r} color={color} />
          </>
        );
      }}
    </SvgPlano>
  );
}

/** Maceta o jardinera (si es alargada, lleva varias plantas). `color` es el de la maceta. */
function Maceta({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const S = Math.min(w, h);
        const L = Math.max(w, h);
        const n = Math.max(1, Math.round(L / S));
        const pad = Math.max(2.5, S * 0.12);
        const rr = Math.min(5, S * 0.2);
        const r = Math.max((S - 2 * pad) * 0.5 * 0.95, 2);
        return (
          <>
            <Sombra w={w} h={h} rx={rr} rot={rotacion} />
            <rect width={w} height={h} rx={rr} fill={color} />
            <rect width={w} height={h} rx={rr} fill="url(#plano-brillo)" />
            <rect x={pad} y={pad} width={Math.max(w - 2 * pad, 0)} height={Math.max(h - 2 * pad, 0)} rx={rr * 0.6} fill="#4a3a2c" />
            <rect x={pad} y={pad} width={Math.max(w - 2 * pad, 0)} height={1.6} fill="#000" opacity={0.3} />
            {Array.from({ length: n }, (_, i) => (
              <Hojas
                key={i}
                cx={w >= h ? ((i + 0.5) * w) / n : w / 2}
                cy={w >= h ? h / 2 : ((i + 0.5) * h) / n}
                r={r}
                color="#4F9443"
              />
            ))}
            <rect width={w} height={h} rx={rr} fill="none" stroke="#000" strokeOpacity={0.35} />
          </>
        );
      }}
    </SvgPlano>
  );
}

function Alfombra({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const f = 4;                          // largo del fleco
        const horiz = w >= h;
        const bx = horiz ? f : 0;
        const by = horiz ? 0 : f;
        const bw = horiz ? w - 2 * f : w;
        const bh = horiz ? h : h - 2 * f;
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        const dw = bw * 0.28;
        const dh = bh * 0.3;
        const largoFleco = horiz ? h : w;
        const nF = Math.max(2, Math.floor(largoFleco / 2.4));
        const crema = "#e8dcc4";
        return (
          <>
            <Sombra x={bx} y={by} w={bw} h={bh} rx={2} rot={rotacion} op={0.2} />
            {Array.from({ length: nF }, (_, i) => {
              const p = ((i + 0.5) * largoFleco) / nF;
              return horiz ? (
                <g key={i} stroke={crema} strokeWidth={0.8}>
                  <line x1={0} y1={p} x2={f + 1} y2={p} />
                  <line x1={w - f - 1} y1={p} x2={w} y2={p} />
                </g>
              ) : (
                <g key={i} stroke={crema} strokeWidth={0.8}>
                  <line x1={p} y1={0} x2={p} y2={f + 1} />
                  <line x1={p} y1={h - f - 1} x2={p} y2={h} />
                </g>
              );
            })}
            <rect x={bx} y={by} width={bw} height={bh} rx={2} fill={color} />
            <rect x={bx} y={by} width={bw} height={bh} rx={2} fill="url(#plano-tela)" />
            <rect x={bx + 5} y={by + 5} width={Math.max(bw - 10, 0)} height={Math.max(bh - 10, 0)} fill="none" stroke={crema} strokeOpacity={0.6} strokeWidth={1.4} />
            <rect x={bx + 9} y={by + 9} width={Math.max(bw - 18, 0)} height={Math.max(bh - 18, 0)} fill="none" stroke="#000" strokeOpacity={0.25} />
            <path
              d={`M${cx} ${cy - dh}L${cx + dw} ${cy}L${cx} ${cy + dh}L${cx - dw} ${cy}Z`}
              fill={crema} fillOpacity={0.16} stroke={crema} strokeOpacity={0.55} strokeWidth={1}
            />
            <rect x={bx} y={by} width={bw} height={bh} rx={2} fill="url(#plano-brillo)" opacity={0.6} />
            <rect x={bx} y={by} width={bw} height={bh} rx={2} fill="none" stroke="#000" strokeOpacity={0.3} />
          </>
        );
      }}
    </SvgPlano>
  );
}

// ─── Estructura y accesos ─────────────────────────────────────────────────────

function Escalera({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const base = aclarar(color, 0.45);
        const oscuro = oscurecerHex(color, 0.3);
        return (
          <>
            <Sombra w={w} h={h} rx={3} rot={rotacion} />
            <Orientado w={w} h={h}>
              {(L, S) => {
                const n = Math.max(4, Math.round(L / 9));
                return (
                  <>
                    <rect width={L} height={S} rx={3} fill={base} />
                    {Array.from({ length: n }, (_, i) => (
                      <rect key={i} x={(i * L) / n} width={L / n} height={S} fill={i % 2 ? "#000" : "#fff"} opacity={i % 2 ? 0.04 : 0.1} />
                    ))}
                    {Array.from({ length: n - 1 }, (_, i) => (
                      <line key={i} x1={((i + 1) * L) / n} x2={((i + 1) * L) / n} y1={0} y2={S} stroke={oscuro} strokeOpacity={0.55} />
                    ))}
                    <rect width={L} height={2.6} fill={oscuro} />
                    <rect y={S - 2.6} width={L} height={2.6} fill={oscuro} />
                    {S >= 16 && (
                      <>
                        <path d={`M${L * 0.86} ${S / 2}H${L * 0.16}`} stroke={oscuro} strokeWidth={1.8} strokeLinecap="round" />
                        <path d={`M${L * 0.16 + 7} ${S / 2 - 5}L${L * 0.16} ${S / 2}L${L * 0.16 + 7} ${S / 2 + 5}`} fill="none" stroke={oscuro} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    )}
                    <rect width={L} height={S} rx={3} fill="url(#plano-brillo)" />
                    <rect width={L} height={S} rx={3} fill="none" stroke="#000" strokeOpacity={0.35} />
                  </>
                );
              }}
            </Orientado>
          </>
        );
      }}
    </SvgPlano>
  );
}

function Columna({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => (
        <>
          <Sombra w={w} h={h} rx={2} rot={rotacion} op={0.34} />
          <rect width={w} height={h} rx={2} fill={color} />
          <rect width={w} height={h} rx={2} fill="url(#plano-brillo)" />
          <rect x={3} y={3} width={Math.max(w - 6, 0)} height={Math.max(h - 6, 0)} fill="none" stroke="#fff" strokeOpacity={0.25} />
          <rect width={w} height={h} rx={2} fill="none" stroke="#000" strokeOpacity={0.4} />
        </>
      )}
    </SvgPlano>
  );
}

function Pared({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => (
        <>
          <Sombra w={w} h={h} rx={1.5} rot={rotacion} op={0.3} />
          <rect width={w} height={h} rx={1.5} fill={color} />
          <rect width={w} height={h} rx={1.5} fill="url(#plano-muro)" />
          <rect width={w} height={Math.min(2, h / 4)} fill="#fff" opacity={0.22} />
          <rect width={w} height={h} rx={1.5} fill="none" stroke="#000" strokeOpacity={0.4} />
        </>
      )}
    </SvgPlano>
  );
}

/** Puerta abierta 90°: hoja de madera, arco de giro punteado y jambas en la línea del muro. */
function Puerta({ color }: { color: string }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const t = Math.max(3.5, Math.min(w, h) * 0.07);
        const hx = 5;
        const hy = h - 4;
        const R = Math.max(8, Math.min(h - 8, w * 0.92 - hx));
        const c = aclarar(color, 0.12);
        return (
          <>
            <path d={`M${hx} ${hy}L${hx} ${hy - R}A${R} ${R} 0 0 1 ${hx + R} ${hy}Z`} fill={color} opacity={0.1} />
            <path
              d={`M${hx} ${hy - R}A${R} ${R} 0 0 1 ${hx + R} ${hy}`}
              fill="none" stroke={oscurecerHex(color, 0.4)} strokeOpacity={0.6} strokeDasharray="3 2.4"
            />
            <rect x={0} y={hy} width={hx + 4} height={4} fill="#6b665f" />
            <rect x={hx + R - 3} y={hy} width={7} height={4} fill="#6b665f" />
            <rect x={hx - t / 2 + 0.8} y={hy - R + 1.4} width={t} height={R} rx={1} fill="#000" opacity={0.3} filter="url(#soft-shadow)" />
            <rect x={hx - t / 2} y={hy - R} width={t} height={R} rx={1} fill={c} />
            <rect x={hx - t / 2} y={hy - R} width={t} height={R} rx={1} fill="url(#plano-brillo)" />
            <rect x={hx - t / 2} y={hy - R} width={t} height={R} rx={1} fill="none" stroke={oscurecerHex(c, 0.5)} strokeOpacity={0.7} />
            <circle cx={hx + t / 2 + 1} cy={hy - R + 5} r={1.2} fill="#d9d4c8" stroke="#6b665f" strokeWidth={0.4} />
          </>
        );
      }}
    </SvgPlano>
  );
}

function Ventana({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const m = Math.min(6, w / 10);
        const marco = oscurecerHex(color, 0.45);
        return (
          <>
            <Sombra w={w} h={h} rx={1.5} rot={rotacion} op={0.25} />
            <rect width={w} height={h} fill="#6b665f" />
            <rect x={m} y={h * 0.2} width={Math.max(w - 2 * m, 0)} height={h * 0.6} fill={aclarar(color, 0.6)} stroke={marco} />
            <rect x={m} y={h * 0.2} width={Math.max(w - 2 * m, 0)} height={h * 0.3} fill="#fff" opacity={0.35} />
            <line x1={w / 2} y1={h * 0.2} x2={w / 2} y2={h * 0.8} stroke={marco} strokeWidth={1.2} />
            <line x1={m} y1={h * 0.5} x2={w - m} y2={h * 0.5} stroke={marco} strokeOpacity={0.6} strokeWidth={0.8} />
          </>
        );
      }}
    </SvgPlano>
  );
}

function Bano({ color, rotacion }: { color: string; rotacion: number }) {
  return (
    <SvgPlano>
      {(w, h) => {
        const s = Math.min(w, h);
        const r = Math.min(10, s * 0.22);
        return (
          <>
            <Sombra w={w} h={h} rx={r} rot={rotacion} />
            <rect width={w} height={h} rx={r} fill={color} />
            <rect width={w} height={h} rx={r} fill="url(#plano-brillo)" />
            <g transform={`translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 48})`} fill="#fff">
              <circle cx="15.5" cy="13" r="3.4" />
              <path d="M11.5 18.5H19.5V29H17.6V39H13.4V29H11.5Z" />
              <rect x="23.4" y="11" width="1.2" height="28" opacity="0.6" />
              <circle cx="32.5" cy="13" r="3.4" />
              <path d="M29.5 18.5H35.5L38.5 30H35.6V39H29.4V30H26.5Z" />
            </g>
            <rect width={w} height={h} rx={r} fill="none" stroke="#000" strokeOpacity={0.25} />
          </>
        );
      }}
    </SvgPlano>
  );
}

// ─── Señalética (CSS) ─────────────────────────────────────────────────────────

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
    <div className="flex h-full w-full items-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" style={{ color }}>
      {doble && cabeza("l")}
      <div className="h-[4px] flex-1 rounded-full" style={{ background: color }} />
      {cabeza("r")}
    </div>
  );
}

/** Texto libre. Si dice ENTRADA / SALIDA se dibuja como cartel sólido, bien visible. */
function Texto({ color, texto }: { color: string; texto: string | null }) {
  const cartel = !!texto && /entrada|salida/i.test(texto);
  if (cartel) {
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-md px-2 text-center font-sans text-[11px] font-bold uppercase leading-none tracking-[0.18em] text-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] ring-1 ring-white/70"
        style={{ background: color }}
      >
        <span className="truncate">{texto}</span>
      </div>
    );
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-md border-2 border-dashed bg-white/75 px-1 text-center font-sans text-[11px] font-bold uppercase leading-none tracking-wide backdrop-blur-[1px]"
      style={{ color, borderColor: `${color}66` }}
    >
      <span className="truncate">{texto || "Texto"}</span>
    </div>
  );
}

// Memoizados: durante un drag/resize solo se vuelve a dibujar el elemento que cambia.
const EMesaLectura = memo(MesaLectura);
const EMesaRect = memo(MesaRect);
const ESillaSuelta = memo(SillaSuelta);
const ESillon = memo(Sillon);
const EMostrador = memo(Mostrador);
const EPlanta = memo(Planta);
const EMaceta = memo(Maceta);
const EAlfombra = memo(Alfombra);
const EEscalera = memo(Escalera);
const EColumna = memo(Columna);
const EPared = memo(Pared);
const EPuerta = memo(Puerta);
const EVentana = memo(Ventana);
const EBano = memo(Bano);

/** Dibuja el elemento correspondiente a la anotación, llenando su caja. */
export function renderElemento(a: Anotacion): ReactNode {
  const color = a.color ?? POR_TIPO[a.tipo]?.color ?? COLOR_DEFAULT;
  const rotacion = a.rotacion ?? 0;

  switch (a.tipo) {
    case "texto":
      return <Texto color={color} texto={a.texto} />;
    case "flecha":
      return <Flecha color={color} />;
    case "flecha_doble":
      return <Flecha color={color} doble />;

    case "mesa_redonda":
      return <EMesaLectura color={color} rotacion={rotacion} redonda />;
    case "mesa_cuadrada":
      return <EMesaLectura color={color} rotacion={rotacion} redonda={false} />;
    case "mesa_rect":
      return <EMesaRect color={color} rotacion={rotacion} />;
    case "silla":
      return <ESillaSuelta color={color} />;
    case "sillon":
      return <ESillon color={color} rotacion={rotacion} />;
    case "mostrador":
      return <EMostrador color={color} rotacion={rotacion} />;

    case "planta":
      return <EPlanta color={color} rotacion={rotacion} />;
    case "maceta":
      return <EMaceta color={color} rotacion={rotacion} />;
    case "alfombra":
      return <EAlfombra color={color} rotacion={rotacion} />;

    case "escalera":
      return <EEscalera color={color} rotacion={rotacion} />;
    case "columna":
      return <EColumna color={color} rotacion={rotacion} />;
    case "pared":
      return <EPared color={color} rotacion={rotacion} />;
    case "puerta":
      return <EPuerta color={color} />;

    case "ventana":
      return <EVentana color={color} rotacion={rotacion} />;
    case "bano":
      return <EBano color={color} rotacion={rotacion} />;

    default:
      return <Texto color={color} texto={a.texto} />;
  }
}
