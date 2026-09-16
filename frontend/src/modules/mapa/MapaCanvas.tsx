import { useRef, type PointerEvent } from "react";
import { Pencil, Plus, RotateCw } from "lucide-react";
import { cn, colorEstante, oscurecer } from "@/lib/utils";
import type { Estante, Anotacion, TexturaPiso } from "@/shared/types";
import { renderElemento, claseTextura } from "./elementos";

interface Props {
  estantes: Estante[];
  anotaciones?: Anotacion[];
  /** Textura del piso de la zona visible (grilla si null). */
  textura?: TexturaPiso | null;
  modo?: "ver" | "editar";
  seleccionadoId?: string | null;
  seleccionadoAnotId?: string | null;
  resaltados?: Set<string>;
  onSeleccionar?: (estante: Estante) => void;
  onSeleccionarAnotacion?: (a: Anotacion) => void;
  onMover?: (id: string, pos_x: number, pos_y: number) => void;
  onResize?: (id: string, ancho: number, alto: number) => void;
  onRotar?: (id: string, rotacion: number) => void;
  onMoverAnotacion?: (id: string, pos_x: number, pos_y: number) => void;
  onResizeAnotacion?: (id: string, ancho: number, alto: number) => void;
  onRotarAnotacion?: (id: string, rotacion: number) => void;
  onEditar?: () => void;
  onAgregar?: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const MIN_ESTANTE = 4;
const MIN_ANOT = 3;

type Kind = "shelf" | "anot";
type Mode = "move" | "resize" | "rotate";
interface DragState {
  kind: Kind; mode: Mode; id: string;
  ox: number; oy: number;
  startW: number; startH: number; startPx: number; startPy: number;
  posX: number; posY: number;
  // Rotación: centro del item en px de pantalla y ángulo inicial del puntero.
  cx: number; cy: number; startRot: number; startAngle: number;
}

function CtrlBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-unla text-white shadow-lg shadow-unla/30 ring-1 ring-white/20 transition-all duration-200 hover:bg-unla-dark hover:shadow-xl active:scale-95"
    >
      {children}
    </button>
  );
}

