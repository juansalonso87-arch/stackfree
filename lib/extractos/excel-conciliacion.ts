/**
 * Excel de la conciliación Fiserv ↔ banco. Hojas, en orden de lectura:
 * Resumen (costo real y plazos), Conciliación (una fila por liquidación con el
 * crédito del banco al lado), Por Tarjeta, Por Día de Pago, Sin Conciliar,
 * Control, Detalle Fiserv y Créditos del Banco. Por Tarjeta y Por Día usan
 * SUMIFS contra "Detalle Fiserv", así se recalculan si el usuario filtra o
 * corrige algo ahí.
 */

import type ExcelJS from "exceljs";
import {
  ETIQUETA_COMO,
  ETIQUETA_SIN_CREDITO,
  ETIQUETA_SIN_LIQUIDACION,
  costoReal,
  describirCredito,
  nombreBanco,
  plazosPorFamilia,
  type Conciliacion,
} from "./conciliacion-tarjetas";
import {
  anchos,
  autofiltro,
  congelar,
  crearLibro,
  encabezadoHoja,
  estiloTotal,
  fechaExcel,
  filaCabecera,
  formula,
  fuentes,
  letra,
  libroABlob,
  refHoja,
  relleno,
  FMT_ENT,
  FMT_FECHA,
  FMT_PCT,
  FMT_PESOS,
  type Paleta,
} from "./excel";
import { porDiaDePago, porTarjeta, type LiquidacionFiserv } from "./fiserv";
import { formatearFecha } from "./texto";

const PALETA: Paleta = { principal: "FF6600", total: "FFE0CC" };
const VERDE = "E2F0D9";
const AMARILLO = "FFF2CC";
const ROJO = "F8D7DA";
const HOJA_FISERV = "Detalle Fiserv";

/** Columnas del Detalle Fiserv (las fórmulas dependen de este orden). */
const COL = {
  fechaPago: "A",
  fechaPres: "B",
  diasPago: "C",
  nro: "D",
  tarjeta: "E",
  familia: "F",
  bruto: "G",
  arancel: "H",
  iva: "I",
  iibb: "J",
  percepciones: "K",
  deducciones: "L",
  liquidacion: "M",
  cargos: "N",
  neto: "O",
  estado: "P",
  fechaBanco: "Q",
  creditoBanco: "R",
  comercio: "S",
  entidad: "T",
  archivo: "U",
} as const;

const FAMILIA: Record<string, string> = { credito: "Crédito", debito: "Débito", prepaga: "Prepaga", otra: "Otra" };

function rango(col: string, fin: number): string {
  return `${refHoja(HOJA_FISERV)}!$${col}$2:$${col}$${fin}`;
}

function filaNormal(ws: ExcelJS.Worksheet, fila: number, columnas: number, fondo?: string): void {
  for (let c = 1; c <= columnas; c++) {
    const celda = ws.getCell(fila, c);
    celda.font = fuentes.normal;
    if (fondo) celda.fill = relleno(fondo);
  }
}

function formatos(ws: ExcelJS.Worksheet, desde: number, hasta: number, mapa: Record<number, string>): void {
  for (let r = desde; r <= hasta; r++) {
    for (const [c, fmt] of Object.entries(mapa)) ws.getCell(r, Number(c)).numFmt = fmt;
  }
}

