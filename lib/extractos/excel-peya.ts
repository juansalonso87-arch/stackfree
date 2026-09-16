/**
 * Excel del análisis de pedidos de PedidosYa. Los resúmenes usan SUMIFS /
 * COUNTIFS contra "Detalle Pedidos": si el usuario filtra o corrige algo ahí,
 * los totales se recalculan solos. Las hojas se crean en el orden en que
 * conviene leerlas.
 */

import type ExcelJS from "exceljs";
import { formatearFecha, round2 } from "./texto";
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
  FMT_FECHAHORA,
  FMT_PCT,
  FMT_PESOS,
  type Paleta,
} from "./excel";
import { ordenHorasDelTurno } from "./mercadopago";
import { porDiaDeTurno, porLocal, porMotivo, promedioPorDiaSemana, type AnalisisPedidosYa, type PedidoPeYa } from "./pedidosya";

const PALETA: Paleta = { principal: "C62828", total: "F8D7DA" };
const AMARILLO = "FFF2CC";
const GRIS_ALT = "F2F2F2";
const HOJA_DETALLE = "Detalle Pedidos";
const ENTREGADO = "Entregado";
const CANCELADO = "Cancelado";

/** Columnas del Detalle (todas las fórmulas dependen de este orden). */
const COL = {
  momento: "A",
  diaTurno: "B",
  diaSemana: "C",
  hora: "D",
  periodo: "E",
  local: "F",
  nro: "G",
  estado: "H",
  formaPago: "I",
  entrega: "J",
  venta: "K",
  otrosIngresos: "L",
  descPropio: "M",
  descPeYa: "N",
  comision: "O",
  tarifaOnline: "P",
  impuestos: "Q",
  cargos: "R",
  marketing: "S",
  otrosCargos: "T",
  ingreso: "U",
  ingresoCalc: "V",
  efectivo: "W",
  pago: "X",
  adeudado: "Y",
  reclamo: "Z",
  motivoReclamo: "AA",
  motivoCancel: "AB",
  responsable: "AC",
  minPrep: "AD",
  minTotal: "AE",
  sinLiquidar: "AF",
  articulos: "AG",
} as const;

function rango(col: string, fin: number): string {
  return `${refHoja(HOJA_DETALLE)}!$${col}$2:$${col}$${fin}`;
}

function filaNormal(ws: ExcelJS.Worksheet, fila: number, columnas: number, fondo?: string): void {
  for (let c = 1; c <= columnas; c++) {
    const celda = ws.getCell(fila, c);
    celda.font = fuentes.normal;
    if (fondo) celda.fill = relleno(fondo);
  }
}

/** Aplica formatos numéricos por columna (1-based) a un rango de filas. */
function formatos(ws: ExcelJS.Worksheet, desde: number, hasta: number, mapa: Record<number, string>): void {
  for (let r = desde; r <= hasta; r++) {
    for (const [c, fmt] of Object.entries(mapa)) ws.getCell(r, Number(c)).numFmt = fmt;
  }
}

