import { api } from "@/lib/api";
import type {
  Usuario, Rol, RolInput, PermisoInfo,
  UsuarioCreateInput, UsuarioUpdateInput,
} from "@/shared/types";

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function listarRoles(): Promise<Rol[]> {
  const { data } = await api.get<Rol[]>("/roles");
  return data;
}

export async function listarPermisos(): Promise<PermisoInfo[]> {
  const { data } = await api.get<PermisoInfo[]>("/roles/permisos");
  return data;
}

export async function crearRol(input: RolInput): Promise<Rol> {
  const { data } = await api.post<Rol>("/roles", input);
  return data;
}

export async function actualizarRol(id: string, input: Partial<RolInput>): Promise<Rol> {
  const { data } = await api.put<Rol>(`/roles/${id}`, input);
  return data;
}

export async function eliminarRol(id: string): Promise<void> {
  await api.delete(`/roles/${id}`);
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data } = await api.get<Usuario[]>("/usuarios");
  return data;
}

export async function crearUsuario(input: UsuarioCreateInput): Promise<Usuario> {
  const { data } = await api.post<Usuario>("/usuarios", input);
  return data;
}

export async function actualizarUsuario(id: string, input: UsuarioUpdateInput): Promise<Usuario> {
  const { data } = await api.put<Usuario>(`/usuarios/${id}`, input);
  return data;
}

export async function eliminarUsuario(id: string): Promise<void> {
  await api.delete(`/usuarios/${id}`);
}
