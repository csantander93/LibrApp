import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  ScrollText, Search, RefreshCw, ShieldCheck, ShieldAlert, Loader2,
} from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Modal } from "@/shared/components/ui/Modal";
import { TablePagination, PAGE_SIZE_DEFAULT } from "@/shared/components/ui/TablePagination";
import { cn } from "@/lib/utils";
import type { LogAccion, LogsFilter } from "@/shared/types";
import { listarAccesos, listarAcciones } from "./api";

type Tab = "accesos" | "acciones";

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// El backend arma el detalle como "{acción breve} — {campo: antes → después; …}".
// Separamos el resumen (fila) del desglose de cambios (detalle) para que el
// listado no quede sobrecargado.
function parseDetalle(detalle: string): { resumen: string; cambios: string[] } {
  const i = detalle.indexOf(" — ");
  if (i === -1) return { resumen: detalle, cambios: [] };
  const cambios = detalle.slice(i + 3).split("; ").map((s) => s.trim()).filter(Boolean);
  return { resumen: detalle.slice(0, i), cambios };
}

const ACCION_CLASES: Record<string, string> = {
  "Creación": "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "Edición": "bg-blue-50 text-blue-700 ring-blue-600/20",
  "Eliminación": "bg-red-50 text-red-700 ring-red-600/20",
  "Importación": "bg-violet-50 text-violet-700 ring-violet-600/20",
};

function AccionBadge({ accion }: { accion?: string | null }) {
  if (!accion) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        ACCION_CLASES[accion] ?? "bg-stone-100 text-stone-600 ring-stone-500/20",
      )}
    >
      {accion}
    </span>
  );
}

export function LogsPage() {
  const [tab, setTab] = useState<Tab>("acciones");

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-unla/10 text-unla">
          <ScrollText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-900">Registros</h1>
          <p className="text-sm text-stone-500">
            Auditoría de accesos al sistema y de acciones del panel (quién, qué y cuándo).
          </p>
        </div>
      </header>

      {/* Pestañas */}
      <div className="mb-5 flex gap-1 border-b border-stone-200">
        <TabButton activo={tab === "acciones"} onClick={() => setTab("acciones")}>
          Acciones
        </TabButton>
        <TabButton activo={tab === "accesos"} onClick={() => setTab("accesos")}>
          Accesos
        </TabButton>
      </div>

      {tab === "acciones" ? <AccionesTab /> : <AccesosTab />}
    </div>
  );
}

function TabButton({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
        activo
          ? "border-unla text-unla"
          : "border-transparent text-stone-500 hover:text-stone-800",
      )}
    >
      {children}
    </button>
  );
}

/** Hook con el estado de filtros + paginación compartido por ambas pestañas. */
function useLogFiltros() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [usuario, setUsuario] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  // Filtros efectivamente aplicados (se congelan al presionar "Aplicar").
  const [aplicados, setAplicados] = useState<LogsFilter>({});

  const aplicar = () => {
    setPage(1);
    setAplicados({ desde: desde || undefined, hasta: hasta || undefined, usuario: usuario || undefined });
  };

  const cambiarTamano = (n: number) => { setPageSize(n); setPage(1); };

  return {
    desde, setDesde, hasta, setHasta, usuario, setUsuario,
    page, setPage, pageSize, cambiarTamano, aplicados, aplicar,
  };
}

