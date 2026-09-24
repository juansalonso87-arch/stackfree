"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FORMATOS_ENTRADA, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

/**
 * Interfaz de "PDF del banco a Excel".
 *
 * Un solo casillero decide el nivel: destildado, la tabla tal cual está impresa
 * (sirve para cualquier banco); tildado, además clasifica y resume si el banco
 * es uno de los que conocemos. Va tildado por defecto porque es lo que más
 * sirve, y si el banco no se reconoce no falla: cae al nivel 1 y lo avisa.
 */
export default function PdfBancoAExcelTool() {
  const [detallado, setDetallado] = useState(true);

  return (
    <AnalizadorExtracto
      accept={FORMATOS_ENTRADA}
      maxSizeMB={MAX_MB}
      multiple
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastrá acá el resumen de tu banco en PDF"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            El <strong>resumen de cuenta en PDF</strong> tal como lo descargás del home banking. Tiene que ser el PDF
            original: si lo escaneaste o le sacaste una foto, adentro no hay texto y no se puede leer la tabla.{" "}
            <a href="#guia-descarga" className="underline underline-offset-2">
              Ver la guía paso a paso
            </a>
            .
          </AlertDescription>
        </Alert>
      }
      opciones={
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm sm:max-w-md">
          <input
            type="checkbox"
            checked={detallado}
            onChange={(e) => setDetallado(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="font-medium">Además, clasificar y resumir los movimientos</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Disponible para <strong>BBVA</strong> y <strong>Comafi</strong>: suma categorías, totales por concepto y
              por mes, y hojas de control. Con cualquier otro banco te damos igual la tabla tal cual está impresa, que
              es lo que necesitás para trabajar en Excel.
            </span>
          </span>
        </label>
      }
      etiquetaAccion="Pasar a Excel"
      analizar={(archivos) => analizar(archivos, detallado)}
    />
  );
}
