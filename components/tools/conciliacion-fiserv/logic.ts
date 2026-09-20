/**
 * Lógica de "Conciliación Fiserv ↔ banco": el cruce vive en
 * `lib/extractos/conciliacion-tarjetas.ts` (y el Excel en
 * `lib/extractos/excel-conciliacion.ts`); acá se arma la pantalla.
 */

import type { ResultadoAnalisis, TablaResumen } from "@/components/core/AnalizadorExtracto";
import {
  ETIQUETA_COMO,
  ETIQUETA_SIN_CREDITO,
  ETIQUETA_SIN_LIQUIDACION,
  conciliarFiservConBanco,
  costoReal,
  describirCredito,
  nombreBanco,
  plazosPorFamilia,
  type Conciliacion,
} from "@/lib/extractos/conciliacion-tarjetas";
import { porTarjeta } from "@/lib/extractos/fiserv";
import { formatearEntero, formatearFecha, formatearPesos } from "@/lib/extractos/texto";
import type { Banco } from "@/lib/extractos/tipos";

export { BANCOS } from "@/lib/extractos/conciliacion-tarjetas";
export const MAX_MB = 25;
export const MAX_ARCHIVOS = 12;
export const ENTRADA_BANCO = "banco";
export const ENTRADA_FISERV = "fiserv";
export const FORMATOS_BANCO = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "text/plain", "text/tab-separated-values", "application/pdf"];
export const FORMATOS_FISERV = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"];

const pct = (parte: number, total: number) => (total ? `${((parte / total) * 100).toFixed(2).replace(".", ",")} %` : "0 %");
const dias = (n: number | null) => (n === null ? "—" : n === 0 ? "mismo día" : `${n} día${n === 1 ? "" : "s"}`);

export async function analizar(porEntrada: Record<string, File[]>, banco: Banco | ""): Promise<ResultadoAnalisis> {
  const c = await conciliarFiservConBanco(porEntrada[ENTRADA_FISERV] ?? [], porEntrada[ENTRADA_BANCO] ?? [], banco ? { banco } : {});
  return resultadoDesdeConciliacion(c);
}

