"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { ImageCompare } from "@/components/core/ImageCompare";
import { Button } from "@/components/ui/button";
import {
  componerSobreBlanco,
  ladoMaximo,
  nombreResultado,
  precargarModelo,
  quitarFondo,
  type ModoFondo,
  type ResultadoQuitarFondo,
} from "./logic";

const FORMATOS = ["image/png", "image/jpeg", "image/webp"];
const TAMANO_MAXIMO_MB = 20;

/**
 * Crea una URL temporal para mostrar un Blob en un <img> y la libera cuando
 * el Blob cambia o el componente se desmonta (evita fugas de memoria).
 */
function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/**
 * Interfaz de "Quitar fondo de imagen".
 * Solo maneja estados y qué mostrar; el trabajo pesado vive en logic.ts.
 *
 * Flujo: elegir imagen → (el modelo se precarga solo) → "Quitar fondo" →
 * comparador antes/después → elegir transparente o blanco → descargar.
 */
export default function QuitarFondoTool() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modo, setModo] = useState<ModoFondo>("transparente");
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoQuitarFondo | null>(null);
  const [jpg, setJpg] = useState<Blob | null>(null);
  const [componiendo, setComponiendo] = useState(false);

  const urlOriginal = useObjectUrl(archivo);
  const urlPng = useObjectUrl(resultado?.png ?? null);
  const urlJpg = useObjectUrl(jpg);

  const seleccionarArchivo = (f: File) => {
    setArchivo(f);
    setResultado(null);
    setJpg(null);
    setError(undefined);
    setEstado("idle");
    // Arrancamos la descarga del modelo ya mismo, en segundo plano, para que
    // cuando toque "Quitar fondo" no haya que esperar. Si falla, el error
    // real se muestra recién al procesar.
    precargarModelo().catch(() => {});
  };

  const reiniciar = () => {
    setArchivo(null);
    setResultado(null);
    setJpg(null);
    setError(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  const procesar = async () => {
    if (!archivo) return;
    setEstado("procesando");
    setError(undefined);
    setProgreso(0);
    setMensajeProgreso("Preparando…");
    try {
      const r = await quitarFondo(archivo, {
        onProgreso: (p, m) => {
          setProgreso(p);
          setMensajeProgreso(m);
        },
      });
      setResultado(r);
      setJpg(modo === "blanco" ? await componerSobreBlanco(r.png) : null);
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  /** Cambiar de modo después de procesar no vuelve a correr la IA: solo recompone. */
  const cambiarModo = async (nuevo: ModoFondo) => {
    setModo(nuevo);
    if (nuevo === "blanco" && resultado && !jpg) {
      setComponiendo(true);
      try {
        setJpg(await componerSobreBlanco(resultado.png));
      } catch {
        setError("No pudimos generar la versión con fondo blanco. Prueba descargando el PNG.");
        setEstado("error");
      } finally {
        setComponiendo(false);
      }
    }
  };

  const SelectorModo = (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">¿Qué fondo quieres?</legend>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={modo === "transparente" ? "default" : "outline"}
          onClick={() => cambiarModo("transparente")}
          aria-pressed={modo === "transparente"}
        >
          Transparente (PNG)
        </Button>
        <Button
          type="button"
          variant={modo === "blanco" ? "default" : "outline"}
          onClick={() => cambiarModo("blanco")}
          aria-pressed={modo === "blanco"}
        >
          Fondo blanco (JPG)
        </Button>
      </div>
    </fieldset>
  );

  const archivoDescarga = modo === "blanco" ? jpg : (resultado?.png ?? null);

  return (
    <ProcessingCard
      estado={estado}
      progreso={progreso}
      mensajeProgreso={mensajeProgreso}
      mensajeError={error}
      onReintentar={procesar}
      onReiniciar={reiniciar}
    >
      {!archivo && (
        <FileDropzone
          accept={FORMATOS}
          maxSizeMB={TAMANO_MAXIMO_MB}
          onFiles={(archivos) => seleccionarArchivo(archivos[0])}
          titulo="Arrastra tu imagen aquí"
        />
      )}

      {archivo && urlOriginal && estado === "idle" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
            {/* Imagen local del usuario: no pasa por el optimizador de Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlOriginal} alt="Vista previa de tu imagen" className="mx-auto max-h-96 w-auto" />
          </div>

          {SelectorModo}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={procesar}>
              <Wand2 data-icon="inline-start" />
              Quitar fondo
            </Button>
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Elegir otra imagen
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            La primera vez se descarga el modelo de IA (40-80 MB) y puede tardar un poco. Las
            imágenes de más de {ladoMaximo()} px de lado se reducen a ese tamaño.
          </p>
        </div>
      )}

      {estado === "listo" && resultado && urlOriginal && urlPng && (
        <div className="space-y-4">
          {modo === "blanco" && !urlJpg ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Generando versión con fondo blanco…
            </div>
          ) : (
            <ImageCompare
              antes={urlOriginal}
              despues={modo === "blanco" && urlJpg ? urlJpg : urlPng}
              fondoResultado={modo}
              alt="Tu imagen antes y después de quitar el fondo"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Arrastra el divisor para comparar. Resultado: {resultado.ancho} × {resultado.alto} px
            {resultado.redimensionada && " (la imagen se redujo para procesarla)"}.
          </p>

          {SelectorModo}

          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton
              archivo={componiendo ? null : archivoDescarga}
              nombreArchivo={nombreResultado(archivo?.name ?? "imagen", modo)}
              label={modo === "blanco" ? "Descargar JPG" : "Descargar PNG"}
            />
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Procesar otra imagen
            </Button>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Procesado en tu navegador. Tu imagen no se subió a ningún servidor.
          </p>
        </div>
      )}
    </ProcessingCard>
  );
}
