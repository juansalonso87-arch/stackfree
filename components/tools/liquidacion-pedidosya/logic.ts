/**
 * Lógica de "Liquidación de PedidosYa": el cruce vive en
 * `lib/extractos/peya-liquidacion.ts` (y el Excel en
 * `lib/extractos/excel-peya-liquidacion.ts`); acá se arma la pantalla.
 */

import type { ResultadoAnalisis, TablaResumen } from "@/components/core/AnalizadorExtracto";
import {
  analizarLiquidacionPeYa,
  incidenciasPorTipo,
  porSucursal,
  type AnalisisLiquidacionPeYa,
} from "@/lib/extractos/peya-liquidacion";
import { claveDia, formatearEntero, formatearFecha, formatearPesos, round2 } from "@/lib/extractos/texto";

export const MAX_MB = 25;
export const MAX_ARCHIVOS = 20;
export const FORMATOS = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

const pct = (parte: number, total: number) => (total ? `${((parte / total) * 100).toFixed(2).replace(".", ",")} %` : "—");
const SD = "falta el archivo";

export async function analizar(archivos: File[]): Promise<ResultadoAnalisis> {
  return resultadoDesdeLiquidacion(await analizarLiquidacionPeYa(archivos));
}

export function resultadoDesdeLiquidacion(a: AnalisisLiquidacionPeYa): ResultadoAnalisis {
  const t = a.total;
  const conEstado = a.estados.length > 0;
  const conPedidos = !!a.pedidos;
  const costoPlataforma = round2(t.comision + t.plus + t.tarifaOnline + t.iva);
  const cancelados = a.dias.reduce((s, d) => s + d.cancelados, 0);
  const montoCancelado = round2(a.dias.reduce((s, d) => s + d.montoCancelado, 0));

  /* --- 1. La cascada --- */
  const cascada: (string | number)[][] = [
    ["Venta bruta (antes de tus promos)", formatearPesos(t.bruto), "100 %"],
    ["Tus promos y cupones", formatearPesos(-t.promos) + (t.promosIncluyenPlus ? " *" : ""), pct(t.promos, t.bruto)],
    ["Descuentos de PedidosYa que te cobran", conEstado ? formatearPesos(-t.descuentoPeya) : SD, conEstado ? pct(t.descuentoPeya, t.bruto) : "—"],
    ["Venta neta", formatearPesos(t.neta), pct(t.neta, t.bruto)],
    ["Comisión por el servicio", formatearPesos(-t.comision), pct(t.comision, t.bruto)],
    ["Cargo por pedidos con Plus", conEstado ? formatearPesos(-t.plus) : SD, conEstado ? pct(t.plus, t.bruto) : "—"],
    ["Tarifa de pago online", conPedidos ? formatearPesos(-t.tarifaOnline) : SD, conPedidos ? pct(t.tarifaOnline, t.bruto) : "—"],
    ["IVA sobre comisiones y tarifas", conPedidos ? formatearPesos(-t.iva) : SD, conPedidos ? pct(t.iva, t.bruto) : "—"],
    ["Reclamos de usuarios", formatearPesos(t.reclamos), pct(-t.reclamos, t.bruto)],
    ...(conEstado ? [["Reintegros por pedidos rechazados", formatearPesos(t.reintegros), pct(t.reintegros, t.bruto)]] : []),
    ["Cobrado por vos en efectivo en el local", formatearPesos(-t.efectivo), pct(t.efectivo, t.bruto)],
    ["Depósito estimado de PedidosYa", formatearPesos(t.deposito), pct(t.deposito, t.bruto)],
    ["Lo que te queda (depósito + efectivo)", formatearPesos(t.queda), pct(t.queda, t.bruto)],
  ];

  const tablas: TablaResumen[] = [
    {
      titulo: "De la venta al depósito",
      columnas: ["Concepto", "Importe", "% de la venta bruta"],
      numericas: [1, 2],
      filas: cascada,
      resaltar: (f) => String(f[0]).startsWith("Depósito estimado") || String(f[0]).startsWith("Lo que te queda") || String(f[0]) === "Venta neta",
    },
    {
      titulo: "Semana por semana",
      columnas: ["Semana", "Pedidos", "Venta bruta", "Se lleva PedidosYa", "Reclamos", "Cobrado en efectivo", "Depósito estimado", "Te queda"],
      numericas: [1, 2, 3, 4, 5, 6, 7],
      filas: a.periodos.map((p) => [
        p.etiqueta + (p.tieneEstado ? "" : " (falta el estado de cuenta)"),
        formatearEntero(p.pedidos),
        formatearPesos(p.bruto),
        formatearPesos(p.comision + p.plus + p.tarifaOnline + p.iva),
        formatearPesos(p.reclamos),
        formatearPesos(p.efectivo),
        formatearPesos(p.deposito),
        pct(p.queda, p.bruto),
      ]),
      resaltar: (f) => String(f[0]).includes("falta el estado"),
    },
  ];

  /* --- 2. Día a día (todas las sucursales juntas) --- */
  const porDia = new Map<string, { fecha: Date; pedidos: number; bruto: number; promos: number; neta: number; efectivo: number; completo: boolean }>();
  for (const d of a.dias) {
    const k = claveDia(d.fecha);
    const x = porDia.get(k) ?? { fecha: d.fecha, pedidos: 0, bruto: 0, promos: 0, neta: 0, efectivo: 0, completo: true };
    x.pedidos += d.pedidos;
    x.bruto = round2(x.bruto + d.bruto);
    x.promos = round2(x.promos + (d.promos ?? 0));
    x.neta = round2(x.neta + (d.neta ?? 0));
    x.efectivo = round2(x.efectivo + d.efectivo);
    if (!d.tieneEstado) x.completo = false;
    porDia.set(k, x);
  }
  tablas.push({
    titulo: "Día a día (para cruzar con lo que informa el local)",
    columnas: ["Fecha", "Día", "Pedidos", "Venta bruta", "Tus promos", "Venta neta", "Cobrado en efectivo", "Cobrado por la app"],
    numericas: [2, 3, 4, 5, 6, 7],
    filas: [...porDia.values()].map((d) => [
      formatearFecha(d.fecha),
      d.fecha.toLocaleDateString("es-AR", { weekday: "long" }),
      formatearEntero(d.pedidos),
      formatearPesos(d.bruto),
      d.completo ? formatearPesos(d.promos) : "s/d",
      d.completo ? formatearPesos(d.neta) : "s/d",
      formatearPesos(d.efectivo),
      d.completo ? formatearPesos(round2(d.neta - d.efectivo)) : "s/d",
    ]),
    resaltar: (f) => f[4] === "s/d",
  });

  /* --- 3. Por sucursal (si hay más de una) --- */
  const sucursales = porSucursal(a);
  if (sucursales.length > 1) {
    tablas.push({
      titulo: "Por sucursal",
      columnas: ["Sucursal", "Pedidos", "Venta bruta", "Ticket promedio", "Se lleva PedidosYa", "% sobre la venta", "Cobrado en efectivo", "Te queda"],
      numericas: [1, 2, 3, 4, 5, 6, 7],
      filas: sucursales.map((s) => [
        s.sucursal,
        formatearEntero(s.pedidos),
        formatearPesos(s.bruto),
        formatearPesos(s.pedidos ? round2(s.bruto / s.pedidos) : 0),
        formatearPesos(s.costos),
        pct(s.costos, s.bruto),
        formatearPesos(s.efectivo),
        formatearPesos(s.queda),
      ]),
    });
  }

  /* --- 4. Para revisar --- */
  const grupos = incidenciasPorTipo(a);
  if (grupos.length) {
    tablas.push({
      titulo: "Para revisar: lo que no cierra o conviene reclamar",
      columnas: ["Qué pasó", "Pedidos", "Importe"],
      numericas: [1, 2],
      filas: grupos.map((g) => [g.titulo, formatearEntero(g.cantidad), formatearPesos(g.importe)]),
      resaltar: (f) => String(f[0]).includes("te cobra") || String(f[0]).includes("incompleta"),
    });
  }

  const enDisputa = round2(a.incidencias.filter((i) => i.tipo === "descuento-peya").reduce((s, i) => s + i.importe, 0));

  const kpis: ResultadoAnalisis["kpis"] = [
    { etiqueta: "Venta bruta", valor: formatearPesos(t.bruto), tono: "positivo" },
    { etiqueta: "Pedidos liquidados", valor: formatearEntero(t.pedidos) },
    { etiqueta: "Se lleva PedidosYa", valor: `${formatearPesos(costoPlataforma)} (${pct(costoPlataforma, t.bruto)})`, tono: "negativo" },
    { etiqueta: "Tus promos", valor: `${formatearPesos(t.promos)} (${pct(t.promos, t.bruto)})` },
    { etiqueta: "Reclamos de usuarios", valor: t.reclamos ? `${formatearPesos(-t.reclamos)} (${pct(-t.reclamos, t.bruto)})` : "Ninguno", tono: t.reclamos ? "negativo" : "positivo" },
    { etiqueta: "Te queda", valor: `${formatearPesos(t.queda)} (${pct(t.queda, t.bruto)})` },
    { etiqueta: "Depósito estimado de PedidosYa", valor: formatearPesos(t.deposito) },
    { etiqueta: "Ya cobraste en efectivo", valor: formatearPesos(t.efectivo) },
    ...(cancelados ? [{ etiqueta: "Pedidos cancelados (no son venta)", valor: `${formatearEntero(cancelados)} · ${formatearPesos(montoCancelado)}` }] : []),
    ...(enDisputa ? [{ etiqueta: "Descuentos de PedidosYa a revisar", valor: formatearPesos(-enDisputa), tono: "negativo" as const }] : []),
  ];

  const archivos = a.archivos.length > 3 ? `${a.archivos.length} archivos` : a.archivos.join(" + ");
  return {
    titulo: a.completo ? "Liquidación de PedidosYa (estado de cuenta + reporte de pedidos)" : "Liquidación de PedidosYa",
    subtitulo:
      `Del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)} · ${formatearEntero(t.pedidos)} pedidos liquidados · ` +
      `${a.sucursales.length} sucursal(es) · ${archivos}`,
    kpis,
    controles: a.controles,
    avisos: [
      ...(t.promosIncluyenPlus ? ["* En las semanas sin estado de cuenta, “tus promos” sale del reporte de pedidos y ahí adentro va también el cargo por pedidos con Plus."] : []),
      ...a.avisos,
    ],
    tablas,
    nombreExcel: `liquidacion_pedidosya_${formatearFecha(a.desde).replace(/\//g, "-")}_${formatearFecha(a.hasta).replace(/\//g, "-")}.xlsx`,
    generarExcel: async () => (await import("@/lib/extractos/excel-peya-liquidacion")).generarExcelLiquidacionPeYa(a),
  };
}