export function resultadoDesdeConciliacion(c: Conciliacion): ResultadoAnalisis {
  const banco = nombreBanco(c.banco);
  const cr = costoReal(c);
  const pagos = c.fiserv.pagos;
  const netoConciliado = c.conciliados.reduce((s, x) => s + x.liquidacion.neto, 0);
  const sinAcreditar = c.sinCredito.filter((s) => s.motivo === "sin-acreditar");
  const sinLiquidacion = c.sinLiquidacion.filter((s) => s.motivo === "sin-liquidacion");
  const cvu = c.sinLiquidacion.filter((s) => s.motivo === "fiserv-cvu");
  const otras = c.sinLiquidacion.filter((s) => s.motivo === "otra-procesadora");
  const suma = (xs: { credito: { credito: number } }[]) => xs.reduce((s, x) => s + x.credito.credito, 0);
  const plazos = plazosPorFamilia(c);
  const plazoCredito = plazos.find((p) => p.familia === "Crédito");
  const plazoDebito = plazos.find((p) => p.familia === "Débito");
  const seLleva = cr.seLlevaFiserv;
  const conBanco = cr.impuestoCreditos !== null && cr.iibbBanco !== null;

  const tablas: TablaResumen[] = [
    {
      titulo: "Cuánto queda de cada venta con tarjeta",
      columnas: ["Concepto", "Importe", "% del bruto"],
      numericas: [1, 2],
      filas: [
        ["Ventas con tarjeta aceptadas (bruto)", formatearPesos(cr.bruto), "100 %"],
        ["Fiserv: arancel", formatearPesos(-cr.arancel), pct(cr.arancel, cr.bruto)],
        ["Fiserv: IVA sobre el arancel", formatearPesos(-cr.ivaArancel), pct(cr.ivaArancel, cr.bruto)],
        ["Fiserv: retención IIBB (SIRTAC)", formatearPesos(-cr.retIibb), pct(cr.retIibb, cr.bruto)],
        ["Fiserv: percepciones de IVA / IIBB", formatearPesos(-cr.percepciones), pct(cr.percepciones, cr.bruto)],
        ...(cr.cargos ? [["Fiserv: otros cargos (reintentos, oper. internacionales, menos reembolsos)", formatearPesos(-cr.cargos), pct(cr.cargos, cr.bruto)]] : []),
        ["Neto que deposita Fiserv", formatearPesos(cr.netoFiserv), pct(cr.netoFiserv, cr.bruto)],
        ...(cr.ajustes
          ? [[`Aparte: retenciones y ajustes de Fiserv sin ventas (sobre cobros QR)${cr.cobrosQr ? ` · ${pct(-cr.ajustes, cr.cobrosQr)} de los ${formatearPesos(cr.cobrosQr)} cobrados por QR` : ""}`, formatearPesos(cr.ajustes), "—"]]
          : []),
        ...(conBanco
          ? [
              [`${banco}: impuesto a los créditos (0,6 %)`, formatearPesos(-(cr.impuestoCreditos ?? 0)), pct(cr.impuestoCreditos ?? 0, cr.bruto)],
              [`${banco}: retención IIBB sobre acreditaciones`, formatearPesos(-(cr.iibbBanco ?? 0)), pct(cr.iibbBanco ?? 0, cr.bruto)],
              ["Lo que queda en la cuenta", formatearPesos(cr.queda), pct(cr.queda, cr.bruto)],
            ]
          : []),
      ],
      resaltar: (fila) => String(fila[0]).startsWith("Neto que") || String(fila[0]).startsWith("Lo que queda"),
    },
    {
      titulo: "Por tarjeta",
      columnas: ["Tarjeta", "Liquidaciones", "Ventas (bruto)", "Arancel", "Neto", "% neto", "Presentación → pago"],
      numericas: [1, 2, 3, 4, 5, 6],
      filas: porTarjeta(c.fiserv.liquidaciones).map((t) => [t.tarjeta, formatearEntero(t.liquidaciones), formatearPesos(t.bruto), pct(t.arancel, t.bruto), formatearPesos(t.neto), pct(t.neto, t.bruto), dias(t.diasPago)]),
    },
    {
      titulo: "Cómo cruzaron las liquidaciones",
      columnas: ["Resultado", "Liquidaciones", "Neto"],
      numericas: [1, 2],
      filas: [
        ...(["exacto", "fecha-cercana", "agrupado"] as const)
          .map((k) => ({ k, xs: c.conciliados.filter((x) => x.como === k) }))
          .filter(({ xs }) => xs.length)
          .map(({ k, xs }) => [`Acreditada · ${ETIQUETA_COMO[k]}`, formatearEntero(xs.length), formatearPesos(xs.reduce((s, x) => s + x.liquidacion.neto, 0))]),
        ...(["sin-acreditar", "banco-no-cubre"] as const)
          .map((k) => ({ k, xs: c.sinCredito.filter((x) => x.motivo === k) }))
          .filter(({ xs }) => xs.length)
          .map(({ k, xs }) => [ETIQUETA_SIN_CREDITO[k], formatearEntero(xs.length), formatearPesos(xs.reduce((s, x) => s + x.liquidacion.neto, 0))]),
        ...(c.fiserv.ajustes.length ? [["Ajuste de Fiserv sin crédito (neto ≤ 0)", formatearEntero(c.fiserv.ajustes.length), formatearPesos(c.fiserv.ajustes.reduce((s, l) => s + l.neto, 0))]] : []),
      ],
      resaltar: (fila) => String(fila[0]).startsWith("Sin acreditar"),
    },
  ];

  if (c.sinLiquidacion.length) {
    tablas.push({
      titulo: `Créditos de ${banco} por tarjeta que no están en la liquidación diaria`,
      columnas: ["Motivo", "Créditos", "Importe"],
      numericas: [1, 2],
      filas: (["fiserv-cvu", "otra-procesadora", "fiserv-no-cubre", "sin-liquidacion"] as const)
        .map((k) => ({ k, xs: c.sinLiquidacion.filter((x) => x.motivo === k) }))
        .filter(({ xs }) => xs.length)
        .map(({ k, xs }) => [ETIQUETA_SIN_LIQUIDACION[k], formatearEntero(xs.length), formatearPesos(suma(xs))]),
      resaltar: (fila) => String(fila[0]).startsWith("Sin liquidación"),
    });
  }

  const pendientes = [...sinAcreditar.map((s) => ({ fecha: s.liquidacion.fechaPago, que: `Fiserv · ${s.liquidacion.tarjeta} · liq. ${s.liquidacion.nro}`, importe: s.liquidacion.neto, motivo: ETIQUETA_SIN_CREDITO[s.motivo] })), ...sinLiquidacion.map((s) => ({ fecha: s.credito.fecha!, que: `${banco} · ${describirCredito(s.credito)}`, importe: s.credito.credito, motivo: ETIQUETA_SIN_LIQUIDACION[s.motivo] }))].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  if (pendientes.length) {
    tablas.push({
      titulo: "Para revisar: lo que quedó sin pareja dentro del período",
      columnas: ["Fecha", "Qué", "Importe", "Situación"],
      numericas: [2],
      filas: pendientes.slice(0, 40).map((p) => [formatearFecha(p.fecha), p.que, formatearPesos(p.importe), p.motivo]),
      resaltar: () => true,
    });
  }

  const avisos = [...c.avisos];
  if (!conBanco) {
    avisos.push(
      `${banco} debita el impuesto a los créditos (0,6 %) y las retenciones de IIBB agregados por día, así que no se pueden atribuir a cada acreditación desde el extracto: el costo real es mayor al ${pct(seLleva, cr.bruto)} que se lleva Fiserv.`,
    );
  }

  const periodo = c.desde && c.hasta ? `${formatearFecha(c.desde)} al ${formatearFecha(c.hasta)}` : `${formatearFecha(c.fiserv.desde)} al ${formatearFecha(c.fiserv.hasta)}`;
  return {
    titulo: `Conciliación Fiserv ↔ ${banco}`,
    subtitulo: `Período común del ${periodo} · ${formatearEntero(pagos.length)} liquidaciones con pago · ${formatearEntero(c.creditosTarjeta.length)} créditos por tarjeta en ${banco} · ${[...c.fiserv.archivos, ...c.extracto.archivos].join(" + ")}`,
    kpis: [
      { etiqueta: "Ventas con tarjeta (bruto)", valor: formatearPesos(cr.bruto), tono: "positivo" },
      { etiqueta: "Se lleva Fiserv", valor: `${formatearPesos(seLleva)} (${pct(seLleva, cr.bruto)})`, tono: "negativo" },
      ...(conBanco ? [{ etiqueta: `Retiene ${banco}`, valor: `${formatearPesos((cr.impuestoCreditos ?? 0) + (cr.iibbBanco ?? 0))} (${pct((cr.impuestoCreditos ?? 0) + (cr.iibbBanco ?? 0), cr.bruto)})`, tono: "negativo" as const }] : []),
      { etiqueta: conBanco ? "Te queda en la cuenta" : "Neto que deposita Fiserv", valor: `${formatearPesos(conBanco ? cr.queda : cr.netoFiserv)} (${pct(conBanco ? cr.queda : cr.netoFiserv, cr.bruto)})` },
      { etiqueta: `Liquidaciones acreditadas en ${banco}`, valor: `${formatearEntero(c.conciliados.length)} de ${formatearEntero(pagos.length)} · ${formatearPesos(netoConciliado)}`, tono: c.conciliados.length === pagos.length ? "positivo" : undefined },
      {
        etiqueta: "Sin acreditar",
        valor: sinAcreditar.length ? `${formatearEntero(sinAcreditar.length)} · ${formatearPesos(sinAcreditar.reduce((s, x) => s + x.liquidacion.neto, 0))}` : "Ninguna",
        tono: sinAcreditar.length ? "negativo" : "positivo",
      },
      {
        etiqueta: `Créditos de ${banco} sin liquidación`,
        valor: sinLiquidacion.length ? `${formatearEntero(sinLiquidacion.length)} · ${formatearPesos(suma(sinLiquidacion))}` : "Ninguno",
        tono: sinLiquidacion.length ? "negativo" : "positivo",
      },
      ...(cvu.length ? [{ etiqueta: "Cobros QR de Fiserv por CVU", valor: `${formatearEntero(cvu.length)} · ${formatearPesos(suma(cvu))}` }] : []),
      ...(otras.length ? [{ etiqueta: "De otras procesadoras", valor: `${formatearEntero(otras.length)} · ${formatearPesos(suma(otras))}` }] : []),
      ...(plazoCredito || plazoDebito
        ? [{ etiqueta: "Plazo presentación → pago", valor: [plazoCredito ? `crédito ${dias(plazoCredito.diasPresentacionAPago)}` : "", plazoDebito ? `débito ${dias(plazoDebito.diasPresentacionAPago)}` : ""].filter(Boolean).join(" · ") }]
        : []),
      { etiqueta: `Pago Fiserv → crédito en ${banco}`, valor: dias(plazoCredito?.diasHastaBanco ?? plazoDebito?.diasHastaBanco ?? null) },
    ],
    controles: c.controles,
    avisos,
    tablas,
    nombreExcel: `conciliacion_fiserv_${c.banco}_${formatearFecha(c.fiserv.desde).replace(/\//g, "-")}_${formatearFecha(c.fiserv.hasta).replace(/\//g, "-")}.xlsx`,
    generarExcel: async () => (await import("@/lib/extractos/excel-conciliacion")).generarExcelConciliacion(c),
  };
}

/** Texto de ayuda por banco: dónde se descarga el extracto (mismo que en su herramienta). */
export const AYUDA_BANCO: Record<Banco, string> = {
  santander: "Santander Office Banking → Cuentas → “Ver saldos y movimientos” → elegís las fechas → “Descargar movimientos” (el mismo archivo que usa el análisis de Santander).",
  bbva: "BBVA → Cuentas → “Saldos y Movimientos” → filtrás las fechas → descargar Excel (el mismo archivo que usa el análisis de BBVA). También sirve el resumen de cuenta en PDF.",
  comafi: "Comafi → Cuentas → pestaña “Movimientos” → filtrás las fechas y tocás “Buscar” → botón de descarga (el mismo archivo que usa el análisis de Comafi). También sirve el resumen de cuenta en PDF.",
};
