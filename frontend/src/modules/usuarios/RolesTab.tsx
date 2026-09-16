import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldPlus, Pencil, Trash2, Loader2, Lock } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Modal } from "@/shared/components/ui/Modal";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import type { Rol, PermisoInfo } from "@/shared/types";
import { listarRoles, listarPermisos, crearRol, actualizarRol, eliminarRol } from "./api";

export function RolesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const [editando, setEditando] = useState<Rol | null>(null);
  const [creando, setCreando] = useState(false);

  const { data: roles, isLoading, isError } = useQuery({ queryKey: ["roles"], queryFn: listarRoles });
  const { data: permisos } = useQuery({ queryKey: ["permisos"], queryFn: listarPermisos });

  const eliminar = useMutation({
    mutationFn: (r: Rol) => eliminarRol(r.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Rol eliminado");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el rol"),
  });

  async function pedirEliminar(r: Rol) {
    const ok = await confirmar({
      titulo: "Eliminar rol",
      mensaje: <span>¿Seguro que querés eliminar el rol <strong>{r.nombre}</strong>?</span>,
    });
    if (ok) eliminar.mutate(r);
  }

  // Etiqueta legible de cada permiso (para el resumen de la tabla).
  const etiqueta = useMemo(() => {
    const m = new Map<string, string>();
    permisos?.forEach((p) => m.set(p.key, p.etiqueta));
    return m;
  }, [permisos]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-stone-500">
          Los roles agrupan permisos. Asigná un rol a cada usuario para acotar qué puede hacer.
        </p>
        <Button onClick={() => setCreando(true)}>
          <ShieldPlus className="h-4 w-4" /> Nuevo rol
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-papel/60 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Rol</th>
                <th className="px-5 py-3 font-semibold">Permisos</th>
                <th className="px-5 py-3 font-semibold">Usuarios</th>
                <th className="px-5 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {isError && (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-red-600">No se pudieron cargar los roles.</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-stone-500">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</span>
                </td></tr>
              )}
              {roles?.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-stone-50">
                  <td className="px-5 py-3">
                    <p className="flex items-center gap-1.5 font-medium text-stone-800">
                      {r.nombre}
                      {r.es_sistema && <Lock className="h-3.5 w-3.5 text-stone-400" aria-label="Rol de sistema" />}
                    </p>
                    {r.descripcion && <p className="text-xs text-stone-400">{r.descripcion}</p>}
                  </td>
                  <td className="px-5 py-3">
                    {r.es_sistema ? (
                      <span className="text-stone-500">Acceso total</span>
                    ) : r.permisos.length === 0 ? (
                      <span className="text-stone-400">Sin permisos</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.permisos.map((p) => (
                          <span key={p} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                            {etiqueta.get(p) ?? p}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-stone-600">{r.usuarios_count}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditando(r)}
                        disabled={r.es_sistema}
                        className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-unla disabled:cursor-not-allowed disabled:opacity-40"
                        title={r.es_sistema ? "El rol de sistema no se edita" : "Editar"}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => pedirEliminar(r)}
                        disabled={r.es_sistema || r.usuarios_count > 0}
                        className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          r.es_sistema
                            ? "El rol de sistema no se elimina"
                            : r.usuarios_count > 0
                            ? "Tiene usuarios asignados"
                            : "Eliminar"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {roles?.length === 0 && !isLoading && (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-stone-500">No hay roles cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(creando || editando) && (
        <RolFormModal
          rol={editando}
          permisos={permisos ?? []}
          onClose={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </>
  );
}

function RolFormModal({
  rol,
  permisos,
  onClose,
}: {
  rol: Rol | null;
  permisos: PermisoInfo[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const esEdicion = !!rol;

  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(rol?.permisos ?? []));

  // Permisos agrupados por su "grupo" (Contenido / Administración).
  const grupos = useMemo(() => {
    const m = new Map<string, PermisoInfo[]>();
    permisos.forEach((p) => {
      const arr = m.get(p.grupo) ?? [];
      arr.push(p);
      m.set(p.grupo, arr);
    });
    return [...m.entries()];
  }, [permisos]);

  function toggle(key: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { nombre: nombre.trim(), descripcion: descripcion || null, permisos: [...seleccion] };
      return esEdicion ? actualizarRol(rol!.id, payload) : crearRol(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success(esEdicion ? "Rol actualizado" : "Rol creado");
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo guardar el rol"),
  });

  const puedeGuardar = nombre.trim().length >= 2 && !guardar.isPending;

  return (
    <Modal abierto onClose={onClose} titulo={esEdicion ? "Editar rol" : "Nuevo rol"} ancho="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (puedeGuardar) guardar.mutate(); }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-stone-700">Nombre <span className="text-unla">*</span></span>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Bibliotecario" autoFocus />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-stone-700">Descripción</span>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué sirve este rol" />
        </label>

        <div>
          <span className="mb-2 block text-sm font-semibold text-stone-700">Permisos</span>
          <div className="space-y-4">
            {grupos.map(([grupo, items]) => (
              <div key={grupo}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{grupo}</p>
                <div className="space-y-1.5">
                  {items.map((p) => (
                    <label
                      key={p.key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 transition-colors hover:bg-stone-50"
                    >
                      <input
                        type="checkbox"
                        checked={seleccion.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-unla focus:ring-unla/40"
                      />
                      <span>
                        <span className="block text-sm font-medium text-stone-800">{p.etiqueta}</span>
                        <span className="block text-xs text-stone-500">{p.descripcion}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!puedeGuardar}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {esEdicion ? "Guardar cambios" : "Crear rol"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
