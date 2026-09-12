"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, ImageIcon, ShieldCheck, Trash2, X } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatearBytes } from "@/lib/imagen";
import { crearZip } from "@/lib/zip";

export interface ResultadoLote {
  original: File;
  blob: Blob;
  nombre: string;
  ancho?: number;
  alto?: number;
  /** Texto corto extra para esa fila, ej. "ya estaba optimizada". */
  nota?: string;
}

interface ErrorLote {
  archivo: string;
  mensaje: string;
}

interface LoteImagenesProps {
  accept: string[];
  maxSizeMB?: number;
  maxArchivos?: number;
  tituloDropzone: string;
  /** Panel de opciones, controlado por la herramienta. Se muestra con la lista. */
  opciones?: ReactNode;
  /** Texto del botón principal. Recibe la cantidad de archivos. */
  etiquetaAccion: (cantidad: number) => string;
  /** Icono del botón principal. */
  iconoAccion?: ReactNode;
  /** Participio para el resumen: "convertidas", "comprimidas"... */
  verboResultado: string;
  /** Procesa UN archivo. Si lanza Error, su `message` se muestra al usuario. */
  procesar: (archivo: File) => Promise<ResultadoLote>;
  nombreZip: string;
  /** Mostrar ancho × alto de las imágenes originales en la lista. */
  mostrarDimensiones?: boolean;
}

