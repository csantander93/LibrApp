import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X, MapPin, Search, GripHorizontal, ChevronUp, ChevronDown, Layers } from "lucide-react";
import { cn, colorLomo, altoLomo } from "@/lib/utils";
import { listarLibros } from "@/modules/catalogo/api";
import type { Estante, Libro, Zona } from "@/shared/types";

interface Props {
  estante: Estante;
  zonas: Zona[];
  onCerrar: () => void;
}

export function EstantePanelInline({ estante, zonas, onCerrar }: Props) {
  const zona = zonas.find((z) => z.id === estante.zona_id);

  const { data: libros = [], isLoading } = useQuery({
    queryKey: ["libros", { estante_id: estante.id }],
    queryFn: () => listarLibros({ estante_id: estante.id }),
  });

  const [orden, setOrden] = useState<string[]>([]);
  useEffect(() => { setOrden(libros.map((l) => l.id)); }, [libros]);

  // ── Niveles ("pisos") — 1..N de abajo hacia arriba ──────────────────────────
  const niveles = [...estante.niveles].sort((a, b) => a.numero - b.numero);
  const [nivelSelId, setNivelSelId] = useState<string | null>(niveles[0]?.id ?? null);
  // Al cambiar de estante, volver al Nivel 1 (el primero).
  useEffect(() => {
    setNivelSelId(estante.niveles.length ? [...estante.niveles].sort((a, b) => a.numero - b.numero)[0].id : null);
  }, [estante.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const nivelSel = niveles.find((n) => n.id === nivelSelId) ?? niveles[0] ?? null;
  const nivelIdx = nivelSel ? niveles.findIndex((n) => n.id === nivelSel.id) : -1;
  const contarNivel = (id: string) => libros.filter((l) => l.nivel_id === id).length;
  const subirNivel = () => { if (nivelIdx < niveles.length - 1) setNivelSelId(niveles[nivelIdx + 1].id); };
  const bajarNivel = () => { if (nivelIdx > 0) setNivelSelId(niveles[nivelIdx - 1].id); };

  const [busqueda, setBusqueda] = useState("");
  const [selectedLibro, setSelectedLibro] = useState<Libro | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const dragFromIdx = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const filtro = busqueda.trim().toLowerCase();

  const librosOrdenados: Libro[] = orden
    .map((id) => libros.find((l) => l.id === id))
    .filter((l): l is Libro => !!l);

  // Libros del nivel seleccionado (o todos si el estante no tiene niveles).
  const librosNivel = nivelSel
    ? librosOrdenados.filter((l) => l.nivel_id === nivelSel.id)
    : librosOrdenados;

  const librosMostrados = filtro
    ? librosNivel.filter(
        (l) =>
          l.titulo.toLowerCase().includes(filtro) ||
          l.autor.toLowerCase().includes(filtro),
      )
    : librosNivel;

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [filtro]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cerrar popover al hacer clic fuera.
  useEffect(() => {
    if (!selectedLibro) return;
    function handleOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelectedLibro(null);
        setPopoverPos(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [selectedLibro]);

  const canDrag = !filtro;

  function onDragStart(idx: number) { dragFromIdx.current = idx; }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function onDrop(toIdx: number) {
    const from = dragFromIdx.current;
    if (from === null || from === toIdx) return;
    const o = [...orden];
    o.splice(toIdx, 0, o.splice(from, 1)[0]);
    setOrden(o);
  }

  function onDragEnd() {
    dragFromIdx.current = null;
    setDragOverIdx(null);
  }

  function handleLomoClick(e: React.MouseEvent<HTMLButtonElement>, libro: Libro) {
    // Ignorar si fue un drag real (HTML5 suprime click, pero por si acaso).
    if (dragFromIdx.current !== null) return;
    if (selectedLibro?.id === libro.id) {
      setSelectedLibro(null);
      setPopoverPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedLibro(libro);
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg shadow-stone-900/8">
      {/* ── Cabecera ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/80 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-unla px-2 py-0.5 text-xs font-semibold text-white shadow-sm shadow-unla/30">
            <MapPin className="h-3 w-3" />
            {estante.codigo}
          </span>
          {estante.etiqueta && (
            <span className="font-serif text-xs font-semibold text-stone-800">{estante.etiqueta}</span>
          )}
          {zona && <span className="text-xs text-stone-500">· {zona.nombre}</span>}
        </div>
        <button
          onClick={onCerrar}
          title="Cerrar panel"
          className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Cuerpo ───────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 divide-x divide-stone-100">
        {/* Izquierda: navegador de niveles ("pisos") */}
        <div className="flex w-32 shrink-0 flex-col overflow-hidden p-2">
          <div className="mb-1.5 flex items-center gap-1 px-1">
            <Layers className="h-3 w-3 text-stone-400" />
            <p className="text-[10px] font-medium uppercase tracking-widest text-stone-400">Niveles</p>
          </div>

          {niveles.length === 0 ? (
            <p className="px-1 text-[11px] text-stone-400">Este estante no tiene niveles.</p>
          ) : (
            <>
              <button
                onClick={subirNivel}
                disabled={nivelIdx >= niveles.length - 1}
                title="Subir un nivel"
                className="mb-2 flex items-center justify-center rounded-md border border-stone-200 py-1 text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>

              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-0.5">
                {[...niveles].reverse().map((n) => {
                  const activo = nivelSel?.id === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => setNivelSelId(n.id)}
                      title={n.etiqueta ?? `Nivel ${n.numero}`}
                      className={cn(
                        "flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-left transition-all",
                        activo
                          ? "border-unla bg-unla/10 shadow-sm"
                          : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className={cn("block text-xs font-semibold", activo ? "text-unla" : "text-stone-700")}>
                          Nivel {n.numero}
                        </span>
                        {n.etiqueta && (
                          <span className="block truncate text-[10px] leading-tight text-stone-400">{n.etiqueta}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-stone-400">{contarNivel(n.id)}</span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={bajarNivel}
                disabled={nivelIdx <= 0}
                title="Bajar un nivel"
                className="mt-2 flex items-center justify-center rounded-md border border-stone-200 py-1 text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <div className="mt-2 border-t border-stone-100 pt-1.5 px-1">
            <p className="text-[10px] text-stone-400">
              Zona: <span className="font-medium text-stone-600">{zona?.nombre ?? "—"}</span>
            </p>
          </div>
        </div>

        {/* Centro: buscador + repisa */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 transition-all focus-within:border-unla/40 focus-within:ring-2 focus-within:ring-unla/15">
            <Search className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <input
              ref={inputRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={nivelSel ? `Buscar en el Nivel ${nivelSel.numero}…` : "Buscar…"}
              className="min-w-0 flex-1 bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="shrink-0 text-stone-400 hover:text-stone-700">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {isLoading && (
            <div className="flex flex-1 items-center gap-2 text-xs text-stone-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando libros…
            </div>
          )}
          {!isLoading && !filtro && librosNivel.length === 0 && (
            <p className="flex-1 py-3 text-center text-xs text-stone-400">
              {nivelSel ? `El Nivel ${nivelSel.numero} no tiene libros.` : "Este estante no tiene libros asignados."}
            </p>
          )}
          {!isLoading && filtro && librosMostrados.length === 0 && (
            <p className="py-3 text-center text-xs text-stone-400">
              Sin coincidencias para "{busqueda}".
            </p>
          )}

          {/* Repisa de lomos */}
          {!isLoading && librosMostrados.length > 0 && (
            <div>
              <div className="rounded-t-lg bg-gradient-to-b from-stone-50 to-stone-100 px-3 pt-4">
                <div ref={scrollRef} className="flex items-end gap-1.5 overflow-x-auto pb-0">
                  {librosMostrados.map((libro, idx) => {
                    const lomo = colorLomo(libro.id);
                    const altura = altoLomo(libro.id) * 1.25;
                    const isSelected = selectedLibro?.id === libro.id;
                    const isDropTarget = canDrag && dragOverIdx === idx;
                    return (
                      <button
                        key={libro.id}
                        draggable={canDrag}
                        onDragStart={() => onDragStart(idx)}
                        onDragOver={(e) => canDrag && onDragOver(e, idx)}
                        onDrop={() => canDrag && onDrop(idx)}
                        onDragEnd={onDragEnd}
                        onClick={(e) => handleLomoClick(e, libro)}
                        title={libro.titulo}
                        style={{
                          height: `${altura}px`,
                          background: `linear-gradient(90deg, ${lomo.edge} 0%, ${lomo.spine} 22%, ${lomo.spine} 78%, ${lomo.edge} 100%)`,
                          color: lomo.ink,
                        }}
                        className={cn(
                          "relative flex w-7 shrink-0 cursor-pointer items-center justify-center rounded-t-sm pb-1 pt-1.5 shadow-sm transition-all duration-200",
                          isSelected
                            ? "-translate-y-3 ring-2 ring-blue-500 ring-offset-1 ring-offset-stone-100 shadow-lg"
                            : filtro
                            ? "-translate-y-1.5 ring-2 ring-ambar ring-offset-1 ring-offset-stone-100 shadow-md"
                            : "ring-1 ring-black/10 hover:-translate-y-1 hover:shadow-md",
                          isDropTarget && "scale-x-110 ring-2 ring-sky-400",
                        )}
                      >
                        <span
                          className="max-h-full truncate px-0.5 font-serif text-[9px] font-medium leading-none"
                          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                        >
                          {libro.titulo}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="shelf-wood h-2 rounded-b-lg" />
              <div className="mt-1 flex items-center gap-3 text-[10px] text-stone-400">
                {!filtro && librosNivel.length > 1 && (
                  <span className="flex items-center gap-1">
                    <GripHorizontal className="h-2.5 w-2.5" />
                    Arrastrá para reordenar
                  </span>
                )}
                {filtro && (
                  <span>{librosMostrados.length} de {librosNivel.length} coinciden</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Popover del libro seleccionado (fixed, sobre el lomo) ───────────── */}
      {selectedLibro && popoverPos && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            left: popoverPos.x,
            top: popoverPos.y - 10,
            transform: "translate(-50%, -100%)",
            zIndex: 200,
          }}
          className="w-52 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl shadow-stone-900/20"
        >
          {/* Flecha apuntando hacia abajo */}
          <div
            className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-stone-200 bg-white"
          />

          <div className="flex items-start justify-between gap-1">
            <p className="font-serif text-sm font-bold leading-snug text-stone-900">
              {selectedLibro.titulo}
            </p>
            <button
              onClick={() => { setSelectedLibro(null); setPopoverPos(null); }}
              className="mt-0.5 shrink-0 rounded p-0.5 text-stone-300 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 space-y-0.5 text-xs">
            <p className="text-stone-700">{selectedLibro.autor}</p>
            <p className="text-stone-400">{selectedLibro.editorial}</p>
            {selectedLibro.precio && (
              <p className="text-stone-500">{selectedLibro.precio}</p>
            )}
            {selectedLibro.coleccion_nombre && (
              <p className="mt-1 text-stone-400">{selectedLibro.coleccion_nombre}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
