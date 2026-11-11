import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, ImagePlus, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Modal } from "@/shared/components/ui/Modal";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import type { ImportImagenesResultado } from "@/shared/types";
import { importarPortadas } from "./api";

interface Props {
  abierto: boolean;
  onClose: () => void;
}

export function ImportarImagenesModal({ abierto, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [pisarAmbiguos, setPisarAmbiguos] = useState(false);
  const [preview, setPreview] = useState<ImportImagenesResultado | null>(null);
  const [confirmado, setConfirmado] = useState<ImportImagenesResultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Timer para autocerrar el modal tras una importación exitosa y sin pendientes.
  const cierreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limpiarTimer = () => {
    if (cierreTimer.current) { clearTimeout(cierreTimer.current); cierreTimer.current = null; }
  };
  useEffect(() => limpiarTimer, []);

  const importar = useMutation({
    mutationFn: ({ files, dryRun }: { files: File[]; dryRun: boolean }) =>
      importarPortadas(files, dryRun, pisarAmbiguos),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudieron procesar las imágenes");
    },
  });

  function seleccionar(files: File[]) {
    setArchivos(files);
    setPreview(null);
    setConfirmado(null);
    setError(null);
  }

  async function previsualizar() {
    if (!archivos.length) return;
    setError(null);
    const res = await importar.mutateAsync({ files: archivos, dryRun: true });
    setPreview(res);
  }

  async function confirmar() {
    if (!archivos.length) return;
    setError(null);
    const res = await importar.mutateAsync({ files: archivos, dryRun: false });
    setConfirmado(res);
    setPreview(null);
    qc.invalidateQueries({ queryKey: ["libros"] });
    toast.success(
      `Portadas importadas · ${res.asignadas} nuevas, ${res.reemplazadas} reemplazadas`,
    );
    // Si todo salió bien (nada sin coincidencia / ambiguo / con error), mostramos el
    // cartel de éxito un instante y cerramos solo. Si hay pendientes para corregir,
    // dejamos el modal abierto con el reporte.
    if (res.sin_match === 0 && res.ambiguos === 0 && res.errores === 0) {
      limpiarTimer();
      cierreTimer.current = setTimeout(cerrar, 1800);
    }
  }

  function cerrar() {
    limpiarTimer();
    seleccionar([]);
    if (inputRef.current) inputRef.current.value = "";
    onClose();
  }

  return (
    <Modal abierto={abierto} onClose={cerrar} titulo="Importar portadas" ancho="max-w-2xl">
      <p className="mb-4 text-sm text-stone-500">
        Cargá muchas portadas de una. <strong>Nombrá cada imagen con el ISBN</strong>{" "}
        (ej. <code>9788437604947.jpg</code>), con el <strong>código del libro</strong>{" "}
        (ej. <code>L-000123.jpg</code>) o directamente con el <strong>título</strong>{" "}
        (ej. <code>El Aleph.jpg</code>). La imagen se asigna como portada del libro que matchea
        y <strong>reemplaza la portada</strong> si ya tenía una. Formatos: JPG, PNG, WEBP, GIF o
        AVIF (hasta 5 MB c/u).
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-center hover:border-unla">
        <ImagePlus className="h-8 w-8 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">
          {archivos.length ? `${archivos.length} imagen(es) seleccionada(s)` : "Elegí las imágenes a subir"}
        </span>
        <span className="text-xs text-slate-400">Click para seleccionar (podés elegir varias)</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          className="hidden"
          onChange={(e) => seleccionar(Array.from(e.target.files ?? []))}
        />
      </label>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-stone-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={pisarAmbiguos}
          onChange={(e) => { setPisarAmbiguos(e.target.checked); setPreview(null); setConfirmado(null); }}
        />
        <span>
          Cuando un archivo matchea por <strong>título</strong> a varios libros con el mismo
          nombre, <strong>aplicar la portada a todos</strong>. Si está desactivado, esos archivos
          se marcan como “ambiguos” y no se tocan.
        </span>
      </label>

      <div className="mt-4 flex gap-2">
        <Button onClick={previsualizar} disabled={!archivos.length || importar.isPending}>
          {importar.isPending && importar.variables?.dryRun && <Loader2 className="h-4 w-4 animate-spin" />}
          <Upload className="h-4 w-4" /> Previsualizar
        </Button>
      </div>

      {error && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      {/* Preview (dry-run): reporte + confirmación */}
      {preview && (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-slate-700">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold">Previsualización (aún no se guardó nada)</h2>
          </div>
          <Reporte res={preview} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={importar.isPending}>
              {importar.isPending && !importar.variables?.dryRun && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar importación
            </Button>
          </div>
        </div>
      )}

      {/* Resultado confirmado */}
      {confirmado && (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="font-semibold">Importación completada</h2>
          </div>
          <Reporte res={confirmado} />
        </div>
      )}
    </Modal>
  );
}

function Reporte({ res }: { res: ImportImagenesResultado }) {
  const stats = [
    { label: "Archivos", valor: res.total_archivos, color: "text-slate-900" },
    { label: "Portadas nuevas", valor: res.asignadas, color: "text-emerald-600" },
    { label: "Reemplazadas", valor: res.reemplazadas, color: "text-blue-600" },
    { label: "Ambiguas", valor: res.ambiguos, color: "text-amber-600" },
    { label: "Sin coincidencia", valor: res.sin_match, color: "text-amber-600" },
    { label: "Con error", valor: res.errores, color: "text-red-600" },
  ];
  // Archivos que NO se asignaron bien: lo que el usuario debe revisar/corregir.
  const problemas = res.items.filter(
    (i) => i.estado === "sin_match" || i.estado === "error" || i.estado === "ambiguo",
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.valor}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {problemas.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">{problemas.length} archivo(s) para revisar:</p>
          <ul className="mt-1 max-h-48 list-inside list-disc overflow-auto">
            {problemas.slice(0, 30).map((i, idx) => (
              <li key={idx}>
                <span className="font-medium">{i.archivo}</span>: {i.motivo}
                {i.libro_titulo ? ` (${i.libro_titulo})` : ""}
              </li>
            ))}
          </ul>
          {problemas.length > 30 && (
            <p className="mt-1 text-xs">…y {problemas.length - 30} más.</p>
          )}
        </div>
      )}
    </div>
  );
}