function filaTotal(ws: ExcelJS.Worksheet, fila: number, primera: number, ultima: number, columnas: number, sumar: number[], extras: Record<number, string> = {}): void {
  ws.getCell(fila, 1).value = "TOTAL";
  for (const c of sumar) ws.getCell(fila, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
  for (const [c, f] of Object.entries(extras)) ws.getCell(fila, Number(c)).value = formula(f);
  estiloTotal(ws, fila, columnas, PALETA);
}

export async function generarExcelConciliacion(c: Conciliacion): Promise<Blob> {
  const wb = await crearLibro();
  const banco = nombreBanco(c.banco);
  const ls = c.fiserv.liquidaciones;
  const fin = ls.length + 1;
  const subtitulo =
    `Fiserv: pagos del ${formatearFecha(c.fiserv.desde)} al ${formatearFecha(c.fiserv.hasta)} (${ls.length} liquidaciones)  |  ` +
    `${banco}: movimientos del ${formatearFecha(c.extracto.desde)} al ${formatearFecha(c.extracto.hasta)}  |  Generado: ${formatearFecha(new Date())}`;
  const rBruto = rango(COL.bruto, fin);
  const rNeto = rango(COL.neto, fin);
  const rTarjeta = rango(COL.tarjeta, fin);
  const rFecha = rango(COL.fechaPago, fin);
  const rEstado = rango(COL.estado, fin);

  // Estado de cada liquidación para el Detalle y la Conciliación.
  const estadoDe = new Map<LiquidacionFiserv, { texto: string; fondo?: string; fechaBanco: Date | null; credito: number | null; comoBanco: string }>();
  for (const x of c.conciliados) {
    estadoDe.set(x.liquidacion, { texto: `Acreditada · ${ETIQUETA_COMO[x.como]}`, fondo: x.como === "exacto" ? undefined : AMARILLO, fechaBanco: x.credito.fecha, credito: x.credito.credito, comoBanco: describirCredito(x.credito) });
  }
  for (const s of c.sinCredito) estadoDe.set(s.liquidacion, { texto: ETIQUETA_SIN_CREDITO[s.motivo], fondo: s.motivo === "sin-acreditar" ? ROJO : AMARILLO, fechaBanco: null, credito: null, comoBanco: "" });
  for (const a of c.fiserv.ajustes) estadoDe.set(a, { texto: "Ajuste sin crédito (neto ≤ 0)", fondo: AMARILLO, fechaBanco: null, credito: null, comoBanco: "" });
  const estado = (l: LiquidacionFiserv) => estadoDe.get(l) ?? { texto: "", fechaBanco: null, credito: null, comoBanco: "" };

  /* ---------------- Resumen ---------------- */
  {
    const ws = wb.addWorksheet("Resumen");
    encabezadoHoja(ws, `Conciliación Fiserv ↔ ${banco}`, subtitulo, 4, PALETA);
    let f = 4;
    const par = (etiqueta: string, valor: ExcelJS.CellValue, fmt?: string, negrita = false) => {
      ws.getCell(f, 1).value = etiqueta;
      ws.getCell(f, 1).font = negrita ? fuentes.total : fuentes.normal;
      ws.getCell(f, 2).value = valor;
      ws.getCell(f, 2).font = negrita ? fuentes.total : fuentes.normal;
      if (fmt) ws.getCell(f, 2).numFmt = fmt;
      f++;
    };
    const titulo = (t: string) => {
      f++;
      ws.getCell(f, 1).value = t;
      ws.getCell(f, 1).font = fuentes.total;
      ws.getCell(f, 1).fill = relleno(PALETA.total);
      ws.getCell(f, 2).fill = relleno(PALETA.total);
      f++;
    };

    titulo("Conciliación");
    par("Liquidaciones de Fiserv con pago", c.fiserv.pagos.length, FMT_ENT);
    par(`Acreditadas en ${banco}`, c.conciliados.length, FMT_ENT, true);
    par("Sin acreditar (dentro de las fechas del extracto)", c.sinCredito.filter((s) => s.motivo === "sin-acreditar").length, FMT_ENT);
    par("Fuera de las fechas del extracto", c.sinCredito.filter((s) => s.motivo === "banco-no-cubre").length, FMT_ENT);
    par("Ajustes de Fiserv sin crédito (neto ≤ 0)", c.fiserv.ajustes.length, FMT_ENT);
    par(`Créditos de ${banco} por tarjeta sin liquidación en Fiserv`, c.sinLiquidacion.filter((s) => s.motivo === "sin-liquidacion").length, FMT_ENT);
    par("Créditos de otra procesadora o marca (Cabal, Naranja, Amex…)", c.sinLiquidacion.filter((s) => s.motivo === "otra-procesadora").length, FMT_ENT);
    par("Créditos fuera de las fechas del reporte de Fiserv", c.sinLiquidacion.filter((s) => s.motivo === "fiserv-no-cubre").length, FMT_ENT);
    par("Cobros QR de Fiserv acreditados por CVU (no pasan por la liquidación diaria)", c.sinLiquidacion.filter((s) => s.motivo === "fiserv-cvu").length, FMT_ENT);

    const cr = costoReal(c);
    const pct = (n: number) => (cr.bruto ? n / cr.bruto : 0);
    titulo("Cuánto queda de cada venta con tarjeta");
    ws.getCell(f - 1, 3).value = "% del bruto";
    ws.getCell(f - 1, 3).font = fuentes.total;
    ws.getCell(f - 1, 3).fill = relleno(PALETA.total);
    const linea = (etiqueta: string, valor: number, negrita = false) => {
      par(etiqueta, valor, FMT_PESOS, negrita);
      ws.getCell(f - 1, 3).value = pct(valor);
      ws.getCell(f - 1, 3).numFmt = "0.00%";
      ws.getCell(f - 1, 3).font = negrita ? fuentes.total : fuentes.normal;
    };
    linea("Ventas con tarjeta aceptadas (bruto)", cr.bruto, true);
    linea("Fiserv: arancel", -cr.arancel);
    linea("Fiserv: IVA sobre el arancel", -cr.ivaArancel);
    linea("Fiserv: retención IIBB (SIRTAC)", -cr.retIibb);
    linea("Fiserv: percepciones de IVA / IIBB", -cr.percepciones);
    if (cr.cargos) linea("Fiserv: otros cargos (reintentos, oper. internacionales, menos reembolsos)", -cr.cargos);
    linea("Neto que deposita Fiserv", cr.netoFiserv, true);
    if (cr.ajustes) {
      par(`Aparte: retenciones y ajustes de Fiserv sin ventas (sobre cobros QR)${cr.cobrosQr ? ` · ${((-cr.ajustes / cr.cobrosQr) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} % de los cobros QR por CVU` : ""}`, cr.ajustes, FMT_PESOS);
    }
    if (cr.impuestoCreditos !== null && cr.iibbBanco !== null) {
      linea(`${banco}: impuesto a los créditos (0,6 %)`, -cr.impuestoCreditos);
      linea(`${banco}: retención IIBB sobre acreditaciones${c.retenciones?.alicuotaIibb ? ` (${(c.retenciones.alicuotaIibb * 100).toLocaleString("es-AR")} %)` : ""}`, -cr.iibbBanco);
      linea("Lo que queda en la cuenta", cr.queda, true);
    } else {
      ws.getCell(f, 1).value = `${banco} debita el impuesto a los créditos y las retenciones de IIBB agregados por día, no por acreditación: no se pueden atribuir a cada liquidación desde el extracto. Ese costo (0,6 % + IIBB) se suma al de Fiserv.`;
      ws.getCell(f, 1).font = fuentes.normal;
      ws.getCell(f, 1).alignment = { wrapText: true, vertical: "top" };
      ws.mergeCells(f, 1, f, 3);
      ws.getRow(f).height = 44;
      f++;
    }

    titulo("Plazos");
    ws.getCell(f - 1, 2).value = "Presentación → pago (días)";
    ws.getCell(f - 1, 3).value = `Pago Fiserv → crédito ${banco} (días)`;
    for (const col of [2, 3]) {
      ws.getCell(f - 1, col).font = fuentes.total;
      ws.getCell(f - 1, col).fill = relleno(PALETA.total);
    }
    for (const p of plazosPorFamilia(c)) {
      ws.getCell(f, 1).value = `Tarjetas de ${p.familia.toLowerCase()} (${p.liquidaciones} liquidaciones)`;
      ws.getCell(f, 2).value = p.diasPresentacionAPago;
      ws.getCell(f, 3).value = p.diasHastaBanco;
      for (const col of [1, 2, 3]) ws.getCell(f, col).font = fuentes.normal;
      f++;
    }
    anchos(ws, [64, 26, 30]);
  }

  /* ---------------- Conciliación ---------------- */
  {
    const ws = wb.addWorksheet("Conciliación");
    const cab = ["Fecha de pago", "Tarjeta", "Nro liquidación", "Ventas (bruto)", "Deducciones Fiserv", "Neto Fiserv", "Estado", `Fecha en ${banco}`, `Crédito en ${banco}`, "Diferencia", `Movimiento en ${banco}`];
    encabezadoHoja(ws, `Liquidaciones de Fiserv y su crédito en ${banco}`, `${subtitulo}  |  Verde: acreditada el mismo día. Amarillo: acreditada otro día, agrupada, ajuste o fuera de fechas. Rojo: sin acreditar.`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    const primera = f;
    for (const l of ls) {
      const e = estado(l);
      ws.getCell(f, 1).value = fechaExcel(l.fechaPago);
      ws.getCell(f, 2).value = l.tarjeta;
      ws.getCell(f, 3).value = l.nro;
      ws.getCell(f, 4).value = l.bruto;
      ws.getCell(f, 5).value = l.deducciones + l.cargos;
      ws.getCell(f, 6).value = l.neto;
      ws.getCell(f, 7).value = e.texto;
      if (e.fechaBanco) ws.getCell(f, 8).value = fechaExcel(e.fechaBanco);
      if (e.credito !== null) {
        ws.getCell(f, 9).value = e.credito;
        ws.getCell(f, 10).value = formula(`I${f}-F${f}`);
      }
      ws.getCell(f, 11).value = e.comoBanco;
      filaNormal(ws, f, cab.length, e.fondo ?? (e.credito !== null ? VERDE : undefined));
      f++;
    }
    const ultima = f - 1;
    filaTotal(ws, f, primera, ultima, cab.length, [4, 5, 6, 9, 10]);
    formatos(ws, primera, f, { 1: FMT_FECHA, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 8: FMT_FECHA, 9: FMT_PESOS, 10: FMT_PESOS });
    anchos(ws, [13, 20, 14, 17, 17, 17, 30, 13, 17, 13, 44]);
    congelar(ws, fc);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Por Tarjeta ---------------- */
  {
    const ws = wb.addWorksheet("Por Tarjeta");
    const cab = ["Tarjeta", "Liquidaciones", "Ventas (bruto)", "% del bruto", "Arancel", "% arancel", "IVA s/arancel", "Ret. IIBB", "Percepciones", "Otros cargos", "Neto", "% neto", "Días presentación → pago"];
    encabezadoHoja(ws, "Costo por tarjeta", `${subtitulo}  |  Fórmulas sobre "Detalle Fiserv"`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    ws.getRow(fc).height = 32;
    let f = fc + 1;
    const primera = f;
    const filas = porTarjeta(ls);
    for (const t of filas) {
      ws.getCell(f, 1).value = t.tarjeta;
      ws.getCell(f, 2).value = formula(`COUNTIFS(${rTarjeta},$A${f})`);
      ws.getCell(f, 3).value = formula(`SUMIFS(${rBruto},${rTarjeta},$A${f})`);
      ws.getCell(f, 5).value = formula(`SUMIFS(${rango(COL.arancel, fin)},${rTarjeta},$A${f})`);
      ws.getCell(f, 6).value = formula(`IFERROR(E${f}/C${f},"")`);
      ws.getCell(f, 7).value = formula(`SUMIFS(${rango(COL.iva, fin)},${rTarjeta},$A${f})`);
      ws.getCell(f, 8).value = formula(`SUMIFS(${rango(COL.iibb, fin)},${rTarjeta},$A${f})`);
      ws.getCell(f, 9).value = formula(`SUMIFS(${rango(COL.percepciones, fin)},${rTarjeta},$A${f})`);
      ws.getCell(f, 10).value = formula(`SUMIFS(${rango(COL.cargos, fin)},${rTarjeta},$A${f})`);
      ws.getCell(f, 11).value = formula(`SUMIFS(${rNeto},${rTarjeta},$A${f})`);
      ws.getCell(f, 12).value = formula(`IFERROR(K${f}/C${f},"")`);
      ws.getCell(f, 13).value = t.diasPago;
      filaNormal(ws, f, cab.length);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    for (let r = primera; r <= ultima; r++) ws.getCell(r, 4).value = formula(`IFERROR(C${r}/$C$${total},"")`);
    filaTotal(ws, total, primera, ultima, cab.length, [2, 3, 5, 7, 8, 9, 10, 11], { 4: `IFERROR(SUM(D${primera}:D${ultima}),"")`, 6: `IFERROR(E${total}/C${total},"")`, 12: `IFERROR(K${total}/C${total},"")` });
    formatos(ws, primera, total, { 2: FMT_ENT, 3: FMT_PESOS, 4: FMT_PCT, 5: FMT_PESOS, 6: '0.00%', 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PESOS, 10: FMT_PESOS, 11: FMT_PESOS, 12: '0.00%', 13: FMT_ENT });
    anchos(ws, [22, 13, 18, 11, 15, 10, 15, 15, 15, 13, 18, 10, 14]);
    congelar(ws, fc);
  }

  /* ---------------- Por Día de Pago ---------------- */
  {
    const ws = wb.addWorksheet("Por Día de Pago");
    const cab = ["Fecha de pago", "Liquidaciones", "Ventas (bruto)", "Deducciones", "Neto Fiserv", `Acreditado en ${banco}`, "Sin acreditar", "Tarjetas"];
    encabezadoHoja(ws, "Liquidaciones por día de pago", `${subtitulo}  |  "Acreditado" suma los créditos conciliados de ese día de pago`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    const primera = f;
    const acreditadoPorDia = new Map<number, number>();
    for (const x of c.conciliados) {
      const k = x.liquidacion.fechaPago.getTime();
      acreditadoPorDia.set(k, (acreditadoPorDia.get(k) ?? 0) + x.credito.credito / c.conciliados.filter((y) => y.credito === x.credito).length);
    }
    for (const d of porDiaDePago(ls)) {
      ws.getCell(f, 1).value = fechaExcel(d.dia);
      ws.getCell(f, 2).value = formula(`COUNTIFS(${rFecha},$A${f})`);
      ws.getCell(f, 3).value = formula(`SUMIFS(${rBruto},${rFecha},$A${f})`);
      ws.getCell(f, 4).value = formula(`C${f}-E${f}`);
      ws.getCell(f, 5).value = formula(`SUMIFS(${rNeto},${rFecha},$A${f})`);
      ws.getCell(f, 6).value = Math.round((acreditadoPorDia.get(d.dia.getTime()) ?? 0) * 100) / 100;
      ws.getCell(f, 7).value = formula(`SUMIFS(${rNeto},${rFecha},$A${f},${rEstado},"Sin acreditar*")`);
      ws.getCell(f, 8).value = [...d.tarjetas].sort().join(", ");
      const finde = [0, 6].includes(d.dia.getDay());
      filaNormal(ws, f, cab.length, finde ? AMARILLO : undefined);
      f++;
    }
    const ultima = f - 1;
    filaTotal(ws, f, primera, ultima, cab.length, [2, 3, 4, 5, 6, 7]);
    formatos(ws, primera, f, { 1: FMT_FECHA, 2: FMT_ENT, 3: FMT_PESOS, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS });
    anchos(ws, [14, 13, 18, 16, 18, 20, 16, 60]);
    congelar(ws, fc);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Sin Conciliar ---------------- */
  {
    const ws = wb.addWorksheet("Sin Conciliar");
    const cab = ["Lado", "Fecha", "Importe", "Motivo", "Tarjeta / movimiento", "Nro liquidación"];
    encabezadoHoja(ws, "Lo que no cruzó", `${subtitulo}  |  Liquidaciones sin crédito en el banco y créditos del banco sin liquidación en Fiserv`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    const primera = f;
    for (const s of c.sinCredito) {
      ws.getCell(f, 1).value = "Fiserv";
      ws.getCell(f, 2).value = fechaExcel(s.liquidacion.fechaPago);
      ws.getCell(f, 3).value = s.liquidacion.neto;
      ws.getCell(f, 4).value = ETIQUETA_SIN_CREDITO[s.motivo];
      ws.getCell(f, 5).value = s.liquidacion.tarjeta;
      ws.getCell(f, 6).value = s.liquidacion.nro;
      filaNormal(ws, f, cab.length, s.motivo === "sin-acreditar" ? ROJO : AMARILLO);
      f++;
    }
    for (const a of c.fiserv.ajustes) {
      ws.getCell(f, 1).value = "Fiserv";
      ws.getCell(f, 2).value = fechaExcel(a.fechaPago);
      ws.getCell(f, 3).value = a.neto;
      ws.getCell(f, 4).value = "Ajuste sin crédito (neto ≤ 0)";
      ws.getCell(f, 5).value = a.tarjeta;
      ws.getCell(f, 6).value = a.nro;
      filaNormal(ws, f, cab.length, AMARILLO);
      f++;
    }
    for (const s of c.sinLiquidacion) {
      ws.getCell(f, 1).value = banco;
      if (s.credito.fecha) ws.getCell(f, 2).value = fechaExcel(s.credito.fecha);
      ws.getCell(f, 3).value = s.credito.credito;
      ws.getCell(f, 4).value = ETIQUETA_SIN_LIQUIDACION[s.motivo];
      ws.getCell(f, 5).value = describirCredito(s.credito);
      ws.getCell(f, 6).value = s.credito.comprobante ?? "";
      filaNormal(ws, f, cab.length, s.motivo === "sin-liquidacion" ? ROJO : undefined);
      f++;
    }
    const ultima = f - 1;
    if (ultima < primera) {
      ws.getCell(f, 1).value = "Todo cruzó: no hay liquidaciones sin crédito ni créditos sin liquidación.";
      ws.getCell(f, 1).font = fuentes.normal;
    }
    formatos(ws, primera, Math.max(ultima, primera), { 2: FMT_FECHA, 3: FMT_PESOS });
    anchos(ws, [10, 13, 17, 40, 50, 16]);
    congelar(ws, fc);
    if (ultima >= primera) autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Control ---------------- */
  {
    const ws = wb.addWorksheet("Control");
    const cab = ["Grupo", "Control", "Calculado", "Declarado", "Estado"];
    encabezadoHoja(ws, "Controles", subtitulo, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    for (const k of c.controles) {
      ws.getCell(f, 1).value = k.grupo;
      ws.getCell(f, 2).value = k.control;
      ws.getCell(f, 3).value = k.calculado;
      ws.getCell(f, 4).value = k.declarado;
      ws.getCell(f, 5).value = k.ok ? "OK" : "REVISAR";
      const fmt = k.formato === "ent" ? FMT_ENT : FMT_PESOS;
      ws.getCell(f, 3).numFmt = fmt;
      ws.getCell(f, 4).numFmt = fmt;
      filaNormal(ws, f, cab.length, k.ok ? undefined : ROJO);
      f++;
    }
    if (c.avisos.length) {
      f++;
      ws.getCell(f, 1).value = "Avisos";
      ws.getCell(f, 1).font = fuentes.total;
      f++;
      for (const a of c.avisos) {
        ws.getCell(f, 1).value = a;
        ws.getCell(f, 1).font = fuentes.normal;
        ws.mergeCells(f, 1, f, cab.length);
        f++;
      }
    }
    anchos(ws, [28, 70, 18, 18, 10]);
  }

  /* ---------------- Detalle Fiserv ---------------- */
  {
    const ws = wb.addWorksheet(HOJA_FISERV);
    const cab = [
      "Fecha de pago",
      "Fecha de presentación",
      "Días",
      "Nro liquidación",
      "Tarjeta",
      "Tipo",
      "Ventas aceptadas (bruto)",
      "Arancel",
      "IVA s/arancel",
      "Ret. IIBB SIRTAC",
      "Percepciones",
      "Total deducciones",
      "Total liquidación",
      "Otros cargos",
      "Importe neto",
      "Estado",
      `Fecha en ${banco}`,
      `Crédito en ${banco}`,
      "Comercio",
      "Entidad pagadora",
      "Archivo",
    ];
    filaCabecera(ws, 1, cab, PALETA);
    ws.getRow(1).height = 30;
    ls.forEach((l, i) => {
      const f = i + 2;
      const e = estado(l);
      const valores: ExcelJS.CellValue[] = [
        fechaExcel(l.fechaPago),
        l.fechaPresentacion ? fechaExcel(l.fechaPresentacion) : null,
        l.diasPago,
        l.nro,
        l.tarjeta,
        FAMILIA[l.familia] ?? l.familia,
        l.bruto,
        l.arancel,
        l.ivaArancel,
        l.retIibb,
        l.percepciones,
        l.deducciones,
        l.liquidacion,
        l.cargos,
        l.neto,
        e.texto,
        e.fechaBanco ? fechaExcel(e.fechaBanco) : null,
        e.credito,
        l.comercio,
        l.entidad,
        l.archivo,
      ];
      valores.forEach((v, j) => {
        ws.getCell(f, j + 1).value = v;
      });
      filaNormal(ws, f, cab.length, e.fondo);
    });
    formatos(ws, 2, fin, { 1: FMT_FECHA, 2: FMT_FECHA, 3: FMT_ENT, 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PESOS, 10: FMT_PESOS, 11: FMT_PESOS, 12: FMT_PESOS, 13: FMT_PESOS, 14: FMT_PESOS, 15: FMT_PESOS, 17: FMT_FECHA, 18: FMT_PESOS });
    anchos(ws, [13, 13, 6, 14, 20, 9, 18, 14, 14, 14, 14, 16, 16, 12, 16, 30, 13, 16, 12, 22, 28]);
    congelar(ws, 1);
    autofiltro(ws, 1, 1, fin, cab.length);
  }

  /* ---------------- Créditos del Banco ---------------- */
  {
    const ws = wb.addWorksheet(`Créditos ${banco}`);
    const cab = ["Fecha", "Movimiento", "Importe", "Estado", "Liquidación Fiserv", "Tarjeta (según Fiserv)", "Comprobante"];
    filaCabecera(ws, 1, cab, PALETA);
    const porCredito = new Map<unknown, typeof c.conciliados>();
    for (const x of c.conciliados) (porCredito.get(x.credito) ?? porCredito.set(x.credito, []).get(x.credito)!).push(x);
    const motivo = new Map(c.sinLiquidacion.map((s) => [s.credito, s.motivo]));
    c.creditosTarjeta.forEach((m, i) => {
      const f = i + 2;
      const xs = porCredito.get(m);
      const mot = motivo.get(m);
      ws.getCell(f, 1).value = m.fecha ? fechaExcel(m.fecha) : null;
      ws.getCell(f, 2).value = describirCredito(m);
      ws.getCell(f, 3).value = m.credito;
      ws.getCell(f, 4).value = xs ? `Conciliado · ${ETIQUETA_COMO[xs[0].como]}` : mot ? ETIQUETA_SIN_LIQUIDACION[mot] : "";
      ws.getCell(f, 5).value = xs ? xs.map((x) => x.liquidacion.nro).join(", ") : "";
      ws.getCell(f, 6).value = xs ? [...new Set(xs.map((x) => x.liquidacion.tarjeta))].join(", ") : "";
      ws.getCell(f, 7).value = m.comprobante ?? "";
      filaNormal(ws, f, cab.length, xs ? (xs[0].como === "exacto" ? undefined : AMARILLO) : mot === "sin-liquidacion" ? ROJO : AMARILLO);
    });
    const finB = c.creditosTarjeta.length + 1;
    formatos(ws, 2, Math.max(2, finB), { 1: FMT_FECHA, 3: FMT_PESOS });
    anchos(ws, [13, 50, 17, 30, 18, 26, 16]);
    congelar(ws, 1);
    autofiltro(ws, 1, 1, finB, cab.length);
  }

  return libroABlob(wb);
}
