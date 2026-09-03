import { api } from "@/lib/api";
import type { Configuracion } from "@/shared/types";

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
