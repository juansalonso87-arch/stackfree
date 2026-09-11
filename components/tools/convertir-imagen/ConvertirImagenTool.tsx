"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileImage, Repeat, ShieldCheck, Trash2, X } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PropsHerramienta } from "@/lib/tools-registry";
import {
  FORMATOS_ENTRADA,
  FORMATOS_SALIDA,
  MAX_ARCHIVOS,
  convertirVarias,
  crearZip,
  formatearBytes,
  puedeCodificar,
  type ErrorConversion,
  type FormatoSalida,
  type ResultadoConversion,
} from "./logic";

const CALIDAD_POR_DEFECTO = 90;

/** URLs temporales para previsualizar una lista de blobs, liberadas al cambiar. */
function useObjectUrls(blobs: Blob[]): string[] {
  const urls = useMemo(() => blobs.map((b) => URL.createObjectURL(b)), [blobs]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function esFormatoSalida(valor: unknown): valor is FormatoSalida {
  return FORMATOS_SALIDA.some((f) => f.mime === valor);
}

/**
 * Interfaz de "Convertir formato de imagen".
 * `opciones.formatoSalida` (de las variantes SEO) preselecciona el formato.
 */
export default function ConvertirImagenTool({ opciones }: PropsHerramienta) {
  const formatoInicial = esFormatoSalida(opciones?.formatoSalida) ? opciones.formatoSalida : "image/jpeg";

  const [archivos, setArchivos] = useState<File[]>([]);
  const [formato, setFormato] = useState<FormatoSalida>(formatoInicial);
  const [calidad, setCalidad] = useState(CALIDAD_POR_DEFECTO);
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [resultados, setResultados] = useState<ResultadoConversion[]>([]);
  const [errores, setErrores] = useState<ErrorConversion[]>([]);
  const [zip, setZip] = useState<Blob | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string>();

  const blobsOriginales = useMemo(() => archivos as Blob[], [archivos]);
  const blobsResultados = useMemo(() => resultados.map((r) => r.blob), [resultados]);
  const urlsOriginales = useObjectUrls(blobsOriginales);
  const urlsResultados = useObjectUrls(blobsResultados);

  const infoFormato = FORMATOS_SALIDA.find((f) => f.mime === formato)!;

  const agregarArchivos = (nuevos: File[]) => {
    setArchivos((previos) => [...previos, ...nuevos].slice(0, MAX_ARCHIVOS));
  };

  const quitarArchivo = (indice: number) => {
    setArchivos((previos) => previos.filter((_, i) => i !== indice));
  };

  const reiniciar = () => {
    setArchivos([]);
    setResultados([]);
    setErrores([]);
    setZip(null);
    setErrorGeneral(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  const convertir = async () => {
    if (archivos.length === 0) return;
    setEstado("procesando");
    setErrorGeneral(undefined);
    setProgreso(0);
    setMensajeProgreso("Convirtiendo…");
    try {
      const { resultados: ok, errores: fallidos } = await convertirVarias(
        archivos,
        { formato, calidad: calidad / 100 },
        (hechos, total, nombre) => {
          setProgreso((hechos / total) * 100);
          setMensajeProgreso(
            total > 1 ? `Convirtiendo ${Math.min(hechos + 1, total)} de ${total}: ${nombre}` : "Convirtiendo…",
          );
        },
      );
      if (ok.length === 0) {
        setErrorGeneral(fallidos[0]?.message ?? "No se pudo convertir ninguna imagen.");
        setEstado("error");
        return;
      }
      setResultados(ok);
      setErrores(fallidos);
      setEstado("listo");
      if (ok.length > 1) {
        // El ZIP se arma en segundo plano mientras el usuario mira los resultados.
        crearZip(ok)
          .then(setZip)
          .catch(() => setZip(null));
      }
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  const totalOriginal = resultados.reduce((s, r) => s + r.original.size, 0);
  const totalConvertido = resultados.reduce((s, r) => s + r.blob.size, 0);

  const SelectorFormato = (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Convertir a</legend>
        <div className="flex flex-wrap gap-2">
          {FORMATOS_SALIDA.map((f) => (
            <Button
              key={f.mime}
              type="button"
              variant={formato === f.mime ? "default" : "outline"}
              onClick={() => setFormato(f.mime)}
              aria-pressed={formato === f.mime}
              disabled={!puedeCodificar(f.mime)}
              title={!puedeCodificar(f.mime) ? "Tu navegador no puede generar este formato" : undefined}
            >
              {f.nombre}
            </Button>
          ))}
        </div>
      </fieldset>

      {infoFormato.conCalidad && (
        <div className="space-y-2">
          <label htmlFor="calidad" className="flex items-center justify-between text-sm font-medium">
            Calidad
            <span className="text-muted-foreground tabular-nums">{calidad}%</span>
          </label>
          <input
            id="calidad"
            type="range"
            min={50}
            max={100}
            step={5}
            value={calidad}
            onChange={(e) => setCalidad(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            90% es un buen equilibrio. Menos calidad = archivo más liviano.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <ProcessingCard
      estado={estado}
      progreso={progreso}
      mensajeProgreso={mensajeProgreso}
      mensajeError={errorGeneral}
      onReintentar={convertir}
      onReiniciar={reiniciar}
    >
      {estado === "idle" && (
        <div className="space-y-4">
          {archivos.length === 0 ? (
            <FileDropzone
              accept={FORMATOS_ENTRADA}
              maxSizeMB={50}
              multiple
              onFiles={agregarArchivos}
              titulo="Arrastra tus imágenes aquí"
              descripcion={`o toca para seleccionarlas (hasta ${MAX_ARCHIVOS} a la vez)`}
            />
          ) : (
            <>
              <ul className="divide-y rounded-lg border" aria-label="Imágenes seleccionadas">
                {archivos.map((a, i) => (
                  <li key={`${a.name}-${a.lastModified}-${i}`} className="flex items-center gap-3 p-2 text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlsOriginales[i]}
                      alt=""
                      className="size-12 shrink-0 rounded border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:8px_8px] object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{formatearBytes(a.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => quitarArchivo(i)}
                      aria-label={`Quitar ${a.name}`}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>

              {archivos.length < MAX_ARCHIVOS && (
                <FileDropzone
                  accept={FORMATOS_ENTRADA}
                  maxSizeMB={50}
                  multiple
                  onFiles={agregarArchivos}
                  titulo="Agregar más imágenes"
                  descripcion="Arrastra o toca para sumar más al lote"
                  className="[&>div]:min-h-28 [&>div]:py-4"
                />
              )}

              {SelectorFormato}

              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={convertir}>
                  <Repeat data-icon="inline-start" />
                  Convertir {archivos.length > 1 ? `${archivos.length} imágenes` : "imagen"} a {infoFormato.nombre}
                </Button>
                <Button size="lg" variant="outline" onClick={reiniciar}>
                  <Trash2 data-icon="inline-start" />
                  Vaciar lista
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {estado === "listo" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {resultados.length} {resultados.length === 1 ? "imagen convertida" : "imágenes convertidas"} a{" "}
                {infoFormato.nombre}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {formatearBytes(totalOriginal)} → {formatearBytes(totalConvertido)}
                {totalOriginal > 0 && (
                  <> ({Math.round(((totalConvertido - totalOriginal) / totalOriginal) * 100)}%)</>
                )}
              </span>
            </p>
            {resultados.length > 1 && (
              <DownloadButton
                archivo={zip}
                nombreArchivo={`imagenes-${infoFormato.extension}.zip`}
                label={zip ? "Descargar todo (ZIP)" : "Preparando ZIP…"}
                size="default"
              />
            )}
          </div>

          {errores.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>
                {errores.length === 1 ? "Una imagen no se pudo convertir" : `${errores.length} imágenes no se pudieron convertir`}
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {errores.map((e, i) => (
                    <li key={i}>
                      {e.archivo}: {e.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <ul className="divide-y rounded-lg border" aria-label="Imágenes convertidas">
            {resultados.map((r, i) => (
              <li key={i} className="flex items-center gap-3 p-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlsResultados[i]}
                  alt=""
                  className="size-12 shrink-0 rounded border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:8px_8px] object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.ancho} × {r.alto} px · {formatearBytes(r.original.size)} → {formatearBytes(r.blob.size)}
                  </p>
                </div>
                <DownloadButton archivo={r.blob} nombreArchivo={r.nombre} label="" size="sm" variant="outline" />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={reiniciar}>
              <FileImage data-icon="inline-start" />
              Convertir otras imágenes
            </Button>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Convertido en tu navegador. Tus imágenes no se subieron a ningún servidor.
          </p>
        </div>
      )}
    </ProcessingCard>
  );
}
