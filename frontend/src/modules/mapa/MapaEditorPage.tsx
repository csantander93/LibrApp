import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, Plus, Trash2, Loader2, Info, Layers,
  Shapes, RotateCcw, RotateCw, Copy, ChevronUp, Search, X,
} from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { ColorPicker } from "@/shared/components/ui/ColorPicker";
import { colorEstante } from "@/lib/utils";
import type { Estante, Anotacion, AnotacionTipo } from "@/shared/types";
import {
  listarEstantes, listarZonas, listarAnotaciones, listarLibros,
  guardarPosiciones, crearEstante, eliminarEstante,
  crearAnotacion, guardarAnotaciones, eliminarAnotacion,
  crearNivel, eliminarNivel,
  type PosicionEstante, type AnotacionPosicion,
} from "@/modules/catalogo/api";
import type { Nivel } from "@/shared/types";
import { EstanteFormModal, siguienteCodigoEstante } from "@/modules/catalogo/EstanteFormModal";
import { MapaCanvas } from "./MapaCanvas";
import { EstantePanelInline } from "./EstantePanelInline";
import { ReubicarEliminarModal } from "./ReubicarEliminarModal";
import { ZonasModal } from "./ZonasModal";
import { PaletaElementos, defaultsElemento, etiquetaTipo, iconoTipo } from "./elementos";

