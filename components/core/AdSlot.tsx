"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { adsConfig, adsenseHabilitado, type PosicionAnuncio } from "@/lib/ads-config";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Tamaño mínimo reservado por posición. Reservar el espacio evita que la
 * página "salte" cuando el anuncio carga (eso penaliza Core Web Vitals - CLS).
 */
const estilosPorPosicion: Record<PosicionAnuncio, string> = {
  "top-banner": "min-h-[100px] w-full",
  "in-content": "min-h-[250px] w-full",
  sidebar: "min-h-[600px] w-full max-w-[300px]",
  "bottom-banner": "min-h-[100px] w-full",
};

const etiquetaPosicion: Record<PosicionAnuncio, string> = {
  "top-banner": "Banner superior",
  "in-content": "Anuncio en contenido",
  sidebar: "Anuncio lateral",
  "bottom-banner": "Banner inferior",
};

interface AdSlotProps {
  posicion: PosicionAnuncio;
  className?: string;
}

/**
 * Espacio publicitario configurable por posición.
 *
 * - Con AdSense configurado (ver lib/ads-config.ts) renderiza el bloque real.
 * - Sin configurar, muestra un recuadro placeholder discreto para poder
 *   visualizar el layout antes de la aprobación de AdSense.
 */
export function AdSlot({ posicion, className }: AdSlotProps) {
  const slot = adsConfig.slots[posicion];
  const habilitado = adsenseHabilitado() && slot.length > 0;
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!habilitado || !insRef.current) return;
    // Un <ins> que ya fue "llenado" por AdSense tiene este atributo; volver
    // a pedir un anuncio ahí lanza un error en consola.
    if (insRef.current.getAttribute("data-adsbygoogle-status")) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Si el bloqueador de anuncios impide cargar el script, no rompemos nada.
    }
  }, [habilitado]);

  if (habilitado) {
    return (
      <div className={cn("flex justify-center", estilosPorPosicion[posicion], className)}>
        <ins
          ref={insRef}
          className="adsbygoogle block w-full"
          data-ad-client={adsConfig.cliente}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  if (!adsConfig.mostrarPlaceholder) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-xs text-muted-foreground",
        estilosPorPosicion[posicion],
        className,
      )}
    >
      <span>
        Publicidad
        <span className="hidden sm:inline"> · {etiquetaPosicion[posicion]}</span>
      </span>
    </div>
  );
}
