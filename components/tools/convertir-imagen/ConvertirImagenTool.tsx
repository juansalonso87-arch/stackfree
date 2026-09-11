"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { LoteImagenes } from "@/components/core/LoteImagenes";
import { Button } from "@/components/ui/button";
import type { PropsHerramienta } from "@/lib/tools-registry";
import {
  FORMATOS_ENTRADA,
  FORMATOS_SALIDA,
  MAX_ARCHIVOS,
  convertirImagen,
  puedeCodificar,
  type FormatoSalida,
} from "./logic";

const CALIDAD_POR_DEFECTO = 90;

function esFormatoSalida(valor: unknown): valor is FormatoSalida {
  return FORMATOS_SALIDA.some((f) => f.mime === valor);
}

/**
 * Interfaz de "Convertir formato de imagen".
 * `opciones.formatoSalida` (de las variantes SEO) preselecciona el formato.
 */
export default function ConvertirImagenTool({ opciones }: PropsHerramienta) {
  const formatoInicial = esFormatoSalida(opciones?.formatoSalida) ? opciones.formatoSalida : "image/jpeg";
  const [formato, setFormato] = useState<FormatoSalida>(formatoInicial);
  const [calidad, setCalidad] = useState(CALIDAD_POR_DEFECTO);
  const infoFormato = FORMATOS_SALIDA.find((f) => f.mime === formato)!;

  const panelOpciones = (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Convertir a</legend>
        <div className="flex flex-wrap gap-2">
          {FORMATOS_SALIDA.map((f) => (
            <Button
              key={f.mime}
              type="button"
              variant={formato === f.mime ? "default" : "outline"}
              onClick={() => setFormato(f.mime)}
              aria-pressed={formato === f.mime}
              disabled={!puedeCodificar(f.mime)}
              title={!puedeCodificar(f.mime) ? "Tu navegador no puede generar este formato" : undefined}
            >
              {f.nombre}
            </Button>
          ))}
        </div>
      </fieldset>

      {infoFormato.conCalidad && (
        <div className="space-y-2">
          <label htmlFor="calidad" className="flex items-center justify-between text-sm font-medium">
            Calidad
            <span className="text-muted-foreground tabular-nums">{calidad}%</span>
          </label>
          <input
            id="calidad"
            type="range"
            min={50}
            max={100}
            step={5}
            value={calidad}
            onChange={(e) => setCalidad(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            90% es un buen equilibrio. Menos calidad = archivo más liviano.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <LoteImagenes
      accept={FORMATOS_ENTRADA}
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastra tus imágenes aquí"
      opciones={panelOpciones}
      iconoAccion={<Repeat data-icon="inline-start" />}
      etiquetaAccion={(n) => `Convertir ${n > 1 ? `${n} imágenes` : "imagen"} a ${infoFormato.nombre}`}
      verboResultado={`convertidas a ${infoFormato.nombre}`}
      procesar={(archivo) => convertirImagen(archivo, { formato, calidad: calidad / 100 })}
      nombreZip={`imagenes-${infoFormato.extension}.zip`}
    />
  );
}
