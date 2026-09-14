/**
 * Lógica de "Extracto Santander": la lectura, los controles y el Excel
 * viven en `lib/extractos/santander.ts` (compartido con futuras variantes).
 * Acá solo se arma el resumen que se muestra en pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { analizarSantander, generarExcelSantander, TIPO_REPORTE } from "@/lib/extractos/santander";
import { CATEGORIA_DEFECTO } from "@/lib/extractos/tipos";
import { formatearEntero, formatearFecha, formatearPesos, resumirPor } from "@/lib/extractos/texto";

export { TIPO_REPORTE };
export const MAX_MB = 25;
export const MAX_ARCHIVOS = 12;
/** El reporte es texto con extensión .xls; también se aceptan .txt y .csv por si lo renombraron. */
export const FORMATOS_ENTRADA = ["application/vnd.ms-excel", "text/plain", "text/csv", "text/tab-separated-values"];

export async function analizar(archivos: File[]): Promise<ResultadoAnalisis> {
  const a = await analizarSantander(archivos);
  const debitos = a.movimientos.reduce((s, m) => s + m.debito, 0);
  const creditos = a.movimientos.reduce((s, m) => s + m.credito, 0);
  const porCategoria = resumirPor(a.movimientos, (m) => m.categoria);
  const base = archivos[0].name.replace(/\.[^.]+$/, "").slice(0, 60) || "extracto";

  return {
    titulo: `Extracto Santander · cuenta ${a.cuenta}`,
    subtitulo: `${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)} · ${formatearEntero(a.movimientos.length)} movimientos · ${a.archivos.length > 1 ? `${a.archivos.length} archivos` : a.archivos[0]}`,
    kpis: [
      { etiqueta: "Saldo inicial", valor: formatearPesos(a.saldoInicial ?? 0) },
      { etiqueta: "Créditos (entradas)", valor: formatearPesos(creditos), tono: "positivo" },
      { etiqueta: "Débitos (salidas)", valor: formatearPesos(debitos), tono: "negativo" },
      { etiqueta: "Saldo final", valor: formatearPesos(a.saldoFinal ?? 0) },
    ],
    controles: a.controles,
    avisos: a.avisos,
    tablas: [
      {
        titulo: "Resumen por categoría",
        columnas: ["Categoría", "Mov.", "Débitos", "Créditos", "Neto"],
        numericas: [1, 2, 3, 4],
        filas: porCategoria.map((f) => [f.clave, formatearEntero(f.movimientos), formatearPesos(f.debitos), formatearPesos(f.creditos), formatearPesos(f.neto)]),
        resaltar: (fila) => fila[0] === CATEGORIA_DEFECTO,
      },
    ],
    nombreExcel: `${base}_agrupado.xlsx`,
    generarExcel: () => generarExcelSantander(a),
  };
}
