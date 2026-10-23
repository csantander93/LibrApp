import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import { ColorPicker } from "@/shared/components/ui/ColorPicker";
import type { Estante, Zona } from "@/shared/types";
import {
  crearEstante, actualizarEstante, listarColecciones, crearColeccion,
  urlFotoEstante, subirFotosEstante, eliminarFotoEstante,
  type EstanteInput,
} from "./api";

/** Tope de fotos de referencia por estante (coincide con el backend). */
const MAX_FOTOS_ESTANTE = 8;

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
  const [coleccionId, setColeccionId] = useState<string | null>(estante?.coleccion_id ?? null);
  const [color, setColor] = useState<string | null>(estante?.color ?? null);
  const [niveles, setNiveles] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [creandoCat, setCreandoCat] = useState(false);
  const [nuevaCat, setNuevaCat] = useState("");

  // Fotos de referencia (solo en edición). Cambios diferidos: se aplican al Guardar.
  const [fotosABorrar, setFotosABorrar] = useState<string[]>([]);
  const [fotosNuevas, setFotosNuevas] = useState<File[]>([]);
  const fotosActuales = (estante?.fotos ?? []).filter((id) => !fotosABorrar.includes(id));
  const totalFotos = fotosActuales.length + fotosNuevas.length;
  // URLs de preview de los archivos nuevos (se liberan al cambiar la lista).
  const previews = useMemo(() => fotosNuevas.map((f) => URL.createObjectURL(f)), [fotosNuevas]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function agregarArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const nuevos = Array.from(lista);
    const cupo = MAX_FOTOS_ESTANTE - totalFotos;
    if (cupo <= 0) {
      toast.error(`Un estante admite hasta ${MAX_FOTOS_ESTANTE} fotos`);
      return;
    }
    if (nuevos.length > cupo) toast.error(`Solo se agregarán ${cupo} foto(s) (tope ${MAX_FOTOS_ESTANTE})`);
    setFotosNuevas((prev) => [...prev, ...nuevos.slice(0, cupo)]);
  }

  const { data: colecciones = [] } = useQuery({
    queryKey: ["colecciones"],
    queryFn: listarColecciones,
  });

  // Alta rápida de categoría (colección) sin salir del form.
  const crearCat = useMutation({
    mutationFn: () => crearColeccion(nuevaCat.trim()),
    onSuccess: (col) => {
      qc.invalidateQueries({ queryKey: ["colecciones"] });
      setColeccionId(col.id);
      setNuevaCat("");
      setCreandoCat(false);
      toast.success("Categoría creada");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudo crear la categoría"),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const base: EstanteInput = {
        codigo: codigo.trim().toUpperCase(),
        etiqueta: etiqueta.trim() || null,
        zona_id: zonaId || null,
        coleccion_id: coleccionId || null,
        color,
      };
      if (esAlta) {
        return crearEstante({ ...base, cantidad_niveles: niveles });
      }
      const guardado = await actualizarEstante(estante!.id, base);
      // Aplicar los cambios de fotos recién al guardar (edición diferida).
      for (const id of fotosABorrar) await eliminarFotoEstante(id);
      if (fotosNuevas.length) await subirFotosEstante(estante!.id, fotosNuevas);
      return guardado;
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
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">Categoría</label>
            {!creandoCat && (
              <button
                type="button"
                onClick={() => setCreandoCat(true)}
                className="flex items-center gap-0.5 text-xs font-medium text-unla hover:text-unla-dark"
              >
                <Plus className="h-3 w-3" /> Nueva categoría
              </button>
            )}
          </div>
          {creandoCat ? (
            <div className="flex items-center gap-2">
              <Input
                value={nuevaCat}
                onChange={(e) => setNuevaCat(e.target.value)}
                placeholder="Ej: Política, Novela, Terror…"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); if (nuevaCat.trim()) crearCat.mutate(); }
                }}
              />
              <Button
                type="button"
                onClick={() => nuevaCat.trim() && crearCat.mutate()}
                disabled={crearCat.isPending || !nuevaCat.trim()}
              >
                {crearCat.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear
              </Button>
              <Button type="button" variant="outline" onClick={() => { setCreandoCat(false); setNuevaCat(""); }}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Select value={coleccionId ?? ""} onChange={(e) => setColeccionId(e.target.value || null)}>
              <option value="">— Sin categoría —</option>
              {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            Los libros de esta categoría se ofrecerán al ubicar en este estante.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Etiqueta</label>
          <Input
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="Nota opcional (ej: Novedades, Ofertas…)"
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

        {!esAlta && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Fotos de referencia</label>
              <span className="text-[11px] text-slate-400">{totalFotos}/{MAX_FOTOS_ESTANTE}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {fotosActuales.map((id) => (
                <div key={id} className="group relative h-28 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                  <img src={urlFotoEstante(id)} alt="Foto del estante" className="h-full w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setFotosABorrar((prev) => [...prev, id])}
                    aria-label="Quitar foto"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {fotosNuevas.map((f, i) => (
                <div key={`nueva-${i}`} className="group relative h-28 overflow-hidden rounded-lg border border-unla/40 bg-stone-100 ring-1 ring-unla/30">
                  <img src={previews[i]} alt={f.name} className="h-full w-full object-contain" />
                  <span className="absolute inset-x-0 bottom-0 bg-unla/80 py-0.5 text-center text-[9px] font-medium text-white">Nueva</span>
                  <button
                    type="button"
                    onClick={() => setFotosNuevas((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Quitar foto nueva"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {totalFotos < MAX_FOTOS_ESTANTE && (
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 bg-stone-50 text-stone-400 transition-colors hover:border-unla/50 hover:text-unla">
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Agregar</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Vistas reales del estante (horizontales o verticales). Los cambios se aplican al guardar.
            </p>
          </div>
        )}

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
