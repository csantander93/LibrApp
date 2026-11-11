import { api } from "@/lib/api";
import type { BackupEstado, Configuracion } from "@/shared/types";

export async function obtenerConfiguracion(): Promise<Configuracion> {
  const { data } = await api.get<Configuracion>("/configuracion");
  return data;
}

export async function actualizarConfiguracion(
  input: Partial<Configuracion>,
): Promise<Configuracion> {
  const { data } = await api.put<Configuracion>("/configuracion", input);
  return data;
}

// ─── Respaldo a Google Drive ──────────────────────────────────────────────────

export async function obtenerBackup(): Promise<BackupEstado> {
  const { data } = await api.get<BackupEstado>("/configuracion/backup");
  return data;
}

export async function actualizarBackup(
  input: Partial<Pick<BackupEstado, "habilitado" | "hora_utc" | "retencion">>,
): Promise<BackupEstado> {
  const { data } = await api.put<BackupEstado>("/configuracion/backup", input);
  return data;
}

/** Arranca el flujo OAuth: pide la URL de consentimiento y navega a Google. */
export async function conectarDrive(): Promise<void> {
  const { data } = await api.get<{ url: string }>("/configuracion/backup/oauth/url");
  window.location.href = data.url;
}

export async function desconectarDrive(): Promise<BackupEstado> {
  const { data } = await api.post<BackupEstado>("/configuracion/backup/desconectar");
  return data;
}

export async function ejecutarBackup(): Promise<{ status: string; nombre?: string; borrados?: number }> {
  const { data } = await api.post("/configuracion/backup/run");
  return data;
}

/** Descarga un dump completo de la base (.sql.gz) — incluye las imágenes. */
export async function descargarBackup(): Promise<void> {
  const { data, headers } = await api.get("/configuracion/backup/descargar", {
    responseType: "blob",
  });
  const disp = (headers["content-disposition"] as string | undefined) ?? "";
  const match = disp.match(/filename="?([^"]+)"?/);
  const nombre = match?.[1] ?? "librapp_backup.sql.gz";
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
