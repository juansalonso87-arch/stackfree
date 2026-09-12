"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { LoteImagenes } from "@/components/core/LoteImagenes";
import { Button } from "@/components/ui/button";
import type { PropsHerramienta } from "@/lib/tools-registry";
import { FORMATOS_ENTRADA, FORMATOS_SALIDA, MAX_ARCHIVOS, MAX_MB, convertirHeic, type FormatoSalida } from "./logic";

const CALIDAD_POR_DEFECTO = 90;

function esFormatoSalida(valor: unknown): valor is FormatoSalida {
  return FORMATOS_SALIDA.some((f) => f.mime === valor);
}

/**
 * Interfaz de "HEIC a JPG". `opciones.formatoSalida` (variante "heic a png")
 * preselecciona el formato.
 */
export default function HeicAJpgTool({ opciones }: PropsHerramienta) {
  const formatoInicial = esFormatoSalida(opciones?.formatoSalida) ? opciones.formatoSalida : "image/jpeg";
  const [formato, setFormato] = useState<FormatoSalida>(formatoInicial);
  const [calidad, setCalidad] = useState(CALIDAD_POR_DEFECTO);
  const infoFormato = FORMATOS_SALIDA.find((f) => f.mime === formato)!;

  const panelOpciones = (
    <div className="space-y-4">
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
              >
                {f.nombre}
              </Button>
            ))}
          </div>
        </fieldset>

        {infoFormato.conCalidad && (
          <div className="space-y-2">
            <label htmlFor="calidad-heic" className="flex items-center justify-between text-sm font-medium">
              Calidad
              <span className="text-muted-foreground tabular-nums">{calidad}%</span>
            </label>
            <input
              id="calidad-heic"
              type="range"
              min={50}
              max={100}
              step={5}
              value={calidad}
              onChange={(e) => setCalidad(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">90% es un buen equilibrio. Menos calidad = archivo más liviano.</p>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        La primera conversión descarga el decodificador de HEIC (menos de 1 MB); las siguientes son inmediatas. Si tu
        celular ya pasó la foto a JPG al elegirla, también sirve.
      </p>
    </div>
  );

  return (
    <LoteImagenes
      accept={FORMATOS_ENTRADA}
      maxSizeMB={MAX_MB}
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastra tus fotos HEIC aquí"
      opciones={panelOpciones}
      iconoAccion={<Smartphone data-icon="inline-start" />}
      etiquetaAccion={(n) => `Convertir ${n > 1 ? `${n} fotos` : "foto"} a ${infoFormato.nombre}`}
      verboResultado={`convertidas a ${infoFormato.nombre}`}
      procesar={(archivo) => convertirHeic(archivo, { formato, calidad: calidad / 100 })}
      nombreZip={`fotos-${infoFormato.extension}.zip`}
    />
  );
}
