/**
 * Lógica de "Análisis de movimientos BBVA": lectura, normalización de
 * conceptos y Excel en `lib/extractos/bbva.ts`; acá se arma la pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { analizarBbva, generarExcelBbva } from "@/lib/extractos/bbva";
import { nombreSalida, resultadoDesdeAnalisis } from "@/lib/extractos/pantalla";
import { formatearEntero } from "@/lib/extractos/texto";

export const MAX_MB = 25;
export const MAX_ARCHIVOS = 12;
export const FORMATOS_ENTRADA = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/html",
];

export async function analizar(archivos: File[]): Promise<ResultadoAnalisis> {
  const a = await analizarBbva(archivos);
  const conceptos = new Set(a.movimientos.map((m) => m.concepto)).size;
  const r = resultadoDesdeAnalisis(a, {
    titulo: "Movimientos BBVA",
    nombreExcel: nombreSalida(archivos, "_analisis"),
    generarExcel: () => generarExcelBbva(a),
    kpisExtra: [{ etiqueta: "Textos del banco → conceptos", valor: `${formatearEntero(a.textosBanco)} → ${formatearEntero(conceptos)}` }],
  });
  // Segunda tabla: los conceptos que más redacciones distintas unificaron.
  const unificados = a.diagnostico.filter((d) => d.variantes > 1).slice(0, 8);
  if (unificados.length > 0) {
    r.tablas.push({
      titulo: "Conceptos que unificaron varias redacciones del banco",
      columnas: ["Concepto", "Variantes", "Mov.", "Textos originales"],
      numericas: [1, 2],
      filas: unificados.map((d) => [d.concepto, d.variantes, d.movimientos, d.textosOriginales]),
    });
  }
  return r;
}
