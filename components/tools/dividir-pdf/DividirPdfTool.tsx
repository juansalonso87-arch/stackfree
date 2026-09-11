"use client";

import { useEffect, useState } from "react";
import { FileText, Scissors, ShieldCheck } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import type { PropsHerramienta } from "@/lib/tools-registry";
import {
  MAX_MB,
  contarPaginas,
  dividirPdf,
  formatearBytes,
  interpretarRango,
  type ModoDivision,
  type ResultadoDivision,
} from "./logic";

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Interfaz de "Dividir PDF". `opciones.modo` (variante "extraer páginas")
 * preselecciona el modo rango.
 */
export default function DividirPdfTool({ opciones }: PropsHerramienta) {
  const modoInicial: ModoDivision = opciones?.modo === "rango" ? "rango" : "todas";
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paginas, setPaginas] = useState<number | null>(null);
  const [errorLectura, setErrorLectura] = useState<string>();
  const [modo, setModo] = useState<ModoDivision>(modoInicial);
  const [rango, setRango] = useState("");
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoDivision | null>(null);

  // Cuenta las páginas apenas se elige el archivo.
  useEffect(() => {
    if (!archivo) return;
    let cancelado = false;
    contarPaginas(archivo)
      .then((n) => !cancelado && setPaginas(n))
      .catch((e) => !cancelado && setErrorLectura(e instanceof Error ? e.message : "No se pudo leer."));
    return () => {
      cancelado = true;
    };
  }, [archivo]);

  const reiniciar = () => {
    setArchivo(null);
    setPaginas(null);
    setErrorLectura(undefined);
    setRango("");
    setResultado(null);
    setError(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  // Validación en vivo del rango (sin bloquear la escritura).
  let avisoRango: string | undefined;
  let paginasSeleccionadas = 0;
  if (modo === "rango" && paginas && rango.trim()) {
    try {
      paginasSeleccionadas = interpretarRango(rango, paginas).length;
    } catch (e) {
      avisoRango = e instanceof Error ? e.message : undefined;
    }
  }

  const listo =
    !!archivo && !!paginas && !errorLectura && (modo === "todas" || (paginasSeleccionadas > 0 && !avisoRango));

  const ejecutar = async () => {
    if (!archivo || !listo) return;
    setEstado("procesando");
    setError(undefined);
    setProgreso(0);
    setMensajeProgreso(modo === "todas" ? "Separando páginas…" : "Extrayendo páginas…");
    try {
      const r = await dividirPdf(archivo, modo, rango, (hechos, total) => {
        setProgreso((hechos / total) * 100);
        if (modo === "todas") setMensajeProgreso(`Separando página ${Math.min(hechos + 1, total)} de ${total}…`);
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
      onReintentar={ejecutar}
      onReiniciar={reiniciar}
    >
      {estado === "idle" && !archivo && (
        <FileDropzone
          accept={["application/pdf"]}
          maxSizeMB={MAX_MB}
          onFiles={(a) => setArchivo(a[0])}
          titulo="Arrastra tu PDF aquí"
          descripcion="o toca para seleccionarlo"
        />
      )}

      {estado === "idle" && archivo && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{archivo.name}</p>
              <p className={errorLectura ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errorLectura ??
                  (paginas === null
                    ? `Leyendo… · ${formatearBytes(archivo.size)}`
                    : `${paginas} ${paginas === 1 ? "página" : "páginas"} · ${formatearBytes(archivo.size)}`)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>
              Cambiar
            </Button>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Qué quieres hacer</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={modo === "todas" ? "default" : "outline"}
                onClick={() => setModo("todas")}
                aria-pressed={modo === "todas"}
              >
                Separar todas las páginas
              </Button>
              <Button
                type="button"
                variant={modo === "rango" ? "default" : "outline"}
                onClick={() => setModo("rango")}
                aria-pressed={modo === "rango"}
              >
                Extraer algunas páginas
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {modo === "todas"
                ? "Cada página se convierte en un PDF independiente. Los recibes todos juntos en un ZIP."
                : "Escribe las páginas que quieres conservar y se crea un solo PDF con ellas, en ese orden."}
            </p>
          </fieldset>

          {modo === "rango" && (
            <div className="space-y-1 sm:max-w-sm">
              <label htmlFor="rango" className="text-sm font-medium">
                Páginas a extraer
              </label>
              <input
                id="rango"
                type="text"
                inputMode="numeric"
                placeholder={paginas ? `Ej: 1-3, 5, ${paginas}` : "Ej: 1-3, 5, 8-10"}
                value={rango}
                onChange={(e) => setRango(e.target.value)}
                className={CAMPO}
                aria-invalid={!!avisoRango}
                aria-describedby="rango-ayuda"
              />
              <p id="rango-ayuda" className={avisoRango ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {avisoRango ??
                  (paginasSeleccionadas > 0
                    ? `Se extraerán ${paginasSeleccionadas} ${paginasSeleccionadas === 1 ? "página" : "páginas"}.`
                    : "Separa con comas; usa guion para rangos.")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={ejecutar} disabled={!listo}>
              <Scissors data-icon="inline-start" />
              {modo === "todas" ? "Separar páginas" : "Extraer páginas"}
            </Button>
          </div>
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
                {resultado.archivos > 1
                  ? `${resultado.archivos} PDF de una página cada uno`
                  : `${resultado.paginas} ${resultado.paginas === 1 ? "página" : "páginas"}`}{" "}
                · {formatearBytes(resultado.blob.size)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadButton
              archivo={resultado.blob}
              nombreArchivo={resultado.nombre}
              label={resultado.archivos > 1 ? "Descargar ZIP" : "Descargar PDF"}
            />
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Dividir otro PDF
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Procesado en tu navegador. Tu documento no se subió a ningún servidor.
          </p>
        </div>
      )}
    </ProcessingCard>
  );
}
