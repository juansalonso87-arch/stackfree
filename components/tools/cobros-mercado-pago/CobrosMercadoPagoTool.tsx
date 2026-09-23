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
  const [transferencias, setTransferencias] = useState(true);

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
            En Mercado Pago: <strong>Reportes → “Cerrar y conciliar mes” → “Todas las transacciones”</strong>, elegís el
            período, filtrás y creás el reporte en <strong>.xlsx</strong> (tarda un rato en generarse). Usá ese y no el de
            “Cobros”: el de Cobros puede dejar afuera parte de lo cobrado, sobre todo los pagos con dinero en cuenta de
            Mercado Pago. Si subís el de Cobros igual funciona y te avisamos.{" "}
            <a href="#guia-descarga" className="underline underline-offset-2">
              Ver la guía paso a paso
            </a>
            .
          </AlertDescription>
        </Alert>
      }
      opciones={
        <div className="space-y-4 sm:max-w-md">
          <div className="space-y-1">
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
          {/* Cobro "por alias": las transferencias recibidas llegan al reporte como ingreso de dinero, no como pago. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={transferencias}
              onChange={(e) => setTransferencias(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="font-medium">Contar las transferencias recibidas como cobros</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Si tus clientes te pagan por transferencia al alias o CVU en vez de QR, en el reporte de <strong>Cobros</strong>{" "}
                esas ventas llegan como “ingreso de dinero”, igual que una carga de saldo tuya. Con esta opción se cuentan
                como cobros y se muestra lo que Mercado Pago retiene sobre ellas; desactivala si son cargas tuyas. En el
                reporte de “Todas las transacciones” no hace falta: ahí Mercado Pago ya las liquidó como cobro, así que la
                opción se ignora.
              </span>
            </span>
          </label>
        </div>
      }
      etiquetaAccion="Analizar cobros"
      analizar={(archivos) => analizar(archivos, horaCorte, transferencias)}
    />
  );
}
