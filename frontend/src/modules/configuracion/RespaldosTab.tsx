import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CloudUpload,
  Download,
  HardDriveDownload,
  Link2Off,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { useToast } from "@/shared/components/ui/Toast";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import type { BackupEstado } from "@/shared/types";
import { Toggle } from "./ConfiguracionPage";
import {
  obtenerBackup,
  actualizarBackup,
  conectarDrive,
  desconectarDrive,
  ejecutarBackup,
  descargarBackup,
} from "./api";

// Argentina = UTC-3 (sin horario de verano). La hora se muestra/edita en horario
// local AR aunque el backend la guarde en UTC.
const AR_OFFSET = 3;
const utcToAr = (h: number) => ((h - AR_OFFSET + 24) % 24);
const arToUtc = (h: number) => ((h + AR_OFFSET) % 24);
const dosDigitos = (h: number) => String(h).padStart(2, "0");

export function RespaldosTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirmar = useConfirm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["backup"],
    queryFn: obtenerBackup,
  });

  // Vuelta del flujo OAuth: ?drive=ok|error. Avisamos y limpiamos el parámetro.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const drive = params.get("drive");
    if (!drive) return;
    if (drive === "ok") {
      toast.success("Google Drive conectado");
      qc.invalidateQueries({ queryKey: ["backup"] });
    } else {
      toast.error("No se pudo conectar Google Drive");
    }
    params.delete("drive");
    const limpio = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", limpio);
  }, [qc, toast]);

  const guardar = useMutation({
    mutationFn: (cambios: Partial<Pick<BackupEstado, "habilitado" | "hora_utc" | "retencion">>) =>
      actualizarBackup(cambios),
    onSuccess: (nueva) => {
      qc.setQueryData(["backup"], nueva);
      toast.success("Configuración de respaldo guardada");
    },
    onError: () => toast.error("No se pudo guardar"),
  });

  const conectar = useMutation({
    mutationFn: conectarDrive,
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? "No se pudo iniciar la conexión con Drive"),
  });

  const desconectar = useMutation({
    mutationFn: desconectarDrive,
    onSuccess: (nueva) => {
      qc.setQueryData(["backup"], nueva);
      toast.success("Google Drive desconectado");
    },
    onError: () => toast.error("No se pudo desconectar"),
  });

  const correr = useMutation({
    mutationFn: ejecutarBackup,
    onSuccess: (r) => {
      toast.success(r.nombre ? `Respaldo subido: ${r.nombre}` : "Respaldo completado");
      qc.invalidateQueries({ queryKey: ["backup"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "El respaldo falló"),
  });

  const descargar = useMutation({
    mutationFn: descargarBackup,
    onSuccess: () => toast.success("Descarga iniciada"),
    onError: () => toast.error("No se pudo generar la descarga"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudo cargar la configuración de respaldo.
      </p>
    );
  }

  const pidiendoConexion = conectar.isPending;

  return (
    <div className="max-w-2xl space-y-5">
      {/* ── Descarga manual (siempre disponible) ── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-stone-800">Descargar la base de datos</p>
            <p className="mt-1 text-sm text-stone-500">
              Baja una copia completa del catálogo —incluidas las imágenes de portada— en un
              archivo comprimido (.sql.gz). Útil para guardar un respaldo en tu computadora.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => descargar.mutate()}
            disabled={descargar.isPending}
            className="shrink-0"
          >
            {descargar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar
          </Button>
        </div>
      </Card>

      {/* ── Respaldo automático en Google Drive ──
          Se muestra SOLO cuando el servidor tiene el cliente OAuth configurado
          (GDRIVE_CLIENT_ID/SECRET). Por ahora queda latente: el admin usa la
          descarga manual de arriba, y esta sección reaparece sola al desplegar
          en un ambiente real con las variables cargadas. */}
      {data.oauth_configurado && (
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <HardDriveDownload className="h-5 w-5 text-unla" />
          <h2 className="text-sm font-bold text-stone-800">Respaldo automático en Google Drive</h2>
        </div>

        {data.conectado ? (
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-stone-700">
                Conectado
                {data.drive_cuenta_email && (
                  <> como <span className="font-semibold">{data.drive_cuenta_email}</span></>
                )}{" "}
                — carpeta «LibrApp Backups»
              </span>
            </div>
            <Button
              variant="danger"
              className="shrink-0"
              disabled={desconectar.isPending}
              onClick={async () => {
                if (
                  await confirmar({
                    titulo: "Desconectar Google Drive",
                    mensaje: "Se dejará de subir el respaldo diario. Los archivos ya subidos no se borran.",
                    confirmar: "Desconectar",
                    tono: "danger",
                  })
                ) {
                  desconectar.mutate();
                }
              }}
            >
              {desconectar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-stone-500">
              Conectá una cuenta de Google para subir una copia de la base todos los días.
            </p>
            <Button
              className="mt-3"
              disabled={!data.oauth_configurado || pidiendoConexion}
              onClick={() => conectar.mutate()}
            >
              {pidiendoConexion ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Conectar con Google Drive
            </Button>
          </div>
        )}

        {/* ── Agenda (solo si hay Drive conectado) ── */}
        {data.conectado && (
          <div className="mt-5 space-y-5 border-t border-stone-200 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-stone-800">Respaldo diario</p>
                <p className="mt-1 text-sm text-stone-500">
                  Sube automáticamente una copia cada día a la hora elegida.
                </p>
              </div>
              <Toggle
                checked={data.habilitado}
                disabled={guardar.isPending}
                onChange={(v) => guardar.mutate({ habilitado: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-stone-800">Hora (Argentina)</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-unla focus:outline-none focus:ring-2 focus:ring-unla/25"
                  value={utcToAr(data.hora_utc)}
                  disabled={guardar.isPending}
                  onChange={(e) => guardar.mutate({ hora_utc: arToUtc(Number(e.target.value)) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{dosDigitos(h)}:00</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-stone-800">Copias a conservar</span>
                <Input
                  key={data.retencion}
                  type="number"
                  min={1}
                  max={365}
                  className="mt-1.5"
                  defaultValue={data.retencion}
                  disabled={guardar.isPending}
                  onBlur={(e) => {
                    const v = Math.min(365, Math.max(1, Number(e.target.value) || data.retencion));
                    if (v !== data.retencion) guardar.mutate({ retencion: v });
                  }}
                />
              </label>
            </div>

            <div>
              <Button
                variant="gold"
                disabled={correr.isPending}
                onClick={() => correr.mutate()}
              >
                {correr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Respaldar ahora
              </Button>
            </div>
          </div>
        )}

        {/* ── Estado del último respaldo ── */}
        {data.ultimo_backup_at && (
          <div className="mt-5 border-t border-stone-200 pt-4 text-sm">
            <p className="font-semibold text-stone-700">Último respaldo</p>
            <p className="mt-1 text-stone-500">
              {new Date(data.ultimo_backup_at).toLocaleString("es-AR")}
              {" — "}
              {data.ultimo_estado === "ok" ? (
                <span className="font-medium text-emerald-600">correcto</span>
              ) : (
                <span className="font-medium text-red-600">con error</span>
              )}
              {data.ultimo_nombre && data.ultimo_estado === "ok" && (
                <span className="text-stone-400"> ({data.ultimo_nombre})</span>
              )}
            </p>
            {data.ultimo_estado === "error" && data.ultimo_error && (
              <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{data.ultimo_error}</p>
            )}
          </div>
        )}
      </Card>
      )}
    </div>
  );
}
