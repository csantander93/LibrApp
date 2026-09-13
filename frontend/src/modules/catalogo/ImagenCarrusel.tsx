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
}

/**
 * Visor de imágenes de un libro: muestra la portada como principal y permite
 * "ir pasando" el resto (una o dos, o más) con flechas y puntos. Solo lectura;
 * se usa tanto en el detalle admin como en la vista pública.
 */
export function ImagenCarrusel({ imagenes, alt, className, altoClase = "h-64" }: Props) {
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
        src={urlImagenLibro(imagenes[actual])}
        alt={alt ? `${alt} — imagen ${actual + 1}` : `Imagen ${actual + 1}`}
        className={cn("w-full object-contain", altoClase)}
      />

      {hayVarias && (
        <>
          <button
            type="button"
            onClick={() => ir(-1)}
            aria-label="Imagen anterior"
            className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur transition-opacity hover:bg-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => ir(1)}
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
                onClick={() => setIdx(i)}
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
