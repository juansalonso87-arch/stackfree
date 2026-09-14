"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FORMATOS_ENTRADA, HORA_CORTE_DEFECTO, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Interfaz de "Análisis de cobros de Mercado Pago": reporte de cobros → resumen por turno + Excel. */
export default function CobrosMercadoPagoTool() {
  const [horaCorte, setHoraCorte] = useState(HORA_CORTE_DEFECTO);

  return (
    <AnalizadorExtracto
      accept={FORMATOS_ENTRADA}
      maxSizeMB={MAX_MB}
      multiple
      maxArchivos={MAX_ARCHIVOS}
      tituloDropzone="Arrastrá acá el reporte de cobros de Mercado Pago"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Qué archivo necesitás</AlertTitle>
          <AlertDescription>
            El <strong>reporte de cobros</strong> que exportás desde Mercado Pago (Excel). Tiene que incluir la fecha
            con hora (columna “Fecha de compra”) para poder aplicar el corte de turno.
          </AlertDescription>
        </Alert>
      }
      opciones={
        <div className="space-y-1 sm:max-w-sm">
          <label htmlFor="hora-corte" className="text-sm font-medium">
            Hora de corte del turno
          </label>
          <select id="hora-corte" value={horaCorte} onChange={(e) => setHoraCorte(Number(e.target.value))} className={CAMPO}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00{h === 0 ? " (sin corte: día calendario)" : h === HORA_CORTE_DEFECTO ? " (recomendado)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Los cobros anteriores a esta hora se imputan al turno del día anterior. Con 06:00, un cobro de las 02:30 del
            sábado cuenta para el viernes.
          </p>
        </div>
      }
      etiquetaAccion="Analizar cobros"
      analizar={(archivos) => analizar(archivos, horaCorte)}
    />
  );
}
