"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadButtonProps {
  /** Resultado a descargar. Si es null el botón queda deshabilitado. */
  archivo: Blob | null;
  /** Nombre con extensión. Ej: "foto-sin-fondo.png". */
  nombreArchivo: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "lg" | "sm";
  className?: string;
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Descarga un Blob generado en el navegador. No hay servidor de por medio:
 * se crea una URL temporal en memoria, se "clickea" un enlace invisible y
 * se libera la memoria al terminar.
 */
export function DownloadButton({
  archivo,
  nombreArchivo,
  label = "Descargar",
  variant = "default",
  size = "lg",
  className,
}: DownloadButtonProps) {
  const descargar = () => {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    // Un pequeño retraso evita que algunos navegadores cancelen la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Button
      onClick={descargar}
      disabled={!archivo}
      variant={variant}
      size={size}
      className={className}
    >
      <Download data-icon="inline-start" />
      {label}
      {archivo && (
        <span className="text-xs opacity-70 tabular-nums">({formatearTamano(archivo.size)})</span>
      )}
    </Button>
  );
}
