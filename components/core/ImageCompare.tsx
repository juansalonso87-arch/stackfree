"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

interface ImageCompareProps {
  /** URL de la imagen original. */
  antes: string;
  /** URL de la imagen procesada. */
  despues: string;
  alt?: string;
  /** Qué mostrar detrás del resultado: cuadrícula (transparencia) o blanco. */
  fondoResultado?: "transparente" | "blanco";
  className?: string;
}

/**
 * Comparador "antes / después" con un divisor que se arrastra.
 * Las dos imágenes se apilan; la de "después" se recorta con clip-path
 * según la posición del control deslizante (un <input type="range"> invisible
 * que cubre toda la imagen: funciona con mouse, dedo y teclado sin librerías).
 */
export function ImageCompare({
  antes,
  despues,
  alt = "Comparación antes y después",
  fondoResultado = "transparente",
  className,
}: ImageCompareProps) {
  const [posicion, setPosicion] = useState(50);
  const id = useId();

  return (
    <div className={cn("relative select-none overflow-hidden rounded-lg border", className)}>
      {/* Imagen original: define el tamaño del contenedor. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={antes} alt={alt} className="block max-h-[70vh] w-full object-contain" draggable={false} />

      {/* Resultado, recortado por la derecha del divisor. */}
      <div
        className={cn(
          "absolute inset-0",
          fondoResultado === "blanco"
            ? "bg-white"
            : "bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]",
        )}
        style={{ clipPath: `inset(0 0 0 ${posicion}%)` }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={despues} alt="" className="block max-h-[70vh] w-full object-contain" draggable={false} />
      </div>

      {/* Divisor visual */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `calc(${posicion}% - 1px)` }}
        aria-hidden="true"
      >
        <span className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-xs font-semibold shadow">
          ⇔
        </span>
      </div>

      <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        Antes
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        Después
      </span>

      <label htmlFor={id} className="sr-only">
        Mover el divisor para comparar antes y después
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={posicion}
        onChange={(e) => setPosicion(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-col-resize opacity-0"
      />
    </div>
  );
}
