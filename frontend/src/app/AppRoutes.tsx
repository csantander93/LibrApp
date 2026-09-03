import { Routes, Route, Navigate } from "react-router-dom";
import { PublicSearchPage } from "@/modules/public/PublicSearchPage";
import { LoginPage } from "@/modules/auth/LoginPage";
import { ProtectedRoute } from "@/shared/components/ProtectedRoute";
import { AdminLayout } from "@/shared/components/AdminLayout";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { CatalogoPage } from "@/modules/catalogo/CatalogoPage";
import { EstantesPage } from "@/modules/catalogo/EstantesPage";
import { ImportarPage } from "@/modules/catalogo/ImportarPage";
import { MapaEditorPage } from "@/modules/mapa/MapaEditorPage";
import { ConfiguracionPage } from "@/modules/configuracion/ConfiguracionPage";

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
        <Route path="catalogo" element={<CatalogoPage />} />
        <Route path="estantes" element={<EstantesPage />} />
        <Route path="mapa" element={<MapaEditorPage />} />
        <Route path="importar" element={<ImportarPage />} />
        <Route path="configuracion" element={<ConfiguracionPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
