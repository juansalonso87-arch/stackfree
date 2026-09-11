"use client";

import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import { quitarFondo, type ModoFondo } from "./logic";

const FORMATOS = ["image/png", "image/jpeg", "image/webp"];

/**
 * Interfaz de "Quitar fondo de imagen".
 * Solo maneja estados y qué mostrar; el trabajo pesado vive en logic.ts.
 */
export default function QuitarFondoTool() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [urlOriginal, setUrlOriginal] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoFondo>("transparente");
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [progreso, setProgreso] = useState<number | undefined>();
  const [mensajeProgreso, setMensajeProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<{ archivo: Blob; nombre: string } | null>(null);

  // Libera la URL temporal de preview cuando cambia o al desmontar el
  // componente (evita fugas de memoria en el navegador).
  useEffect(() => {
    if (!urlOriginal) return;
    return () => URL.revokeObjectURL(urlOriginal);
  }, [urlOriginal]);

  const seleccionarArchivo = (f: File) => {
    setArchivo(f);
    setUrlOriginal(URL.createObjectURL(f));
  };

  const reiniciar = () => {
    setArchivo(null);
    setUrlOriginal(null);
    setResultado(null);
    setError(undefined);
    setProgreso(undefined);
    setEstado("idle");
  };

  const procesar = async () => {
    if (!archivo) return;
    setEstado("procesando");
    setError(undefined);
    setProgreso(undefined);
    setMensajeProgreso("Preparando…");
    try {
      const r = await quitarFondo(archivo, {
        modo,
        onProgreso: (p, m) => {
          setProgreso(p);
          if (m) setMensajeProgreso(m);
        },
      });
      setResultado({ archivo: r.archivo, nombre: r.nombreSugerido });
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
      onReintentar={procesar}
      onReiniciar={reiniciar}
    >
      {!archivo && (
        <FileDropzone
          accept={FORMATOS}
          maxSizeMB={20}
          onFiles={(archivos) => seleccionarArchivo(archivos[0])}
          titulo="Arrastra tu imagen aquí"
        />
      )}

      {archivo && urlOriginal && estado === "idle" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
            {/* Es una imagen local del usuario, no pasa por el optimizador de Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlOriginal} alt="Vista previa de tu imagen" className="mx-auto max-h-96 w-auto" />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">¿Qué fondo quieres?</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={modo === "transparente" ? "default" : "outline"}
                onClick={() => setModo("transparente")}
                aria-pressed={modo === "transparente"}
              >
                Transparente (PNG)
              </Button>
              <Button
                type="button"
                variant={modo === "blanco" ? "default" : "outline"}
                onClick={() => setModo("blanco")}
                aria-pressed={modo === "blanco"}
              >
                Fondo blanco (JPG)
              </Button>
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={procesar}>
              <Wand2 data-icon="inline-start" />
              Quitar fondo
            </Button>
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Elegir otra imagen
            </Button>
          </div>
        </div>
      )}

      {estado === "listo" && resultado && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Listo. Tu imagen ya está procesada.</p>
          <div className="flex flex-wrap gap-2">
            <DownloadButton archivo={resultado.archivo} nombreArchivo={resultado.nombre} />
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Procesar otra imagen
            </Button>
          </div>
        </div>
      )}
    </ProcessingCard>
  );
}
