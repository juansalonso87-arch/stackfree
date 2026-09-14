"use client";

import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FORMATOS_ENTRADA, MAX_ARCHIVOS, MAX_MB, TIPO_REPORTE, analizar } from "./logic";

/** Interfaz de "Extracto Santander": un archivo (o varios meses) → resumen + Excel. */
export default function ExtractoSantanderTool() {
  return (
    <AnalizadorExtracto
      accept={FORMATOS_ENTRADA}
      maxSizeMB={MAX_MB}
      multiple
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastrá acá el archivo de movimientos de Santander"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            En Santander Office Banking: <strong>Consultas → Extracto → Exportar</strong>, eligiendo el formato{" "}
            <strong>“{TIPO_REPORTE}”</strong>. Subí ese archivo tal cual lo bajaste: si lo abrís y lo guardás con Excel, se
            rompe.
          </AlertDescription>
        </Alert>
      }
      etiquetaAccion="Analizar movimientos"
      analizar={analizar}
    />
  );
}
