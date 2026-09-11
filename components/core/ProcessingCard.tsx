"use client";

import type { ReactNode } from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

/**
 * Estados por los que pasa cualquier herramienta:
 *   idle → procesando → listo
 *                    ↘ error
 */
export type EstadoProceso = "idle" | "procesando" | "listo" | "error";

interface ProcessingCardProps {
  estado: EstadoProceso;
  /** 0-100. Si no se pasa, se muestra un spinner "indeterminado". */
  progreso?: number;
  /** Texto que acompaña al progreso. Ej: "Descargando modelo de IA…". */
  mensajeProgreso?: string;
  /** Mensaje amigable para mostrar cuando `estado === "error"`. */
  mensajeError?: string;
  /** Reintentar con el mismo archivo. */
  onReintentar?: () => void;
  /** Volver al inicio para elegir otro archivo. */
  onReiniciar?: () => void;
  /** Contenido para los estados `idle` (ej: dropzone) y `listo` (ej: resultado). */
  children?: ReactNode;
  className?: string;
}

/**
 * Tarjeta contenedora que resuelve los estados de carga y error de forma
 * uniforme en todas las herramientas. La herramienta solo se ocupa de
 * qué mostrar en `idle` y en `listo`.
 */
export function ProcessingCard({
  estado,
  progreso,
  mensajeProgreso,
  mensajeError,
  onReintentar,
  onReiniciar,
  children,
  className,
}: ProcessingCardProps) {
  return (
    <Card className={cn("w-full", className)} aria-busy={estado === "procesando"}>
      <CardContent className="space-y-4">
        {estado === "procesando" && (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-52 flex-col items-center justify-center gap-4 py-6 text-center"
          >
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
            <div className="w-full max-w-sm space-y-2">
              <p className="text-sm font-medium">{mensajeProgreso ?? "Procesando…"}</p>
              {typeof progreso === "number" ? (
                <>
                  <Progress value={Math.min(100, Math.max(0, progreso))} />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {Math.round(progreso)}%
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Esto puede tardar unos segundos. No cierres la pestaña.
                </p>
              )}
            </div>
          </div>
        )}

        {estado === "error" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Algo salió mal</AlertTitle>
              <AlertDescription>
                {mensajeError ??
                  "No pudimos procesar el archivo. Intenta de nuevo o prueba con otro archivo."}
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              {onReintentar && (
                <Button onClick={onReintentar}>
                  <RotateCcw data-icon="inline-start" />
                  Reintentar
                </Button>
              )}
              {onReiniciar && (
                <Button variant="outline" onClick={onReiniciar}>
                  Elegir otro archivo
                </Button>
              )}
            </div>
          </div>
        )}

        {(estado === "idle" || estado === "listo") && children}
      </CardContent>
    </Card>
  );
}