export function MapaEditorPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: estantesServer, isLoading } = useQuery({ queryKey: ["estantes"], queryFn: listarEstantes });
  const { data: anotServer } = useQuery({ queryKey: ["anotaciones"], queryFn: listarAnotaciones });
  const { data: zonas = [] } = useQuery({ queryKey: ["zonas"], queryFn: listarZonas });

  const [zonaId, setZonaId] = useState<string>("");
  const [localEst, setLocalEst] = useState<Estante[]>([]);
  const [localAnot, setLocalAnot] = useState<Anotacion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selEstId, setSelEstId] = useState<string | null>(null);
  const [selAnotId, setSelAnotId] = useState<string | null>(null);
  const [zonasModal, setZonasModal] = useState(false);
  const [estanteModal, setEstanteModal] = useState(false);
  const [borrarEst, setBorrarEst] = useState<Estante | null>(null);
  const [borrarNivel, setBorrarNivel] = useState<Nivel | null>(null);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [copiedEst, setCopiedEst] = useState<Estante | null>(null);
  const [copiedAnot, setCopiedAnot] = useState<Anotacion | null>(null);

  // Sincroniza copias locales desde el server salvo que haya cambios sin guardar.
  useEffect(() => {
    if (estantesServer && !dirty) setLocalEst(estantesServer);
  }, [estantesServer, dirty]);
  useEffect(() => {
    if (anotServer && !dirty) setLocalAnot(anotServer);
  }, [anotServer, dirty]);

  useEffect(() => {
    if (!zonas.length) return;
    if (!zonaId || !zonas.some((z) => z.id === zonaId)) setZonaId(zonas[0].id);
  }, [zonas, zonaId]);

  const selEstante = localEst.find((e) => e.id === selEstId) ?? null;

  const estVisibles = useMemo(
    () => localEst.filter((e) => (zonaId ? e.zona_id === zonaId : true)),
    [localEst, zonaId],
  );
  const anotVisibles = useMemo(
    () => localAnot.filter((a) => (zonaId ? a.zona_id === zonaId : true)),
    [localAnot, zonaId],
  );

  const selAnot = localAnot.find((a) => a.id === selAnotId) ?? null;
  const zonaActual = zonas.find((z) => z.id === zonaId) ?? null;

  // ── Buscar un libro y resaltar los estantes que lo contienen (RF-13) ─────────
  const [q, setQ] = useState("");
  const busqueda = q.trim().length >= 2 ? q.trim() : ""; // desde 2 caracteres
  const { data: librosMatch } = useQuery({
    queryKey: ["libros-buscar", busqueda],
    queryFn: () => listarLibros({ q: busqueda }),
    enabled: !!busqueda,
  });
  const resaltados = useMemo(() => {
    if (!busqueda || !librosMatch) return new Set<string>();
    return new Set(librosMatch.map((l) => l.estante_id).filter((id): id is string => !!id));
  }, [busqueda, librosMatch]);
  // Zonas con coincidencias (para orientar cuando el estante está en otro piso).
  const zonasConMatch = useMemo(() => {
    if (resaltados.size === 0) return [];
    return zonas.filter((z) => localEst.some((e) => e.zona_id === z.id && resaltados.has(e.id)));
  }, [zonas, localEst, resaltados]);
  // Coincidencias visibles en la zona actual (las que efectivamente brillan).
  const matchEnZona = useMemo(
    () => estVisibles.filter((e) => resaltados.has(e.id)).length,
    [estVisibles, resaltados],
  );

  // ── Guardado en lote (estantes + anotaciones) ───────────────────────────────
  const guardar = useMutation({
    mutationFn: async () => {
      const estPayload: PosicionEstante[] = localEst.map((e) => ({
        id: e.id, pos_x: e.pos_x, pos_y: e.pos_y, ancho: e.ancho, alto: e.alto,
        rotacion: e.rotacion, color: e.color,
      }));
      const anotPayload: AnotacionPosicion[] = localAnot.map((a) => ({
        id: a.id, texto: a.texto, pos_x: a.pos_x, pos_y: a.pos_y,
        ancho: a.ancho, alto: a.alto, rotacion: a.rotacion, color: a.color,
      }));
      await guardarPosiciones(estPayload);
      await guardarAnotaciones(anotPayload);
    },
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      qc.invalidateQueries({ queryKey: ["anotaciones"] });
      toast.success("Cambios guardados");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudieron guardar los cambios"),
  });

  // ── Alta de estante: alta optimista tras crearlo en el modal ─────────────────
  function onEstanteCreado(nuevo: Estante) {
    setLocalEst((prev) => (prev.some((e) => e.id === nuevo.id) ? prev : [...prev, nuevo]));
    setSelEstId(nuevo.id);
    setSelAnotId(null);
  }

  const eliminarEst = useMutation({
    mutationFn: ({ id, reasignarA }: { id: string; reasignarA: string | null }) =>
      eliminarEstante(id, reasignarA),
    onSuccess: (_d, { id, reasignarA }) => {
      setLocalEst((prev) => prev.filter((e) => e.id !== id));
      setSelEstId(null);
      setBorrarEst(null);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      qc.invalidateQueries({ queryKey: ["libros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(reasignarA ? "Estante eliminado y libros reasignados" : "Estante eliminado");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo eliminar"),
  });

  // ── Alta / baja de niveles del estante seleccionado ──────────────────────────
  function patchNiveles(estanteId: string, niveles: Nivel[]) {
    setLocalEst((prev) => prev.map((e) => (e.id === estanteId ? { ...e, niveles } : e)));
  }

  const agregarNiv = useMutation({
    mutationFn: (estanteId: string) => crearNivel({ estante_id: estanteId }),
    onSuccess: (nuevo) => {
      const est = localEst.find((e) => e.id === nuevo.estante_id);
      if (est) patchNiveles(est.id, [...est.niveles, nuevo]);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success(`Nivel ${nuevo.numero} agregado`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo agregar el nivel"),
  });

  const quitarNiv = useMutation({
    mutationFn: ({ id, moverA }: { id: string; moverA: string | null }) => eliminarNivel(id, moverA),
    onSuccess: (_d, { id }) => {
      // Optimista: quitar el nivel y renumerar 1..N (el server hace lo mismo).
      setLocalEst((prev) =>
        prev.map((e) => {
          if (!e.niveles.some((n) => n.id === id)) return e;
          const niveles = e.niveles
            .filter((n) => n.id !== id)
            .sort((a, b) => a.numero - b.numero)
            .map((n, i) => ({ ...n, numero: i + 1 }));
          return { ...e, niveles };
        }),
      );
      setBorrarNivel(null);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      qc.invalidateQueries({ queryKey: ["libros"] });
      toast.success("Nivel eliminado");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el nivel"),
  });

  // ── Alta / baja de anotaciones ──────────────────────────────────────────────
  const agregarAnot = useMutation({
    mutationFn: (tipo: AnotacionTipo) => {
      const d = defaultsElemento(tipo);
      return crearAnotacion({
        tipo, zona_id: zonaId || null,
        texto: d.texto,
        pos_x: 42, pos_y: 44, ancho: d.ancho, alto: d.alto,
        color: d.color,
      });
    },
    onSuccess: (nueva) => {
      setLocalAnot((prev) => [...prev, nueva]);
      setSelAnotId(nueva.id);
      setSelEstId(null);
      setPaletaAbierta(false);
      qc.invalidateQueries({ queryKey: ["anotaciones"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo crear el elemento"),
  });

  const eliminarAnot = useMutation({
    mutationFn: eliminarAnotacion,
    onSuccess: (_d, id) => {
      setLocalAnot((prev) => prev.filter((a) => a.id !== id));
      setSelAnotId(null);
      qc.invalidateQueries({ queryKey: ["anotaciones"] });
      toast.success("Anotación eliminada");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo eliminar la anotación"),
  });

  // ── Ediciones locales (marcan dirty) ────────────────────────────────────────
  function patchEst(id: string, patch: Partial<Estante>) {
    setDirty(true);
    setLocalEst((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function patchAnot(id: string, patch: Partial<Anotacion>) {
    setDirty(true);
    setLocalAnot((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function agregarEstante() {
    setEstanteModal(true);
  }

  function rotarEstante(delta: number) {
    if (!selEstante) return;
    const rot = ((((selEstante.rotacion ?? 0) + delta) % 360) + 360) % 360;
    patchEst(selEstante.id, { rotacion: Math.round(rot * 100) / 100 });
  }

  async function eliminarEstanteSel() {
    if (!selEstante) return;
    // Con libros: modal con opciones (mover a otro estante o dejar sin ubicar).
    if (selEstante.total_libros > 0) {
      setBorrarEst(selEstante);
      return;
    }
    // Sin libros: confirmación simple.
    const ok = await confirmar({
      mensaje: (
        <>
          ¿Eliminar el estante <strong className="font-semibold text-stone-800">“{selEstante.codigo}”</strong>?
        </>
      ),
    });
    if (ok) eliminarEst.mutate({ id: selEstante.id, reasignarA: null });
  }

  // ── Copiar / pegar (Ctrl+C / Ctrl+V) y borrar (Delete) ──────────────────────
  async function pegarEstante(src: Estante) {
    // Código autogenerado (E{n}) para no depender de un prompt del navegador.
    const codigo = siguienteCodigoEstante(localEst);
    try {
      const nuevo = await crearEstante({
        codigo,
        etiqueta: src.etiqueta,
        zona_id: (src.zona_id ?? zonaId) || null,
        cantidad_niveles: src.niveles?.length || 1,
      });
      const patched: Estante = {
        ...nuevo,
        color: src.color,
        pos_x: Math.min(src.pos_x + 5, 90),
        pos_y: Math.min(src.pos_y + 5, 90),
        ancho: src.ancho,
        alto: src.alto,
        rotacion: src.rotacion ?? 0,
      };
      setLocalEst((prev) => [...prev, patched]);
      setSelEstId(nuevo.id);
      setSelAnotId(null);
      setDirty(true);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success(`Estante ${codigo} pegado`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "No se pudo pegar el estante");
    }
  }

  async function pegarAnotacion(src: Anotacion) {
    try {
      const nueva = await crearAnotacion({
        tipo: src.tipo,
        zona_id: zonaId || null,
        texto: src.texto,
        pos_x: Math.min(src.pos_x + 5, 95),
        pos_y: Math.min(src.pos_y + 5, 95),
        ancho: src.ancho,
        alto: src.alto,
        rotacion: src.rotacion,
        color: src.color,
      });
      setLocalAnot((prev) => [...prev, nueva]);
      setSelAnotId(nueva.id);
      setSelEstId(null);
      qc.invalidateQueries({ queryKey: ["anotaciones"] });
      toast.success(`${etiquetaTipo(src.tipo)} pegado`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "No se pudo pegar el elemento");
    }
  }

  // Un único listener que delega en la última versión del handler (ve el estado
  // fresco de cada render sin re-suscribir el evento).
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    // Borrar el elemento seleccionado.
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selEstante) { e.preventDefault(); void eliminarEstanteSel(); }
      else if (selAnot) { e.preventDefault(); eliminarAnot.mutate(selAnot.id); }
      return;
    }

    if (!(e.ctrlKey || e.metaKey)) return;

    if (e.key === "c") {
      if (selEstante) { e.preventDefault(); setCopiedEst(selEstante); setCopiedAnot(null); }
      else if (selAnot) { e.preventDefault(); setCopiedAnot(selAnot); setCopiedEst(null); }
    } else if (e.key === "v") {
      if (copiedEst) { e.preventDefault(); void pegarEstante(copiedEst); }
      else if (copiedAnot) { e.preventDefault(); void pegarAnotacion(copiedAnot); }
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyRef.current(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <header className="mb-2 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="shrink-0">
            <h1 className="font-serif text-lg font-bold leading-tight text-stone-900">Mapa de la Librería</h1>
            <p className="text-xs text-stone-500">Vista general de estantes y zonas</p>
          </div>
          {/* Buscador: localizar un libro y resaltar sus estantes en el plano (RF-13) */}
          <div className="flex w-64 items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-unla/40 focus-within:ring-2 focus-within:ring-unla/15">
            <Search className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, autor o ISBN…"
              className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} title="Limpiar" className="shrink-0 text-stone-400 transition-colors hover:text-stone-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {(copiedEst || copiedAnot) && (
            <span className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
              <Copy className="h-3 w-3" />
              {copiedEst ? `Estante ${copiedEst.codigo}` : etiquetaTipo(copiedAnot!.tipo)} copiado — Ctrl+V para pegar
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {zonas.length > 0 && (
            <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className="w-34 py-1 text-xs">
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </Select>
          )}
          <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={() => setZonasModal(true)}>
            <Layers className="h-3.5 w-3.5" /> Zonas
          </Button>
          <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={agregarEstante}>
            <Plus className="h-3.5 w-3.5" /> Estante
          </Button>
          <div className="relative">
            <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={() => setPaletaAbierta((v) => !v)}>
              <Shapes className="h-3.5 w-3.5" /> Elemento
            </Button>
            {paletaAbierta && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setPaletaAbierta(false)} />
                <div className="absolute right-0 top-full z-30 mt-1 rounded-xl border border-stone-200 bg-white p-3 shadow-lg shadow-stone-900/10">
                  <PaletaElementos onElegir={(tipo) => agregarAnot.mutate(tipo)} />
                </div>
              </>
            )}
          </div>
          <Button className="px-2.5 py-1 text-xs" onClick={() => guardar.mutate()} disabled={!dirty || guardar.isPending}>
            {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </Button>
        </div>
      </header>

      {/* Resultado de la búsqueda: conteo / estado (RF-13) */}
      {busqueda && (
        <p className="mb-2 shrink-0 text-xs text-stone-500">
          {resaltados.size === 0
            ? "Sin coincidencias."
            : matchEnZona > 0
            ? `${matchEnZona} estante(s) con coincidencias — brillan en dorado. Hacé clic para ver sus libros.`
            : "Hay coincidencias, pero en otra zona."}
        </p>
      )}

      {/* Coincidencias en otra zona: botones para saltar a esa zona */}
      {busqueda && zonasConMatch.length > 0 && !zonasConMatch.some((z) => z.id === zonaId) && (
        <p className="mb-2 shrink-0 flex flex-wrap items-center gap-1.5 rounded-lg bg-unla/10 px-2.5 py-1.5 text-xs text-unla">
          <Search className="h-3.5 w-3.5" /> Coincidencias en otra zona:
          {zonasConMatch.map((z) => (
            <button
              key={z.id}
              onClick={() => setZonaId(z.id)}
              className="rounded-md bg-white/70 px-1.5 py-0.5 font-medium underline-offset-2 transition-colors hover:bg-white hover:underline"
            >
              {z.nombre}
            </button>
          ))}
        </p>
      )}

      {dirty && (
        <p className="mb-2 shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
          <Info className="h-3.5 w-3.5" /> Tenés cambios sin guardar.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_188px]">
        <div className="flex min-h-0 flex-col gap-2">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-stone-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="min-h-0" style={{ flex: 6 }}>
                <MapaCanvas
                  estantes={estVisibles}
                  anotaciones={anotVisibles}
                  textura={zonaActual?.textura ?? null}
                  modo="editar"
                  resaltados={resaltados}
                  seleccionadoId={selEstId}
                  seleccionadoAnotId={selAnotId}
                  onSeleccionar={(e) => { setSelEstId((prev) => prev === e.id ? null : e.id); setSelAnotId(null); }}
                  onSeleccionarAnotacion={(a) => { setSelAnotId(a.id); setSelEstId(null); }}
                  onMover={(id, x, y) => patchEst(id, { pos_x: x, pos_y: y })}
                  onResize={(id, w, h) => patchEst(id, { ancho: w, alto: h })}
                  onRotar={(id, r) => patchEst(id, { rotacion: r })}
                  onMoverAnotacion={(id, x, y) => patchAnot(id, { pos_x: x, pos_y: y })}
                  onResizeAnotacion={(id, w, h) => patchAnot(id, { ancho: w, alto: h })}
                  onRotarAnotacion={(id, r) => patchAnot(id, { rotacion: r })}
                  onAgregar={agregarEstante}
                />
              </div>
              <div className="min-h-[240px]" style={{ flex: 4 }}>
                {selEstante ? (
                  <EstantePanelInline
                    estante={selEstante}
                    zonas={zonas}
                    onCerrar={() => setSelEstId(null)}
                    permitirReordenar
                    filtroInicial={busqueda}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/60 text-xs text-stone-400">
                    Hacé clic en un estante para ver sus libros
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Panel lateral contextual */}
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 shadow-sm shadow-stone-900/5">
          {selEstante ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm"
                  style={{ background: colorEstante(selEstante.color, selEstante.zona_id) }}
                >
                  {selEstante.codigo}
                </span>
                <span className="text-[10px] text-stone-400">Estante</span>
              </div>
              {selEstante.etiqueta && (
                <p className="mt-2 font-serif text-sm font-semibold text-stone-800">{selEstante.etiqueta}</p>
              )}
              <p className="mt-1 text-xs text-stone-500">{selEstante.total_libros} libro(s)</p>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {Math.round(selEstante.ancho)} × {Math.round(selEstante.alto)} · arrastrá esquina
              </p>

              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">Color</p>
                <ColorPicker value={selEstante.color} onChange={(c) => patchEst(selEstante.id, { color: c })} />
              </div>

              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Girar ({Math.round(selEstante.rotacion ?? 0)}°)
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" className="px-2 py-1" onClick={() => rotarEstante(-15)} title="Girar 15° a la izquierda">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" className="px-2 py-1" onClick={() => rotarEstante(15)} title="Girar 15° a la derecha">
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" className="px-2 py-1 text-xs" onClick={() => rotarEstante(90)} title="Girar 90°">
                    90°
                  </Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => patchEst(selEstante.id, { rotacion: 0 })}>
                    Reset
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-stone-400">O arrastrá el tirador ↻ sobre el estante.</p>
              </div>

              {/* Niveles ("pisos") del estante */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    <Layers className="h-3 w-3" /> Niveles
                  </p>
                  <button
                    onClick={() => agregarNiv.mutate(selEstante.id)}
                    disabled={agregarNiv.isPending}
                    className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-unla transition-colors hover:bg-unla/10 disabled:opacity-40"
                    title="Agregar un nivel arriba"
                  >
                    <Plus className="h-3 w-3" /> Nivel
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {[...selEstante.niveles].sort((a, b) => b.numero - a.numero).map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-2 py-1"
                    >
                      <span className="flex items-center gap-1 text-xs text-stone-700">
                        {n.numero === selEstante.niveles.length && <ChevronUp className="h-3 w-3 text-stone-300" />}
                        <span className="font-medium">Nivel {n.numero}</span>
                        <span className="text-[10px] text-stone-400">· {n.total_libros} libro(s)</span>
                      </span>
                      <button
                        onClick={async () => {
                          // Con libros: modal con opciones (mover a otro nivel o dejar sin nivel).
                          if (n.total_libros > 0) { setBorrarNivel(n); return; }
                          const ok = await confirmar({ mensaje: `¿Eliminar el Nivel ${n.numero}?` });
                          if (ok) quitarNiv.mutate({ id: n.id, moverA: null });
                        }}
                        className="rounded p-0.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Eliminar nivel"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-2">
                <Button variant="danger" className="w-full px-2 py-1 text-xs" onClick={eliminarEstanteSel}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </div>
          ) : selAnot ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-stone-800 px-2 py-0.5 text-xs font-semibold text-white">
                  {(() => { const I = iconoTipo(selAnot.tipo); return <I className="h-3 w-3" />; })()}
                  {etiquetaTipo(selAnot.tipo)}
                </span>
                <span className="text-[10px] text-stone-400">Elemento</span>
              </div>

              {selAnot.tipo === "texto" && (
                <div className="mt-3">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-stone-500">Texto</label>
                  <Input
                    value={selAnot.texto ?? ""}
                    onChange={(e) => patchAnot(selAnot.id, { texto: e.target.value })}
                    placeholder="Ej: ESCALERA…"
                  />
                </div>
              )}

              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">Color</p>
                <ColorPicker value={selAnot.color} allowAuto={false} onChange={(c) => patchAnot(selAnot.id, { color: c ?? "#7A1C30" })} />
              </div>

              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Rotación ({Math.round(selAnot.rotacion)}°)
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" className="px-2 py-1" onClick={() => patchAnot(selAnot.id, { rotacion: selAnot.rotacion - 15 })}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" className="px-2 py-1" onClick={() => patchAnot(selAnot.id, { rotacion: selAnot.rotacion + 15 })}>
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => patchAnot(selAnot.id, { rotacion: 0 })}>
                    Reset
                  </Button>
                </div>
              </div>

              <p className="mt-2 text-[10px] text-stone-400">
                Arrastrá para mover; esquina redimensiona. <span className="font-medium">Ctrl+C</span>/<span className="font-medium">Ctrl+V</span> copia · <span className="font-medium">Del</span> borra.
              </p>

              <Button
                variant="danger"
                className="mt-3 w-full px-2 py-1 text-xs"
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: "Eliminar anotación",
                    mensaje: "¿Eliminar esta anotación del mapa?",
                  });
                  if (ok) eliminarAnot.mutate(selAnot.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            </div>
          ) : (
            <div className="text-xs text-stone-400">
              <p>Seleccioná un estante o elemento para editarlo.</p>
              <p className="mt-2">
                Usá <span className="font-semibold text-stone-500">Elemento</span> para sumar mobiliario
                (mesas, sillas), plantas, señalética (flechas, textos) y estructura al plano.
              </p>
            </div>
          )}
        </aside>
      </div>

      {borrarEst && (
        <ReubicarEliminarModal
          titulo={`Eliminar estante “${borrarEst.codigo}”`}
          advertencia={
            <>
              Este estante tiene <strong className="font-semibold text-stone-800">{borrarEst.total_libros} libro(s)</strong>.
              Al eliminarlo no se borra ningún libro: elegí qué hacer con ellos.
            </>
          }
          dejar={{
            label: "Dejar los libros sin ubicar",
            descripcion: "Quedan en “Sin ubicar” y los reacomodás después desde el catálogo.",
          }}
          mover={{
            label: "Mover los libros a otro estante",
            descripcion: "Se reasignan al estante que elijas (a su primer nivel).",
            placeholder: "Elegí un estante…",
            opciones: localEst
              .filter((e) => e.id !== borrarEst.id)
              .map((e) => ({
                id: e.id,
                label: `${e.codigo}${e.etiqueta ? ` · ${e.etiqueta}` : ""} — ${zonas.find((z) => z.id === e.zona_id)?.nombre ?? "Sin zona"}`,
              })),
            sinOpciones: "No hay otros estantes disponibles.",
          }}
          onClose={() => setBorrarEst(null)}
          onConfirmar={(reasignarA) => eliminarEst.mutate({ id: borrarEst.id, reasignarA })}
          pending={eliminarEst.isPending}
        />
      )}

      {borrarNivel && selEstante && (
        <ReubicarEliminarModal
          titulo={`Eliminar Nivel ${borrarNivel.numero}`}
          advertencia={
            <>
              Este nivel tiene <strong className="font-semibold text-stone-800">{borrarNivel.total_libros} libro(s)</strong>.
              Al eliminarlo no se borra ningún libro: elegí qué hacer con ellos.
            </>
          }
          dejar={{
            label: "Dejar los libros sin nivel",
            descripcion: "Quedan en el estante, sin un nivel asignado.",
          }}
          mover={{
            label: "Mover los libros a otro nivel",
            descripcion: "Se reasignan al nivel que elijas de este estante.",
            placeholder: "Elegí un nivel…",
            opciones: [...selEstante.niveles]
              .filter((n) => n.id !== borrarNivel.id)
              .sort((a, b) => a.numero - b.numero)
              .map((n) => ({ id: n.id, label: `Nivel ${n.numero}${n.etiqueta ? ` · ${n.etiqueta}` : ""}` })),
            sinOpciones: "Este estante no tiene otros niveles.",
          }}
          onClose={() => setBorrarNivel(null)}
          onConfirmar={(moverA) => quitarNiv.mutate({ id: borrarNivel.id, moverA })}
          pending={quitarNiv.isPending}
        />
      )}

      {zonasModal && <ZonasModal zonas={zonas} estantes={localEst} onClose={() => setZonasModal(false)} />}

      {estanteModal && (
        <EstanteFormModal
          onClose={() => setEstanteModal(false)}
          estante={null}
          zonas={zonas}
          estantes={localEst}
          zonaIdDefault={zonaId || null}
          onCreado={onEstanteCreado}
        />
      )}
    </div>
  );
}
