/**
 * Lógica de "Análisis de movimientos Santander": la lectura, los controles y
 * el Excel viven en `lib/extractos/santander.ts`; acá se arma la pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { analizarSantander, generarExcelSantander, TIPO_REPORTE } from "@/lib/extractos/santander";
import { nombreSalida, resultadoDesdeAnalisis } from "@/lib/extractos/pantalla";

export { TIPO_REPORTE };
export const MAX_MB = 25;
export const MAX_ARCHIVOS = 12;
/** El reporte es texto con extensión .xls; también se aceptan .txt y .csv por si lo renombraron. */
export const FORMATOS_ENTRADA = ["application/vnd.ms-excel", "text/plain", "text/csv", "text/tab-separated-values"];

export async function analizar(archivos: File[]): Promise<ResultadoAnalisis> {
  const a = await analizarSantander(archivos);
  return resultadoDesdeAnalisis(a, {
    titulo: `Movimientos Santander · cuenta ${a.cuenta}`,
    nombreExcel: nombreSalida(archivos, "_analisis"),
    generarExcel: () => generarExcelSantander(a),
  });
}
