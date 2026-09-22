"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, FileText, Layers, Trash2, X } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NotaPrivacidad } from "@/components/core/NotaPrivacidad";
import {
  MAX_ARCHIVOS,
  MAX_MB_POR_ARCHIVO,
  formatearBytes,
  inspeccionarPdf,
  unirPdfs,
  type ResultadoUnion,
} from "./logic";

/** Identificador estable de un File para asociarle información. */
function claveDe(f: File) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

type InfoArchivo = { paginas?: number; error?: string };

/**
 * Interfaz de "Unir PDF": lista ordenable de archivos → un solo PDF.
 * El orden de la lista es el orden en el documento final.
 */
export default function UnirPdfTool() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [info, setInfo] = useState<Record<string, InfoArchivo>>({});
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoUnion | null>(null);

  // Cuenta las páginas de cada PDF nuevo en segundo plano (y detecta los
  // protegidos o dañados antes de intentar unir).
  useEffect(() => {
    const pendientes = archivos.filter((a) => !(claveDe(a) in info));
    if (pendientes.length === 0) return;
    let cancelado = false;
    (async () => {
      for (const a of pendientes) {
        const clave = claveDe(a);
        let datos: InfoArchivo;
        try {
          datos = { paginas: (await inspeccionarPdf(a)).paginas };
        } catch (e) {
          datos = { error: e instanceof Error ? e.message : "No se pudo leer." };
        }
        if (cancelado) return;
        setInfo((previo) => ({ ...previo, [clave]: datos }));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [archivos, info]);

  const agregar = (nuevos: File[]) => {
    setArchivos((previos) => {
      const claves = new Set(previos.map(claveDe));
      const sinRepetidos = nuevos.filter((n) => !claves.has(claveDe(n)));
      return [...previos, ...sinRepetidos].slice(0, MAX_ARCHIVOS);
    });
  };

  const quitar = (i: number) => setArchivos((p) => p.filter((_, k) => k !== i));

  const mover = (i: number, direccion: -1 | 1) => {
    setArchivos((p) => {
      const j = i + direccion;
      if (j < 0 || j >= p.length) return p;
      const copia = [...p];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  };

  const reiniciar = () => {
    setArchivos([]);
    setInfo({});
    setResultado(null);
    setError(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  const unir = async () => {
    if (archivos.length < 2) return;
    setEstado("procesando");
    setError(undefined);
    setProgreso(0);
    setMensajeProgreso("Uniendo…");
    try {
      const r = await unirPdfs(archivos, (hechos, total, nombre) => {
        setProgreso((hechos / total) * 100);
        setMensajeProgreso(hechos < total ? `Agregando ${hechos + 1} de ${total}: ${nombre}` : nombre);
      });
      setResultado(r);
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  const conError = archivos.filter((a) => info[claveDe(a)]?.error);
  const totalPaginas = archivos.reduce((s, a) => s + (info[claveDe(a)]?.paginas ?? 0), 0);
  const listoParaUnir = archivos.length >= 2 && conError.length === 0;

  return (
    <ProcessingCard
      estado={estado}
      progreso={progreso}
      mensajeProgreso={mensajeProgreso}
      mensajeError={error}
      onReintentar={unir}
      onReiniciar={reiniciar}
    >
      {estado === "idle" && (
        <div className="space-y-4">
          {archivos.length === 0 ? (
            <FileDropzone
              accept={["application/pdf"]}
              maxSizeMB={MAX_MB_POR_ARCHIVO}
              multiple
              onFiles={agregar}
              titulo="Arrastra tus PDF aquí"
              descripcion={`o toca para seleccionarlos (hasta ${MAX_ARCHIVOS})`}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                El orden de la lista es el orden del PDF final. Usa las flechas para reordenar.
              </p>
              <ol className="divide-y rounded-lg border" aria-label="PDF a unir, en orden">
                {archivos.map((a, i) => {
                  const datos = info[claveDe(a)];
                  return (
                    <li key={claveDe(a)} className="flex items-center gap-3 p-2 text-sm">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                        {i + 1}
                      </span>
                      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className={datos?.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          {datos?.error
                            ? datos.error
                            : datos
                              ? `${datos.paginas} ${datos.paginas === 1 ? "página" : "páginas"} · ${formatearBytes(a.size)}`
                              : `Leyendo… · ${formatearBytes(a.size)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => mover(i, -1)}
                          disabled={i === 0}
                          aria-label={`Subir ${a.name}`}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => mover(i, 1)}
                          disabled={i === archivos.length - 1}
                          aria-label={`Bajar ${a.name}`}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => quitar(i)}
                          aria-label={`Quitar ${a.name}`}
                        >
                          <X />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {archivos.length < MAX_ARCHIVOS && (
                <FileDropzone
                  accept={["application/pdf"]}
                  maxSizeMB={MAX_MB_POR_ARCHIVO}
                  multiple
                  onFiles={agregar}
                  titulo="Agregar más PDF"
                  descripcion="Arrastra o toca para sumar más"
                  className="[&>div]:min-h-28 [&>div]:py-4"
                />
              )}

              {conError.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Hay archivos que no se pueden unir</AlertTitle>
                  <AlertDescription>Quítalos de la lista (botón ✕) para continuar.</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="lg" onClick={unir} disabled={!listoParaUnir}>
                  <Layers data-icon="inline-start" />
                  Unir {archivos.length} PDF
                  {totalPaginas > 0 && <span className="text-xs opacity-70">({totalPaginas} páginas)</span>}
                </Button>
                <Button size="lg" variant="outline" onClick={reiniciar}>
                  <Trash2 data-icon="inline-start" />
                  Vaciar lista
                </Button>
                {archivos.length < 2 && (
                  <span className="text-xs text-muted-foreground">Agrega al menos 2 archivos.</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {estado === "listo" && resultado && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{resultado.nombre}</p>
              <p className="text-sm text-muted-foreground">
                {resultado.paginas} páginas · {formatearBytes(resultado.blob.size)} · {archivos.length} archivos unidos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <DownloadButton archivo={resultado.blob} nombreArchivo={resultado.nombre} label="Descargar PDF" />
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Unir otros PDF
            </Button>
          </div>

          <NotaPrivacidad texto="Unido en tu navegador. Tus documentos no se subieron a ningún servidor." />
        </div>
      )}
    </ProcessingCard>
  );
}
