/**
 * Lógica de "Análisis de cobros de Mercado Pago": lectura, regla del turno y
 * agregaciones en `lib/extractos/mercadopago.ts`; Excel en `excel-mp.ts`.
 * Acá se arma lo que se muestra en pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { generarExcelMercadoPago } from "@/lib/extractos/excel-mp";
import {
  HORA_CORTE_DEFECTO,
  MEDIO_TRANSFERENCIA_RECIBIDA,
  analizarMercadoPago,
  cajasConNombre,
  hayVentasEnCuotas,
  liberacionPorMedio,
  localesConNombre,
  pendienteDeLiberar,
  porCaja,
  porCanal,
  porCuotas,
  porDiaDeTurno,
  porLocal,
  porMedioDePago,
  porTarjeta,
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

export async function analizar(archivos: File[], horaCorte: number, transferenciasComoCobro = true): Promise<ResultadoAnalisis> {
  const a = await analizarMercadoPago(archivos, horaCorte, { transferenciasComoCobro });
  const bruto = a.cobros.reduce((s, c) => s + c.bruto, 0);
  const neto = a.cobros.reduce((s, c) => s + c.neto, 0);
  const descontado = bruto - neto;
  const noCobrado = a.noConcretadas.reduce((s, n) => s + n.bruto, 0);
  const devuelto = a.cobros.reduce((s, c) => s + c.devuelto, 0);
  const mejor = [...porDiaDeTurno(a.cobros)].sort((x, y) => y.bruto - x.bruto)[0];
  // Cobros que entraron "por alias" en vez de QR: en Argentina suelen ser la mayoría.
  const porTransferencia = a.cobros.filter((c) => c.medioPago === MEDIO_TRANSFERENCIA_RECIBIDA);
  const brutoTransferencia = porTransferencia.reduce((s, c) => s + c.bruto, 0);
  const canales = porCanal(a.cobros);
  const liberacion = liberacionPorMedio(a.cobros);
  const pendiente = pendienteDeLiberar(a.cobros);
  const periodos = [...new Set(a.cobros.map((c) => c.periodo))].sort();
  // Marca, cuotas y caja: solo los trae el reporte nuevo de "Todas las transacciones" (las cuotas, también el de Cobros).
  const tarjetas = porTarjeta(a.cobros);
  const brutoTarjetas = tarjetas.reduce((s, t) => s + t.bruto, 0);
  const cuotas = porCuotas(a.cobros);
  const brutoCuotas = cuotas.reduce((s, c) => s + c.bruto, 0);
  const variosLocales = localesConNombre(a.cobros).length > 1;

  return {
    titulo: "Cobros de Mercado Pago",
    subtitulo: `Turnos del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)} · ${formatearEntero(a.cobros.length)} cobros · corte de turno ${String(a.horaCorte).padStart(2, "0")}:00 · ${a.archivos.length > 1 ? `${a.archivos.length} archivos` : a.archivos[0]}`,
    kpis: [
      { etiqueta: "Cobrado (bruto)", valor: formatearPesos(bruto), tono: "positivo" },
      { etiqueta: "Neto acreditado", valor: formatearPesos(neto) },
      { etiqueta: "Descontado por MP", valor: `${formatearPesos(descontado)} (${bruto ? ((descontado / bruto) * 100).toFixed(2) : "0"} %)`, tono: "negativo" },
      { etiqueta: "Ticket promedio", valor: formatearPesos(a.cobros.length ? bruto / a.cobros.length : 0) },
      ...(porTransferencia.length
        ? [
            {
              etiqueta: "Cobrado por transferencia (alias/CVU)",
              valor: `${formatearPesos(brutoTransferencia)} · ${formatearEntero(porTransferencia.length)} cobros (${bruto ? ((brutoTransferencia / bruto) * 100).toFixed(1) : "0"} %)`,
            },
          ]
        : []),
      ...(a.noConcretadas.length
        ? [{ etiqueta: "No concretados", valor: `${formatearEntero(a.noConcretadas.length)} · ${formatearPesos(noCobrado)}`, tono: "negativo" as const }]
        : []),
      ...(devuelto > 0 ? [{ etiqueta: "Devoluciones parciales", valor: formatearPesos(devuelto), tono: "negativo" as const }] : []),
      ...(mejor ? [{ etiqueta: "Mejor turno", valor: `${mejor.diaSemana} ${formatearFecha(mejor.dia)} · ${formatearPesos(mejor.bruto)}` }] : []),
      ...(pendiente.neto > 0 ? [{ etiqueta: "Pendiente de liberar al cierre", valor: `${formatearPesos(pendiente.neto)} · ${formatearEntero(pendiente.cobros)} cobros` }] : []),
    ],
    avisos: a.avisos,
    tablas: [
      ...(canales.length > 1
        ? [
            {
              titulo: "Canales de cobro (cómo cobraste)",
              columnas: ["Canal", "Cobros", "Bruto", "% del total", "Comisión MP", "Neto"],
              numericas: [1, 2, 3, 4, 5],
              filas: canales.map((c) => [c.canal, formatearEntero(c.cobros), formatearPesos(c.bruto), `${bruto ? ((c.bruto / bruto) * 100).toFixed(1) : "0"} %`, `${c.bruto ? ((c.comision / c.bruto) * 100).toFixed(2) : "0"} %`, formatearPesos(c.neto)]),
            },
          ]
        : []),
      {
        titulo: "Promedio por día de la semana (por turno)",
        columnas: ["Día", "Turnos", "Promedio cobrado"],
        numericas: [1, 2],
        filas: promedioPorDiaSemana(a.cobros).map((d) => [d.dia, formatearEntero(d.turnos), formatearPesos(d.promedio)]),
      },
      ...(localesConNombre(a.cobros).length > 1
        ? [
            {
              titulo: "Cobros por local",
              columnas: ["Local", "Cobros", "Bruto", "% del total", "Neto recibido"],
              numericas: [1, 2, 3, 4],
              filas: porLocal(a.cobros).map((l) => [l.local, formatearEntero(l.cobros), formatearPesos(l.bruto), `${bruto ? ((l.bruto / bruto) * 100).toFixed(1) : "0"} %`, formatearPesos(l.neto)]),
            },
          ]
        : []),
      {
        titulo: "Medios de pago (con qué pagó el cliente)",
        columnas: ["Medio de pago", "Cobros", "Bruto", "% del total", "Comisión MP", "Retenciones"],
        numericas: [1, 2, 3, 4, 5],
        filas: porMedioDePago(a.cobros).map((m) => [
          m.medio,
          formatearEntero(m.cobros),
          formatearPesos(m.bruto),
          `${bruto ? ((m.bruto / bruto) * 100).toFixed(1) : "0"} %`,
          `${m.bruto ? ((m.comision / m.bruto) * 100).toFixed(2) : "0"} %`,
          `${m.bruto ? ((m.retenciones / m.bruto) * 100).toFixed(2) : "0"} %`,
        ]),
      },
      ...(tarjetas.length
        ? [
            {
              titulo: "Tarjetas: cuánto te cobra Mercado Pago por cada una",
              columnas: ["Tarjeta", "Cobros", "Bruto", "% de lo cobrado con tarjeta", "Comisión MP", "En cuotas"],
              numericas: [1, 2, 3, 4, 5],
              filas: tarjetas.map((t) => [
                t.etiqueta,
                formatearEntero(t.cobros),
                formatearPesos(t.bruto),
                `${brutoTarjetas ? ((t.bruto / brutoTarjetas) * 100).toFixed(1) : "0"} %`,
                `${t.bruto ? ((t.comision / t.bruto) * 100).toFixed(2) : "0"} %`,
                t.enCuotas ? formatearEntero(t.enCuotas) : "—",
              ]),
            },
          ]
        : []),
      ...(hayVentasEnCuotas(a.cobros)
        ? [
            {
              titulo: "En un pago o en cuotas (tarjeta de crédito y Mercado Crédito)",
              columnas: ["Cuotas", "Cobros", "Bruto", "% de lo cobrado en crédito", "Comisión MP", "Otras tarifas"],
              numericas: [1, 2, 3, 4, 5],
              filas: cuotas.map((c) => [
                c.cuotas === 1 ? "1 pago" : `${c.cuotas} cuotas`,
                formatearEntero(c.cobros),
                formatearPesos(c.bruto),
                `${brutoCuotas ? ((c.bruto / brutoCuotas) * 100).toFixed(1) : "0"} %`,
                `${c.bruto ? ((c.comision / c.bruto) * 100).toFixed(2) : "0"} %`,
                `${c.bruto ? ((c.otras / c.bruto) * 100).toFixed(2) : "0"} %`,
              ]),
            },
          ]
        : []),
      ...(cajasConNombre(a.cobros).length > 1
        ? [
            {
              titulo: "Cobros por caja",
              columnas: ["Caja", ...(variosLocales ? ["Local"] : []), "Cobros", "Bruto", "% del total", "Neto recibido"],
              numericas: variosLocales ? [2, 3, 4, 5] : [1, 2, 3, 4],
              filas: porCaja(a.cobros).map((c) => [
                c.caja,
                ...(variosLocales ? [c.local || "Sin local"] : []),
                formatearEntero(c.cobros),
                formatearPesos(c.bruto),
                `${bruto ? ((c.bruto / bruto) * 100).toFixed(1) : "0"} %`,
                formatearPesos(c.neto),
              ]),
            },
          ]
        : []),
      ...(liberacion.length
        ? [
            {
              titulo: "Cuándo se libera la plata",
              columnas: ["Medio de pago", "Cobros", "Días hasta liberar (prom.)", "Pendiente al cierre"],
              numericas: [1, 2, 3],
              filas: liberacion.map((l) => [l.medio, formatearEntero(l.cobros), l.diasPromedio.toFixed(1), formatearPesos(l.pendiente)]),
            },
          ]
        : []),
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
