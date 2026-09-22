"use client";

import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FORMATOS, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

/**
 * Interfaz de "Liquidación de PedidosYa": un solo recuadro donde entran los dos
 * reportes del Portal Partner (estado de cuenta y reporte de pedidos, de todas
 * las semanas y locales). Cada archivo se reconoce por su contenido.
 */
export default function LiquidacionPedidosYaTool() {
  return (
    <AnalizadorExtracto
      accept={FORMATOS}
      maxSizeMB={MAX_MB}
      maxArchivos={MAX_ARCHIVOS}
      multiple
      tituloDropzone="Arrastrá tus archivos de PedidosYa"
      descripcionDropzone="o tocá para seleccionarlos (podés soltar todos juntos: estados de cuenta y reportes de pedidos)"
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Con un archivo ya funciona; con los dos ves todo</AlertTitle>
          <AlertDescription>
            <p>
              Soltá todo junto lo que tengas del Portal Partner, del <strong>mismo período</strong>: el{" "}
              <strong>estado de cuenta</strong> de cada semana (Finanzas) y el <strong>reporte de pedidos</strong> de cada local
              (Reportes → Pedidos). La herramienta reconoce sola cuál es cuál.
            </p>
            <p>
              Con el reporte de pedidos solo ya ves el costo real (incluye la tarifa de pago online y el IVA, que el estado de
              cuenta esconde). Sumando los estados de cuenta, además controlás cada depósito, los reintegros y los descuentos que
              PedidosYa te cobra.
            </p>
          </AlertDescription>
        </Alert>
      }
      etiquetaAccion="Analizar la liquidación"
      analizar={(archivos) => analizar(archivos)}
    />
  );
}
