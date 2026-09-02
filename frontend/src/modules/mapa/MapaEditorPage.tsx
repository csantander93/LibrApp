import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, Plus, Trash2, Loader2, Info, Layers,
  Type, ArrowRight, RotateCcw, RotateCw, Copy,
} from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { cn, COLORES_ESTANTE, colorEstante } from "@/lib/utils";
import type { Estante, Anotacion, AnotacionTipo } from "@/shared/types";
import {
  listarEstantes, listarZonas, listarAnotaciones,
  guardarPosiciones, crearEstante, eliminarEstante,
  crearAnotacion, guardarAnotaciones, eliminarAnotacion,
  type PosicionEstante, type AnotacionPosicion,
} from "@/modules/catalogo/api";
import { MapaCanvas } from "./MapaCanvas";
import { EstantePanelInline } from "./EstantePanelInline";
import { ZonasModal } from "./ZonasModal";

/** Fila de swatches de color reutilizable. */
function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORES_ESTANTE.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          className={cn(
            "h-6 w-6 rounded-full border transition-transform hover:scale-110",
            value?.toLowerCase() === c.toLowerCase() ? "border-stone-900 ring-2 ring-ambar" : "border-black/10",
          )}
          style={{ background: c }}
        />
      ))}
      <button
        onClick={() => onChange(null)}
        title="Automático (color de zona)"
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border bg-white text-[9px] font-bold text-stone-500 transition-transform hover:scale-110",
          value === null ? "border-stone-900 ring-2 ring-ambar" : "border-stone-300",
        )}
      >
        Aa
      </button>
    </div>
  );
}

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
  const [copiedEst, setCopiedEst] = useState<Estante | null>(null);

  // Refs para que el keyboard handler siempre vea los valores más recientes.
  const selEstRef = useRef<Estante | null>(null);
  const copiedEstRef = useRef<Estante | null>(null);
  const zonaIdRef = useRef<string>("");

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
        const defaultCodigo = src.codigo + "-COPIA";
        const codigo = window.prompt("Código del estante copiado:", defaultCodigo);
        if (!codigo?.trim()) return;
        try {
          const nuevo = await crearEstante({
            codigo: codigo.trim().toUpperCase(),
            etiqueta: src.etiqueta,
            zona_id: (src.zona_id ?? zonaIdRef.current) || null,
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
        } catch (err: any) {
          window.alert(err?.response?.data?.detail ?? "No se pudo pegar el estante");
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

  // ── Alta de estante ─────────────────────────────────────────────────────────
  const agregarEst = useMutation({
    mutationFn: (codigo: string) => crearEstante({ codigo, etiqueta: null, zona_id: zonaId || null }),
    onSuccess: (nuevo) => {
      setLocalEst((prev) => [...prev, nuevo]);
      setSelEstId(nuevo.id);
      setSelAnotId(null);
      qc.invalidateQueries({ queryKey: ["estantes"] });
      toast.success("Estante creado");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "No se pudo crear el estante"),
  });

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
    const codigo = window.prompt("Código del nuevo estante (ej: E6, MESA-2):");
    if (codigo?.trim()) agregarEst.mutate(codigo.trim().toUpperCase());
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
                <ColorPicker value={selAnot.color} onChange={(c) => patchAnot(selAnot.id, { color: c ?? "#7A1C30" })} />
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
    </div>
  );
}
