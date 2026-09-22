/**
 * Excel de la liquidación de PedidosYa. "Día a día" y "Por sucursal" usan
 * SUMIFS / COUNTIFS contra la hoja "Detalle": si el usuario filtra o corrige
 * algo ahí, los totales se recalculan solos. La cascada de "Liquidación" va
 * con valores porque combina los dos reportes.
 */

import type ExcelJS from "exceljs";
import { formatearFecha } from "./texto";
import {
  anchos,
  autofiltro,
  congelar,
  crearLibro,
  encabezadoHoja,
  estiloFila,
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
import { MODOS_PLANILLA_LOCAL, porSucursal, type AnalisisLiquidacionPeYa, type PeriodoLiquidacion } from "./peya-liquidacion";

const PALETA: Paleta = { principal: "C62828", total: "F8D7DA" };
const AMARILLO = "FFF2CC";
const GRIS_ALT = "F2F2F2";
const HOJA_DETALLE = "Detalle";
const ENTREGADO = "Entregado";
const SD = "s/d";

/** Columnas del Detalle: todas las fórmulas dependen de este orden. */
const COL = {
  fecha: "A",
  dia: "B",
  hora: "C",
  sucursal: "D",
  nro: "E",
  estado: "F",
  formaPago: "G",
  entrega: "H",
  semana: "I",
  bruto: "J",
  promos: "K",
  descPeya: "L",
  neta: "M",
  efectivo: "N",
  comision: "O",
  plus: "P",
  tarifa: "Q",
  iva: "R",
  reclamo: "S",
  queda: "T",
  aDepositar: "U",
  cancelado: "V",
  articulos: "W",
} as const;

const rango = (col: string, fin: number) => `${refHoja(HOJA_DETALLE)}!$${col}$2:$${col}$${fin}`;

function formatos(ws: ExcelJS.Worksheet, desde: number, hasta: number, mapa: Record<number, string>): void {
  for (let r = desde; r <= hasta; r++) {
    for (const [c, fmt] of Object.entries(mapa)) ws.getCell(r, Number(c)).numFmt = fmt;
  }
}

export async function generarExcelLiquidacionPeYa(a: AnalisisLiquidacionPeYa): Promise<Blob> {
  const wb = await crearLibro();
  const fin = a.detalle.length + 1;
  const entregados = a.detalle.filter((d) => d.estado === ENTREGADO).length;
  const subtitulo =
    `Del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${entregados.toLocaleString("es-AR")} pedidos liquidados` +
    `  |  ${a.sucursales.length} sucursal(es)  |  ${a.estados.length} estado(s) de cuenta` +
    `${a.pedidos ? ` + reporte de pedidos` : " (sin reporte de pedidos)"}  |  Generado: ${formatearFecha(new Date())}`;

  hojaLiquidacion(wb, a, subtitulo);
  if (a.planillaLocal?.filas.length) hojaPlanillaLocal(wb, a, subtitulo);
  hojaDiaADia(wb, a, subtitulo, fin);
  hojaPorSucursal(wb, a, subtitulo, fin);
  hojaRevisar(wb, a, subtitulo);
  hojaControl(wb, a, subtitulo);
  hojaDetalle(wb, a);
  return libroABlob(wb);
}

/* ------------------------------------------------------------------ */
/* 1. Liquidación: la cascada de la venta al depósito, por semana        */
/* ------------------------------------------------------------------ */

function hojaLiquidacion(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa, subtitulo: string): void {
  const ws = wb.addWorksheet("Liquidación");
  const columnas = a.periodos.length + 2;
  encabezadoHoja(ws, "De la venta al depósito", subtitulo, columnas, PALETA);
  const fc = 4;
  filaCabecera(ws, fc, ["Concepto", ...a.periodos.map((p) => p.etiqueta), "Total"], PALETA);

  const lineas: { texto: string; valor: (p: PeriodoLiquidacion) => number; destacar?: boolean; falta?: (p: PeriodoLiquidacion) => boolean }[] = [
    { texto: "Venta bruta (antes de tus promos)", valor: (p) => p.bruto, destacar: true },
    { texto: "− Tus promos y cupones", valor: (p) => -p.promos },
    { texto: "− Descuentos de PedidosYa que te cobran", valor: (p) => -p.descuentoPeya, falta: (p) => !p.tieneEstado },
    { texto: "= Venta neta", valor: (p) => p.neta, destacar: true },
    { texto: "− Comisión por el servicio", valor: (p) => -p.comision },
    { texto: "− Cargo por pedidos con Plus", valor: (p) => -p.plus, falta: (p) => !p.tieneEstado },
    { texto: "− Tarifa de pago online (no está en el estado de cuenta)", valor: (p) => -p.tarifaOnline, falta: (p) => !p.tienePedidos },
    { texto: "− IVA sobre comisiones y tarifas (no está en el estado de cuenta)", valor: (p) => -p.iva, falta: (p) => !p.tienePedidos },
    { texto: "− Reclamos de usuarios", valor: (p) => p.reclamos },
    { texto: "+ Reintegros por pedidos rechazados", valor: (p) => p.reintegros, falta: (p) => !p.tieneEstado },
    { texto: "− Cobrado por vos en efectivo en el local", valor: (p) => -p.efectivo },
    { texto: "= Depósito estimado de PedidosYa", valor: (p) => p.deposito, destacar: true },
  ];

  let fila = fc + 1;
  ws.getCell(fila, 1).value = "Pedidos liquidados";
  a.periodos.forEach((p, i) => (ws.getCell(fila, i + 2).value = p.pedidos));
  ws.getCell(fila, columnas).value = a.total.pedidos;
  formatos(ws, fila, fila, Object.fromEntries(Array.from({ length: columnas - 1 }, (_, i) => [i + 2, FMT_ENT])));
  estiloFila(ws, fila, columnas, { alterna: true });
  fila++;

  for (const l of lineas) {
    ws.getCell(fila, 1).value = l.texto;
    a.periodos.forEach((p, i) => {
      const celda = ws.getCell(fila, i + 2);
      if (l.falta?.(p)) {
        celda.value = SD;
        celda.alignment = { horizontal: "center" };
        celda.fill = relleno(AMARILLO);
      } else {
        celda.value = l.valor(p);
        celda.numFmt = FMT_PESOS;
      }
    });
    const total = ws.getCell(fila, columnas);
    total.value = l.valor(a.total);
    total.numFmt = FMT_PESOS;
    if (l.destacar) estiloFila(ws, fila, columnas, { total: true });
    fila++;
  }

  fila++;
  ws.getCell(fila, 1).value = "Lo que te queda (depósito + efectivo en caja)";
  a.periodos.forEach((p, i) => {
    ws.getCell(fila, i + 2).value = p.queda;
    ws.getCell(fila, i + 2).numFmt = FMT_PESOS;
  });
  ws.getCell(fila, columnas).value = a.total.queda;
  ws.getCell(fila, columnas).numFmt = FMT_PESOS;
  estiloTotal(ws, fila, columnas, PALETA);
  fila++;
  ws.getCell(fila, 1).value = "% sobre la venta bruta";
  a.periodos.forEach((p, i) => {
    ws.getCell(fila, i + 2).value = p.bruto ? p.queda / p.bruto : 0;
    ws.getCell(fila, i + 2).numFmt = FMT_PCT;
  });
  ws.getCell(fila, columnas).value = a.total.bruto ? a.total.queda / a.total.bruto : 0;
  ws.getCell(fila, columnas).numFmt = FMT_PCT;
  estiloTotal(ws, fila, columnas, PALETA);
  fila += 2;

  const notas = [
    "El estado de cuenta (Finanzas → semana) llega hasta la línea de reclamos: no incluye la tarifa de pago online ni el IVA sobre las comisiones.",
    "El reporte de pedidos (Reportes → Pedidos) sí los trae, pero no muestra los reintegros ni separa tus promos del cargo por Plus.",
    "“s/d” significa que falta el archivo que informa ese dato para ese período.",
    ...(a.periodos.some((p) => p.promosIncluyenPlus)
      ? ['En las semanas sin estado de cuenta, "Tus promos" sale del reporte de pedidos y ya incluye adentro el cargo por pedidos con Plus.']
      : []),
  ];
  for (const n of notas) {
    ws.getCell(fila, 1).value = n;
    ws.getCell(fila, 1).font = fuentes.subtitulo;
    fila++;
  }

  anchos(ws, [56, ...a.periodos.map(() => 18), 18]);
  congelar(ws, fc, 1);
}

/* ------------------------------------------------------------------ */
/* 1 bis. Tu planilla del local contra la liquidación                    */
/* ------------------------------------------------------------------ */

const ETIQUETA_ESTADO: Record<string, string> = {
  coincide: "Coincide",
  descuentos: "Descuentos de PedidosYa",
  cancelados: "Cancelado anotado",
  revisar: "Revisar",
  "sin-datos": "Sin datos",
};

function hojaPlanillaLocal(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa, subtitulo: string): void {
  const pl = a.planillaLocal!;
  const modo = MODOS_PLANILLA_LOCAL.find((m) => m.id === pl.modo)!;
  const ws = wb.addWorksheet("Planilla del local");
  const cabeceras = ["Fecha", "Informó el local", "Según PedidosYa", "Diferencia", "Descuentos de PedidosYa", "Cancelado anotado", "Sin explicar", "Resultado", "Qué la explica"];
  encabezadoHoja(ws, `Tu planilla del local contra la liquidación · ${modo.etiqueta} (${modo.ayuda})`, subtitulo, cabeceras.length, PALETA);
  const fc = 4;
  filaCabecera(ws, fc, cabeceras, PALETA);
  let fila = fc + 1;
  pl.filas.forEach((f, i) => {
    ws.getCell(fila, 1).value = fechaExcel(f.fecha);
    ws.getCell(fila, 2).value = f.informado;
    ws.getCell(fila, 3).value = f.estado === "sin-datos" ? "—" : f.segunPeya;
    ws.getCell(fila, 4).value = f.estado === "sin-datos" ? "—" : f.diferencia;
    ws.getCell(fila, 5).value = f.descuentosPeya;
    ws.getCell(fila, 6).value = f.canceladoNeto;
    ws.getCell(fila, 7).value = f.sinExplicar;
    ws.getCell(fila, 8).value = ETIQUETA_ESTADO[f.estado];
    ws.getCell(fila, 9).value = f.detalle;
    formatos(ws, fila, fila, { 1: FMT_FECHA, 2: FMT_PESOS, 3: FMT_PESOS, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS });
    estiloFila(ws, fila, cabeceras.length, { alterna: i % 2 === 1, alerta: f.estado === "revisar" || f.estado === "sin-datos" });
    fila++;
  });
  const primera = fc + 1;
  const ultima = fila - 1;
  // Los días sin reportes no entran en el total (inflarían la diferencia).
  ws.getCell(fila, 1).value = "TOTAL (días con reportes)";
  ws.getCell(fila, 2).value = formula(`SUMIFS(B${primera}:B${ultima},H${primera}:H${ultima},"<>${ETIQUETA_ESTADO["sin-datos"]}")`);
  for (const c of [5, 6, 7]) ws.getCell(fila, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
  ws.getCell(fila, 3).value = pl.segunPeya;
  ws.getCell(fila, 4).value = pl.diferencia;
  formatos(ws, fila, fila, { 2: FMT_PESOS, 3: FMT_PESOS, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS });
  estiloTotal(ws, fila, cabeceras.length, PALETA);
  fila += 2;
  const resumen = [
    `${pl.coinciden} día(s) coinciden exacto con ${modo.etiqueta.toLowerCase()} según PedidosYa.`,
    `${pl.conDescuentos} día(s) cierran sumando los descuentos que PedidosYa te cobra: el local anota la venta como la mostró la app y PedidosYa los descuenta en la liquidación.`,
    `${pl.conCancelados} día(s) cierran sumando además un pedido cancelado que quedó anotado como venta.`,
    `${pl.aRevisar} día(s) quedan para revisar${pl.sinDatos ? ` y ${pl.sinDatos} sin reportes que los cubran` : ""}.`,
    `La cuenta que cierra: lo que anota el local (${modo.ayuda}) − descuentos que te cobra PedidosYa − pedidos cancelados = ${modo.etiqueta.toLowerCase()} según PedidosYa.`,
    ...(pl.sugerencia ? [`Ojo: tus números cierran mejor con la opción "${MODOS_PLANILLA_LOCAL.find((m) => m.id === pl.sugerencia)!.etiqueta}": volvé a analizar con esa opción.`] : []),
  ];
  for (const t of resumen) {
    ws.getCell(fila, 1).value = t;
    ws.getCell(fila, 1).font = fuentes.subtitulo;
    fila++;
  }
  anchos(ws, [12, 17, 17, 15, 20, 18, 14, 22, 90]);
  congelar(ws, fc);
  autofiltro(ws, fc, 1, ultima, cabeceras.length);
}

/* ------------------------------------------------------------------ */
/* 2. Día a día: para comparar con lo que informa el local               */
/* ------------------------------------------------------------------ */

function hojaDiaADia(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa, subtitulo: string, fin: number): void {
  const ws = wb.addWorksheet("Día a día");
  const cabeceras = [
    "Fecha",
    "Día",
    "Sucursal",
    "Pedidos",
    "Venta bruta",
    "Tus promos",
    "Venta neta",
    "Cobrado en efectivo",
    "Cobrado por la app",
    "Cancelados",
    "$ cancelado",
    "Reclamos",
    "Estado de cuenta",
  ];
  encabezadoHoja(ws, "Venta día a día (para cruzar con la planilla del local)", subtitulo, cabeceras.length, PALETA);
  const fc = 4;
  filaCabecera(ws, fc, cabeceras, PALETA);

  const rFecha = rango(COL.fecha, fin);
  const rSuc = rango(COL.sucursal, fin);
  const rEstado = rango(COL.estado, fin);
  let fila = fc + 1;
  a.dias.forEach((d, i) => {
    const claves = `${rFecha},$A${fila},${rSuc},$C${fila}`;
    ws.getCell(fila, 1).value = fechaExcel(d.fecha);
    ws.getCell(fila, 2).value = d.fecha.toLocaleDateString("es-AR", { weekday: "long" });
    ws.getCell(fila, 3).value = d.sucursal;
    ws.getCell(fila, 4).value = formula(`COUNTIFS(${claves},${rEstado},"${ENTREGADO}")`);
    ws.getCell(fila, 5).value = formula(`SUMIFS(${rango(COL.bruto, fin)},${claves})`);
    if (d.tieneEstado) {
      ws.getCell(fila, 6).value = formula(`SUMIFS(${rango(COL.promos, fin)},${claves})`);
      ws.getCell(fila, 7).value = formula(`SUMIFS(${rango(COL.neta, fin)},${claves})`);
    } else {
      ws.getCell(fila, 6).value = SD;
      ws.getCell(fila, 7).value = SD;
    }
    ws.getCell(fila, 8).value = formula(`SUMIFS(${rango(COL.efectivo, fin)},${claves})`);
    ws.getCell(fila, 9).value = d.tieneEstado ? formula(`G${fila}-H${fila}`) : SD;
    ws.getCell(fila, 10).value = formula(`COUNTIFS(${claves},${rEstado},"<>${ENTREGADO}")`);
    ws.getCell(fila, 11).value = formula(`SUMIFS(${rango(COL.cancelado, fin)},${claves})`);
    ws.getCell(fila, 12).value = formula(`SUMIFS(${rango(COL.reclamo, fin)},${claves})`);
    ws.getCell(fila, 13).value = d.tieneEstado ? "sí" : "falta esa semana";
    formatos(ws, fila, fila, { 1: FMT_FECHA, 4: FMT_ENT, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PESOS, 10: FMT_ENT, 11: FMT_PESOS, 12: FMT_PESOS });
    estiloFila(ws, fila, cabeceras.length, { alterna: i % 2 === 1, alerta: !d.tieneEstado });
    fila++;
  });

  const primera = fc + 1;
  const ultima = fila - 1;
  ws.getCell(fila, 3).value = "TOTAL";
  for (const c of [4, 5, 8, 10, 11, 12]) ws.getCell(fila, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
  formatos(ws, fila, fila, { 4: FMT_ENT, 5: FMT_PESOS, 8: FMT_PESOS, 10: FMT_ENT, 11: FMT_PESOS, 12: FMT_PESOS });
  estiloTotal(ws, fila, cabeceras.length, PALETA);

  anchos(ws, [12, 12, 24, 9, 15, 13, 15, 17, 17, 11, 13, 13, 17]);
  congelar(ws, fc, 3);
  autofiltro(ws, fc, 1, ultima, cabeceras.length);
}

/* ------------------------------------------------------------------ */
/* 3. Por sucursal                                                       */
/* ------------------------------------------------------------------ */

function hojaPorSucursal(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa, subtitulo: string, fin: number): void {
  const ws = wb.addWorksheet("Por sucursal");
  const cabeceras = ["Sucursal", "Pedidos", "Venta bruta", "Ticket promedio", "Tus promos", "Venta neta", "Comisión", "Costo total de PedidosYa", "% sobre la venta", "Cobrado en efectivo", "Reintegros", "Lo que te queda"];
  encabezadoHoja(ws, "Cada sucursal", subtitulo, cabeceras.length, PALETA);
  const fc = 4;
  filaCabecera(ws, fc, cabeceras, PALETA);
  const rSuc = rango(COL.sucursal, fin);
  const rEstado = rango(COL.estado, fin);
  let fila = fc + 1;
  porSucursal(a).forEach((s, i) => {
    const claves = `${rSuc},$A${fila},${rEstado},"${ENTREGADO}"`;
    ws.getCell(fila, 1).value = s.sucursal;
    ws.getCell(fila, 2).value = formula(`COUNTIFS(${claves})`);
    ws.getCell(fila, 3).value = formula(`SUMIFS(${rango(COL.bruto, fin)},${claves})`);
    ws.getCell(fila, 4).value = formula(`IFERROR(C${fila}/B${fila},0)`);
    ws.getCell(fila, 5).value = formula(`SUMIFS(${rango(COL.promos, fin)},${claves})`);
    ws.getCell(fila, 6).value = formula(`SUMIFS(${rango(COL.neta, fin)},${claves})`);
    ws.getCell(fila, 7).value = formula(`SUMIFS(${rango(COL.comision, fin)},${claves})`);
    ws.getCell(fila, 8).value = formula(
      `SUMIFS(${rango(COL.comision, fin)},${claves})+SUMIFS(${rango(COL.plus, fin)},${claves})+SUMIFS(${rango(COL.tarifa, fin)},${claves})+SUMIFS(${rango(COL.iva, fin)},${claves})`,
    );
    ws.getCell(fila, 9).value = formula(`IFERROR(H${fila}/C${fila},0)`);
    ws.getCell(fila, 10).value = formula(`SUMIFS(${rango(COL.efectivo, fin)},${claves})`);
    ws.getCell(fila, 11).value = s.reintegros;
    ws.getCell(fila, 12).value = formula(`SUMIFS(${rango(COL.queda, fin)},${claves})+K${fila}`);
    formatos(ws, fila, fila, { 2: FMT_ENT, 3: FMT_PESOS, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PCT, 10: FMT_PESOS, 11: FMT_PESOS, 12: FMT_PESOS });
    estiloFila(ws, fila, cabeceras.length, { alterna: i % 2 === 1 });
    fila++;
  });
  const primera = fc + 1;
  const ultima = fila - 1;
  ws.getCell(fila, 1).value = "TOTAL";
  for (const c of [2, 3, 5, 6, 7, 8, 10, 11, 12]) ws.getCell(fila, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
  ws.getCell(fila, 4).value = formula(`IFERROR(C${fila}/B${fila},0)`);
  ws.getCell(fila, 9).value = formula(`IFERROR(H${fila}/C${fila},0)`);
  formatos(ws, fila, fila, { 2: FMT_ENT, 3: FMT_PESOS, 4: FMT_PESOS, 5: FMT_PESOS, 6: FMT_PESOS, 7: FMT_PESOS, 8: FMT_PESOS, 9: FMT_PCT, 10: FMT_PESOS, 11: FMT_PESOS, 12: FMT_PESOS });
  estiloTotal(ws, fila, cabeceras.length, PALETA);
  anchos(ws, [26, 9, 15, 15, 13, 15, 14, 17, 13, 17, 13, 16]);
  congelar(ws, fc);
}

/* ------------------------------------------------------------------ */
/* 4. Revisar: lo que hay que mirar (y en varios casos reclamar)         */
/* ------------------------------------------------------------------ */

function hojaRevisar(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa, subtitulo: string): void {
  const ws = wb.addWorksheet("Revisar");
  const cabeceras = ["Qué pasó", "Pedido", "Fecha", "Sucursal", "Importe", "Detalle"];
  encabezadoHoja(ws, "Para revisar con PedidosYa", subtitulo, cabeceras.length, PALETA);
  const fc = 4;
  filaCabecera(ws, fc, cabeceras, PALETA);
  let fila = fc + 1;
  if (a.incidencias.length === 0) {
    ws.getCell(fila, 1).value = "No se encontró nada raro en este período.";
    ws.getCell(fila, 1).font = fuentes.normal;
    fila++;
  }
  a.incidencias.forEach((inc, i) => {
    ws.getCell(fila, 1).value = inc.titulo;
    ws.getCell(fila, 2).value = inc.nro;
    ws.getCell(fila, 3).value = inc.fecha ? fechaExcel(inc.fecha) : "";
    ws.getCell(fila, 4).value = inc.sucursal;
    ws.getCell(fila, 5).value = inc.importe;
    ws.getCell(fila, 6).value = inc.detalle;
    formatos(ws, fila, fila, { 3: FMT_FECHA, 5: FMT_PESOS });
    estiloFila(ws, fila, cabeceras.length, { alterna: i % 2 === 1, alerta: inc.tipo === "descuento-peya" || inc.tipo === "fila-rota" });
    fila++;
  });
  anchos(ws, [52, 15, 12, 24, 15, 90]);
  congelar(ws, fc);
  autofiltro(ws, fc, 1, Math.max(fila - 1, fc), cabeceras.length);
}

/* ------------------------------------------------------------------ */
/* 5. Control                                                            */
/* ------------------------------------------------------------------ */

function hojaControl(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa, subtitulo: string): void {
  const ws = wb.addWorksheet("Control");
  const cabeceras = ["Control", "Calculado", "Informado", "Diferencia", "Resultado"];
  encabezadoHoja(ws, "Controles de la liquidación", subtitulo, cabeceras.length, PALETA);
  let fila = 4;
  let grupo = "";
  for (const c of a.controles) {
    if (c.grupo !== grupo) {
      grupo = c.grupo;
      ws.getCell(fila, 1).value = grupo;
      ws.getCell(fila, 1).font = fuentes.cabecera;
      ws.getCell(fila, 1).fill = relleno(PALETA.principal);
      for (let j = 2; j <= cabeceras.length; j++) ws.getCell(fila, j).fill = relleno(PALETA.principal);
      fila++;
      filaCabecera(ws, fila, cabeceras, PALETA);
      fila++;
    }
    const fmt = c.formato === "ent" ? FMT_ENT : FMT_PESOS;
    ws.getCell(fila, 1).value = c.control;
    ws.getCell(fila, 2).value = c.calculado;
    ws.getCell(fila, 3).value = c.declarado;
    ws.getCell(fila, 4).value = formula(`B${fila}-C${fila}`);
    ws.getCell(fila, 5).value = c.ok ? "OK" : "REVISAR";
    formatos(ws, fila, fila, { 2: fmt, 3: fmt, 4: fmt });
    estiloFila(ws, fila, cabeceras.length, { alerta: !c.ok });
    fila++;
  }
  if (a.avisos.length) {
    fila++;
    ws.getCell(fila, 1).value = "Avisos";
    ws.getCell(fila, 1).font = fuentes.cabecera;
    ws.getCell(fila, 1).fill = relleno(PALETA.principal);
    fila++;
    for (const av of a.avisos) {
      ws.getCell(fila, 1).value = av;
      ws.getCell(fila, 1).font = fuentes.normal;
      ws.getCell(fila, 1).alignment = { wrapText: true, vertical: "top" };
      ws.mergeCells(fila, 1, fila, cabeceras.length);
      ws.getRow(fila).height = 28;
      fila++;
    }
  }
  anchos(ws, [64, 18, 18, 16, 14]);
  congelar(ws, 3);
}

/* ------------------------------------------------------------------ */
/* 6. Detalle: un pedido por fila (base de todas las fórmulas)           */
/* ------------------------------------------------------------------ */

function hojaDetalle(wb: ExcelJS.Workbook, a: AnalisisLiquidacionPeYa): void {
  const ws = wb.addWorksheet(HOJA_DETALLE);
  const cabeceras = [
    "Fecha",
    "Día",
    "Hora",
    "Sucursal",
    "Pedido",
    "Estado",
    "Forma de pago",
    "Entrega",
    "Semana liquidada",
    "Venta bruta",
    "Tus promos",
    "Desc. PedidosYa a cobrar",
    "Venta neta",
    "Cobrado en efectivo",
    "Comisión",
    "Cargo Plus",
    "Tarifa pago online",
    "IVA",
    "Reclamos",
    "Lo que te queda",
    "A depositar",
    "$ cancelado",
    "Artículos",
  ];
  filaCabecera(ws, 1, cabeceras, PALETA);
  ws.getRow(1).height = 30;
  let fila = 2;
  for (const d of a.detalle) {
    const v: (string | number | Date | null)[] = [
      fechaExcel(d.fecha),
      d.diaSemana,
      d.hora,
      d.sucursal,
      d.nro,
      d.estado,
      d.formaPago,
      d.entrega,
      d.periodo,
      d.bruto,
      d.promos,
      d.descuentoPeya,
      d.neta,
      d.efectivo,
      d.comision,
      d.plus,
      d.tarifaOnline,
      d.iva,
      d.reclamo,
      d.queda,
      d.aDepositar,
      d.cancelado,
      d.articulos,
    ];
    v.forEach((valor, j) => {
      const celda = ws.getCell(fila, j + 1);
      celda.value = valor;
      celda.font = fuentes.normal;
      if (fila % 2 === 1) celda.fill = relleno(GRIS_ALT);
    });
    formatos(ws, fila, fila, Object.fromEntries([1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((c) => [c, c === 1 ? FMT_FECHA : FMT_PESOS])));
    fila++;
  }
  anchos(ws, [12, 11, 7, 24, 15, 11, 15, 18, 16, 14, 12, 15, 14, 15, 13, 12, 14, 12, 12, 15, 14, 12, 48]);
  congelar(ws, 1, 1);
  autofiltro(ws, 1, 1, Math.max(fila - 1, 1), cabeceras.length);
}
