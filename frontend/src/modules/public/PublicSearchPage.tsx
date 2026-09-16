import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Lock } from "lucide-react";
import { Select } from "@/shared/components/ui/Select";
import { listarLibros, listarEstantes, listarZonas, listarAnotaciones } from "@/modules/catalogo/api";
import { MapaCanvas } from "@/modules/mapa/MapaCanvas";
import { EstantePanelInline } from "@/modules/mapa/EstantePanelInline";
import { cn } from "@/lib/utils";
import type { Estante } from "@/shared/types";

export function PublicSearchPage() {
  const [texto, setTexto] = useState("");
  const [estantePanel, setEstantePanel] = useState<Estante | null>(null);
  const [zonaId, setZonaId] = useState("");
  // Búsqueda desde 2 caracteres (CU-01).
  const q = texto.trim().length >= 2 ? texto.trim() : "";

  const { data: libros } = useQuery({
    queryKey: ["public-libros", q],
    queryFn: () => listarLibros(q ? { q } : {}),
  });
  const { data: estantes = [] } = useQuery({ queryKey: ["estantes"], queryFn: listarEstantes });
  const { data: zonas = [] } = useQuery({ queryKey: ["zonas"], queryFn: listarZonas });
  const { data: anotaciones = [] } = useQuery({ queryKey: ["anotaciones"], queryFn: listarAnotaciones });

  // Zona por defecto: la primera.
  useEffect(() => {
    if (!zonaId && zonas.length) setZonaId(zonas[0].id);
  }, [zonas, zonaId]);

  // RF-13: resaltar en el plano los estantes que contienen resultados de la búsqueda.
  const resaltados = useMemo(() => {
    if (!q || !libros) return new Set<string>();
    return new Set(libros.map((l) => l.estante_id).filter((id): id is string => !!id));
  }, [q, libros]);

  // Estantes de la zona seleccionada (RF-11: mapa multi-piso).
  const estantesZona = useMemo(
    () => estantes.filter((e) => (zonaId ? e.zona_id === zonaId : true)),
    [estantes, zonaId],
  );
  const anotacionesZona = useMemo(
    () => anotaciones.filter((a) => (zonaId ? a.zona_id === zonaId : true)),
    [anotaciones, zonaId],
  );
  const zonaActual = zonas.find((z) => z.id === zonaId) ?? null;

  // Zonas que contienen coincidencias (para orientar cuando están en otro piso).
  const zonasConMatch = useMemo(() => {
    if (resaltados.size === 0) return [];
    return zonas.filter((z) => estantes.some((e) => e.zona_id === z.id && resaltados.has(e.id)));
  }, [zonas, estantes, resaltados]);

  return (
    <div className="min-h-full">
      {/* Barra superior institucional */}
      <div className="border-b border-stone-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-librapp.png"
              alt="LibrApp"
              className="h-9 w-9 rounded-xl object-cover shadow-sm shadow-black/20"
            />
            <div>
              <p className="font-serif text-sm font-bold leading-tight text-stone-900">LibrApp</p>
              <p className="text-[11px] text-stone-500">Librería Rodolfo Walsh — UNLa</p>
            </div>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-unla"
          >
            <Lock className="h-3.5 w-3.5" /> Acceso administrador
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Buscador */}
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-lg shadow-stone-900/5 ring-1 ring-black/[0.02] focus-within:border-unla/40 focus-within:ring-2 focus-within:ring-unla/20">
          <Search className="ml-2 h-5 w-5 shrink-0 text-stone-400" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por título, autor, editorial o ISBN…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
        </div>

        {/* Encabezado del mapa */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold text-stone-900">Mapa de la sala</h2>
          {zonas.length > 1 && (
            <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className="w-44">
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </Select>
          )}
        </div>

        {/* Pista: coincidencias en otra zona */}
        {zonasConMatch.length > 0 && !zonasConMatch.some((z) => z.id === zonaId) && (
          <p className="mb-2 rounded-lg bg-unla/10 px-3 py-2 text-xs font-medium text-unla">
            Hay coincidencias en: {zonasConMatch.map((z) => z.nombre).join(", ")}. Cambiá de zona para verlas.
          </p>
        )}

        {/* Mapa (RF-01 / RF-13 / RF-11) */}
        <div className="h-[42vh]">
          <MapaCanvas
            estantes={estantesZona}
            anotaciones={anotacionesZona}
            textura={zonaActual?.textura ?? null}
            modo="ver"
            resaltados={resaltados}
            seleccionadoId={estantePanel?.id}
            onSeleccionar={(e) =>
              setEstantePanel((prev) => (prev?.id === e.id ? null : e))
            }
          />
        </div>
        <p className={cn("mt-2 text-xs", q ? "text-unla" : "text-stone-400")}>
          {q
            ? "Los estantes con brillo dorado contienen tu búsqueda. Tocá uno para ver sus libros."
            : "Tocá un estante para ver qué libros tiene."}
        </p>

        {/* Panel inline: siempre reservado debajo del mapa (RF-03). */}
        <div className="mt-3 h-72">
          {estantePanel ? (
            <EstantePanelInline
              estante={estantePanel}
              zonas={zonas}
              onCerrar={() => setEstantePanel(null)}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/60 text-sm text-stone-400">
              Tocá un estante para ver sus libros
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
