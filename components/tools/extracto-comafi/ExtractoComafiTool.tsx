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
      tituloDropzone="Arrastrá acá el Excel de movimientos o el resumen en PDF de Comafi"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            En Comafi: <strong>Cuentas → pestaña “Movimientos” → filtrás las fechas y tocás “Buscar” → botón de
            descarga</strong> (la flecha hacia abajo a la derecha de la tabla “Últimos Movimientos”). Subí ese archivo tal
            cual lo bajaste. <strong>También sirve el resumen de cuenta mensual en PDF</strong> (el que el banco te manda
            por mail): dice a qué empresa fue cada pago de servicios y el CUIT de cada transferencia.{" "}
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
