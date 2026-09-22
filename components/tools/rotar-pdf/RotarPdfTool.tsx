"use client";

import { useEffect, useState } from "react";
import { FileText, RotateCcw, RotateCw } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import { NotaPrivacidad } from "@/components/core/NotaPrivacidad";
import {
  ANGULOS,
  MAX_MB,
  contarPaginas,
  formatearBytes,
  interpretarRango,
  rotarPdf,
  textoPaginas,
  type AlcanceRotacion,
  type Angulo,
  type ResultadoRotacion,
} from "./logic";

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Interfaz de "Rotar PDF": elegir ángulo, todas o algunas páginas, y listo. */
export default function RotarPdfTool() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paginas, setPaginas] = useState<number | null>(null);
  const [errorLectura, setErrorLectura] = useState<string>();
  const [angulo, setAngulo] = useState<Angulo>(90);
  const [alcance, setAlcance] = useState<AlcanceRotacion>("todas");
  const [rango, setRango] = useState("");
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoRotacion | null>(null);

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
    setEstado("idle");
  };

  // Validación en vivo del rango (sin bloquear la escritura).
  let avisoRango: string | undefined;
  let seleccionadas = 0;
  if (alcance === "rango" && paginas && rango.trim()) {
    try {
      seleccionadas = new Set(interpretarRango(rango, paginas)).size;
    } catch (e) {
      avisoRango = e instanceof Error ? e.message : undefined;
    }
  }

  const listo =
    !!archivo && !!paginas && !errorLectura && (alcance === "todas" || (seleccionadas > 0 && !avisoRango));

  const ejecutar = async () => {
    if (!archivo || !listo) return;
    setEstado("procesando");
    setError(undefined);
    try {
      setResultado(await rotarPdf(archivo, angulo, alcance, rango));
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  return (
    <ProcessingCard
      estado={estado}
      mensajeProgreso="Rotando páginas…"
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
                    : `${textoPaginas(paginas)} · ${formatearBytes(archivo.size)}`)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>
              Cambiar
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
            {/* Vista previa esquemática: una "hoja" girada según el ángulo elegido. */}
            <div
              className="flex size-28 items-center justify-center rounded-lg border bg-muted/30"
              aria-hidden="true"
            >
              <div
                className="flex h-16 w-12 flex-col gap-1 rounded-sm border-2 border-primary/60 bg-background p-1.5 transition-transform duration-300"
                style={{ transform: `rotate(${angulo}deg)` }}
              >
                <span className="h-1 w-6 rounded bg-primary/60" />
                <span className="h-1 w-8 rounded bg-muted-foreground/40" />
                <span className="h-1 w-7 rounded bg-muted-foreground/40" />
                <span className="h-1 w-8 rounded bg-muted-foreground/40" />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Cuánto rotar</legend>
              <div className="flex flex-wrap gap-2">
                {ANGULOS.map((a) => (
                  <Button
                    key={a.valor}
                    type="button"
                    variant={angulo === a.valor ? "default" : "outline"}
                    onClick={() => setAngulo(a.valor)}
                    aria-pressed={angulo === a.valor}
                    title={a.descripcion}
                  >
                    {a.valor === 270 ? (
                      <RotateCcw data-icon="inline-start" />
                    ) : (
                      <RotateCw data-icon="inline-start" />
                    )}
                    {a.nombre}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Si el PDF ya venía girado, la rotación se suma a la que tenía.
              </p>
            </fieldset>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Qué páginas</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={alcance === "todas" ? "default" : "outline"}
                onClick={() => setAlcance("todas")}
                aria-pressed={alcance === "todas"}
              >
                Todas las páginas
              </Button>
              <Button
                type="button"
                variant={alcance === "rango" ? "default" : "outline"}
                onClick={() => setAlcance("rango")}
                aria-pressed={alcance === "rango"}
              >
                Solo algunas
              </Button>
            </div>
          </fieldset>

          {alcance === "rango" && (
            <div className="space-y-1 sm:max-w-sm">
              <label htmlFor="rango-rotar" className="text-sm font-medium">
                Páginas a rotar
              </label>
              <input
                id="rango-rotar"
                type="text"
                inputMode="numeric"
                placeholder={paginas ? `Ej: 1-3, 5, ${paginas}` : "Ej: 1-3, 5, 8-10"}
                value={rango}
                onChange={(e) => setRango(e.target.value)}
                className={CAMPO}
                aria-invalid={!!avisoRango}
                aria-describedby="rango-rotar-ayuda"
              />
              <p
                id="rango-rotar-ayuda"
                className={avisoRango ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              >
                {avisoRango ??
                  (seleccionadas > 0
                    ? `${seleccionadas === 1 ? "Se rotará" : "Se rotarán"} ${textoPaginas(seleccionadas)}; el resto queda igual.`
                    : "Separa con comas; usa guion para rangos.")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={ejecutar} disabled={!listo}>
              <RotateCw data-icon="inline-start" />
              Rotar PDF
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
                {resultado.rotadas === resultado.total
                  ? `${textoPaginas(resultado.total)} ${resultado.total === 1 ? "rotada" : "rotadas"}`
                  : `${resultado.rotadas} de ${textoPaginas(resultado.total)} rotadas`}{" "}
                · {formatearBytes(resultado.blob.size)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadButton archivo={resultado.blob} nombreArchivo={resultado.nombre} label="Descargar PDF" />
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Rotar otro PDF
            </Button>
          </div>
          <NotaPrivacidad texto="Procesado en tu navegador. Tu documento no se subió a ningún servidor." />
        </div>
      )}
    </ProcessingCard>
  );
}
