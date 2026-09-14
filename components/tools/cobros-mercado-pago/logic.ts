/**
 * Lógica de "Análisis de cobros de Mercado Pago": lectura, regla del turno y
 * agregaciones en `lib/extractos/mercadopago.ts`; Excel en `excel-mp.ts`.
 * Acá se arma lo que se muestra en pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { generarExcelMercadoPago } from "@/lib/extractos/excel-mp";
import {
  HORA_CORTE_DEFECTO,
  analizarMercadoPago,
  porDiaDeTurno,
  porMedioDePago,
  promedioPorDiaSemana,
  resumenMensual,
} from "@/lib/extractos/mercadopago";
import { formatearEntero, formatearFecha, formatearPesos } from "@/lib/extractos/texto";

export { HORA_CORTE_DEFECTO };
export const MAX_MB = 50;
export const MAX_ARCHIVOS = 12;
export const FORMATOS_ENTRADA = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/xml",
  "text/csv",
];

export async function analizar(archivos: File[], horaCorte: number): Promise<ResultadoAnalisis> {
  const a = await analizarMercadoPago(archivos, horaCorte);
  const bruto = a.cobros.reduce((s, c) => s + c.bruto, 0);
  const neto = a.cobros.reduce((s, c) => s + c.neto, 0);
  const descontado = bruto - neto;
  const noCobrado = a.noConcretadas.reduce((s, n) => s + n.bruto, 0);
  const mejor = [...porDiaDeTurno(a.cobros)].sort((x, y) => y.bruto - x.bruto)[0];
  const periodos = [...new Set(a.cobros.map((c) => c.periodo))].sort();

  return {
    titulo: "Cobros de Mercado Pago",
    subtitulo: `Turnos del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)} · ${formatearEntero(a.cobros.length)} cobros · corte de turno ${String(a.horaCorte).padStart(2, "0")}:00 · ${a.archivos.length > 1 ? `${a.archivos.length} archivos` : a.archivos[0]}`,
    kpis: [
      { etiqueta: "Cobrado (bruto)", valor: formatearPesos(bruto), tono: "positivo" },
      { etiqueta: "Neto acreditado", valor: formatearPesos(neto) },
      { etiqueta: "Descontado por MP", valor: `${formatearPesos(descontado)} (${bruto ? ((descontado / bruto) * 100).toFixed(2) : "0"} %)`, tono: "negativo" },
      { etiqueta: "Ticket promedio", valor: formatearPesos(a.cobros.length ? bruto / a.cobros.length : 0) },
      ...(a.noConcretadas.length
        ? [{ etiqueta: "No concretados", valor: `${formatearEntero(a.noConcretadas.length)} · ${formatearPesos(noCobrado)}`, tono: "negativo" as const }]
        : []),
      ...(mejor ? [{ etiqueta: "Mejor turno", valor: `${mejor.diaSemana} ${formatearFecha(mejor.dia)} · ${formatearPesos(mejor.bruto)}` }] : []),
    ],
    avisos: a.avisos,
    tablas: [
      {
        titulo: "Promedio por día de la semana (por turno)",
        columnas: ["Día", "Turnos", "Promedio cobrado"],
        numericas: [1, 2],
        filas: promedioPorDiaSemana(a.cobros).map((d) => [d.dia, formatearEntero(d.turnos), formatearPesos(d.promedio)]),
      },
      {
        titulo: "Medios de pago",
        columnas: ["Medio de pago", "Cobros", "Bruto", "% del total"],
        numericas: [1, 2, 3],
        filas: porMedioDePago(a.cobros).map((m) => [m.medio, formatearEntero(m.cobros), formatearPesos(m.bruto), `${bruto ? ((m.bruto / bruto) * 100).toFixed(1) : "0"} %`]),
      },
      ...(periodos.length > 1
        ? [
            {
              titulo: "Resumen mensual",
              columnas: ["Período", "Cobros", "Bruto", "Descontado", "Neto"],
              numericas: [1, 2, 3, 4],
              filas: resumenMensual(a.cobros).map((m) => [m.periodo, formatearEntero(m.cobros), formatearPesos(m.bruto), formatearPesos(m.bruto - m.neto), formatearPesos(m.neto)]),
            },
          ]
        : []),
    ],
    nombreExcel: `analisis_cobros_${periodos.join("-")}.xlsx`,
    generarExcel: () => generarExcelMercadoPago(a),
  };
}
