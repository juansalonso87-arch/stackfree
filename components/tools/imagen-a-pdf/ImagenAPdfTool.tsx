"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileText, ShieldCheck, Trash2, X } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import type { PropsHerramienta } from "@/lib/tools-registry";
import {
  FORMATOS_ENTRADA,
  MAX_ARCHIVOS,
  OPCIONES_POR_DEFECTO,
  formatearBytes,
  imagenesAPdf,
  type Margen,
  type OpcionesPdf,
  type Orientacion,
  type ResultadoPdf,
  type TamanoPagina,
} from "./logic";

function claveDe(f: File) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

function useObjectUrls(blobs: Blob[]): string[] {
  const urls = useMemo(() => blobs.map((b) => URL.createObjectURL(b)), [blobs]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

/** Grupo de botones excluyentes (tamaño, orientación, margen). */
function Selector<T extends string>({
  titulo,
  valor,
  opciones,
  onCambio,
  deshabilitado,
}: {
  titulo: string;
  valor: T;
  opciones: { valor: T; etiqueta: string }[];
  onCambio: (v: T) => void;
  deshabilitado?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={deshabilitado}>
      <legend className="text-sm font-medium">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <Button
            key={o.valor}
            type="button"
            size="sm"
            variant={valor === o.valor ? "default" : "outline"}
            onClick={() => onCambio(o.valor)}
            aria-pressed={valor === o.valor}
            disabled={deshabilitado}
          >
            {o.etiqueta}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Interfaz de "Imagen a PDF": lista ordenable de imágenes + opciones de
 * página → un PDF con una imagen por página.
 */
export default function ImagenAPdfTool({ opciones: opcionesVariante }: PropsHerramienta) {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [opciones, setOpciones] = useState<OpcionesPdf>(OPCIONES_POR_DEFECTO);
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoPdf | null>(null);

  const blobs = useMemo(() => archivos as Blob[], [archivos]);
  const urls = useObjectUrls(blobs);

  const formatoNombre =
    typeof opcionesVariante?.formatoNombre === "string" ? opcionesVariante.formatoNombre : "imágenes";

  const agregar = (nuevos: File[]) => {
    setArchivos((previos) => {
      const claves = new Set(previos.map(claveDe));
      return [...previos, ...nuevos.filter((n) => !claves.has(claveDe(n)))].slice(0, MAX_ARCHIVOS);
    });
  };
  const quitar = (i: number) => setArchivos((p) => p.filter((_, k) => k !== i));
  const mover = (i: number, d: -1 | 1) =>
    setArchivos((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const c = [...p];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const reiniciar = () => {
    setArchivos([]);
    setResultado(null);
    setError(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  const convertir = async () => {
    if (archivos.length === 0) return;
    setEstado("procesando");
    setError(undefined);
    setProgreso(0);
    setMensajeProgreso("Creando PDF…");
    try {
      const r = await imagenesAPdf(archivos, opciones, (hechos, total, nombre) => {
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

  return (
    <ProcessingCard
      estado={estado}
      progreso={progreso}
      mensajeProgreso={mensajeProgreso}
      mensajeError={error}
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
              onFiles={agregar}
              titulo={`Arrastra tus ${formatoNombre} aquí`}
              descripcion={`o toca para seleccionarlas (hasta ${MAX_ARCHIVOS}, una por página)`}
            />
          ) : (
            <>
              {archivos.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  Cada imagen será una página. El orden de la lista es el orden del PDF.
                </p>
              )}
              <ol className="divide-y rounded-lg border" aria-label="Imágenes en orden">
                {archivos.map((a, i) => (
                  <li key={claveDe(a)} className="flex items-center gap-3 p-2 text-sm">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urls[i]}
                      alt=""
                      className="size-12 shrink-0 rounded border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:8px_8px] object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{formatearBytes(a.size)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${a.name}`}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => mover(i, 1)} disabled={i === archivos.length - 1} aria-label={`Bajar ${a.name}`}>
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => quitar(i)} aria-label={`Quitar ${a.name}`}>
                        <X />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>

              {archivos.length < MAX_ARCHIVOS && (
                <FileDropzone
                  accept={FORMATOS_ENTRADA}
                  maxSizeMB={50}
                  multiple
                  onFiles={agregar}
                  titulo="Agregar más imágenes"
                  descripcion="Arrastra o toca para sumar más páginas"
                  className="[&>div]:min-h-28 [&>div]:py-4"
                />
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <Selector<TamanoPagina>
                  titulo="Tamaño de página"
                  valor={opciones.tamano}
                  onCambio={(tamano) => setOpciones((o) => ({ ...o, tamano }))}
                  opciones={[
                    { valor: "a4", etiqueta: "A4" },
                    { valor: "carta", etiqueta: "Carta" },
                    { valor: "ajustar", etiqueta: "Igual a la imagen" },
                  ]}
                />
                <Selector<Orientacion>
                  titulo="Orientación"
                  valor={opciones.orientacion}
                  onCambio={(orientacion) => setOpciones((o) => ({ ...o, orientacion }))}
                  deshabilitado={opciones.tamano === "ajustar"}
                  opciones={[
                    { valor: "auto", etiqueta: "Automática" },
                    { valor: "vertical", etiqueta: "Vertical" },
                    { valor: "horizontal", etiqueta: "Horizontal" },
                  ]}
                />
                <Selector<Margen>
                  titulo="Márgenes"
                  valor={opciones.margen}
                  onCambio={(margen) => setOpciones((o) => ({ ...o, margen }))}
                  opciones={[
                    { valor: "ninguno", etiqueta: "Sin margen" },
                    { valor: "chico", etiqueta: "Chico" },
                    { valor: "normal", etiqueta: "Normal" },
                  ]}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={convertir}>
                  <FileText data-icon="inline-start" />
                  Crear PDF {archivos.length > 1 && `(${archivos.length} páginas)`}
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

      {estado === "listo" && resultado && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{resultado.nombre}</p>
              <p className="text-sm text-muted-foreground">
                {resultado.paginas} {resultado.paginas === 1 ? "página" : "páginas"} · {formatearBytes(resultado.blob.size)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadButton archivo={resultado.blob} nombreArchivo={resultado.nombre} label="Descargar PDF" />
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Convertir otras imágenes
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Creado en tu navegador. Tus imágenes no se subieron a ningún servidor.
          </p>
        </div>
      )}
    </ProcessingCard>
  );
}