/** Fila TOTAL con SUM en las columnas indicadas y fórmulas propias en otras. */
function filaTotal(ws: ExcelJS.Worksheet, fila: number, primera: number, ultima: number, columnas: number, sumar: number[], extras: Record<number, string> = {}): void {
  ws.getCell(fila, 1).value = "TOTAL";
  for (const c of sumar) ws.getCell(fila, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
  for (const [c, f] of Object.entries(extras)) ws.getCell(fila, Number(c)).value = formula(f);
  estiloTotal(ws, fila, columnas, PALETA);
}

export async function generarExcelPedidosYa(a: AnalisisPedidosYa): Promise<Blob> {
  const wb = await crearLibro();
  const fin = a.pedidos.length + 1;
  const subtitulo =
    `Turnos del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${a.ventas.length.toLocaleString("es-AR")} pedidos entregados` +
    `${a.cancelados.length ? ` y ${a.cancelados.length} cancelados` : ""}  |  ${a.locales.length} local(es)  |  Generado: ${formatearFecha(new Date())}`;
  const hc = String(a.horaCorte).padStart(2, "0");
  const rLocal = rango(COL.local, fin);
  const rEstado = rango(COL.estado, fin);
  const rVenta = rango(COL.venta, fin);
  const rIngreso = rango(COL.ingreso, fin);
  const rDia = rango(COL.diaTurno, fin);
  const soloEntregados = `${rEstado},"${ENTREGADO}"`;
  const locales = porLocal(a);

  /* ---------------- Resumen por Local ---------------- */
  {
    const ws = wb.addWorksheet("Resumen por Local");
    const cab = [
      "Local",
      "Pedidos",
      "Venta",
      "% s/total",
      "Ticket promedio",
      "Descuentos que financió el local",
      "Comisión",
      "Tarifa pago online",
      "Impuestos s/comisiones",
      "Cargos por reclamos",
      "Marketing (fugaces y publicidad)",
      "Otros cargos",
      "Neto para el local",
      "% neto s/venta",
      "Efectivo cobrado por el local",
      "A cobrar de PedidosYa (pago − adeudado)",
      "Cancelados",
      "Reclamos",
      "Preparación mediana (min)",
    ];
    encabezadoHoja(
      ws,
      "Resumen por local",
      `${subtitulo}  |  Venta = lo que compró el cliente a precio de carta; Neto = "Ingreso estimado" que informa PedidosYa`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    ws.getRow(fc).height = 42;
    const deducciones: [string, number][] = [
      [COL.descPropio, 6],
      [COL.comision, 7],
      [COL.tarifaOnline, 8],
      [COL.impuestos, 9],
      [COL.cargos, 10],
      [COL.marketing, 11],
      [COL.otrosCargos, 12],
    ];
    let f = fc + 1;
    const primera = f;
    for (const l of locales) {
      ws.getCell(f, 1).value = l.local;
      ws.getCell(f, 2).value = formula(`COUNTIFS(${rLocal},$A${f},${soloEntregados})`);
      ws.getCell(f, 3).value = formula(`SUMIFS(${rVenta},${rLocal},$A${f},${soloEntregados})`);
      ws.getCell(f, 5).value = formula(`IFERROR(C${f}/B${f},"")`);
      for (const [col, c] of deducciones) ws.getCell(f, c).value = formula(`SUMIFS(${rango(col, fin)},${rLocal},$A${f},${soloEntregados})`);
      // El neto incluye las penalidades de cancelaciones atribuidas al local (ingreso negativo).
      ws.getCell(f, 13).value = formula(`SUMIFS(${rIngreso},${rLocal},$A${f})`);
      ws.getCell(f, 14).value = formula(`IFERROR(M${f}/C${f},"")`);
      ws.getCell(f, 15).value = formula(`SUMIFS(${rango(COL.efectivo, fin)},${rLocal},$A${f})`);
      ws.getCell(f, 16).value = formula(`SUMIFS(${rango(COL.pago, fin)},${rLocal},$A${f})-SUMIFS(${rango(COL.adeudado, fin)},${rLocal},$A${f})`);
      ws.getCell(f, 17).value = formula(`COUNTIFS(${rLocal},$A${f},${rEstado},"${CANCELADO}")`);
      ws.getCell(f, 18).value = formula(`COUNTIFS(${rLocal},$A${f},${rango(COL.reclamo, fin)},"Sí")`);
      ws.getCell(f, 19).value = l.preparacionMediana ?? "";
      f++;
    }
    const ultima = f - 1;
    const total = f;
    for (let r = primera; r <= ultima; r++) ws.getCell(r, 4).value = formula(`IFERROR(C${r}/$C$${total},"")`);
    filaTotal(ws, total, primera, ultima, cab.length, [2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18], {
      4: `IFERROR(SUM(D${primera}:D${ultima}),"")`,
      5: `IFERROR(C${total}/B${total},"")`,
      14: `IFERROR(M${total}/C${total},"")`,
    });
    for (let r = primera; r <= ultima; r++) filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
    formatos(ws, primera, total, { 2: FMT_ENT, 3: FMT_PESOS, 4: FMT_PCT, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PESOS, 10: FMT_PESOS, 11: FMT_PESOS, 12: FMT_PESOS, 13: FMT_PESOS, 14: FMT_PCT, 15: FMT_PESOS, 16: FMT_PESOS, 17: FMT_ENT, 18: FMT_ENT, 19: FMT_ENT });
    anchos(ws, [30, 9, 17, 9, 14, 16, 15, 14, 14, 14, 15, 12, 17, 10, 16, 18, 10, 9, 12]);
    congelar(ws, fc, 1);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Ventas por Día ---------------- */
  const dias = porDiaDeTurno(a.ventas);
  {
    const ws = wb.addWorksheet("Ventas por Día");
    const cab = ["Día de turno", "Día", "Pedidos", "Venta", "Neto para el local", "Ticket promedio", "% s/total", "Cancelados"];
    encabezadoHoja(
      ws,
      "Ventas por día de turno",
      `${subtitulo}  |  Corte de turno: ${hc}:00 (los pedidos de 00:00 a ${String((a.horaCorte + 23) % 24).padStart(2, "0")}:59 van al día anterior)`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    const primera = f;
    for (const d of dias) {
      ws.getCell(f, 1).value = fechaExcel(d.dia);
      ws.getCell(f, 2).value = d.diaSemana;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${rDia},$A${f},${soloEntregados})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rVenta},${rDia},$A${f},${soloEntregados})`);
      ws.getCell(f, 5).value = formula(`SUMIFS(${rIngreso},${rDia},$A${f},${soloEntregados})`);
      ws.getCell(f, 6).value = formula(`IFERROR(D${f}/C${f},"")`);
      ws.getCell(f, 8).value = formula(`COUNTIFS(${rDia},$A${f},${rEstado},"${CANCELADO}")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    for (let r = primera; r <= ultima; r++) ws.getCell(r, 7).value = formula(`IFERROR(D${r}/$D$${total},"")`);
    filaTotal(ws, total, primera, ultima, cab.length, [3, 4, 5, 8], { 6: `IFERROR(D${total}/C${total},"")`, 7: `IFERROR(SUM(G${primera}:G${ultima}),"")` });
    for (let r = primera; r <= ultima; r++) {
      const finde = ["Sábado", "Domingo"].includes(String(ws.getCell(r, 2).value));
      filaNormal(ws, r, cab.length, finde ? AMARILLO : undefined);
    }
    formatos(ws, primera, total, { 1: FMT_FECHA, 3: FMT_ENT, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PCT, 8: FMT_ENT });
    anchos(ws, [14, 12, 10, 18, 18, 16, 11, 11]);
    congelar(ws, fc);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Local x Día (matriz) ---------------- */
  if (a.locales.length > 1) {
    const ws = wb.addWorksheet("Local x Día");
    const nombres = locales.map((l) => l.local);
    const cab = ["Día de turno", "Día", ...nombres, "TOTAL"];
    encabezadoHoja(ws, "Venta por local y día de turno", `${subtitulo}  |  Cada celda es la venta (pedidos entregados) de ese local en ese turno`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    ws.getRow(fc).height = 32;
    let f = fc + 1;
    const primera = f;
    const colTotal = cab.length;
    for (const d of dias) {
      ws.getCell(f, 1).value = fechaExcel(d.dia);
      ws.getCell(f, 2).value = d.diaSemana;
      nombres.forEach((_, j) => {
        const c = j + 3;
        ws.getCell(f, c).value = formula(`SUMIFS(${rVenta},${rDia},$A${f},${rLocal},${letra(c)}$${fc},${soloEntregados})`);
      });
      ws.getCell(f, colTotal).value = formula(`SUM(C${f}:${letra(colTotal - 1)}${f})`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    filaTotal(ws, total, primera, ultima, cab.length, Array.from({ length: cab.length - 2 }, (_, j) => j + 3));
    for (let r = primera; r <= ultima; r++) {
      const finde = ["Sábado", "Domingo"].includes(String(ws.getCell(r, 2).value));
      filaNormal(ws, r, cab.length, finde ? AMARILLO : undefined);
    }
    const fmts: Record<number, string> = { 1: FMT_FECHA };
    for (let c = 3; c <= colTotal; c++) fmts[c] = FMT_PESOS;
    formatos(ws, primera, total, fmts);
    anchos(ws, [14, 12, ...nombres.map(() => 16), 17]);
    congelar(ws, fc, 2);
  }

  /* ---------------- Ventas por Hora ---------------- */
  {
    const ws = wb.addWorksheet("Ventas por Hora");
    const cab = ["Hora", "Pedidos", "Venta", "% s/total", "Ticket promedio"];
    encabezadoHoja(ws, "Pedidos por hora del turno", `${subtitulo}  |  El listado arranca a las ${hc}:00; las horas del final son la madrugada del día siguiente`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rHora = rango(COL.hora, fin);
    const presentes = new Set(a.ventas.map((p) => p.hora));
    let f = fc + 1;
    const primera = f;
    for (const hora of ordenHorasDelTurno(a.horaCorte)) {
      if (!presentes.has(hora)) continue;
      const hh = String(hora).padStart(2, "0");
      ws.getCell(f, 1).value = `${hh}:00 a ${hh}:59${hora < a.horaCorte ? "  (madrugada)" : ""}`;
      ws.getCell(f, 2).value = formula(`COUNTIFS(${rHora},${hora},${soloEntregados})`);
      ws.getCell(f, 3).value = formula(`SUMIFS(${rVenta},${rHora},${hora},${soloEntregados})`);
      ws.getCell(f, 5).value = formula(`IFERROR(C${f}/B${f},"")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    for (let r = primera; r <= ultima; r++) ws.getCell(r, 4).value = formula(`IFERROR(C${r}/$C$${total},"")`);
    filaTotal(ws, total, primera, ultima, cab.length, [2, 3], { 4: `IFERROR(SUM(D${primera}:D${ultima}),"")`, 5: `IFERROR(C${total}/B${total},"")` });
    for (let r = primera; r <= ultima; r++) filaNormal(ws, r, cab.length, String(ws.getCell(r, 1).value).includes("madrugada") ? AMARILLO : undefined);
    formatos(ws, primera, total, { 2: FMT_ENT, 3: FMT_PESOS, 4: FMT_PCT, 5: FMT_PESOS });
    anchos(ws, [24, 10, 18, 11, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Día de la Semana ---------------- */
  {
    const ws = wb.addWorksheet("Día de la Semana");
    const cab = ["Día", "Turnos", "Pedidos", "Venta", "Pedidos por turno", "Venta promedio por turno", "Ticket promedio"];
    encabezadoHoja(ws, "Promedio por día de la semana", `${subtitulo}  |  Sirve para comparar qué días rinden más, sin que pese cuántos hubo de cada uno`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rDiaSem = rango(COL.diaSemana, fin);
    let f = fc + 1;
    const primera = f;
    for (const d of promedioPorDiaSemana(a.ventas)) {
      ws.getCell(f, 1).value = d.dia;
      ws.getCell(f, 2).value = d.turnos;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${rDiaSem},$A${f},${soloEntregados})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rVenta},${rDiaSem},$A${f},${soloEntregados})`);
      ws.getCell(f, 5).value = formula(`IFERROR(C${f}/B${f},"")`);
      ws.getCell(f, 6).value = formula(`IFERROR(D${f}/B${f},"")`);
      ws.getCell(f, 7).value = formula(`IFERROR(D${f}/C${f},"")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    filaTotal(ws, total, primera, ultima, cab.length, [2, 3, 4], { 5: `IFERROR(C${total}/B${total},"")`, 6: `IFERROR(D${total}/B${total},"")`, 7: `IFERROR(D${total}/C${total},"")` });
    for (let r = primera; r <= ultima; r++) filaNormal(ws, r, cab.length, ["Sábado", "Domingo"].includes(String(ws.getCell(r, 1).value)) ? AMARILLO : undefined);
    formatos(ws, primera, total, { 2: FMT_ENT, 3: FMT_ENT, 4: FMT_PESOS, 5: '#,##0.0;-#,##0.0;"-"', 6: FMT_PESOS, 7: FMT_PESOS });
    anchos(ws, [12, 9, 10, 18, 14, 20, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Deducciones ---------------- */
  {
    const ws = wb.addWorksheet("Deducciones");
    const cab = ["Local", "Concepto", "Monto", "% s/venta del local", "Quién lo decide"];
    encabezadoHoja(
      ws,
      "Qué se descuenta de la venta, por local",
      `${subtitulo}  |  Los descuentos que financia el local son una decisión comercial propia; el resto lo cobra PedidosYa`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const conceptos: [string, string, string][] = [
      ["Descuentos y vales financiados por el local", COL.descPropio, "El local"],
      ["Comisión de PedidosYa", COL.comision, "PedidosYa"],
      ["Tarifa de pago online", COL.tarifaOnline, "PedidosYa"],
      ["Impuestos sobre comisiones y tarifas (IVA y percepciones)", COL.impuestos, "PedidosYa"],
      ["Cargos por reclamos y penalidades", COL.cargos, "PedidosYa"],
      ["Marketing: descuentos fugaces y publicidad", COL.marketing, "El local (campañas)"],
      ["Otros cargos (espera, etc.)", COL.otrosCargos, "PedidosYa"],
    ];
    let f = fc + 1;
    const primera = f;
    for (const l of locales) {
      for (const [etiqueta, col, quien] of conceptos) {
        ws.getCell(f, 1).value = l.local;
        ws.getCell(f, 2).value = etiqueta;
        ws.getCell(f, 3).value = formula(`SUMIFS(${rango(col, fin)},${rLocal},$A${f},${soloEntregados})`);
        ws.getCell(f, 4).value = formula(`IFERROR(C${f}/SUMIFS(${rVenta},${rLocal},$A${f},${soloEntregados}),"")`);
        ws.getCell(f, 5).value = quien;
        f++;
      }
    }
    const ultima = f - 1;
    const total = f;
    filaTotal(ws, total, primera, ultima, cab.length, [3], { 4: `IFERROR(C${total}/SUMIFS(${rVenta},${soloEntregados}),"")` });
    for (let r = primera; r <= ultima; r++) filaNormal(ws, r, cab.length, Math.floor((r - primera) / conceptos.length) % 2 === 1 ? GRIS_ALT : undefined);
    formatos(ws, primera, total, { 3: FMT_PESOS, 4: FMT_PCT });
    anchos(ws, [30, 56, 18, 14, 20]);
    congelar(ws, fc);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Productos ---------------- */
  if (a.items.length > 0) {
    const ws = wb.addWorksheet("Productos");
    const cab = ["Local", "Producto", "Unidades", "Pedidos en que aparece", "% de las unidades del local", "Puesto en el local"];
    encabezadoHoja(
      ws,
      "Productos más vendidos, por local",
      `${subtitulo}  |  Armado a partir de la columna "Artículos" del reporte; las opciones entre corchetes (guarniciones, gustos) no se cuentan como producto`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    ws.getRow(fc).height = 32;
    const unidadesPorLocal = new Map<string, number>();
    for (const i of a.items) unidadesPorLocal.set(i.local, (unidadesPorLocal.get(i.local) ?? 0) + i.unidades);
    let f = fc + 1;
    const primera = f;
    let localActual = "";
    let puesto = 0;
    for (const i of a.items) {
      if (i.local !== localActual) {
        localActual = i.local;
        puesto = 0;
      }
      puesto++;
      ws.getCell(f, 1).value = i.local;
      ws.getCell(f, 2).value = i.producto;
      ws.getCell(f, 3).value = i.unidades;
      ws.getCell(f, 4).value = i.pedidos;
      ws.getCell(f, 5).value = round2(i.unidades / (unidadesPorLocal.get(i.local) || 1));
      ws.getCell(f, 6).value = puesto;
      filaNormal(ws, f, cab.length, puesto <= 5 ? AMARILLO : undefined);
      f++;
    }
    const ultima = f - 1;
    formatos(ws, primera, ultima, { 3: FMT_ENT, 4: FMT_ENT, 5: FMT_PCT, 6: FMT_ENT });
    anchos(ws, [30, 52, 11, 14, 14, 11]);
    congelar(ws, fc);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Cancelados y Reclamos ---------------- */
  const motivos = porMotivo(a);
  if (motivos.length > 0) {
    const ws = wb.addWorksheet("Cancelados y Reclamos");
    const cab = ["Tipo", "Motivo", "Cantidad", "Monto"];
    encabezadoHoja(
      ws,
      "Cancelaciones y reclamos por motivo",
      `${subtitulo}  |  Cancelación: monto = venta que no se concretó. Reclamo: monto = lo que PedidosYa devolvió al cliente y descontó al local ("Cargos")`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    const primera = f;
    for (const m of motivos) {
      ws.getCell(f, 1).value = m.tipo;
      ws.getCell(f, 2).value = m.motivo;
      ws.getCell(f, 3).value = m.cantidad;
      ws.getCell(f, 4).value = round2(m.monto);
      filaNormal(ws, f, cab.length, m.tipo === "Reclamo" ? AMARILLO : undefined);
      f++;
    }
    const ultima = f - 1;
    formatos(ws, primera, ultima, { 3: FMT_ENT, 4: FMT_PESOS });

    // Debajo, el listado pedido por pedido para poder reclamar con el número.
    f += 2;
    const cab2 = ["Fecha y hora", "Local", "Nº pedido", "Tipo", "Motivo", "Responsable", "Venta", "Cargo al local", "Artículos"];
    filaCabecera(ws, f, cab2, PALETA);
    f++;
    const lista: PedidoPeYa[] = [...a.cancelados, ...a.ventas.filter((p) => p.tieneReclamo)].sort((x, y) => x.momento.getTime() - y.momento.getTime());
    const primera2 = f;
    for (const p of lista) {
      const valores: ExcelJS.CellValue[] = [
        fechaExcel(p.momento),
        p.local,
        p.nro,
        p.entregado ? "Reclamo" : "Cancelación",
        p.entregado ? p.motivoReclamo : p.motivoCancelacion,
        p.entregado ? "" : p.responsableCancelacion,
        p.venta,
        p.entregado ? p.cargosReclamos : -p.ingreso,
        p.articulos,
      ];
      valores.forEach((v, j) => {
        ws.getCell(f, j + 1).value = v;
      });
      filaNormal(ws, f, cab2.length);
      f++;
    }
    formatos(ws, primera2, f - 1, { 1: FMT_FECHAHORA, 7: FMT_PESOS, 8: FMT_PESOS });
    anchos(ws, [18, 30, 14, 12, 44, 26, 15, 15, 60]);
    congelar(ws, fc);
  }

  /* ---------------- Revisar ---------------- */
  const revisar = a.ventas.filter((p) => p.sinLiquidar || !p.liquidacionCierra);
  if (revisar.length > 0) {
    const ws = wb.addWorksheet("Revisar");
    const cab = ["Fecha y hora", "Local", "Nº pedido", "Forma de pago", "Venta", "Ingreso informado", "Ingreso calculado", "Pago", "Adeudado", "Efectivo", "Qué pasa"];
    encabezadoHoja(
      ws,
      "Pedidos para reclamar o revisar con PedidosYa",
      `${subtitulo}  |  Entregados cuya liquidación no está informada o no cierra. Conviene consultarlos con el número de pedido`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    for (const p of revisar) {
      const valores: ExcelJS.CellValue[] = [
        fechaExcel(p.momento),
        p.local,
        p.nro,
        p.formaPago,
        p.venta,
        p.ingreso,
        p.ingresoCalculado,
        p.pago,
        p.adeudado,
        p.efectivo,
        p.sinLiquidar ? "Sin liquidación informada (pago, adeudado y efectivo en cero)" : "El ingreso informado no coincide con venta − deducciones",
      ];
      valores.forEach((v, j) => {
        ws.getCell(f, j + 1).value = v;
      });
      filaNormal(ws, f, cab.length, AMARILLO);
      f++;
    }
    formatos(ws, fc + 1, f - 1, { 1: FMT_FECHAHORA, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PESOS, 10: FMT_PESOS });
    anchos(ws, [18, 30, 14, 14, 15, 16, 16, 14, 14, 14, 58]);
    congelar(ws, fc);
  }

  /* ---------------- Control ---------------- */
  {
    const ws = wb.addWorksheet("Control");
    const cab = ["Grupo", "Control", "Calculado", "Informado", "Resultado"];
    encabezadoHoja(ws, "Controles de lectura y liquidación", subtitulo, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    let f = fc + 1;
    for (const c of a.controles) {
      ws.getCell(f, 1).value = c.grupo;
      ws.getCell(f, 2).value = c.control;
      ws.getCell(f, 3).value = c.calculado;
      ws.getCell(f, 4).value = c.declarado;
      ws.getCell(f, 5).value = c.ok ? "OK" : "REVISAR";
      filaNormal(ws, f, cab.length);
      ws.getCell(f, 5).font = c.ok ? fuentes.ok : fuentes.mal;
      const fmt = c.formato === "ent" ? FMT_ENT : FMT_PESOS;
      ws.getCell(f, 3).numFmt = fmt;
      ws.getCell(f, 4).numFmt = fmt;
      f++;
    }
    f++;
    ws.getCell(f, 1).value = "Cómo leer la liquidación";
    ws.getCell(f, 1).font = fuentes.titulo(PALETA);
    f++;
    const notas = [
      "Venta: lo que compró el cliente a precio de carta (Total parcial).",
      "Ingreso estimado (neto para el local) = venta + otros ingresos − descuentos que financia el local − comisión − tarifa de pago online − impuestos sobre comisiones − cargos por reclamos − marketing − otros cargos.",
      "En los pedidos en efectivo el local ya cobró la venta al cliente: por eso le adeuda a PedidosYa las comisiones. A cobrar de PedidosYa = pagos − adeudado.",
      "Los cancelados no cuentan como venta. Si la cancelación se atribuye al local, puede traer una penalidad (ingreso negativo).",
      "Los descuentos financiados por PedidosYa se informan pero no afectan lo que cobra el local.",
    ];
    for (const n of notas) {
      ws.getCell(f, 1).value = `• ${n}`;
      ws.getCell(f, 1).font = fuentes.normal;
      ws.mergeCells(f, 1, f, cab.length);
      ws.getCell(f, 1).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(f).height = 30;
      f++;
    }
    anchos(ws, [20, 60, 18, 18, 12]);
    congelar(ws, fc);
  }

  /* ---------------- Detalle Pedidos ---------------- */
  {
    const ws = wb.addWorksheet(HOJA_DETALLE);
    const cab = [
      "Fecha y hora",
      "Día de turno",
      "Día",
      "Hora",
      "Período",
      "Local",
      "Nº pedido",
      "Estado",
      "Forma de pago",
      "Entrega",
      "Venta",
      "Otros ingresos",
      "Desc. financiado por el local",
      "Desc. financiado por PedidosYa",
      "Comisión",
      "Tarifa pago online",
      "Impuestos s/comisiones",
      "Cargos por reclamos",
      "Marketing",
      "Otros cargos",
      "Ingreso neto (informado)",
      "Ingreso calculado",
      "Efectivo cobrado por el local",
      "Pago de PedidosYa",
      "Adeudado a PedidosYa",
      "Reclamo",
      "Motivo del reclamo",
      "Motivo de cancelación",
      "Responsable",
      "Min. preparación",
      "Min. hasta la entrega",
      "Sin liquidar",
      "Artículos",
    ];
    filaCabecera(ws, 1, cab, PALETA);
    ws.getRow(1).height = 32;
    a.pedidos.forEach((p, i) => {
      const f = i + 2;
      const valores: ExcelJS.CellValue[] = [
        fechaExcel(p.momento),
        fechaExcel(p.diaTurno),
        p.diaSemana,
        p.hora,
        p.periodo,
        p.local,
        p.nro,
        p.entregado ? ENTREGADO : CANCELADO,
        p.formaPago,
        p.metodoEntrega,
        p.venta,
        p.otrosIngresos,
        p.descuentoPropio,
        p.descuentoPeYa,
        p.comision,
        p.tarifaOnline,
        p.impuestos,
        p.cargosReclamos,
        p.marketing,
        p.otrosCargos,
        p.ingreso,
        p.ingresoCalculado,
        p.efectivo,
        p.pago,
        p.adeudado,
        p.tieneReclamo ? "Sí" : "No",
        p.motivoReclamo,
        p.motivoCancelacion,
        p.responsableCancelacion,
        p.minutosPreparacion ?? "",
        p.minutosTotal ?? "",
        p.sinLiquidar ? "Sí" : "",
        p.articulos,
      ];
      valores.forEach((v, j) => {
        const celda = ws.getCell(f, j + 1);
        celda.value = v;
        celda.font = fuentes.normal;
      });
      if (!p.entregado || p.sinLiquidar) filaNormal(ws, f, cab.length, AMARILLO);
      ws.getCell(f, 1).numFmt = FMT_FECHAHORA;
      ws.getCell(f, 2).numFmt = FMT_FECHA;
      for (let c = 11; c <= 25; c++) ws.getCell(f, c).numFmt = FMT_PESOS;
    });
    anchos(ws, [17, 12, 11, 6, 9, 26, 13, 11, 13, 20, 13, 10, 13, 13, 12, 12, 12, 12, 11, 10, 14, 14, 13, 13, 13, 8, 22, 34, 22, 9, 9, 8, 60]);
    congelar(ws, 1);
    autofiltro(ws, 1, 1, fin, cab.length);
  }

  return libroABlob(wb);
}