/** URLs temporales para previsualizar blobs, liberadas al cambiar. */
function useObjectUrls(blobs: Blob[]): string[] {
  const urls = useMemo(() => blobs.map((b) => URL.createObjectURL(b)), [blobs]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

/** "convertidas a JPG" → "convertida a JPG" cuando hay un solo resultado. */
function concordar(verbo: string, cantidad: number): string {
  return cantidad === 1 ? verbo.replace(/^(S+)as/, "$1a") : verbo;
}

function claveDe(f: File) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

const MINIATURA =
  "size-12 shrink-0 rounded border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:8px_8px] object-contain";

/**
 * Miniatura con respaldo: si el navegador no puede dibujar el formato
 * (HEIC en Chrome, por ejemplo) muestra un ícono en vez de la imagen rota.
 */
function Miniatura({ src }: { src: string }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    return (
      <div className={cn(MINIATURA, "flex items-center justify-center text-muted-foreground")} aria-hidden="true">
        <ImageIcon className="size-5" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={MINIATURA} onError={() => setFallo(true)} />;
}

/**
 * Flujo genérico "varias imágenes → varias imágenes": selección con
 * miniaturas, opciones, progreso por archivo, errores parciales, resultados
 * con descarga individual y ZIP. Las herramientas solo aportan `procesar`
 * y su panel de opciones.
 */
export function LoteImagenes({
  accept,
  maxSizeMB = 50,
  maxArchivos = 50,
  tituloDropzone,
  opciones,
  etiquetaAccion,
  iconoAccion,
  verboResultado,
  procesar,
  nombreZip,
  mostrarDimensiones = false,
}: LoteImagenesProps) {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [dimensiones, setDimensiones] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [resultados, setResultados] = useState<ResultadoLote[]>([]);
  const [errores, setErrores] = useState<ErrorLote[]>([]);
  const [zip, setZip] = useState<Blob | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string>();

  const urlsOriginales = useObjectUrls(useMemo(() => archivos as Blob[], [archivos]));
  const urlsResultados = useObjectUrls(useMemo(() => resultados.map((r) => r.blob), [resultados]));

  // Lee ancho × alto de las imágenes nuevas en segundo plano (opcional).
  useEffect(() => {
    if (!mostrarDimensiones) return;
    const pendientes = archivos.filter((a) => !(claveDe(a) in dimensiones));
    if (pendientes.length === 0) return;
    let cancelado = false;
    (async () => {
      for (const a of pendientes) {
        let texto = "";
        try {
          const bmp = await createImageBitmap(a);
          texto = `${bmp.width} × ${bmp.height} px`;
          bmp.close();
        } catch {
          texto = "no se pudo leer";
        }
        if (cancelado) return;
        setDimensiones((d) => ({ ...d, [claveDe(a)]: texto }));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [archivos, dimensiones, mostrarDimensiones]);

  const agregar = (nuevos: File[]) =>
    setArchivos((previos) => {
      const claves = new Set(previos.map(claveDe));
      return [...previos, ...nuevos.filter((n) => !claves.has(claveDe(n)))].slice(0, maxArchivos);
    });

  const quitar = (i: number) => setArchivos((p) => p.filter((_, k) => k !== i));

  const reiniciar = () => {
    setArchivos([]);
    setDimensiones({});
    setResultados([]);
    setErrores([]);
    setZip(null);
    setErrorGeneral(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  const ejecutar = async () => {
    if (archivos.length === 0) return;
    setEstado("procesando");
    setErrorGeneral(undefined);
    setProgreso(0);
    const ok: ResultadoLote[] = [];
    const fallidos: ErrorLote[] = [];
    for (let i = 0; i < archivos.length; i++) {
      setProgreso((i / archivos.length) * 100);
      setMensajeProgreso(
        archivos.length > 1 ? `Procesando ${i + 1} de ${archivos.length}: ${archivos[i].name}` : "Procesando…",
      );
      try {
        ok.push(await procesar(archivos[i]));
      } catch (e) {
        fallidos.push({
          archivo: archivos[i].name,
          mensaje: e instanceof Error ? e.message : "No se pudo procesar.",
        });
      }
    }
    if (ok.length === 0) {
      setErrorGeneral(fallidos[0]?.mensaje ?? "No se pudo procesar ninguna imagen.");
      setEstado("error");
      return;
    }
    setResultados(ok);
    setErrores(fallidos);
    setEstado("listo");
    if (ok.length > 1) {
      // El ZIP se arma en segundo plano mientras el usuario mira los resultados.
      crearZip(ok.map((r) => ({ nombre: r.nombre, blob: r.blob })))
        .then(setZip)
        .catch(() => setZip(null));
    }
  };

  const totalOriginal = resultados.reduce((s, r) => s + r.original.size, 0);
  const totalFinal = resultados.reduce((s, r) => s + r.blob.size, 0);
  const cambio = totalOriginal > 0 ? Math.round(((totalFinal - totalOriginal) / totalOriginal) * 100) : 0;

  return (
    <ProcessingCard
      estado={estado}
      progreso={progreso}
      mensajeProgreso={mensajeProgreso}
      mensajeError={errorGeneral}
      onReintentar={ejecutar}
      onReiniciar={reiniciar}
    >
      {estado === "idle" && (
        <div className="space-y-4">
          {archivos.length === 0 ? (
            <FileDropzone
              accept={accept}
              maxSizeMB={maxSizeMB}
              multiple
              onFiles={agregar}
              titulo={tituloDropzone}
              descripcion={`o toca para seleccionarlas (hasta ${maxArchivos} a la vez)`}
            />
          ) : (
            <>
              <ul className="divide-y rounded-lg border" aria-label="Imágenes seleccionadas">
                {archivos.map((a, i) => (
                  <li key={claveDe(a)} className="flex items-center gap-3 p-2 text-sm">
                    <Miniatura src={urlsOriginales[i]} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {mostrarDimensiones && dimensiones[claveDe(a)] && `${dimensiones[claveDe(a)]} · `}
                        {formatearBytes(a.size)}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => quitar(i)} aria-label={`Quitar ${a.name}`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>

              {archivos.length < maxArchivos && (
                <FileDropzone
                  accept={accept}
                  maxSizeMB={maxSizeMB}
                  multiple
                  onFiles={agregar}
                  titulo="Agregar más imágenes"
                  descripcion="Arrastra o toca para sumar más al lote"
                  className="[&>div]:min-h-28 [&>div]:py-4"
                />
              )}

              {opciones}

              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={ejecutar}>
                  {iconoAccion}
                  {etiquetaAccion(archivos.length)}
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
                {resultados.length} {resultados.length === 1 ? "imagen" : "imágenes"}{" "}
                {concordar(verboResultado, resultados.length)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {formatearBytes(totalOriginal)} → {formatearBytes(totalFinal)} ({cambio > 0 ? "+" : ""}
                {cambio}%)
              </span>
            </p>
            {resultados.length > 1 && (
              <DownloadButton
                archivo={zip}
                nombreArchivo={nombreZip}
                label={zip ? "Descargar todo (ZIP)" : "Preparando ZIP…"}
                size="default"
              />
            )}
          </div>

          {errores.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>
                {errores.length === 1 ? "Una imagen no se pudo procesar" : `${errores.length} imágenes no se pudieron procesar`}
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {errores.map((e, i) => (
                    <li key={i}>
                      {e.archivo}: {e.mensaje}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <ul className="divide-y rounded-lg border" aria-label="Resultados">
            {resultados.map((r, i) => (
              <li key={i} className="flex items-center gap-3 p-2 text-sm">
                <Miniatura src={urlsResultados[i]} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.ancho && r.alto && `${r.ancho} × ${r.alto} px · `}
                    {formatearBytes(r.original.size)} → {formatearBytes(r.blob.size)}
                    {r.nota && ` · ${r.nota}`}
                  </p>
                </div>
                <DownloadButton archivo={r.blob} nombreArchivo={r.nombre} label="" size="sm" variant="outline" />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Procesar otras imágenes
            </Button>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Procesado en tu navegador. Tus imágenes no se subieron a ningún servidor.
          </p>
        </div>
      )}
    </ProcessingCard>
  );
}
