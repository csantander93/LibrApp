import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, Plus, Trash2, Loader2, Info, Layers,
  Type, ArrowRight, RotateCcw, RotateCw, Copy, ChevronUp,
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
  listarEstantes, listarZonas, listarAnotaciones,
  guardarPosiciones, crearEstante, eliminarEstante,
  crearAnotacion, guardarAnotaciones, eliminarAnotacion,
  crearNivel, eliminarNivel,
  type PosicionEstante, type AnotacionPosicion,
} from "@/modules/catalogo/api";
import type { Nivel } from "@/shared/types";
import { EstanteFormModal, siguienteCodigoEstante } from "@/modules/catalogo/EstanteFormModal";
import { MapaCanvas } from "./MapaCanvas";
import { EstantePanelInline } from "./EstantePanelInline";
import { ZonasModal } from "./ZonasModal";

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
  const [copiedEst, setCopiedEst] = useState<Estante | null>(null);

  // Refs para que el keyboard handler siempre vea los valores más recientes.
  const selEstRef = useRef<Estante | null>(null);
  const copiedEstRef = useRef<Estante | null>(null);
  const zonaIdRef = useRef<string>("");
  const localEstRef = useRef<Estante[]>([]);

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

  // Mantener refs actualizados para el keyboard handler.
  const selEstante = localEst.find((e) => e.id === selEstId) ?? null;
  useEffect(() => { selEstRef.current = selEstante; }, [selEstante]);
  useEffect(() => { copiedEstRef.current = copiedEst; }, [copiedEst]);
  useEffect(() => { zonaIdRef.current = zonaId; }, [zonaId]);
  useEffect(() => { localEstRef.current = localEst; }, [localEst]);

  // Ctrl+C: copiar estante seleccionado | Ctrl+V: pegar (crea uno nuevo vacío).
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "c" && selEstRef.current) {
        e.preventDefault();
        setCopiedEst(selEstRef.current);
      } else if (e.key === "v" && copiedEstRef.current) {
        e.preventDefault();
        const src = copiedEstRef.current;
        // Código autogenerado (E{n}) para no depender de un prompt del navegador.
        const codigo = siguienteCodigoEstante(localEstRef.current);
        try {
          const nuevo = await crearEstante({
            codigo,
            etiqueta: src.etiqueta,
            zona_id: (src.zona_id ?? zonaIdRef.current) || null,
            cantidad_niveles: src.niveles?.length || 1,
          });
          const patched: Estante = {
            ...nuevo,
            color: src.color,
            pos_x: Math.min(src.pos_x + 5, 90),
            pos_y: Math.min(src.pos_y + 5, 90),
            ancho: src.ancho,
            alto: src.alto,
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
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estVisibles = useMemo(
    () => localEst.filter((e) => (zonaId ? e.zona_id === zonaId : true)),
    [localEst, zonaId],
  );
  const anotVisibles = useMemo(
    () => localAnot.filter((a) => (zonaId ? a.zona_id === zonaId : true)),
    [localAnot, zonaId],
  );

  const selAnot = localAnot.find((a) => a.id === selAnotId) ?? null;

  // ── Guardado en lote (estantes + anotaciones) ───────────────────────────────
  const guardar = useMutation({
    mutationFn: async () => {
      const estPayload: PosicionEstante[] = localEst.map((e) => ({
        id: e.id, pos_x: e.pos_x, pos_y: e.pos_y, ancho: e.ancho, alto: e.alto, color: e.color,
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
    mutationFn: eliminarEstante,
    onSuccess: (_d, id) => {
      setLocalEst((prev) => prev.filter((e) => e.id !== id));
      setSelEstId(null);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success("Estante eliminado");
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
    mutationFn: (nivelId: string) => eliminarNivel(nivelId),
    onSuccess: (_d, nivelId) => {
      // Optimista: quitar el nivel y renumerar 1..N (el server hace lo mismo).
      setLocalEst((prev) =>
        prev.map((e) => {
          if (!e.niveles.some((n) => n.id === nivelId)) return e;
          const niveles = e.niveles
            .filter((n) => n.id !== nivelId)
            .sort((a, b) => a.numero - b.numero)
            .map((n, i) => ({ ...n, numero: i + 1 }));
          return { ...e, niveles };
        }),
      );
      qc.invalidateQueries({ queryKey: ["estantes"] });
      qc.invalidateQueries({ queryKey: ["libros"] });
      toast.success("Nivel eliminado");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo eliminar el nivel"),
  });

  // ── Alta / baja de anotaciones ──────────────────────────────────────────────
  const agregarAnot = useMutation({
    mutationFn: (tipo: AnotacionTipo) =>
      crearAnotacion({
        tipo, zona_id: zonaId || null,
        texto: tipo === "texto" ? "NUEVO TEXTO" : null,
        pos_x: 42, pos_y: 44, ancho: tipo === "flecha" ? 14 : 18, alto: 6,
        color: "#7A1C30",
      }),
    onSuccess: (nueva) => {
      setLocalAnot((prev) => [...prev, nueva]);
      setSelAnotId(nueva.id);
      setSelEstId(null);
      qc.invalidateQueries({ queryKey: ["anotaciones"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo crear la anotación"),
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

  function rotarEstante() {
    if (!selEstante) return;
    const { pos_x, pos_y, ancho, alto } = selEstante;
    const cx = pos_x + ancho / 2;
    const cy = pos_y + alto / 2;
    const newPosX = Math.max(0, Math.min(cx - alto / 2, 100 - alto));
    const newPosY = Math.max(0, Math.min(cy - ancho / 2, 100 - ancho));
    patchEst(selEstante.id, {
      ancho: alto, alto: ancho,
      pos_x: Math.round(newPosX * 100) / 100,
      pos_y: Math.round(newPosY * 100) / 100,
    });
  }

  async function eliminarEstanteSel() {
    if (!selEstante) return;
    if (selEstante.total_libros > 0) {
      toast.error(
        `El estante "${selEstante.codigo}" tiene ${selEstante.total_libros} libro(s). ` +
        "Reasignalos antes de eliminarlo (RN-08).",
      );
      return;
    }
    const ok = await confirmar({
      mensaje: (
        <>
          ¿Eliminar el estante <strong className="font-semibold text-stone-800">“{selEstante.codigo}”</strong>?
        </>
      ),
    });
    if (ok) eliminarEst.mutate(selEstante.id);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <header className="mb-2 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-lg font-bold text-stone-900">Editor de mapa</h1>
          {copiedEst && (
            <span className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
              <Copy className="h-3 w-3" /> {copiedEst.codigo} copiado — Ctrl+V para pegar
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
          <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={() => agregarAnot.mutate("texto")}>
            <Type className="h-3.5 w-3.5" /> Texto
          </Button>
          <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={() => agregarAnot.mutate("flecha")}>
            <ArrowRight className="h-3.5 w-3.5" /> Flecha
          </Button>
          <Button className="px-2.5 py-1 text-xs" onClick={() => guardar.mutate()} disabled={!dirty || guardar.isPending}>
            {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </Button>
        </div>
      </header>

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
                  modo="editar"
                  seleccionadoId={selEstId}
                  seleccionadoAnotId={selAnotId}
                  onSeleccionar={(e) => { setSelEstId((prev) => prev === e.id ? null : e.id); setSelAnotId(null); }}
                  onSeleccionarAnotacion={(a) => { setSelAnotId(a.id); setSelEstId(null); }}
                  onMover={(id, x, y) => patchEst(id, { pos_x: x, pos_y: y })}
                  onResize={(id, w, h) => patchEst(id, { ancho: w, alto: h })}
                  onMoverAnotacion={(id, x, y) => patchAnot(id, { pos_x: x, pos_y: y })}
                  onResizeAnotacion={(id, w, h) => patchAnot(id, { ancho: w, alto: h })}
                  onAgregar={agregarEstante}
                />
              </div>
              <div className="min-h-[240px]" style={{ flex: 4 }}>
                {selEstante ? (
                  <EstantePanelInline
                    estante={selEstante}
                    zonas={zonas}
                    onCerrar={() => setSelEstId(null)}
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
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">Girar</p>
                <div className="flex gap-1">
                  <Button variant="outline" className="flex-1 px-2 py-1 text-xs" onClick={rotarEstante} title="Girar 90°">
                    <RotateCw className="h-3.5 w-3.5" /> 90°
                  </Button>
                </div>
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
                          if (n.total_libros > 0) {
                            toast.error(`El Nivel ${n.numero} tiene ${n.total_libros} libro(s). Reasignalos antes de eliminarlo.`);
                            return;
                          }
                          const ok = await confirmar({ mensaje: `¿Eliminar el Nivel ${n.numero}?` });
                          if (ok) quitarNiv.mutate(n.id);
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
                  {selAnot.tipo === "flecha" ? <ArrowRight className="h-3 w-3" /> : <Type className="h-3 w-3" />}
                  {selAnot.tipo === "flecha" ? "Flecha" : "Texto"}
                </span>
                <span className="text-[10px] text-stone-400">Anotación</span>
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
                Arrastrá para mover; esquina redimensiona.
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
              <p>Seleccioná un estante o anotación para editarlo.</p>
              <p className="mt-2">
                Usá <span className="font-semibold text-stone-500">Texto</span> y{" "}
                <span className="font-semibold text-stone-500">Flecha</span> para señalizar entrada, salida, escaleras.
              </p>
            </div>
          )}
        </aside>
      </div>

      {zonasModal && <ZonasModal zonas={zonas} onClose={() => setZonasModal(false)} />}

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
