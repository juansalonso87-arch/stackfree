"use client";

import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FORMATOS_ENTRADA, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

/** Interfaz de "Análisis de movimientos Comafi": el Excel de movimientos → resumen + Excel. */
export default function ExtractoComafiTool() {
  return (
    <AnalizadorExtracto
      accept={FORMATOS_ENTRADA}
      maxSizeMB={MAX_MB}
      multiple
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastrá acá el Excel de movimientos de Comafi"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            El Excel de <strong>movimientos de cuenta</strong> que exportás desde el home banking de Comafi (con
            columnas como Fecha, Descripción, Importe y Saldo). Subilo tal cual lo descargaste.
          </AlertDescription>
        </Alert>
      }
      etiquetaAccion="Analizar movimientos"
      analizar={analizar}
    />
  );
}
