/**
 * Lógica de "Análisis de movimientos Comafi": lectura y Excel en
 * `lib/extractos/comafi.ts`; acá se arma la pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { analizarComafi, generarExcelComafi } from "@/lib/extractos/comafi";
import { nombreSalida, resultadoDesdeAnalisis } from "@/lib/extractos/pantalla";

export const MAX_MB = 25;
export const MAX_ARCHIVOS = 12;
export const FORMATOS_ENTRADA = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/pdf",
];

export async function analizar(archivos: File[]): Promise<ResultadoAnalisis> {
  const a = await analizarComafi(archivos);
  const monedas = [...new Set(a.movimientos.map((m) => m.moneda))];
  return resultadoDesdeAnalisis(a, {
    titulo: `Movimientos Comafi${monedas.length > 1 ? ` · ${monedas.join(" y ")}` : ""}`,
    nombreExcel: nombreSalida(archivos, "_analisis"),
    generarExcel: () => generarExcelComafi(a),
  });
}
