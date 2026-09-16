import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, BookOpen, Map, LibrarySquare, Upload, Settings, ScrollText, LogOut } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthContext";
import { cn } from "@/lib/utils";

// Navegación del panel. `permiso` = permiso(s) que habilitan el ítem; el
// Dashboard no lleva (visible para cualquier sesión). Configuración se muestra si
// el usuario puede editar ajustes O administrar usuarios/roles.
const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, permiso: [] as string[] },
  { to: "/admin/catalogo", label: "Catálogo", icon: BookOpen, permiso: ["catalogo.gestionar"] },
  { to: "/admin/estantes", label: "Estantes", icon: LibrarySquare, permiso: ["estantes.gestionar"] },
  { to: "/admin/mapa", label: "Mapa", icon: Map, permiso: ["mapa.gestionar"] },
  { to: "/admin/importar", label: "Importar", icon: Upload, permiso: ["importar.ejecutar"] },
  { to: "/admin/registros", label: "Registros", icon: ScrollText, permiso: ["registros.ver"] },
  { to: "/admin/configuracion", label: "Configuración", icon: Settings, permiso: ["configuracion.editar", "usuarios.gestionar"] },
];

export function AdminLayout() {
  const { usuario, logout, tienePermiso } = useAuth();
  const iniciales = (usuario?.nombre ?? usuario?.username ?? "?").slice(0, 2).toUpperCase();

  // Solo se muestran los ítems para los que el usuario tiene permiso.
  const visibles = nav.filter((n) => n.permiso.length === 0 || tienePermiso(...n.permiso));

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="sidebar-texture flex w-64 shrink-0 flex-col text-slate-300">
        {/* Marca */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <img
            src="/logo-librapp.png"
            alt="LibrApp"
            className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-black/30 ring-1 ring-white/10"
          />
          <div>
            <p className="font-serif text-base font-bold leading-tight text-white">LibrApp</p>
            <p className="text-[11px] tracking-wide text-slate-400">Librería Rodolfo Walsh</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Gestión
          </p>
          {visibles.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-unla text-white shadow-md shadow-black/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Indicador bordó del ítem activo */}
                  <span
                    className={cn(
                      "absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-ambar transition-all",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Usuario */}
        <div className="border-t border-white/10 p-3">
          <div className="mb-1 flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/15">
              {iniciales}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{usuario?.nombre ?? usuario?.username}</p>
              <p className="text-xs capitalize text-slate-400">{usuario?.rol}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
