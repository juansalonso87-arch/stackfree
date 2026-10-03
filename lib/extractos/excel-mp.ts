/**
 * Excel del análisis de cobros de Mercado Pago (7 hojas). Los resúmenes usan
 * SUMIFS / COUNTIFS contra "Detalle Cobros": si el usuario filtra o corrige
 * algo ahí, los totales se recalculan solos.
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
  libroABlob,
  refHoja,
  relleno,
  FMT_ENT,
  FMT_FECHA,
  FMT_FECHAHORA,
  FMT_HORA,
  FMT_PCT,
  FMT_PESOS,
  type Paleta,
} from "./excel";
import {
  cajasConNombre,
  hayVentasEnCuotas,
  localesConNombre,
  ordenHorasDelTurno,
  porCanal,
  porDiaDeTurno,
  porTarjeta,
  resumenMensual,
  type AnalisisMercadoPago,
} from "./mercadopago";

const PALETA: Paleta = { principal: "00437A", total: "D6E4F0" };
const AMARILLO = "FFF2CC";
const GRIS_ALT = "F2F2F2";
const HOJA_DETALLE = "Detalle Cobros";

/** Columnas del Detalle (todas las fórmulas dependen de este orden). */
const COL = { momento: "A", diaTurno: "B", diaSemana: "C", hora: "D", periodo: "E", medio: "F", tipo: "G", bruto: "H", comision: "I", otras: "J", retenc: "K", neto: "L", nro: "M", devuelto: "N", local: "O", canal: "P", liberacion: "Q", diasLib: "R", marca: "S", cuotas: "T", caja: "U" };

/** Letra de la columna n (1 = A). Alcanza para las hojas de resumen, que no pasan de la Z. */
function letra(n: number): string {
  return String.fromCharCode(64 + n);
}

/** "1 pago", "3 cuotas": se ve como texto pero la celda sigue siendo el número, así COUNTIFS lo encuentra. */
const FMT_CUOTAS = '[=1]"1 pago";0" cuotas"';

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

