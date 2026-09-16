import { Routes, Route, Navigate } from "react-router-dom";
import { PublicSearchPage } from "@/modules/public/PublicSearchPage";
import { LoginPage } from "@/modules/auth/LoginPage";
import { ProtectedRoute } from "@/shared/components/ProtectedRoute";
import { RequierePermiso } from "@/shared/components/RequierePermiso";
import { AdminLayout } from "@/shared/components/AdminLayout";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { CatalogoPage } from "@/modules/catalogo/CatalogoPage";
import { EstantesPage } from "@/modules/catalogo/EstantesPage";
import { ImportarPage } from "@/modules/catalogo/ImportarPage";
import { MapaEditorPage } from "@/modules/mapa/MapaEditorPage";
import { ConfiguracionPage } from "@/modules/configuracion/ConfiguracionPage";
import { LogsPage } from "@/modules/auditoria/LogsPage";

export function AppRoutes() {
  return (
    <Routes>
      {/* Público: autoconsulta sin login (RF-07). */}
      <Route path="/" element={<PublicSearchPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Admin: requiere sesión. La primera vista es el Dashboard. */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="catalogo" element={<RequierePermiso permiso="catalogo.gestionar"><CatalogoPage /></RequierePermiso>} />
        <Route path="estantes" element={<RequierePermiso permiso="estantes.gestionar"><EstantesPage /></RequierePermiso>} />
        <Route path="mapa" element={<RequierePermiso permiso="mapa.gestionar"><MapaEditorPage /></RequierePermiso>} />
        <Route path="importar" element={<RequierePermiso permiso="importar.ejecutar"><ImportarPage /></RequierePermiso>} />
        <Route path="registros" element={<RequierePermiso permiso="registros.ver"><LogsPage /></RequierePermiso>} />
        <Route
          path="configuracion"
          element={
            <RequierePermiso permiso={["configuracion.editar", "usuarios.gestionar"]}>
              <ConfiguracionPage />
            </RequierePermiso>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
