import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Primitivas SVG del plano cenital (vista desde arriba).
 *
 * Cada elemento del mapa se dibuja en SVG nativo y en PÍXELES reales de su caja
 * (no en un viewBox estirado), así los radios de esquina, los trazos y el texto
 * quedan nítidos y sin deformarse al redimensionar. `MapaCanvas` sigue siendo el
 * dueño de la posición, el tamaño, el giro y el drag: acá solo se dibuja el interior.
 *
 * Los filtros, degradés y patrones viven en `PlanoDefs`, que se monta UNA sola vez
 * en el canvas; los elementos los referencian por id (`url(#shelf-shadow)`…).
 */

// ─── Color ────────────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla `a` con `b` (t = 0 → a, t = 1 → b). Si algún color no es hex, devuelve `a`. */
export function mezclar(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  if (!A || !B) return a;
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const aclarar = (hex: string, t: number) => mezclar(hex, "#ffffff", t);
export const oscurecerHex = (hex: string, t: number) => mezclar(hex, "#000000", t);

// ─── Defs compartidos (montar una vez dentro del canvas) ──────────────────────

export function PlanoDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        {/* Sombra suave proyectada en el piso: se aplica a un rect negro, no al elemento entero. */}
        <filter id="shelf-shadow" x="-30%" y="-60%" width="160%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id="soft-shadow" x="-40%" y="-60%" width="180%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>

        {/* Luz desde arriba a la izquierda: independiente del color del objeto. */}
        <linearGradient id="plano-brillo" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id="plano-brillo-rad" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.24" />
        </radialGradient>

        {/* Lomos de libros vistos desde arriba (sobre el color de la zona). */}
        <pattern id="plano-lomos" width="30" height="10" patternUnits="userSpaceOnUse">
          <rect x="0" width="3" height="10" fill="#fff" opacity="0.16" />
          <rect x="3" width="2" height="10" fill="#000" opacity="0.1" />
          <rect x="5" width="4" height="10" fill="#fff" opacity="0.07" />
          <rect x="9" width="2.5" height="10" fill="#000" opacity="0.14" />
          <rect x="11.5" width="3.5" height="10" fill="#fff" opacity="0.18" />
          <rect x="15" width="2" height="10" fill="#000" opacity="0.09" />
          <rect x="17" width="4.5" height="10" fill="#fff" opacity="0.09" />
          <rect x="21.5" width="2" height="10" fill="#000" opacity="0.13" />
          <rect x="23.5" width="3" height="10" fill="#fff" opacity="0.15" />
          <rect x="26.5" width="3.5" height="10" fill="#000" opacity="0.07" />
          <path d="M3 0V10M9 0V10M15 0V10M21.5 0V10M26.5 0V10" stroke="#000" strokeOpacity="0.22" strokeWidth="0.6" />
        </pattern>

        {/* Veta de madera (se pinta sobre un rect de color madera). */}
        <pattern id="plano-madera" width="96" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 3 C24 1 48 5 96 3" fill="none" stroke="#000" strokeOpacity="0.1" strokeWidth="0.7" />
          <path d="M0 8 C30 10 60 6 96 8" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="0.6" />
          <path d="M0 13 C20 12 70 15 96 13" fill="none" stroke="#000" strokeOpacity="0.08" strokeWidth="0.8" />
          <path d="M0 17.6H96" stroke="#000" strokeOpacity="0.12" strokeWidth="0.6" />
        </pattern>

        {/* Trama de tela (sillones, alfombra). */}
        <pattern id="plano-tela" width="3" height="3" patternUnits="userSpaceOnUse">
          <path d="M0 1.5H3" stroke="#000" strokeOpacity="0.1" strokeWidth="0.8" />
          <path d="M1.5 0V3" stroke="#fff" strokeOpacity="0.07" strokeWidth="0.8" />
        </pattern>

        {/* Teclas de un teclado. */}
        <pattern id="plano-teclas" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <rect x="0.25" y="0.25" width="1.9" height="1.9" rx="0.3" fill="#fbfbfa" />
        </pattern>

        {/* Hachurado de muros, como en un plano de arquitectura. */}
        <pattern id="plano-muro" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V6" stroke="#fff" strokeOpacity="0.14" strokeWidth="1" />
        </pattern>
      </defs>
    </svg>
  );
}

/** Muros perimetrales con grosor (reemplaza el borde fino del canvas). */
export function MarcoPlano() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
      style={{
        boxShadow:
          "inset 0 0 0 8px #a39d93, inset 0 0 0 9px rgba(0,0,0,0.3), inset 0 0 14px 9px rgba(0,0,0,0.12)",
      }}
    />
  );
}

// ─── Medición y contenedor ────────────────────────────────────────────────────

/** Tamaño en px de un elemento (sin contar el giro CSS de los padres). */
export function useTamano<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [t, setT] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const leer = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setT((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    leer();
    const ro = new ResizeObserver(leer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, t] as const;
}

/**
 * Lienzo SVG que llena la caja del padre (que debe estar posicionado) y entrega
 * su tamaño real en px a `children`. No captura eventos: el drag lo maneja el padre.
 */
export function SvgPlano({ children }: { children: (w: number, h: number) => ReactNode }) {
  const [ref, { w, h }] = useTamano<HTMLDivElement>();
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 select-none">
      {w > 0 && h > 0 && (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="absolute left-0 top-0 overflow-visible"
          aria-hidden="true"
        >
          {children(w, h)}
        </svg>
      )}
    </div>
  );
}

// ─── Sombra proyectada ────────────────────────────────────────────────────────

interface SombraProps {
  x?: number;
  y?: number;
  w: number;
  h: number;
  rx?: number;
  ry?: number;
  /** Ruta SVG (en vez de rect) para formas que no son rectángulos. */
  d?: string;
  /** Giro CSS del contenedor: la sombra se contra-gira para seguir cayendo abajo a la derecha. */
  rot?: number;
  op?: number;
}

export function Sombra({ x = 0, y = 0, w, h, rx = 4, ry, d, rot = 0, op = 0.3 }: SombraProps) {
  const a = (-rot * Math.PI) / 180;
  const sx = 1.4;
  const sy = Math.min(3.2, Math.max(1.6, Math.min(w, h) * 0.08));
  const dx = sx * Math.cos(a) - sy * Math.sin(a);
  const dy = sx * Math.sin(a) + sy * Math.cos(a);
  const filtro = Math.min(w, h) < 30 ? "url(#soft-shadow)" : "url(#shelf-shadow)";
  return d ? (
    <path d={d} fill="#000" opacity={op} filter={filtro} transform={`translate(${dx} ${dy})`} />
  ) : (
    <rect x={x + dx} y={y + dy} width={w} height={h} rx={rx} ry={ry ?? rx} fill="#000" opacity={op} filter={filtro} />
  );
}
