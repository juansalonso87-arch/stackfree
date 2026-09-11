"use client";

import { useState } from "react";
import { Scaling } from "lucide-react";
import { LoteImagenes } from "@/components/core/LoteImagenes";
import { Button } from "@/components/ui/button";
import {
  FORMATOS_ENTRADA,
  MAX_ARCHIVOS,
  PRESETS,
  redimensionarImagen,
  type ModoRedimension,
  type OpcionesRedimension,
} from "./logic";

const INICIAL: OpcionesRedimension = {
  modo: "pixeles",
  porcentaje: 50,
  ancho: 1920,
  alto: 1080,
  mantenerProporcion: true,
  soloReducir: true,
};

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Interfaz de "Redimensionar imagen": por píxeles (con presets) o por porcentaje. */
export default function RedimensionarImagenTool() {
  const [o, setO] = useState<OpcionesRedimension>(INICIAL);
  const set = (parte: Partial<OpcionesRedimension>) => setO((prev) => ({ ...prev, ...parte }));

  const panelOpciones = (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cómo redimensionar</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["pixeles", "En píxeles"],
              ["porcentaje", "En porcentaje"],
            ] as [ModoRedimension, string][]
          ).map(([valor, etiqueta]) => (
            <Button
              key={valor}
              type="button"
              variant={o.modo === valor ? "default" : "outline"}
              onClick={() => set({ modo: valor })}
              aria-pressed={o.modo === valor}
            >
              {etiqueta}
            </Button>
          ))}
        </div>
      </fieldset>

      {o.modo === "pixeles" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Ancho (px)</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={o.ancho}
                onChange={(e) => set({ ancho: Number(e.target.value) })}
                className={CAMPO}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Alto (px)</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={o.alto}
                onChange={(e) => set({ alto: Number(e.target.value) })}
                className={CAMPO}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.etiqueta}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set({ ancho: p.ancho, alto: p.alto })}
              >
                {p.etiqueta}
              </Button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={o.mantenerProporcion}
              onChange={(e) => set({ mantenerProporcion: e.target.checked })}
              className="size-4 accent-primary"
            />
            Mantener proporción
            <span className="text-xs text-muted-foreground">(la imagen se encaja dentro de ese tamaño sin deformarse)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={o.soloReducir}
              onChange={(e) => set({ soloReducir: e.target.checked })}
              className="size-4 accent-primary"
            />
            No agrandar imágenes más chicas
            <span className="text-xs text-muted-foreground">(agrandar siempre pierde nitidez)</span>
          </label>
        </div>
      ) : (
        <div className="space-y-2 sm:max-w-sm">
          <label htmlFor="porcentaje" className="flex items-center justify-between text-sm font-medium">
            Tamaño
            <span className="text-muted-foreground tabular-nums">{o.porcentaje}%</span>
          </label>
          <input
            id="porcentaje"
            type="range"
            min={5}
            max={200}
            step={5}
            value={o.porcentaje}
            onChange={(e) => set({ porcentaje: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            50% = mitad de ancho y alto (un cuarto de los píxeles). Más de 100% agranda y pierde nitidez.
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
      iconoAccion={<Scaling data-icon="inline-start" />}
      etiquetaAccion={(n) => `Redimensionar ${n > 1 ? `${n} imágenes` : "imagen"}`}
      verboResultado="redimensionadas"
      procesar={(archivo) => redimensionarImagen(archivo, o)}
      nombreZip="imagenes-redimensionadas.zip"
      mostrarDimensiones
    />
  );
}
