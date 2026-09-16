import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/modules/auth/AuthContext";

/**
 * Guard de sección: exige que el usuario tenga al menos uno de los permisos.
 * Si no los tiene, redirige al Dashboard (la vista base del panel). El backend
 * es la fuente de verdad; esto solo evita mostrar pantallas que darían 403.
 */
export function RequierePermiso({
  permiso,
  children,
}: {
  permiso: string | string[];
  children: ReactNode;
}) {
  const { tienePermiso } = useAuth();
  const requeridos = Array.isArray(permiso) ? permiso : [permiso];
  if (!tienePermiso(...requeridos)) {
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
}
