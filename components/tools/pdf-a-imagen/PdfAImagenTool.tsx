"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Images, ShieldCheck } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import type { PropsHerramienta } from "@/lib/tools-registry";
import {
  FORMATOS,
  MAX_MB,
  RESOLUCIONES,
  contarPaginas,
  formatearBytes,
  interpretarRango,
  pdfAImagenes,
  textoPaginas,
  type AlcancePaginas,
  type FormatoImagen,
  type ResultadoPdfAImagen,
} from "./logic";

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MINIATURA =
  "size-14 shrink-0 rounded border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:8px_8px] object-contain";

function esFormato(v: unknown): v is FormatoImagen {
  return FORMATOS.some((f) => f.mime === v);
}

/**
 * Interfaz de "PDF a imagen". `opciones.formato` (variantes "pdf a jpg" /
 * "pdf a png") preselecciona el formato de salida.
 */
export default function PdfAImagenTool({ opciones }: PropsHerramienta) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paginas, setPaginas] = useState<number | null>(null);
  const [errorLectura, setErrorLectura] = useState<string>();
  const [formato, setFormato] = useState<FormatoImagen>(esFormato(opciones?.formato) ? opciones.formato : "image/jpeg");
  const [dpi, setDpi] = useState(150);
  const [alcance, setAlcance] = useState<AlcancePaginas>("todas");
  const [rango, setRango] = useState("");
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoPdfAImagen | null>(null);

  const infoFormato = FORMATOS.find((f) => f.mime === formato)!;

  // Cuenta las páginas apenas se elige el archivo (descarga pdf.js en ese momento).
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

  // URLs temporales para las miniaturas del resultado, liberadas al cambiar.
  const urls = useMemo(() => resultado?.imagenes.map((i) => URL.createObjectURL(i.blob)) ?? [], [resultado]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

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
  let seleccionadas = 0;
  if (alcance === "rango" && paginas && rango.trim()) {
    try {
      seleccionadas = interpretarRango(rango, paginas).length;
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
    setProgreso(0);
    setMensajeProgreso("Convirtiendo páginas…");
    try {
      const r = await pdfAImagenes(archivo, { formato, dpi, alcance, rango }, (hechas, total) => {
        setProgreso((hechas / total) * 100);
        setMensajeProgreso(`Convirtiendo página ${Math.min(hechas + 1, total)} de ${total}…`);
      });
      setResultado(r);
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  const totalBytes = resultado?.imagenes.reduce((s, i) => s + i.blob.size, 0) ?? 0;

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
                    : `${textoPaginas(paginas)} · ${formatearBytes(archivo.size)}`)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>
              Cambiar
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Formato de imagen</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATOS.map((f) => (
                  <Button
                    key={f.mime}
                    type="button"
                    variant={formato === f.mime ? "default" : "outline"}
                    onClick={() => setFormato(f.mime)}
                    aria-pressed={formato === f.mime}
                  >
                    {f.nombre}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{infoFormato.nota}</p>
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="dpi" className="text-sm font-medium">
                Calidad
              </label>
              <select id="dpi" value={dpi} onChange={(e) => setDpi(Number(e.target.value))} className={CAMPO}>
                {RESOLUCIONES.map((r) => (
                  <option key={r.dpi} value={r.dpi}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{RESOLUCIONES.find((r) => r.dpi === dpi)?.ayuda}</p>
            </div>
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
              <label htmlFor="rango-pdfimg" className="text-sm font-medium">
                Páginas a convertir
              </label>
              <input
                id="rango-pdfimg"
                type="text"
                inputMode="numeric"
                placeholder={paginas ? `Ej: 1-3, 5, ${paginas}` : "Ej: 1-3, 5, 8-10"}
                value={rango}
                onChange={(e) => setRango(e.target.value)}
                className={CAMPO}
                aria-invalid={!!avisoRango}
                aria-describedby="rango-pdfimg-ayuda"
              />
              <p
                id="rango-pdfimg-ayuda"
                className={avisoRango ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              >
                {avisoRango ??
                  (seleccionadas > 0
                    ? `Se ${seleccionadas === 1 ? "convertirá" : "convertirán"} ${textoPaginas(seleccionadas)}.`
                    : "Separa con comas; usa guion para rangos.")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={ejecutar} disabled={!listo}>
              <Images data-icon="inline-start" />
              Convertir a {infoFormato.nombre}
            </Button>
          </div>
        </div>
      )}

      {estado === "listo" && resultado && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {resultado.imagenes.length} {resultado.imagenes.length === 1 ? "imagen" : "imágenes"}{" "}
                {infoFormato.nombre}
              </span>
              <span className="text-muted-foreground"> · {formatearBytes(totalBytes)} en total</span>
            </p>
            {resultado.zip && (
              <DownloadButton archivo={resultado.zip} nombreArchivo={resultado.nombreZip} label="Descargar todo (ZIP)" size="default" />
            )}
          </div>

          {resultado.reducida && (
            <p className="text-xs text-muted-foreground">
              Algunas páginas son muy grandes: se generaron a menor resolución para no agotar la memoria del dispositivo.
            </p>
          )}

          <ul className="divide-y rounded-lg border" aria-label="Imágenes generadas">
            {resultado.imagenes.map((img, i) => (
              <li key={img.pagina} className="flex items-center gap-3 p-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[i]} alt={`Página ${img.pagina}`} className={MINIATURA} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{img.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    Página {img.pagina} · {img.ancho} × {img.alto} px · {formatearBytes(img.blob.size)}
                  </p>
                </div>
                <DownloadButton archivo={img.blob} nombreArchivo={img.nombre} label="" size="sm" variant="outline" />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            {resultado.imagenes.length === 1 && (
              <DownloadButton
                archivo={resultado.imagenes[0].blob}
                nombreArchivo={resultado.imagenes[0].nombre}
                label={`Descargar ${infoFormato.nombre}`}
              />
            )}
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Convertir otro PDF
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
