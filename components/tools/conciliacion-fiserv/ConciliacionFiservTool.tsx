"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { AnalizadorExtracto } from "@/components/core/AnalizadorExtracto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Banco } from "@/lib/extractos/tipos";
import { AYUDA_BANCO, BANCOS, ENTRADA_BANCO, ENTRADA_FISERV, FORMATOS_BANCO, FORMATOS_FISERV, MAX_ARCHIVOS, MAX_MB, analizar } from "./logic";

const CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Interfaz de "Conciliación Fiserv ↔ banco": dos archivos (extracto del banco + liquidaciones de Fiserv) → cruce + Excel. */
export default function ConciliacionFiservTool() {
  const [banco, setBanco] = useState<Banco | "">("");

  return (
    <AnalizadorExtracto
      maxSizeMB={MAX_MB}
      maxArchivos={MAX_ARCHIVOS}
      entradas={[
        {
          id: ENTRADA_BANCO,
          titulo: "Movimientos del banco",
          descripcion: "Arrastrá acá el extracto de Santander, BBVA o Comafi",
          accept: FORMATOS_BANCO,
          multiple: true,
          ayuda: (
            <>
              El mismo archivo que usás en el análisis de tu banco. Si tenés dudas de cuál es,{" "}
              <Link href="/administracion" className="underline underline-offset-2 hover:text-foreground">
                cada herramienta de banco tiene la guía
              </Link>
              .
            </>
          ),
        },
        {
          id: ENTRADA_FISERV,
          titulo: "Liquidaciones diarias de Fiserv",
          descripcion: "Arrastrá acá el Excel de liquidaciones de Fiserv",
          accept: FORMATOS_FISERV,
          multiple: true,
          ayuda: (
            <>
              En el portal de Fiserv: <strong>Liquidaciones → Liquidaciones Diarias</strong>, filtrás las fechas (y el CUIT si tenés
              varios comercios) y descargás el Excel completo.{" "}
              <a href="#guia-descarga" className="underline underline-offset-2 hover:text-foreground">
                Ver la guía
              </a>
              .
            </>
          ),
        },
      ]}
      instrucciones={
        <Alert>
          <Info />
          <AlertTitle>Dos archivos del mismo período</AlertTitle>
          <AlertDescription>
            Subí el extracto del banco y el reporte de liquidaciones diarias de Fiserv <strong>del mismo mes o rango de fechas</strong>.
            La herramienta busca cada liquidación de Fiserv como crédito en el banco y te dice cuáles no aparecen, cuáles llegaron
            con demora y cuánto te queda de verdad de cada venta con tarjeta.
          </AlertDescription>
        </Alert>
      }
      opciones={
        <div className="space-y-1 sm:max-w-md">
          <label htmlFor="banco" className="text-sm font-medium">
            Banco del extracto
          </label>
          <select id="banco" value={banco} onChange={(e) => setBanco(e.target.value as Banco | "")} className={CAMPO}>
            <option value="">Detectar automáticamente por el archivo</option>
            {BANCOS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {banco ? AYUDA_BANCO[banco] : "Normalmente no hace falta elegirlo: se reconoce por el formato del archivo. Elegilo solo si no lo detecta."}
          </p>
        </div>
      }
      etiquetaAccion="Conciliar liquidaciones"
      analizar={(_, porEntrada) => analizar(porEntrada, banco)}
    />
  );
}
