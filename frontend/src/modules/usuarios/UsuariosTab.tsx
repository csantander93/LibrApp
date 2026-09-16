import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Pencil, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { Modal } from "@/shared/components/ui/Modal";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useAuth } from "@/modules/auth/AuthContext";
import { cn } from "@/lib/utils";
import type { Usuario, Rol } from "@/shared/types";
import {
  listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario, listarRoles,
} from "./api";

export function UsuariosTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const { usuario: actual } = useAuth();
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [creando, setCreando] = useState(false);

  const { data: usuarios, isLoading, isError } = useQuery({
    queryKey: ["usuarios"],
    queryFn: listarUsuarios,
  });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listarRoles });

  const eliminar = useMutation({
    mutationFn: (u: Usuario) => eliminarUsuario(u.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Usuario eliminado");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el usuario"),
  });

  async function pedirEliminar(u: Usuario) {
    const ok = await confirmar({
      titulo: "Eliminar usuario",
      mensaje: (
        <span>
          ¿Seguro que querés eliminar a <strong>{u.nombre ?? u.username}</strong>? Esta acción no se puede deshacer.
        </span>
      ),
    });
    if (ok) eliminar.mutate(u);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-stone-500">
          Usuarios con acceso al panel. El rol define qué secciones puede usar cada uno.
        </p>
        <Button onClick={() => setCreando(true)}>
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-papel/60 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Usuario</th>
                <th className="px-5 py-3 font-semibold">Rol</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {isError && (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-red-600">No se pudieron cargar los usuarios.</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-stone-500">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</span>
                </td></tr>
              )}
              {usuarios?.map((u) => (
                <tr key={u.id} className="align-middle transition-colors hover:bg-stone-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-stone-800">
                      {u.nombre ?? u.username}
                      {actual?.id === u.id && (
                        <span className="ml-2 rounded-full bg-unla/10 px-2 py-0.5 text-[11px] font-semibold text-unla">vos</span>
                      )}
                    </p>
                    <p className="text-xs text-stone-400">{u.username}</p>
                  </td>
                  <td className="px-5 py-3 text-stone-700">{u.rol ?? "—"}</td>
                  <td className="px-5 py-3">
                    {u.activo ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <ShieldCheck className="h-4 w-4" /> Activo
                      </span>
                    ) : (
                      <span className="text-stone-400">Inactivo</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditando(u)}
                        className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-unla"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => pedirEliminar(u)}
                        disabled={actual?.id === u.id}
                        className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        title={actual?.id === u.id ? "No podés eliminar tu propia cuenta" : "Eliminar"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios?.length === 0 && !isLoading && (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-stone-500">No hay usuarios cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(creando || editando) && (
        <UsuarioFormModal
          usuario={editando}
          roles={roles ?? []}
          onClose={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </>
  );
}

function UsuarioFormModal({
  usuario,
  roles,
  onClose,
}: {
  usuario: Usuario | null;
  roles: Rol[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const esEdicion = !!usuario;

  const [username, setUsername] = useState(usuario?.username ?? "");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [password, setPassword] = useState("");
  const [rolId, setRolId] = useState(usuario?.rol_id ?? roles[0]?.id ?? "");
  const [activo, setActivo] = useState(usuario?.activo ?? true);

  const guardar = useMutation({
    mutationFn: () => {
      if (esEdicion) {
        return actualizarUsuario(usuario!.id, {
          nombre: nombre || null,
          password: password || null,
          rol_id: rolId,
          activo,
        });
      }
      return crearUsuario({
        username: username.trim(),
        nombre: nombre || null,
        password,
        rol_id: rolId,
        activo,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success(esEdicion ? "Usuario actualizado" : "Usuario creado");
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "No se pudo guardar el usuario"),
  });

  const passwordValida = esEdicion ? password.length === 0 || password.length >= 8 : password.length >= 8;
  const puedeGuardar =
    (esEdicion || username.trim().length >= 3) && !!rolId && passwordValida && !guardar.isPending;

  return (
    <Modal abierto onClose={onClose} titulo={esEdicion ? "Editar usuario" : "Nuevo usuario"}>
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (puedeGuardar) guardar.mutate(); }}
      >
        <Campo label="Nombre de usuario" requerido={!esEdicion}>
          <Input
            value={username}
            disabled={esEdicion}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ej: jperez"
            autoFocus={!esEdicion}
          />
          {esEdicion && <Ayuda>El nombre de usuario no se puede cambiar.</Ayuda>}
        </Campo>

        <Campo label="Nombre completo">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Juan Pérez" />
        </Campo>

        <Campo label={esEdicion ? "Nueva contraseña" : "Contraseña"} requerido={!esEdicion}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={esEdicion ? "Dejar vacío para no cambiarla" : "Mínimo 8 caracteres"}
          />
          {!passwordValida && <Ayuda tono="error">La contraseña debe tener al menos 8 caracteres.</Ayuda>}
        </Campo>

        <Campo label="Rol" requerido>
          <Select value={rolId} onChange={(e) => setRolId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </Select>
        </Campo>

        <label className="flex items-center gap-2.5 pt-1">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
          />
          <span className="text-sm text-stone-700">Usuario activo (puede iniciar sesión)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!puedeGuardar}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {esEdicion ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Campo({ label, requerido, children }: { label: string; requerido?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-700">
        {label} {requerido && <span className="text-unla">*</span>}
      </span>
      {children}
    </label>
  );
}

function Ayuda({ children, tono }: { children: React.ReactNode; tono?: "error" }) {
  return <p className={cn("mt-1 text-xs", tono === "error" ? "text-red-600" : "text-stone-400")}>{children}</p>;
}
