import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { useToast } from "@/shared/components/ui/Toast";
import type { ImportResultado } from "@/shared/types";
import { importarLibros } from "./api";

export function ImportarPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResultado | null>(null);
  const [confirmado, setConfirmado] = useState<ImportResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importar = useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => importarLibros(file, dryRun),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo procesar el archivo");
    },
  });

  function seleccionar(file: File | null) {
    setArchivo(file);
    setPreview(null);
    setConfirmado(null);
    setError(null);
  }

  async function previsualizar() {
    if (!archivo) return;
    setError(null);
    const res = await importar.mutateAsync({ file: archivo, dryRun: true });
    setPreview(res);
  }

  async function confirmar() {
    if (!archivo) return;
    setError(null);
    const res = await importar.mutateAsync({ file: archivo, dryRun: false });
    setConfirmado(res);
    setPreview(null);
    qc.invalidateQueries({ queryKey: ["libros"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["estantes"] });
    toast.success(`Importación completada · ${res.creados} creados, ${res.actualizados} actualizados`);
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-stone-900">Importar inventario</h1>
        <p className="text-sm text-stone-500">
          Cargá el catálogo desde un archivo <strong>.csv</strong> o <strong>.xlsx</strong> (RF-05).
          Se detectan las columnas automáticamente; los libros sin ubicación quedan como “Sin ubicar”.
        </p>
      </header>

      <Card>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-center hover:border-unla">
          <FileSpreadsheet className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {archivo ? archivo.name : "Elegí un archivo .csv o .xlsx"}
          </span>
          <span className="text-xs text-slate-400">Click para seleccionar</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm"
            className="hidden"
            onChange={(e) => seleccionar(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="mt-4 flex gap-2">
          <Button onClick={previsualizar} disabled={!archivo || importar.isPending}>
            {importar.isPending && importar.variables?.dryRun && <Loader2 className="h-4 w-4 animate-spin" />}
            <Upload className="h-4 w-4" /> Previsualizar
          </Button>
        </div>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}
      </Card>

      {/* Preview (dry-run): reporte + confirmación (CU-04) */}
      {preview && (
        <Card className="mt-4">
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
        </Card>
      )}

      {/* Resultado confirmado */}
      {confirmado && (
        <Card className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="font-semibold">Importación completada</h2>
          </div>
          <Reporte res={confirmado} />
        </Card>
      )}
    </div>
  );
}

function Reporte({ res }: { res: ImportResultado }) {
  const stats = [
    { label: "Filas procesadas", valor: res.total_filas, color: "text-slate-900" },
    { label: "Creados", valor: res.creados, color: "text-emerald-600" },
    { label: "Actualizados", valor: res.actualizados, color: "text-blue-600" },
    { label: "Sin ubicar", valor: res.sin_ubicar, color: "text-amber-600" },
  ];
  return (
    <div>
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.valor}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 text-xs text-slate-500">
        <span className="font-medium">Columnas detectadas: </span>
        {Object.entries(res.columnas_detectadas).map(([campo, col]) => (
          <span key={campo} className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5">
            {campo} ← “{col}”
          </span>
        ))}
      </div>

      {res.errores.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">{res.errores.length} fila(s) con error:</p>
          <ul className="mt-1 list-inside list-disc">
            {res.errores.slice(0, 10).map((e, i) => (
              <li key={i}>Fila {e.fila}: {e.motivo}{e.titulo ? ` (${e.titulo})` : ""}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
