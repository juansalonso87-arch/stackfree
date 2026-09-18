/**
 * Lógica de "Análisis de ventas de PedidosYa": lectura, liquidación y
 * agregaciones en `lib/extractos/pedidosya.ts`; Excel en `excel-peya.ts`.
 * Acá se arma lo que se muestra en pantalla.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { generarExcelPedidosYa } from "@/lib/extractos/excel-peya";
import {
  HORA_CORTE_DEFECTO,
  analizarPedidosYa,
  cajaPorDia,
  descontadoPorPeYa,
  medianaEntrega,
  medianaPreparacion,
  porDiaDeTurno,
  porFormaDePago,
  porLocal,
  porMotivo,
  promedioPorDiaSemana,
  resumenMensual,
} from "@/lib/extractos/pedidosya";
import { formatearEntero, formatearFecha, formatearPesos } from "@/lib/extractos/texto";

export { HORA_CORTE_DEFECTO };
export const MAX_MB = 50;
export const MAX_ARCHIVOS = 12;
export const FORMATOS_ENTRADA = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

const pct = (parte: number, total: number) => (total ? `${((parte / total) * 100).toFixed(1)} %` : "0 %");

export async function analizar(archivos: File[], horaCorte: number): Promise<ResultadoAnalisis> {
  const a = await analizarPedidosYa(archivos, horaCorte);
  const venta = a.ventas.reduce((s, p) => s + p.venta, 0);
  // Incluye las penalidades de cancelaciones atribuidas al local (ingreso negativo), igual que el Excel.
  const neto = a.pedidos.reduce((s, p) => s + p.ingreso, 0);
  const descontado = a.ventas.reduce((s, p) => s + descontadoPorPeYa(p), 0);
  const descuentoPropio = a.ventas.reduce((s, p) => s + p.descuentoPropio, 0);
  const aCobrar = a.pedidos.reduce((s, p) => s + p.pago - p.adeudado, 0);
  const efectivo = a.ventas.reduce((s, p) => s + p.efectivo, 0);
  const ventaCancelada = a.cancelados.reduce((s, p) => s + p.venta, 0);
  const reclamos = a.ventas.filter((p) => p.tieneReclamo);
  const cargosReclamos = reclamos.reduce((s, p) => s + p.cargosReclamos, 0);
  const mejor = [...porDiaDeTurno(a.ventas)].sort((x, y) => y.venta - x.venta)[0];
  const prep = medianaPreparacion(a.ventas);
  const entrega = medianaEntrega(a.ventas);
  const periodos = [...new Set(a.ventas.map((p) => p.periodo))].sort();
  const locales = porLocal(a);
  const variosLocales = a.locales.length > 1;
  const topProductos = [...a.items].sort((x, y) => y.unidades - x.unidades).slice(0, 15);
  // Caja por día para la pantalla: sumada entre locales (el Excel la trae por local); solo si hubo cobros en efectivo.
  const caja = new Map<number, { dia: Date; diaSemana: string; online: number; ventaOnline: number; efectivoN: number; efectivo: number; adeudado: number }>();
  for (const c of cajaPorDia(a.ventas)) {
    const k = c.dia.getTime();
    const f = caja.get(k) ?? { dia: c.dia, diaSemana: c.diaSemana, online: 0, ventaOnline: 0, efectivoN: 0, efectivo: 0, adeudado: 0 };
    f.online += c.pedidosOnline;
    f.ventaOnline += c.ventaOnline;
    f.efectivoN += c.pedidosEfectivo;
    f.efectivo += c.efectivoCobrado;
    f.adeudado += c.adeudado;
    caja.set(k, f);
  }
  const cajaPorDiaUI = [...caja.values()].sort((x, y) => x.dia.getTime() - y.dia.getTime());

  return {
    titulo: "Ventas de PedidosYa",
    subtitulo: `Turnos del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)} · ${formatearEntero(a.ventas.length)} pedidos entregados · ${a.locales.length} ${variosLocales ? "locales" : "local"} · corte de turno ${String(a.horaCorte).padStart(2, "0")}:00 · ${a.archivos.length > 1 ? `${a.archivos.length} archivos` : a.archivos[0]}`,
    kpis: [
      { etiqueta: "Venta (pedidos entregados)", valor: formatearPesos(venta), tono: "positivo" },
      { etiqueta: "Neto para el local", valor: `${formatearPesos(neto)} (${pct(neto, venta)})` },
      { etiqueta: "Se lleva PedidosYa", valor: `${formatearPesos(descontado)} (${pct(descontado, venta)})`, tono: "negativo" },
      { etiqueta: "Descuentos que financiaste", valor: `${formatearPesos(descuentoPropio)} (${pct(descuentoPropio, venta)})`, tono: "negativo" },
      { etiqueta: "A cobrar de PedidosYa", valor: formatearPesos(aCobrar) },
      ...(efectivo > 0 ? [{ etiqueta: "Ya cobrado en efectivo", valor: formatearPesos(efectivo) }] : []),
      { etiqueta: "Ticket promedio", valor: formatearPesos(a.ventas.length ? venta / a.ventas.length : 0) },
      ...(a.cancelados.length
        ? [{ etiqueta: "Cancelados", valor: `${formatearEntero(a.cancelados.length)} · ${formatearPesos(ventaCancelada)}`, tono: "negativo" as const }]
        : []),
      ...(reclamos.length
        ? [{ etiqueta: "Reclamos (devuelto al cliente)", valor: `${formatearEntero(reclamos.length)} · ${formatearPesos(cargosReclamos)}`, tono: "negativo" as const }]
        : []),
      ...(prep !== null ? [{ etiqueta: "Preparación (mediana)", valor: `${prep} min${entrega !== null ? ` · entrega ${entrega} min` : ""}` }] : []),
      ...(mejor ? [{ etiqueta: "Mejor turno", valor: `${mejor.diaSemana} ${formatearFecha(mejor.dia)} · ${formatearPesos(mejor.venta)}` }] : []),
    ],
    controles: a.controles,
    avisos: a.avisos,
    tablas: [
      ...(variosLocales
        ? [
            {
              titulo: "Ventas por local",
              columnas: ["Local", "Pedidos", "Venta", "% del total", "Ticket prom.", "Comisión", "Neto", "% neto", "Cancel.", "Reclamos"],
              numericas: [1, 2, 3, 4, 5, 6, 7, 8, 9],
              filas: locales.map((l) => [
                l.local,
                formatearEntero(l.pedidos),
                formatearPesos(l.venta),
                pct(l.venta, venta),
                formatearPesos(l.pedidos ? l.venta / l.pedidos : 0),
                pct(l.comision, l.venta),
                formatearPesos(l.ingreso),
                pct(l.ingreso, l.venta),
                formatearEntero(l.cancelados),
                formatearEntero(l.reclamos),
              ]),
            },
          ]
        : []),
      {
        titulo: "Promedio por día de la semana (por turno)",
        columnas: ["Día", "Turnos", "Pedidos por turno", "Venta promedio"],
        numericas: [1, 2, 3],
        filas: promedioPorDiaSemana(a.ventas).map((d) => [d.dia, formatearEntero(d.turnos), d.pedidosPromedio.toFixed(1), formatearPesos(d.promedio)]),
      },
      ...(efectivo > 0
        ? [
            {
              titulo: `Caja por día: cobros online vs. en efectivo${variosLocales ? " (todos los locales; el Excel lo trae por local)" : ""}`,
              columnas: ["Día de turno", "Pedidos online", "Venta online", "Pedidos en efectivo", "Efectivo cobrado en el local", "Adeudado a PedidosYa"],
              numericas: [1, 2, 3, 4, 5],
              filas: cajaPorDiaUI.map((c) => [
                `${c.diaSemana.slice(0, 3)} ${formatearFecha(c.dia)}`,
                formatearEntero(c.online),
                formatearPesos(c.ventaOnline),
                formatearEntero(c.efectivoN),
                formatearPesos(c.efectivo),
                formatearPesos(c.adeudado),
              ]),
            },
          ]
        : []),
      {
        titulo: "Cómo pagan y cómo reciben",
        columnas: ["Forma de pago", "Entrega", "Pedidos", "Venta", "% del total"],
        numericas: [2, 3, 4],
        filas: porFormaDePago(a.ventas).map((f) => [f.formaPago, f.metodoEntrega, formatearEntero(f.pedidos), formatearPesos(f.venta), pct(f.venta, venta)]),
      },
      ...(topProductos.length
        ? [
            {
              titulo: `Productos más vendidos (top ${topProductos.length}${variosLocales ? "; el Excel los trae por local" : ""})`,
              columnas: ["Producto", ...(variosLocales ? ["Local"] : []), "Unidades", "Pedidos"],
              numericas: variosLocales ? [2, 3] : [1, 2],
              filas: topProductos.map((i) => [i.producto, ...(variosLocales ? [i.local] : []), formatearEntero(i.unidades), formatearEntero(i.pedidos)]),
            },
          ]
        : []),
      ...(a.cancelados.length || reclamos.length
        ? [
            {
              titulo: "Cancelaciones y reclamos por motivo",
              columnas: ["Tipo", "Motivo", "Cantidad", "Monto"],
              numericas: [2, 3],
              filas: porMotivo(a).map((m) => [m.tipo, m.motivo, formatearEntero(m.cantidad), formatearPesos(m.monto)]),
              resaltar: (fila: (string | number)[]) => fila[0] === "Reclamo",
            },
          ]
        : []),
      ...(periodos.length > 1
        ? [
            {
              titulo: "Resumen mensual",
              columnas: ["Período", "Pedidos", "Venta", "Se lleva PedidosYa", "Descuentos propios", "Neto"],
              numericas: [1, 2, 3, 4, 5],
              filas: resumenMensual(a.ventas).map((m) => [
                m.periodo,
                formatearEntero(m.pedidos),
                formatearPesos(m.venta),
                formatearPesos(m.descontado),
                formatearPesos(m.descuentoPropio),
                formatearPesos(m.ingreso),
              ]),
            },
          ]
        : []),
    ],
    nombreExcel: `ventas_pedidosya_${periodos.join("-")}.xlsx`,
    generarExcel: () => generarExcelPedidosYa(a),
  };
}
