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
      tituloDropzone="Arrastrá acá el Excel de movimientos o el resumen en PDF de BBVA"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            En BBVA: <strong>Cuentas → “Saldos y Movimientos” → elegís la empresa/cuenta → filtrás las fechas →
            “Descargar”</strong>. Subí ese archivo tal cual lo bajaste; se reconoce aunque venga como .xls, .xlsx o tabla
            web. <strong>También sirve el resumen de cuenta mensual en PDF</strong> (el que el banco te manda por mail):
            trae el saldo después de cada movimiento y quién cobró cada débito automático.{" "}
            <a href="#guia-descarga" className="underline underline-offset-2">
              Ver la guía paso a paso
            </a>
            .
          </AlertDescription>
        </Alert>
      }
      etiquetaAccion="Analizar movimientos"
      analizar={analizar}
    />
  );
}
