"use client";

import { useCallback, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AlertCircle, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FileDropzoneProps {
  /** Tipos MIME aceptados. Ej: ["image/png", "image/jpeg"]. */
  accept: string[];
  /** Tamaño máximo por archivo en MB. */
  maxSizeMB?: number;
  /** Permitir seleccionar varios archivos a la vez. */
  multiple?: boolean;
  /** Se llama con los archivos que pasaron la validación. */
  onFiles: (archivos: File[]) => void;
  disabled?: boolean;
  titulo?: string;
  descripcion?: string;
  className?: string;
}

const nombresLegibles: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/gif": "GIF",
  "image/bmp": "BMP",
  "image/avif": "AVIF",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "application/pdf": "PDF",
};

/** Por si el sistema no informa el tipo MIME (pasa en algunos Windows). */
const tipoPorExtension: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  hif: "image/heif",
  pdf: "application/pdf",
};

function tipoDe(archivo: File): string {
  if (archivo.type) return archivo.type;
  const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  return tipoPorExtension[extension] ?? "";
}

function formatearTipos(tipos: string[]): string {
  return tipos.map((t) => nombresLegibles[t] ?? t).join(", ");
}

/**
 * Zona de arrastrar y soltar genérica. Valida tipo y tamaño antes de
 * entregar los archivos a la herramienta. Funciona con teclado y en mobile
 * (donde el "arrastrar" se reemplaza por el selector nativo).
 */
export function FileDropzone({
  accept,
  maxSizeMB = 25,
  multiple = false,
  onFiles,
  disabled = false,
  titulo,
  descripcion,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const procesarArchivos = useCallback(
    (lista: FileList | File[]) => {
      const archivos = Array.from(lista);
      if (archivos.length === 0) return;

      const seleccion = multiple ? archivos : archivos.slice(0, 1);
      const errores: string[] = [];
      const validos: File[] = [];

      for (const archivo of seleccion) {
        if (!accept.includes(tipoDe(archivo))) {
          errores.push(`"${archivo.name}" no es un formato válido. Usa ${formatearTipos(accept)}.`);
          continue;
        }
        if (archivo.size > maxSizeMB * 1024 * 1024) {
          errores.push(`"${archivo.name}" pesa más de ${maxSizeMB} MB.`);
          continue;
        }
        validos.push(archivo);
      }

      setError(errores.length > 0 ? errores.join(" ") : null);
      if (validos.length > 0) onFiles(validos);
    },
    [accept, maxSizeMB, multiple, onFiles],
  );

  const abrirSelector = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setArrastrando(true);
  };

  const onDragLeave = () => setArrastrando(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    if (disabled) return;
    procesarArchivos(e.dataTransfer.files);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      abrirSelector();
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={`${inputId}-ayuda`}
        onClick={abrirSelector}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          arrastrando ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/60",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="size-7" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium">
            {titulo ?? (multiple ? "Arrastra tus archivos aquí" : "Arrastra tu archivo aquí")}
          </p>
          <p className="text-sm text-muted-foreground">
            {descripcion ?? "o toca para seleccionarlo desde tu dispositivo"}
          </p>
        </div>
        <p id={`${inputId}-ayuda`} className="text-xs text-muted-foreground">
          Formatos: {formatearTipos(accept)} · Máximo {maxSizeMB} MB
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept.join(",")}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) procesarArchivos(e.target.files);
            // Permite volver a elegir el mismo archivo después de un reinicio.
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>No se pudo usar el archivo</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
