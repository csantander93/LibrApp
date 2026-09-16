import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Select } from "./Select";

/** Opciones de tamaño de página compartidas por las tablas del panel. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const PAGE_SIZE_DEFAULT = 20;

interface Props {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  /** Sustantivo del ítem listado (se pluraliza con "s"). Ej: "libro", "estante". */
  unidad?: string;
}

/**
 * Barra de paginación unificada: total, selector de filas por página
 * (10/20/50/100) y navegación anterior/siguiente. Al cambiar el tamaño, la
 * página vuelve a 1 (responsabilidad del contenedor vía onPageSize).
 */
export function TablePagination({ page, pages, total, pageSize, onPage, onPageSize, unidad = "registro" }: Props) {
  if (total === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <div className="flex items-center gap-2">
        <span>{total} {unidad}{total === 1 ? "" : "s"}</span>
        <span className="text-slate-300">·</span>
        <label className="flex items-center gap-1.5">
          <span>Mostrar</span>
          <Select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="w-20 py-1.5"
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
          <span>por página</span>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-2.5 py-1.5">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[5rem] text-center">Página {page} de {pages}</span>
        <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} className="px-2.5 py-1.5">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
