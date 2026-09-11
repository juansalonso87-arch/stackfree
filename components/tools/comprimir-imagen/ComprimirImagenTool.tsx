"use client";

import { useState } from "react";
import { Minimize2 } from "lucide-react";
import { LoteImagenes } from "@/components/core/LoteImagenes";
import { Button } from "@/components/ui/button";
import type { PropsHerramienta } from "@/lib/tools-registry";
import { FORMATOS_ENTRADA, MAX_ARCHIVOS, NIVELES, comprimirImagen, type NivelCompresion } from "./logic";

const LADO_REDUCIDO = 2000;

/**
 * Interfaz de "Comprimir imagen": nivel de compresión + opción de reducir
 * resolución. `opciones.formatoNombre` (variantes SEO) solo cambia textos.
 */
export default function ComprimirImagenTool({ opciones }: PropsHerramienta) {
  const [nivel, setNivel] = useState<NivelCompresion>("equilibrado");
  const [reducir, setReducir] = useState(false);
  const formatoNombre =
    typeof opciones?.formatoNombre === "string" ? opciones.formatoNombre : "imágenes";

  const panelOpciones = (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Nivel de compresión</legend>
        <div className="flex flex-wrap gap-2">
          {NIVELES.map((n) => (
            <Button
              key={n.valor}
              type="button"
              variant={nivel === n.valor ? "default" : "outline"}
              onClick={() => setNivel(n.valor)}
              aria-pressed={nivel === n.valor}
              title={n.descripcion}
            >
              {n.etiqueta}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{NIVELES.find((n) => n.valor === nivel)?.descripcion}.</p>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={reducir}
          onChange={(e) => setReducir(e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="font-medium">Reducir también la resolución</span>
          <span className="block text-xs text-muted-foreground">
            Achica las imágenes de más de {LADO_REDUCIDO} px a {LADO_REDUCIDO} px. Ideal para web, WhatsApp
            o email. No lo actives si vas a imprimir.
          </span>
        </span>
      </label>
    </div>
  );

  return (
    <LoteImagenes
      accept={FORMATOS_ENTRADA}
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone={`Arrastra tus ${formatoNombre} aquí`}
      opciones={panelOpciones}
      iconoAccion={<Minimize2 data-icon="inline-start" />}
      etiquetaAccion={(n) => `Comprimir ${n > 1 ? `${n} imágenes` : "imagen"}`}
      verboResultado="comprimidas"
      procesar={(archivo) =>
        comprimirImagen(archivo, { nivel, ladoMaximo: reducir ? LADO_REDUCIDO : undefined })
      }
      nombreZip="imagenes-comprimidas.zip"
      mostrarDimensiones
    />
  );
}