export function MapaCanvas({
  estantes, anotaciones = [], textura, modo = "ver",
  seleccionadoId, seleccionadoAnotId, resaltados,
  onSeleccionar, onSeleccionarAnotacion, onMover, onResize, onRotar,
  onMoverAnotacion, onResizeAnotacion, onRotarAnotacion, onEditar, onAgregar,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  function pct(e: PointerEvent): { px: number; py: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      px: ((e.clientX - rect.left) / rect.width) * 100,
      py: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function beginMove(e: PointerEvent, item: { id: string; pos_x: number; pos_y: number; ancho: number; alto: number }, kind: Kind) {
    if (modo !== "editar") return;
    const p = pct(e);
    if (!p) return;
    drag.current = {
      kind, mode: "move", id: item.id,
      ox: p.px - item.pos_x, oy: p.py - item.pos_y,
      startW: item.ancho, startH: item.alto, startPx: p.px, startPy: p.py,
      posX: item.pos_x, posY: item.pos_y,
      cx: 0, cy: 0, startRot: 0, startAngle: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function beginResize(e: PointerEvent, item: { id: string; pos_x: number; pos_y: number; ancho: number; alto: number }, kind: Kind) {
    if (modo !== "editar") return;
    e.stopPropagation();
    const p = pct(e);
    if (!p) return;
    drag.current = {
      kind, mode: "resize", id: item.id,
      ox: 0, oy: 0,
      startW: item.ancho, startH: item.alto, startPx: p.px, startPy: p.py,
      posX: item.pos_x, posY: item.pos_y,
      cx: 0, cy: 0, startRot: 0, startAngle: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // Gira el item manteniendo su tamaño: sigue el desplazamiento angular del puntero
  // alrededor del centro (en px de pantalla, que no se mueve al rotar).
  function beginRotate(e: PointerEvent, item: { id: string; pos_x: number; pos_y: number; ancho: number; alto: number; rotacion: number }, kind: Kind) {
    if (modo !== "editar") return;
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + ((item.pos_x + item.ancho / 2) / 100) * rect.width;
    const cy = rect.top + ((item.pos_y + item.alto / 2) / 100) * rect.height;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    drag.current = {
      kind, mode: "rotate", id: item.id,
      ox: 0, oy: 0,
      startW: item.ancho, startH: item.alto, startPx: 0, startPy: 0,
      posX: item.pos_x, posY: item.pos_y,
      cx, cy, startRot: item.rotacion ?? 0, startAngle,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = pct(e);
    if (!p) return;
    const min = d.kind === "shelf" ? MIN_ESTANTE : MIN_ANOT;
    if (d.mode === "move") {
      const nx = clamp(p.px - d.ox, 0, 100 - d.startW);
      const ny = clamp(p.py - d.oy, 0, 100 - d.startH);
      const cb = d.kind === "shelf" ? onMover : onMoverAnotacion;
      cb?.(d.id, Math.round(nx * 100) / 100, Math.round(ny * 100) / 100);
    } else if (d.mode === "resize") {
      const nw = clamp(d.startW + (p.px - d.startPx), min, 100 - d.posX);
      const nh = clamp(d.startH + (p.py - d.startPy), min, 100 - d.posY);
      const cb = d.kind === "shelf" ? onResize : onResizeAnotacion;
      cb?.(d.id, Math.round(nw * 100) / 100, Math.round(nh * 100) / 100);
    } else {
      const ang = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI;
      let rot = d.startRot + (ang - d.startAngle);
      rot = ((rot % 360) + 360) % 360;
      // Con Shift, imantar a pasos de 15°.
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      const cb = d.kind === "shelf" ? onRotar : onRotarAnotacion;
      cb?.(d.id, Math.round(rot * 100) / 100);
    }
  }

  function onUp(e: PointerEvent) {
    if (drag.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      drag.current = null;
    }
  }

  const handle = (item: { id: string; pos_x: number; pos_y: number; ancho: number; alto: number }, kind: Kind) => (
    <span
      onPointerDown={(e) => beginResize(e, item, kind)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className="absolute -bottom-1.5 -right-1.5 z-20 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-unla shadow-md"
      title="Redimensionar"
    />
  );

  // Tirador de giro: sobresale por encima del item, unido por una guía. Mantener el
  // clic y arrastrar en círculo rota el item sin cambiar su tamaño (Shift imanta a 15°).
  const rotHandle = (item: { id: string; pos_x: number; pos_y: number; ancho: number; alto: number; rotacion: number }, kind: Kind) => (
    <span className="pointer-events-none absolute -top-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center">
      <span
        onPointerDown={(e) => beginRotate(e, item, kind)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="pointer-events-auto flex h-5 w-5 cursor-grab touch-none items-center justify-center rounded-full border-2 border-white bg-unla text-white shadow-md active:cursor-grabbing"
        title="Girar (mantené Shift para pasos de 15°)"
      >
        <RotateCw className="h-3 w-3" />
      </span>
      <span className="h-2 w-[2px] bg-white/90 shadow-sm" />
    </span>
  );

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full overflow-hidden rounded-2xl border border-stone-300/80 shadow-inner shadow-stone-900/10">
        <div ref={canvasRef} className={cn("map-floor relative h-full w-full", claseTextura(textura))}>
          <div className="pointer-events-none absolute inset-2 z-0 rounded border-[2.5px] border-stone-400/70" />

          {estantes.length === 0 && anotaciones.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">
              No hay estantes en esta zona.
            </div>
          )}

          {anotaciones.map((a) => {
            const sel = seleccionadoAnotId === a.id;
            return (
              <div
                key={a.id}
                onPointerDown={(e) => beginMove(e, a, "anot")}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onClick={() => onSeleccionarAnotacion?.(a)}
                className={cn(
                  "absolute z-[4] flex items-center justify-center",
                  modo === "editar" ? "cursor-move touch-none" : "pointer-events-none",
                )}
                style={{
                  left: `${a.pos_x}%`, top: `${a.pos_y}%`,
                  width: `${a.ancho}%`, height: `${a.alto}%`,
                  transform: `rotate(${a.rotacion}deg)`,
                }}
              >
                {renderElemento(a)}
                {modo === "editar" && sel && (
                  <>
                    <span className="pointer-events-none absolute -inset-1 rounded-md ring-2 ring-ambar" />
                    {handle(a, "anot")}
                    {rotHandle(a, "anot")}
                  </>
                )}
              </div>
            );
          })}

          {estantes.map((est) => {
            const resaltado = resaltados?.has(est.id);
            const seleccionado = seleccionadoId === est.id;
            const color = colorEstante(est.color, est.zona_id);
            const borde = oscurecer(color, 0.78);
            return (
              <button
                key={est.id}
                onPointerDown={(e) => beginMove(e, est, "shelf")}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onClick={() => onSeleccionar?.(est)}
                className={cn(
                  "group absolute z-[5] flex items-center justify-center rounded-md p-1 text-center transition-shadow duration-200",
                  modo === "editar" ? "cursor-move touch-none" : "cursor-pointer",
                  "hover:z-[6]",
                )}
                style={{
                  left: `${est.pos_x}%`, top: `${est.pos_y}%`,
                  width: `${est.ancho}%`, height: `${est.alto}%`,
                  transform: `rotate(${est.rotacion ?? 0}deg)`,
                  background: color,
                  border: `2px solid ${borde}`,
                  boxShadow: resaltado
                    ? "0 0 0 3px #F9F8F6, 0 0 0 6px #E69D45, 0 0 22px 4px rgba(230,157,69,0.6)"
                    : seleccionado
                    ? "0 0 0 3px #F9F8F6, 0 0 0 6px #E69D45, 0 4px 12px rgba(0,0,0,0.2)"
                    : "0 1px 4px rgba(0,0,0,0.18)",
                }}
                title={est.etiqueta ?? est.codigo}
              >
                <span className="pointer-events-none max-w-full truncate rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
                  {est.codigo}
                </span>
                {modo === "editar" && seleccionado && (
                  <>
                    {handle(est, "shelf")}
                    {rotHandle(est, "shelf")}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {(onEditar || onAgregar) && (
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          {onEditar && (
            <CtrlBtn label="Editar mapa" onClick={onEditar}>
              <Pencil className="h-[18px] w-[18px]" />
            </CtrlBtn>
          )}
          {onAgregar && (
            <button
              type="button"
              onClick={onAgregar}
              title="Agregar estante"
              aria-label="Agregar estante"
              className="flex cursor-pointer items-center justify-center text-unla transition-transform duration-150 hover:scale-125 hover:text-unla-dark active:scale-95"
            >
              <Plus className="h-5 w-5" strokeWidth={2.75} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