function Filtros({ f }: { f: ReturnType<typeof useLogFiltros> }) {
  return (
    <Card className="mb-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Desde</span>
          <Input type="date" value={f.desde} onChange={(e) => f.setDesde(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Hasta</span>
          <Input type="date" value={f.hasta} onChange={(e) => f.setHasta(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Usuario</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="pl-9"
              placeholder="Usuario o nombre…"
              value={f.usuario}
              onChange={(e) => f.setUsuario(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") f.aplicar(); }}
            />
          </div>
        </label>
        <Button onClick={f.aplicar} className="w-full sm:w-auto">
          <RefreshCw className="h-4 w-4" /> Aplicar
        </Button>
      </div>
    </Card>
  );
}

function EstadoTabla({ loading, error, vacio, colSpan }: { loading: boolean; error: boolean; vacio: boolean; colSpan: number }) {
  let contenido: React.ReactNode = null;
  if (error) contenido = <span className="text-red-600">No se pudieron cargar los registros.</span>;
  else if (loading) contenido = (
    <span className="inline-flex items-center gap-2 text-stone-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
    </span>
  );
  else if (vacio) contenido = <span className="text-stone-500">Sin registros para los filtros aplicados.</span>;
  else return null;
  return (
    <tr>
      <td colSpan={colSpan} className="py-14 text-center text-sm">{contenido}</td>
    </tr>
  );
}

// ─── Pestaña: Acciones ────────────────────────────────────────────────────────

function AccionesTab() {
  const f = useLogFiltros();
  const [sel, setSel] = useState<LogAccion | null>(null);
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["logs", "acciones", f.aplicados, f.page, f.pageSize],
    queryFn: () => listarAcciones({ ...f.aplicados, page: f.page, size: f.pageSize }),
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];

  return (
    <>
      <Filtros f={f} />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-papel/60 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Usuario</th>
                <th className="px-5 py-3 font-semibold">Detalle</th>
                <th className="px-5 py-3 font-semibold">Módulo</th>
                <th className="px-5 py-3 font-semibold">Fecha y hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <EstadoTabla loading={isLoading} error={isError} vacio={items.length === 0} colSpan={4} />
              {items.map((log) => {
                const { resumen, cambios } = parseDetalle(log.detalle);
                return (
                  <tr
                    key={log.id}
                    onClick={() => setSel(log)}
                    className="cursor-pointer align-top transition-colors hover:bg-stone-50"
                    title="Ver detalle completo"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-stone-800">{log.usuario_nombre ?? log.username ?? "—"}</p>
                      {log.usuario_nombre && log.username && (
                        <p className="text-xs text-stone-400">{log.username}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-2">
                        <AccionBadge accion={log.accion} />
                        <div className="min-w-0">
                          <p className="text-stone-800" style={{ overflowWrap: "anywhere" }}>{resumen}</p>
                          {cambios.length > 0 && (
                            <p className="mt-0.5 text-xs text-stone-400">
                              {cambios.length} {cambios.length === 1 ? "cambio" : "cambios"} · clic para ver
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-stone-600">{log.modulo ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-stone-500">{fmtFecha(log.fecha)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <TablePagination
        page={f.page}
        pages={data?.pages ?? 1}
        total={data?.total ?? 0}
        pageSize={f.pageSize}
        onPage={f.setPage}
        onPageSize={f.cambiarTamano}
        unidad="registro"
      />
      {isFetching && !isLoading && <p className="mt-2 text-xs text-stone-400">Actualizando…</p>}

      <AccionDetalleModal log={sel} onClose={() => setSel(null)} />
    </>
  );
}

function AccionDetalleModal({ log, onClose }: { log: LogAccion | null; onClose: () => void }) {
  if (!log) return null;
  const { resumen, cambios } = parseDetalle(log.detalle);
  return (
    <Modal abierto={!!log} onClose={onClose} titulo="Detalle de la acción">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AccionBadge accion={log.accion} />
          <p className="text-sm text-stone-800" style={{ overflowWrap: "anywhere" }}>{resumen}</p>
        </div>

        {cambios.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Cambios ({cambios.length})
            </p>
            <ul className="space-y-1.5">
              {cambios.map((c, i) => {
                const j = c.indexOf(": ");
                const campo = j === -1 ? null : c.slice(0, j);
                const valor = j === -1 ? c : c.slice(j + 2);
                return (
                  <li key={i} className="rounded-lg bg-stone-50 px-3 py-2">
                    {campo && <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{campo}</p>}
                    <p className="text-sm text-stone-800" style={{ overflowWrap: "anywhere" }}>{valor}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-stone-100 pt-3">
          <Campo label="Usuario" valor={log.usuario_nombre} />
          <Campo label="Nombre de usuario" valor={log.username} />
          <Campo label="Módulo" valor={log.modulo} />
          <Campo label="IP" valor={log.ip} mono />
          <Campo label="Fecha y hora" valor={fmtFecha(log.fecha)} />
        </div>
      </div>
    </Modal>
  );
}

function Campo({ label, valor, mono }: { label: string; valor?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={cn("mt-0.5 text-sm text-stone-800", mono && "font-mono")} style={{ overflowWrap: "anywhere" }}>
        {valor || "—"}
      </p>
    </div>
  );
}

// ─── Pestaña: Accesos ─────────────────────────────────────────────────────────

function AccesosTab() {
  const f = useLogFiltros();
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["logs", "accesos", f.aplicados, f.page, f.pageSize],
    queryFn: () => listarAccesos({ ...f.aplicados, page: f.page, size: f.pageSize }),
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];

  return (
    <>
      <Filtros f={f} />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-papel/60 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Usuario</th>
                <th className="px-5 py-3 font-semibold">Resultado</th>
                <th className="px-5 py-3 font-semibold">IP</th>
                <th className="px-5 py-3 font-semibold">Dispositivo</th>
                <th className="px-5 py-3 font-semibold">Fecha y hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <EstadoTabla loading={isLoading} error={isError} vacio={items.length === 0} colSpan={5} />
              {items.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="px-5 py-3 font-medium text-stone-800">{log.username}</td>
                  <td className="px-5 py-3">
                    {log.exito ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <ShieldCheck className="h-4 w-4" /> Exitoso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-red-600">
                        <ShieldAlert className="h-4 w-4" /> Fallido
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-stone-600">{log.ip ?? "—"}</td>
                  <td className="max-w-xs truncate px-5 py-3 text-stone-500" title={log.agente ?? undefined}>
                    {log.agente ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-stone-500">{fmtFecha(log.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <TablePagination
        page={f.page}
        pages={data?.pages ?? 1}
        total={data?.total ?? 0}
        pageSize={f.pageSize}
        onPage={f.setPage}
        onPageSize={f.cambiarTamano}
        unidad="registro"
      />
      {isFetching && !isLoading && <p className="mt-2 text-xs text-stone-400">Actualizando…</p>}
    </>
  );
}