export async function generarExcelMercadoPago(a: AnalisisMercadoPago): Promise<Blob> {
  const wb = await crearLibro();
  const fin = a.cobros.length + 1;
  // Si el reporte trae locales, un cobro sin local va como "Sin local" también en
  // el Detalle: si no, las fórmulas de la hoja Por Local no lo encuentran.
  const hayLocales = localesConNombre(a.cobros).length > 0;
  // Lo mismo con las cajas.
  const hayCajas = cajasConNombre(a.cobros).length > 0;
  const subtitulo =
    `Turnos del ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${a.cobros.length.toLocaleString("es-AR")} cobros  |  ` +
    `Generado: ${formatearFecha(new Date())}`;
  const hc = String(a.horaCorte).padStart(2, "0");

  /* ---------------- Cobros por Día ---------------- */
  {
    const ws = wb.addWorksheet("Cobros por Día");
    const cab = ["Día de turno", "Día", "Cobros", "Bruto", "Neto recibido", "Ticket promedio", "% s/total", "Primer cobro", "Último cobro"];
    encabezadoHoja(
      ws,
      "Cobros por día de turno",
      `${subtitulo}  |  Corte de turno: ${hc}:00 (los cobros de 00:00 a ${String(a.horaCorte - 1).padStart(2, "0")}:59 van al día anterior)`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rDia = rango(COL.diaTurno, fin);
    const rBruto = rango(COL.bruto, fin);
    const rNeto = rango(COL.neto, fin);
    let f = fc + 1;
    const primera = f;
    for (const d of porDiaDeTurno(a.cobros)) {
      ws.getCell(f, 1).value = fechaExcel(d.dia);
      ws.getCell(f, 2).value = d.diaSemana;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${rDia},$A${f})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rBruto},${rDia},$A${f})`);
      ws.getCell(f, 5).value = formula(`SUMIFS(${rNeto},${rDia},$A${f})`);
      ws.getCell(f, 6).value = formula(`IFERROR(D${f}/C${f},"")`);
      ws.getCell(f, 8).value = fechaExcel(d.primero);
      ws.getCell(f, 9).value = fechaExcel(d.ultimo);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["C", "D", "E"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`F${total}`).value = formula(`IFERROR(D${total}/C${total},"")`);
    for (let r = primera; r <= ultima; r++) ws.getCell(r, 7).value = formula(`IFERROR(D${r}/$D$${total},"")`);
    ws.getCell(total, 7).value = formula(`IFERROR(SUM(G${primera}:G${ultima}),"")`);
    for (let r = primera; r <= total; r++) {
      const finde = ["Sábado", "Domingo"].includes(String(ws.getCell(r, 2).value));
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, finde ? AMARILLO : undefined);
      ws.getCell(r, 1).numFmt = FMT_FECHA;
      ws.getCell(r, 3).numFmt = FMT_ENT;
      for (const c of [4, 5, 6]) ws.getCell(r, c).numFmt = FMT_PESOS;
      ws.getCell(r, 7).numFmt = FMT_PCT;
      for (const c of [8, 9]) ws.getCell(r, c).numFmt = FMT_HORA;
    }
    anchos(ws, [14, 12, 10, 17, 17, 16, 11, 12, 12]);
    congelar(ws, fc);
    autofiltro(ws, fc, 1, ultima, cab.length);
  }

  /* ---------------- Cobros por Hora ---------------- */
  {
    const ws = wb.addWorksheet("Cobros por Hora");
    const cab = ["Hora", "Cobros", "Bruto", "% s/total", "Ticket promedio"];
    encabezadoHoja(
      ws,
      "Cobros por hora del turno",
      `${subtitulo}  |  El listado arranca a las ${hc}:00; las horas del final son la madrugada del día siguiente`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rHora = rango(COL.hora, fin);
    const rBruto = rango(COL.bruto, fin);
    const presentes = new Set(a.cobros.map((c) => c.hora));
    let f = fc + 1;
    const primera = f;
    for (const hora of ordenHorasDelTurno(a.horaCorte)) {
      if (!presentes.has(hora)) continue;
      const hh = String(hora).padStart(2, "0");
      ws.getCell(f, 1).value = `${hh}:00 a ${hh}:59${hora < a.horaCorte ? "  (madrugada)" : ""}`;
      ws.getCell(f, 2).value = formula(`COUNTIFS(${rHora},${hora})`);
      ws.getCell(f, 3).value = formula(`SUMIFS(${rBruto},${rHora},${hora})`);
      ws.getCell(f, 5).value = formula(`IFERROR(C${f}/B${f},"")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["B", "C"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`E${total}`).value = formula(`IFERROR(C${total}/B${total},"")`);
    for (let r = primera; r <= ultima; r++) ws.getCell(r, 4).value = formula(`IFERROR(C${r}/$C$${total},"")`);
    ws.getCell(total, 4).value = formula(`IFERROR(SUM(D${primera}:D${ultima}),"")`);
    for (let r = primera; r <= total; r++) {
      const madrugada = String(ws.getCell(r, 1).value).includes("madrugada");
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, madrugada ? AMARILLO : undefined);
      ws.getCell(r, 2).numFmt = FMT_ENT;
      ws.getCell(r, 3).numFmt = FMT_PESOS;
      ws.getCell(r, 4).numFmt = FMT_PCT;
      ws.getCell(r, 5).numFmt = FMT_PESOS;
    }
    anchos(ws, [24, 10, 18, 11, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Resumen Mensual ---------------- */
  {
    const ws = wb.addWorksheet("Resumen Mensual");
    const cab = ["Período", "Cobros", "Bruto", "Comisión MP", "Otras tarifas", "Retenciones (est.)", "Neto recibido", "Total descontado", "% descontado", "Ticket promedio"];
    encabezadoHoja(ws, "Resumen mensual", subtitulo, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const cols: [string, number][] = [[COL.bruto, 3], [COL.comision, 4], [COL.otras, 5], [COL.retenc, 6], [COL.neto, 7]];
    let f = fc + 1;
    const primera = f;
    for (const m of resumenMensual(a.cobros)) {
      ws.getCell(f, 1).value = m.periodo;
      ws.getCell(f, 2).value = formula(`COUNTIFS(${rPer},$A${f})`);
      for (const [col, c] of cols) ws.getCell(f, c).value = formula(`SUMIFS(${rango(col, fin)},${rPer},$A${f})`);
      ws.getCell(f, 8).value = formula(`C${f}-G${f}`);
      ws.getCell(f, 9).value = formula(`IFERROR(H${f}/C${f},"")`);
      ws.getCell(f, 10).value = formula(`IFERROR(C${f}/B${f},"")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["B", "C", "D", "E", "F", "G", "H"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`I${total}`).value = formula(`IFERROR(H${total}/C${total},"")`);
    ws.getCell(`J${total}`).value = formula(`IFERROR(C${total}/B${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length);
      ws.getCell(r, 2).numFmt = FMT_ENT;
      for (const c of [3, 4, 5, 6, 7, 8, 10]) ws.getCell(r, c).numFmt = FMT_PESOS;
      ws.getCell(r, 9).numFmt = FMT_PCT;
    }
    anchos(ws, [12, 10, 18, 16, 15, 17, 18, 17, 13, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Canales de Cobro (si hay más de uno) ---------------- */
  if (porCanal(a.cobros).length > 1) {
    const ws = wb.addWorksheet("Canales de Cobro");
    const cab = ["Período", "Canal", "Cobros", "Bruto", "% del período", "Comisión MP", "% comisión", "Neto recibido"];
    encabezadoHoja(
      ws,
      "Cómo cobraste: QR, Point, link, transferencia al alias",
      `${subtitulo}  |  El canal es cómo le cobraste al cliente; el medio de pago (otra hoja) es con qué pagó él`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const rCanal = rango(COL.canal, fin);
    const rBruto = rango(COL.bruto, fin);
    const grupos = new Map<string, { periodo: string; canal: string; bruto: number }>();
    for (const c of a.cobros) {
      const k = `${c.periodo}|${c.canal}`;
      const g = grupos.get(k) ?? { periodo: c.periodo, canal: c.canal, bruto: 0 };
      g.bruto += c.bruto;
      grupos.set(k, g);
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || y.bruto - x.bruto);
    let f = fc + 1;
    const primera = f;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      ws.getCell(f, 2).value = g.canal;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${rPer},$A${f},${rCanal},$B${f})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rBruto},${rPer},$A${f},${rCanal},$B${f})`);
      ws.getCell(f, 5).value = formula(`IFERROR(D${f}/SUMIFS(${rBruto},${rPer},$A${f}),"")`);
      ws.getCell(f, 6).value = formula(`SUMIFS(${rango(COL.comision, fin)},${rPer},$A${f},${rCanal},$B${f})`);
      ws.getCell(f, 7).value = formula(`IFERROR(F${f}/D${f},"")`);
      ws.getCell(f, 8).value = formula(`SUMIFS(${rango(COL.neto, fin)},${rPer},$A${f},${rCanal},$B${f})`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["C", "D", "F", "H"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`G${total}`).value = formula(`IFERROR(F${total}/D${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
      ws.getCell(r, 3).numFmt = FMT_ENT;
      ws.getCell(r, 4).numFmt = FMT_PESOS;
      ws.getCell(r, 5).numFmt = FMT_PCT;
      ws.getCell(r, 6).numFmt = FMT_PESOS;
      ws.getCell(r, 7).numFmt = FMT_PCT;
      ws.getCell(r, 8).numFmt = FMT_PESOS;
    }
    anchos(ws, [12, 32, 10, 18, 14, 15, 12, 18]);
    congelar(ws, fc);
  }

  /* ---------------- Medios de Pago ---------------- */
  {
    const ws = wb.addWorksheet("Medios de Pago");
    const cab = ["Período", "Medio de pago", "Cobros", "Bruto", "% del período", "Ticket promedio"];
    encabezadoHoja(ws, "Participación por medio de pago", subtitulo, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const rMedio = rango(COL.medio, fin);
    const rBruto = rango(COL.bruto, fin);
    const grupos = new Map<string, { periodo: string; medio: string; bruto: number }>();
    for (const c of a.cobros) {
      const k = `${c.periodo}|${c.medioPago}`;
      const g = grupos.get(k) ?? { periodo: c.periodo, medio: c.medioPago, bruto: 0 };
      g.bruto += c.bruto;
      grupos.set(k, g);
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || y.bruto - x.bruto);
    let f = fc + 1;
    const primera = f;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      ws.getCell(f, 2).value = g.medio;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${rPer},$A${f},${rMedio},$B${f})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rBruto},${rPer},$A${f},${rMedio},$B${f})`);
      ws.getCell(f, 5).value = formula(`IFERROR(D${f}/SUMIFS(${rBruto},${rPer},$A${f}),"")`);
      ws.getCell(f, 6).value = formula(`IFERROR(D${f}/C${f},"")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["C", "D"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`F${total}`).value = formula(`IFERROR(D${total}/C${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
      ws.getCell(r, 3).numFmt = FMT_ENT;
      ws.getCell(r, 4).numFmt = FMT_PESOS;
      ws.getCell(r, 5).numFmt = FMT_PCT;
      ws.getCell(r, 6).numFmt = FMT_PESOS;
    }
    anchos(ws, [12, 34, 10, 18, 14, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Tarjetas (si el reporte trae la marca) ---------------- */
  if (porTarjeta(a.cobros).length > 0) {
    const ws = wb.addWorksheet("Tarjetas");
    const cab = ["Período", "Tipo", "Marca", "Cobros", "Bruto", "% de lo cobrado con tarjeta", "Comisión MP", "% comisión", "Ticket promedio", "En cuotas"];
    encabezadoHoja(
      ws,
      "Cuánto te cobra Mercado Pago por cada tarjeta",
      `${subtitulo}  |  Solo los cobros con tarjeta. La comisión ya incluye el IVA`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const rMedio = rango(COL.medio, fin);
    const rMarca = rango(COL.marca, fin);
    const criterios = (f: number) => `${rPer},$A${f},${rMedio},$B${f},${rMarca},$C${f}`;
    const grupos = new Map<string, { periodo: string; medio: string; marca: string; bruto: number }>();
    for (const c of a.cobros) {
      if (!c.marca) continue;
      const k = `${c.periodo}|${c.medioPago}|${c.marca}`;
      const g = grupos.get(k) ?? { periodo: c.periodo, medio: c.medioPago, marca: c.marca, bruto: 0 };
      g.bruto += c.bruto;
      grupos.set(k, g);
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || y.bruto - x.bruto);
    const primera = fc + 1;
    const ultima = primera + orden.length - 1;
    let f = primera;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      ws.getCell(f, 2).value = g.medio;
      ws.getCell(f, 3).value = g.marca;
      ws.getCell(f, 4).value = formula(`COUNTIFS(${criterios(f)})`);
      ws.getCell(f, 5).value = formula(`SUMIFS(${rango(COL.bruto, fin)},${criterios(f)})`);
      // Sobre lo cobrado con tarjeta en el mismo período: las filas de esta misma hoja.
      ws.getCell(f, 6).value = formula(`IFERROR(E${f}/SUMIFS($E$${primera}:$E$${ultima},$A$${primera}:$A$${ultima},$A${f}),"")`);
      ws.getCell(f, 7).value = formula(`SUMIFS(${rango(COL.comision, fin)},${criterios(f)})`);
      ws.getCell(f, 8).value = formula(`IFERROR(G${f}/E${f},"")`);
      ws.getCell(f, 9).value = formula(`IFERROR(E${f}/D${f},"")`);
      ws.getCell(f, 10).value = formula(`COUNTIFS(${criterios(f)},${rango(COL.cuotas, fin)},">1")`);
      f++;
    }
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["D", "E", "G", "J"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`H${total}`).value = formula(`IFERROR(G${total}/E${total},"")`);
    ws.getCell(`I${total}`).value = formula(`IFERROR(E${total}/D${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
      ws.getCell(r, 4).numFmt = FMT_ENT;
      ws.getCell(r, 5).numFmt = FMT_PESOS;
      ws.getCell(r, 6).numFmt = FMT_PCT;
      ws.getCell(r, 7).numFmt = FMT_PESOS;
      ws.getCell(r, 8).numFmt = FMT_PCT;
      ws.getCell(r, 9).numFmt = FMT_PESOS;
      ws.getCell(r, 10).numFmt = FMT_ENT;
    }
    anchos(ws, [12, 20, 18, 10, 18, 16, 15, 12, 16, 11]);
    congelar(ws, fc);
  }

  /* ---------------- Cuotas (si hubo ventas en más de un pago) ---------------- */
  if (hayVentasEnCuotas(a.cobros)) {
    const ws = wb.addWorksheet("Cuotas");
    const cab = ["Período", "Cuotas", "Cobros", "Bruto", "% del período", "Comisión MP", "% comisión", "Otras tarifas", "% otras tarifas"];
    encabezadoHoja(
      ws,
      "Ventas en un pago y en cuotas",
      `${subtitulo}  |  Solo tarjeta de crédito y Mercado Crédito, los únicos medios que se pueden pagar en cuotas. Si ofrecés cuotas sin interés, lo que Mercado Pago te cobra por eso va en "Otras tarifas"`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const rCuotas = rango(COL.cuotas, fin);
    const criterios = (f: number) => `${rPer},$A${f},${rCuotas},$B${f}`;
    const grupos = new Map<string, { periodo: string; cuotas: number }>();
    for (const c of a.cobros) {
      if (c.cuotas === null) continue;
      grupos.set(`${c.periodo}|${c.cuotas}`, { periodo: c.periodo, cuotas: c.cuotas });
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || x.cuotas - y.cuotas);
    const primera = fc + 1;
    const ultima = primera + orden.length - 1;
    let f = primera;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      ws.getCell(f, 2).value = g.cuotas;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${criterios(f)})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rango(COL.bruto, fin)},${criterios(f)})`);
      ws.getCell(f, 5).value = formula(`IFERROR(D${f}/SUMIFS($D$${primera}:$D$${ultima},$A$${primera}:$A$${ultima},$A${f}),"")`);
      ws.getCell(f, 6).value = formula(`SUMIFS(${rango(COL.comision, fin)},${criterios(f)})`);
      ws.getCell(f, 7).value = formula(`IFERROR(F${f}/D${f},"")`);
      ws.getCell(f, 8).value = formula(`SUMIFS(${rango(COL.otras, fin)},${criterios(f)})`);
      ws.getCell(f, 9).value = formula(`IFERROR(H${f}/D${f},"")`);
      f++;
    }
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["C", "D", "F", "H"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`G${total}`).value = formula(`IFERROR(F${total}/D${total},"")`);
    ws.getCell(`I${total}`).value = formula(`IFERROR(H${total}/D${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
      ws.getCell(r, 2).numFmt = FMT_CUOTAS;
      ws.getCell(r, 3).numFmt = FMT_ENT;
      ws.getCell(r, 4).numFmt = FMT_PESOS;
      ws.getCell(r, 5).numFmt = FMT_PCT;
      ws.getCell(r, 6).numFmt = FMT_PESOS;
      ws.getCell(r, 7).numFmt = FMT_PCT;
      ws.getCell(r, 8).numFmt = FMT_PESOS;
      ws.getCell(r, 9).numFmt = FMT_PCT;
    }
    anchos(ws, [12, 11, 10, 18, 14, 15, 12, 15, 14]);
    congelar(ws, fc);
  }

  /* ---------------- Por Local (si hay más de uno) ---------------- */
  if (localesConNombre(a.cobros).length > 1) {
    const ws = wb.addWorksheet("Por Local");
    const cab = ["Período", "Local", "Cobros", "Bruto", "% del período", "Neto recibido", "Ticket promedio"];
    encabezadoHoja(ws, "Cobros por local / sucursal", subtitulo, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const rLocal = rango(COL.local, fin);
    const rBruto = rango(COL.bruto, fin);
    const rNeto = rango(COL.neto, fin);
    const grupos = new Map<string, { periodo: string; local: string; bruto: number }>();
    for (const c of a.cobros) {
      const local = c.local || "Sin local";
      const k = `${c.periodo}|${local}`;
      const g = grupos.get(k) ?? { periodo: c.periodo, local, bruto: 0 };
      g.bruto += c.bruto;
      grupos.set(k, g);
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || y.bruto - x.bruto);
    let f = fc + 1;
    const primera = f;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      ws.getCell(f, 2).value = g.local;
      ws.getCell(f, 3).value = formula(`COUNTIFS(${rPer},$A${f},${rLocal},$B${f})`);
      ws.getCell(f, 4).value = formula(`SUMIFS(${rBruto},${rPer},$A${f},${rLocal},$B${f})`);
      ws.getCell(f, 5).value = formula(`IFERROR(D${f}/SUMIFS(${rBruto},${rPer},$A${f}),"")`);
      ws.getCell(f, 6).value = formula(`SUMIFS(${rNeto},${rPer},$A${f},${rLocal},$B${f})`);
      ws.getCell(f, 7).value = formula(`IFERROR(D${f}/C${f},"")`);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["C", "D", "F"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(`G${total}`).value = formula(`IFERROR(D${total}/C${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
      ws.getCell(r, 3).numFmt = FMT_ENT;
      ws.getCell(r, 4).numFmt = FMT_PESOS;
      ws.getCell(r, 5).numFmt = FMT_PCT;
      ws.getCell(r, 6).numFmt = FMT_PESOS;
      ws.getCell(r, 7).numFmt = FMT_PESOS;
    }
    anchos(ws, [12, 30, 10, 18, 14, 18, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Por Caja (si hay más de una) ---------------- */
  if (cajasConNombre(a.cobros).length > 1) {
    const ws = wb.addWorksheet("Por Caja");
    // Con varios locales, la caja va con su local: dos locales pueden tener una "Caja 1".
    const conLocal = localesConNombre(a.cobros).length > 1;
    const o = conLocal ? 1 : 0;
    const cab = ["Período", ...(conLocal ? ["Local"] : []), "Caja", "Cobros", "Bruto", "% del período", "Neto recibido", "Ticket promedio"];
    encabezadoHoja(ws, "Cobros por caja", subtitulo, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const L = { caja: letra(2 + o), cobros: letra(3 + o), bruto: letra(4 + o), neto: letra(6 + o) };
    const criterios = (f: number) =>
      `${rPer},$A${f},${conLocal ? `${rango(COL.local, fin)},$B${f},` : ""}${rango(COL.caja, fin)},$${L.caja}${f}`;
    const grupos = new Map<string, { periodo: string; local: string; caja: string; bruto: number }>();
    for (const c of a.cobros) {
      // Los mismos textos que escribe el Detalle, si no las fórmulas no los encuentran.
      const local = c.local || "Sin local";
      const caja = c.caja || "Sin caja";
      const k = `${c.periodo}|${conLocal ? local : ""}|${caja}`;
      const g = grupos.get(k) ?? { periodo: c.periodo, local, caja, bruto: 0 };
      g.bruto += c.bruto;
      grupos.set(k, g);
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || y.bruto - x.bruto);
    const primera = fc + 1;
    const ultima = primera + orden.length - 1;
    let f = primera;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      if (conLocal) ws.getCell(f, 2).value = g.local;
      ws.getCell(f, 2 + o).value = g.caja;
      ws.getCell(f, 3 + o).value = formula(`COUNTIFS(${criterios(f)})`);
      ws.getCell(f, 4 + o).value = formula(`SUMIFS(${rango(COL.bruto, fin)},${criterios(f)})`);
      ws.getCell(f, 5 + o).value = formula(
        `IFERROR(${L.bruto}${f}/SUMIFS($${L.bruto}$${primera}:$${L.bruto}$${ultima},$A$${primera}:$A$${ultima},$A${f}),"")`,
      );
      ws.getCell(f, 6 + o).value = formula(`SUMIFS(${rango(COL.neto, fin)},${criterios(f)})`);
      ws.getCell(f, 7 + o).value = formula(`IFERROR(${L.bruto}${f}/${L.cobros}${f},"")`);
      f++;
    }
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of [L.cobros, L.bruto, L.neto]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    ws.getCell(total, 7 + o).value = formula(`IFERROR(${L.bruto}${total}/${L.cobros}${total},"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length, (r - primera) % 2 === 1 ? GRIS_ALT : undefined);
      ws.getCell(r, 3 + o).numFmt = FMT_ENT;
      ws.getCell(r, 4 + o).numFmt = FMT_PESOS;
      ws.getCell(r, 5 + o).numFmt = FMT_PCT;
      ws.getCell(r, 6 + o).numFmt = FMT_PESOS;
      ws.getCell(r, 7 + o).numFmt = FMT_PESOS;
    }
    anchos(ws, [12, ...(conLocal ? [26] : []), 28, 10, 18, 14, 18, 16]);
    congelar(ws, fc);
  }

  /* ---------------- Tarifas e Impuestos ---------------- */
  {
    const ws = wb.addWorksheet("Tarifas e Impuestos");
    const cab = ["Período", "Concepto", "Monto", "% s/bruto"];
    encabezadoHoja(
      ws,
      "Tarifas, comisiones y retenciones",
      `${subtitulo}  |  'Retenciones no discriminadas' es la diferencia entre bruto − tarifas explícitas − neto acreditado (suele ser IIBB): conviene validarla con contaduría. En las transferencias recibidas (cobro por alias/CVU) no hay comisión, pero esta retención se aplica igual`,
      cab.length,
      PALETA,
    );
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const rPer = rango(COL.periodo, fin);
    const rBruto = rango(COL.bruto, fin);
    const conceptos: [string, string][] = [
      ["Comisión Mercado Pago", COL.comision],
      ["Otras tarifas (envío, plataforma, financiación)", COL.otras],
      ["Retenciones no discriminadas (estimado)", COL.retenc],
    ];
    let f = fc + 1;
    const primera = f;
    for (const m of resumenMensual(a.cobros)) {
      for (const [etiqueta, col] of conceptos) {
        ws.getCell(f, 1).value = m.periodo;
        ws.getCell(f, 2).value = etiqueta;
        ws.getCell(f, 3).value = formula(`SUMIFS(${rango(col, fin)},${rPer},$A${f})`);
        ws.getCell(f, 4).value = formula(`IFERROR(C${f}/SUMIFS(${rBruto},${rPer},$A${f}),"")`);
        f++;
      }
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    ws.getCell(`C${total}`).value = formula(`SUM(C${primera}:C${ultima})`);
    ws.getCell(`D${total}`).value = formula(`IFERROR(C${total}/SUM(${rBruto}),"")`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length);
      ws.getCell(r, 3).numFmt = FMT_PESOS;
      ws.getCell(r, 4).numFmt = FMT_PCT;
    }
    anchos(ws, [12, 48, 18, 13]);
    congelar(ws, fc);
  }

  /* ---------------- No Concretadas ---------------- */
  if (a.noConcretadas.length > 0) {
    const ws = wb.addWorksheet("No Concretadas");
    const cab = ["Período", "Motivo", "Cantidad", "Monto no cobrado"];
    encabezadoHoja(ws, "Cobros rechazados, cancelados, devueltos y pendientes", `${subtitulo}  |  No son facturación, pero sirven como alerta operativa`, cab.length, PALETA);
    const fc = 4;
    filaCabecera(ws, fc, cab, PALETA);
    const grupos = new Map<string, { periodo: string; motivo: string; cantidad: number; monto: number }>();
    for (const n of a.noConcretadas) {
      const k = `${n.periodo}|${n.motivo}`;
      const g = grupos.get(k) ?? { periodo: n.periodo, motivo: n.motivo, cantidad: 0, monto: 0 };
      g.cantidad++;
      g.monto += n.bruto;
      grupos.set(k, g);
    }
    const orden = [...grupos.values()].sort((x, y) => x.periodo.localeCompare(y.periodo) || y.monto - x.monto);
    let f = fc + 1;
    const primera = f;
    for (const g of orden) {
      ws.getCell(f, 1).value = g.periodo;
      ws.getCell(f, 2).value = g.motivo;
      ws.getCell(f, 3).value = g.cantidad;
      ws.getCell(f, 4).value = round2(g.monto);
      f++;
    }
    const ultima = f - 1;
    const total = f;
    ws.getCell(total, 1).value = "TOTAL";
    for (const col of ["C", "D"]) ws.getCell(`${col}${total}`).value = formula(`SUM(${col}${primera}:${col}${ultima})`);
    for (let r = primera; r <= total; r++) {
      if (r === total) estiloTotal(ws, r, cab.length, PALETA);
      else filaNormal(ws, r, cab.length);
      ws.getCell(r, 3).numFmt = FMT_ENT;
      ws.getCell(r, 4).numFmt = FMT_PESOS;
    }
    anchos(ws, [12, 46, 12, 20]);
    congelar(ws, fc);
  }

  /* ---------------- Detalle Cobros ---------------- */
  {
    const ws = wb.addWorksheet(HOJA_DETALLE);
    const cab = ["Fecha y hora", "Día de turno", "Día", "Hora", "Período", "Medio de pago", "Tipo de operación", "Bruto", "Comisión MP", "Otras tarifas", "Retenciones (est.)", "Neto recibido", "Nº operación", "Devuelto", "Local", "Canal de cobro", "Liberación del dinero", "Días hasta liberar", "Marca de tarjeta", "Cuotas", "Caja"];
    filaCabecera(ws, 1, cab, PALETA);
    a.cobros.forEach((c, i) => {
      const f = i + 2;
      const valores: ExcelJS.CellValue[] = [
        fechaExcel(c.momento),
        fechaExcel(c.diaTurno),
        c.diaSemana,
        c.hora,
        c.periodo,
        c.medioPago,
        c.tipoOperacion,
        c.bruto,
        c.comisionMp,
        c.otrasTarifas,
        c.retenciones,
        c.neto,
        c.nroOperacion,
        c.devuelto,
        c.local || (hayLocales ? "Sin local" : ""),
        c.canal,
        c.liberacion ? fechaExcel(c.liberacion) : "",
        c.diasLiberacion ?? "",
        c.marca,
        c.cuotas ?? "",
        c.caja || (hayCajas ? "Sin caja" : ""),
      ];
      valores.forEach((v, j) => {
        const celda = ws.getCell(f, j + 1);
        celda.value = v;
        celda.font = fuentes.normal;
      });
      ws.getCell(f, 1).numFmt = FMT_FECHAHORA;
      ws.getCell(f, 2).numFmt = FMT_FECHA;
      for (const c of [8, 9, 10, 11, 12, 14]) ws.getCell(f, c).numFmt = FMT_PESOS;
      ws.getCell(f, 17).numFmt = FMT_FECHA;
      ws.getCell(f, 18).numFmt = FMT_ENT;
      ws.getCell(f, 20).numFmt = FMT_ENT;
    });
    anchos(ws, [18, 13, 11, 7, 10, 34, 18, 15, 14, 14, 16, 15, 16, 13, 24, 28, 14, 10, 18, 8, 24]);
    congelar(ws, 1);
    autofiltro(ws, 1, 1, fin, cab.length);
  }

  return libroABlob(wb);
}
