import { api } from "@/lib/api";
import type { Page, LogAcceso, LogAccion, LogsFilter } from "@/shared/types";

function buildParams(f: LogsFilter): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (f.desde) params.desde = f.desde;
  if (f.hasta) params.hasta = f.hasta;
  if (f.usuario) params.usuario = f.usuario;
  params.page = f.page ?? 1;
  params.size = f.size ?? 20;
  return params;
}

export async function listarAccesos(filter: LogsFilter = {}): Promise<Page<LogAcceso>> {
  const { data } = await api.get<Page<LogAcceso>>("/auditoria/accesos", { params: buildParams(filter) });
  return data;
}

export async function listarAcciones(filter: LogsFilter = {}): Promise<Page<LogAccion>> {
  const { data } = await api.get<Page<LogAccion>>("/auditoria/acciones", { params: buildParams(filter) });
  return data;
}
