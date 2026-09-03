import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, BookMarked, Layers } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { listarLibros } from "@/modules/catalogo/api";
import { colorLomo, altoLomo, cn } from "@/lib/utils";
import type { Estante, Libro } from "@/shared/types";

function formatearPrecio(precio: string | null): string {
  if (precio === null) return "—";
  return Number(precio).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

/** Badge de ubicación reutilizable (RF-07). */
function BadgeUbicacion({ libro }: { libro: Libro }) {
  return libro.estante_codigo ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      Ubicado 📍 {libro.estante_codigo}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      Sin ubicar ⚠️
    </span>
  );
}

/** Popup con los libros de un estante como lomos en una repisa (RF-03). */
export function EstantePopup({
  estante, onClose, mostrarPrecio = true,
}: { estante: Estante; onClose: () => void; mostrarPrecio?: boolean }) {
  const { data: libros, isLoading } = useQuery({
    queryKey: ["libros", { estante_id: estante.id }],
    queryFn: () => listarLibros({ estante_id: estante.id }),
  });

  // Niveles ("pisos") 1..N; por defecto el Nivel 1.
  const niveles = [...estante.niveles].sort((a, b) => a.numero - b.numero);
  const [nivelSelId, setNivelSelId] = useState<string | null>(niveles[0]?.id ?? null);
  const nivelSel = niveles.find((n) => n.id === nivelSelId) ?? niveles[0] ?? null;

  const [selId, setSelId] = useState<string | null>(null);
  // Al cambiar de nivel, deseleccionar el libro para mostrar el primero del nivel.
  useEffect(() => { setSelId(null); }, [nivelSelId]);

  const librosNivel = (libros ?? []).filter(
    (l) => (nivelSel ? l.nivel_id === nivelSel.id : true),
  );
  const seleccionado = librosNivel.find((l) => l.id === selId) ?? librosNivel[0] ?? null;

  return (
    <Modal abierto onClose={onClose} ancho="max-w-2xl" titulo="">
      <div className="-mt-1">
        {/* Encabezado del estante */}
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-unla px-3 py-1 text-sm font-semibold text-white shadow-sm shadow-unla/30">
            <MapPin className="h-4 w-4" /> {estante.codigo}
          </span>
          <div>
            {estante.etiqueta && (
              <p className="font-serif text-base font-semibold text-stone-900">{estante.etiqueta}</p>
            )}
            <p className="text-xs text-stone-500">
              {libros ? `${libros.length} libro(s) en este estante` : "Contenido del estante"}
            </p>
          </div>
        </div>

        {/* Selector de niveles ("pisos") */}
        {niveles.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-stone-400" />
            {[...niveles].reverse().map((n) => {
              const activo = nivelSel?.id === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setNivelSelId(n.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                    activo
                      ? "bg-unla text-white shadow-sm shadow-unla/30"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                  )}
                >
                  Nivel {n.numero}{n.etiqueta ? ` · ${n.etiqueta}` : ""}
                </button>
              );
            })}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando libros…
          </div>
        )}

        {libros && librosNivel.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 bg-papel/60 py-8 text-center text-sm text-stone-400">
            {nivelSel ? `El Nivel ${nivelSel.numero} no tiene libros.` : "Este estante no tiene libros asignados."}
          </p>
        )}

        {libros && librosNivel.length > 0 && (
          <>
            {/* Repisa de madera con lomos */}
            <div className="rounded-t-xl bg-gradient-to-b from-stone-50 to-stone-100 px-3 pt-4">
              <div className="flex items-end gap-[3px] overflow-x-auto pb-0">
                {librosNivel.map((l) => {
                  const lomo = colorLomo(l.id);
                  const activo = seleccionado?.id === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelId(l.id)}
                      title={l.titulo}
                      style={{
                        height: `${altoLomo(l.id) * 1.6}px`,
                        background: `linear-gradient(90deg, ${lomo.edge} 0%, ${lomo.spine} 22%, ${lomo.spine} 78%, ${lomo.edge} 100%)`,
                        color: lomo.ink,
                        animation: "spine-in 0.3s ease both",
                      }}
                      className={cn(
                        "relative flex w-7 shrink-0 items-center justify-center rounded-t-sm pb-1 pt-2 shadow-sm transition-all duration-200",
                        "hover:-translate-y-1 hover:shadow-md",
                        activo
                          ? "-translate-y-1.5 ring-2 ring-ambar ring-offset-2 ring-offset-stone-100"
                          : "ring-1 ring-black/10",
                      )}
                    >
                      <span
                        className="max-h-full truncate px-0.5 font-serif text-[10px] font-medium leading-none"
                        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                      >
                        {l.titulo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Tabla/base de la repisa */}
            <div className="shelf-wood h-3 rounded-b-xl" />

            {/* Popover de detalle del libro seleccionado */}
            {seleccionado && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-papel/70 p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-11 w-8 shrink-0 items-center justify-center rounded-sm shadow-sm ring-1 ring-black/10"
                    style={{ background: colorLomo(seleccionado.id).spine, color: colorLomo(seleccionado.id).ink }}
                  >
                    <BookMarked className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-lg font-bold leading-snug text-stone-900">
                      {seleccionado.titulo}
                    </h3>
                    <p className="text-sm text-stone-600">{seleccionado.autor}</p>
                    <div className="mt-2">
                      <BadgeUbicacion libro={seleccionado} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-stone-400">Editorial</dt>
                        <dd className="font-medium text-stone-800">{seleccionado.editorial || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-stone-400">ISBN</dt>
                        <dd className="font-medium tabular-nums text-stone-800">{seleccionado.isbn || "—"}</dd>
                      </div>
                      {seleccionado.coleccion_nombre && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-stone-400">Colección</dt>
                          <dd className="font-medium text-stone-800">{seleccionado.coleccion_nombre}</dd>
                        </div>
                      )}
                      {mostrarPrecio && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-stone-400">Precio</dt>
                          <dd className="font-serif font-semibold text-unla">
                            {formatearPrecio(seleccionado.precio)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
