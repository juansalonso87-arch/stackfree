"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MODOS_PLANILLA_LOCAL, type ModoPlanillaElegido } from "@/lib/extractos/peya-liquidacion";
import { FORMATOS, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

const EJEMPLO = "30/08/2026\t$ 1.369.576,00\n29/08/2026\t$ 1.080.620,00";

/** Cada local lleva la cuenta a su manera; por defecto lo deduce la herramienta. */
const OPCIONES: { id: ModoPlanillaElegido; etiqueta: string; ayuda: string }[] = [
  { id: "auto", etiqueta: "Que lo detecte la herramienta", ayuda: "prueba las tres formas y usa la que cierra con tus números" },
  ...MODOS_PLANILLA_LOCAL,
];

/**
 * Interfaz de "Liquidación de PedidosYa": un solo recuadro donde entran los dos
 * reportes del Portal Partner (estado de cuenta y reporte de pedidos, de todas
 * las semanas y locales). Cada archivo se reconoce por su contenido. Opcional:
 * pegar la planilla diaria del local para que el análisis explique, día por día,
 * por qué no coincide con lo que liquida PedidosYa.
 */
export default function LiquidacionPedidosYaTool() {
  const [planilla, setPlanilla] = useState("");
  const [modo, setModo] = useState<ModoPlanillaElegido>("auto");

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
      opciones={
        <details className="rounded-lg border border-input bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            ¿Tu local anota la venta de PedidosYa día por día? Pegala acá y te digo dónde está la diferencia (opcional)
          </summary>
          <div className="mt-3 space-y-2">
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">¿Qué anota tu local en esa planilla?</legend>
              {OPCIONES.map((m) => (
                <label key={m.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="modo-planilla"
                    value={m.id}
                    checked={modo === m.id}
                    onChange={() => setModo(m.id)}
                    className="mt-1"
                  />
                  <span>
                    <strong>{m.etiqueta}</strong>{" "}
                    <span className="text-muted-foreground">— {m.ayuda}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Con la primera opción no tenés que decidir nada: el análisis prueba las tres y te dice cuál usó.
              </p>
            </fieldset>
            <label htmlFor="planilla-local" className="block pt-2 text-sm text-muted-foreground">
              Una línea por día, con la fecha y el importe. Podés pegar las dos columnas directo desde tu planilla.
            </label>
            <textarea
              id="planilla-local"
              value={planilla}
              onChange={(e) => setPlanilla(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={EJEMPLO}
              className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">
              El análisis compara cada día y te dice qué explica la diferencia: casi siempre son los descuentos que PedidosYa
              cobra después (el local anota la venta como la mostró la app) y los pedidos cancelados que quedaron anotados.
            </p>
          </div>
        </details>
      }
      etiquetaAccion="Analizar la liquidación"
      analizar={(archivos) => analizar(archivos, planilla, modo)}
    />
  );
}
