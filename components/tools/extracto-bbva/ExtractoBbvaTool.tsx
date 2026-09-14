"use client";

import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FORMATOS_ENTRADA, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

/** Interfaz de "Análisis de movimientos BBVA": el Excel de movimientos → resumen + Excel. */
export default function ExtractoBbvaTool() {
  return (
    <AnalizadorExtracto
      accept={FORMATOS_ENTRADA}
      maxSizeMB={MAX_MB}
      multiple
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastrá acá el Excel de movimientos de BBVA"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            El archivo de <strong>Movimientos</strong> que exportás desde BBVA (Excel, con columnas Fecha, Concepto,
            Crédito y Débito). Subilo tal cual lo descargaste; se reconoce aunque el banco lo entregue como .xls, .xlsx
            o tabla HTML.
          </AlertDescription>
        </Alert>
      }
      etiquetaAccion="Analizar movimientos"
      analizar={analizar}
    />
  );
}
