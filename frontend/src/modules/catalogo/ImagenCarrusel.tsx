import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { urlImagenLibro } from "./api";

interface Props {
  /** Ids de las imágenes; la primera es la portada. */
  imagenes: string[];
  alt?: string;
  className?: string;
  /** Alto del visor (clase Tailwind). Por defecto una tapa mediana. */
  altoClase?: string;
  /** Cómo resolver el id de cada imagen a una URL. Por defecto, imagen de libro. */
  resolverUrl?: (id: string) => string;
  /** Ajuste de la imagen dentro del visor:
   *  - "contain" (default): ancho fijo, alto = `altoClase`, sin recortar.
   *  - "cover": llena el marco recortando.
   *  - "natural": respeta la relación de aspecto real de cada imagen (ancha se ve
   *    ancha, vertical se ve vertical), acotada por `maxAltoClase`. */
  ajuste?: "contain" | "cover" | "natural";
  /** Alto máximo en modo "natural" (clase Tailwind). */
  maxAltoClase?: string;
  /** Si se provee, al hacer clic en la imagen (no en las flechas) se ejecuta —
   *  p. ej. para ampliarla en un modal. Las flechas/puntos nunca lo disparan. */
  onAmpliar?: () => void;
}

/**
 * Visor de imágenes: muestra la principal y permite "ir pasando" el resto (una o
 * dos, o más) con flechas y puntos. Solo lectura. Se usa para la galería de un
 * libro (default) y, con `resolverUrl`, para las fotos de referencia de un estante.
 */
export function ImagenCarrusel({
  imagenes, alt, className, altoClase = "h-64",
  resolverUrl = urlImagenLibro, ajuste = "contain", maxAltoClase = "max-h-80",
  onAmpliar,
}: Props) {
  const [idx, setIdx] = useState(0);

  // Si cambia el libro (otra lista de imágenes), volver a la portada.
  useEffect(() => { setIdx(0); }, [imagenes.join(",")]);

  if (imagenes.length === 0) return null;
  const actual = Math.min(idx, imagenes.length - 1);
  const hayVarias = imagenes.length > 1;
  const ir = (delta: number) =>
    setIdx((i) => (i + delta + imagenes.length) % imagenes.length);

  return (
    <div className={cn("group relative overflow-hidden rounded-xl bg-stone-100", className)}>
      <img
        src={resolverUrl(imagenes[actual])}
        alt={alt ? `${alt} — imagen ${actual + 1}` : `Imagen ${actual + 1}`}
        onClick={onAmpliar}
        className={cn(
          onAmpliar && "cursor-zoom-in",
          ajuste === "natural"
            ? cn("mx-auto block h-auto w-auto max-w-full object-contain", maxAltoClase)
            : ajuste === "cover"
            ? "h-full w-full object-cover"
            : cn("w-full object-contain", altoClase),
        )}
      />

      {hayVarias && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ir(-1); }}
            aria-label="Imagen anterior"
            className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur transition-opacity hover:bg-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ir(1); }}
            aria-label="Imagen siguiente"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur transition-opacity hover:bg-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {imagenes.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                aria-label={`Ver imagen ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === actual ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
