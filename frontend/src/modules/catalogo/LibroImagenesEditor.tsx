import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/shared/components/ui/Toast";
import {
  urlImagenLibro, subirImagenesLibro, eliminarImagenLibro, hacerPrincipalImagen,
} from "./api";

const MAX_IMAGENES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  /** Id del libro en edición, o null en el alta (imágenes pendientes). */
  libroId: string | null;
  /** Ids de imágenes ya cargadas (solo edición). */
  imagenesIniciales: string[];
  /** Archivos pendientes de subir tras crear el libro (solo alta). */
  pendingFiles: File[];
  onPendingChange: (files: File[]) => void;
}

/**
 * Gestor de imágenes del libro. En edición opera contra el backend al instante
 * (subir / borrar / marcar portada). En el alta acumula los archivos y los sube
 * el formulario recién creado el libro. La primera imagen es la portada.
 */
export function LibroImagenesEditor({ libroId, imagenesIniciales, pendingFiles, onPendingChange }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imagenes, setImagenes] = useState<string[]>(imagenesIniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);

  const esAlta = libroId === null;

  // Reinicia el estado local cuando cambia el libro objetivo.
  useEffect(() => { setImagenes(imagenesIniciales); }, [libroId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Previews de los archivos pendientes (alta): object URLs revocadas al cambiar.
  const previews = useMemo(
    () => pendingFiles.map((f) => URL.createObjectURL(f)),
    [pendingFiles],
  );
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const total = esAlta ? pendingFiles.length : imagenes.length;

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["libros"] });
    qc.invalidateQueries({ queryKey: ["public-libros"] });
  }

  function validar(archivos: File[]): File[] {
    const validos: File[] = [];
    for (const f of archivos) {
      if (!f.type.startsWith("image/")) {
        toast.error(`"${f.name}" no es una imagen`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" supera los 5 MB`);
        continue;
      }
      validos.push(f);
    }
    const cupo = MAX_IMAGENES - total;
    if (validos.length > cupo) {
      toast.error(`Máximo ${MAX_IMAGENES} imágenes por libro`);
      return validos.slice(0, Math.max(0, cupo));
    }
    return validos;
  }

  async function onElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = validar(Array.from(e.target.files ?? []));
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (archivos.length === 0) return;

    if (esAlta) {
      onPendingChange([...pendingFiles, ...archivos]);
      return;
    }
    setSubiendo(true);
    try {
      const creadas = await subirImagenesLibro(libroId!, archivos);
      setImagenes((prev) => [...prev, ...creadas.map((i) => i.id)]);
      invalidar();
    } catch {
      toast.error("No se pudieron subir las imágenes");
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(idOrIndex: string | number) {
    if (esAlta && typeof idOrIndex === "number") {
      onPendingChange(pendingFiles.filter((_, i) => i !== idOrIndex));
      return;
    }
    const id = idOrIndex as string;
    setOcupadaId(id);
    try {
      await eliminarImagenLibro(id);
      setImagenes((prev) => prev.filter((x) => x !== id));
      invalidar();
    } catch {
      toast.error("No se pudo eliminar la imagen");
    } finally {
      setOcupadaId(null);
    }
  }

  async function hacerPortada(idOrIndex: string | number) {
    if (esAlta && typeof idOrIndex === "number") {
      const i = idOrIndex;
      onPendingChange([pendingFiles[i], ...pendingFiles.filter((_, j) => j !== i)]);
      return;
    }
    const id = idOrIndex as string;
    setOcupadaId(id);
    try {
      await hacerPrincipalImagen(id);
      setImagenes((prev) => [id, ...prev.filter((x) => x !== id)]);
      invalidar();
    } catch {
      toast.error("No se pudo definir la portada");
    } finally {
      setOcupadaId(null);
    }
  }

  // Ítems unificados para render (edición usa ids; alta usa índices).
  const items = esAlta
    ? previews.map((src, i) => ({ key: `p${i}`, src, ref: i as number, ocupada: false }))
    : imagenes.map((id) => ({ key: id, src: urlImagenLibro(id), ref: id as string, ocupada: ocupadaId === id }));

  const completo = total >= MAX_IMAGENES;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700">Imágenes</label>
        <span className="text-xs text-slate-400">{total}/{MAX_IMAGENES}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => {
          const esPortada = i === 0;
          return (
            <div
              key={it.key}
              className="group relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-50"
            >
              <img src={it.src} alt="" className="h-full w-full object-cover" />

              {esPortada && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-unla px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm">
                  <Star className="h-2.5 w-2.5 fill-current" /> Portada
                </span>
              )}

              {it.ocupada && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2 className="h-4 w-4 animate-spin text-unla" />
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!esPortada && (
                  <button
                    type="button"
                    onClick={() => hacerPortada(it.ref)}
                    title="Marcar como portada"
                    className="rounded p-1 text-white hover:bg-white/20"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => borrar(it.ref)}
                  title="Eliminar imagen"
                  className="rounded p-1 text-white hover:bg-white/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {!completo && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className={cn(
              "flex h-24 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 text-stone-400 transition-colors hover:border-unla/50 hover:text-unla",
              subiendo && "opacity-60",
            )}
          >
            {subiendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[10px]">Agregar</span>
          </button>
        )}
      </div>

      {total === 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
          <X className="h-3 w-3" /> Sin imágenes (opcional). La primera será la portada.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onElegir}
        className="hidden"
      />
    </div>
  );
}
