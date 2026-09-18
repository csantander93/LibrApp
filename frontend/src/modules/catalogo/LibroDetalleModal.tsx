import { Pencil, MapPinOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/shared/components/ui/Modal";
import { Button } from "@/shared/components/ui/Button";
import { ImagenCarrusel } from "./ImagenCarrusel";
import { listarCampos } from "./api";
import type { Libro, CampoLibro } from "@/shared/types";

/** Formatea el valor de un campo personalizado según su tipo, para mostrarlo. */
function formatearDato(campo: CampoLibro, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo.tipo === "booleano") return valor ? "Sí" : "No";
  if (campo.tipo === "fecha") {
    const d = new Date(`${valor}T00:00:00`);
    return isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("es-AR");
  }
  return String(valor);
}

function formatearPrecio(precio: string | null): string {
  if (precio === null) return "—";
  const n = Number(precio);
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

interface Props {
  libro: Libro | null;
  onClose: () => void;
  /** Si se omite, el modal es de solo lectura (sin botón "Editar"): vista pública. */
  onEditar?: (libro: Libro) => void;
}

export function LibroDetalleModal({ libro, onClose, onEditar }: Props) {
  const { data: campos = [] } = useQuery({ queryKey: ["campos-libro"], queryFn: listarCampos });
  if (!libro) return null;

  // Campos personalizados con valor cargado (respeta el orden de las definiciones).
  const datosExtra = libro.datos_extra ?? {};
  const camposConValor = campos.filter((c) => {
    const v = datosExtra[c.codigo];
    return v !== null && v !== undefined && v !== "";
  });

  const ubicacion = libro.estante_codigo ? (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full bg-unla/10 px-2 py-0.5 text-xs font-medium text-unla">
        {libro.estante_codigo}
      </span>
      {libro.nivel_numero !== null && (
        <span className="text-slate-500">Nivel {libro.nivel_numero}</span>
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      <MapPinOff className="h-3 w-3" /> Sin ubicar
    </span>
  );

  return (
    <Modal abierto onClose={onClose} titulo="Detalle del libro">
      {libro.imagenes.length > 0 && (
        <div className="mb-5">
          <ImagenCarrusel imagenes={libro.imagenes} alt={libro.titulo} />
        </div>
      )}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo etiqueta="Título">
            <span className="font-serif text-base font-semibold text-slate-900">{libro.titulo}</span>
          </Campo>
        </div>
        <Campo etiqueta="Autor">{libro.autor}</Campo>
        <Campo etiqueta="Editorial">{libro.editorial}</Campo>
        <Campo etiqueta="ISBN">{libro.isbn ?? "—"}</Campo>
        <Campo etiqueta="Colección">{libro.coleccion_nombre ?? "—"}</Campo>
        <Campo etiqueta="Ubicación">{ubicacion}</Campo>
        <Campo etiqueta="Precio">
          <span className="tabular-nums">{formatearPrecio(libro.precio)}</span>
        </Campo>

        {/* Campos personalizados (dinámicos) con valor. */}
        {camposConValor.map((campo) => (
          <Campo key={campo.id} etiqueta={campo.etiqueta}>
            {formatearDato(campo, datosExtra[campo.codigo])}
          </Campo>
        ))}
      </dl>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        {onEditar && (
          <Button onClick={() => onEditar(libro)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        )}
      </div>
    </Modal>
  );
}
