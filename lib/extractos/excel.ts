/**
 * Escritura del Excel de resultados con ExcelJS (MIT), en el navegador.
 * Reproduce las hojas de los scripts Python originales: los resúmenes usan
 * fórmulas SUMIFS / COUNTIFS contra la hoja "Detalle", así que si el usuario
 * filtra o corrige algo ahí, los totales se recalculan solos al abrir el
 * archivo en Excel, LibreOffice o Google Sheets.
 */

import type ExcelJS from "exceljs";
import { CATEGORIA_DEFECTO, type AnalisisExtracto, type Control, type DiagnosticoConcepto, type Movimiento } from "./tipos";
import { claveDia, formatearFecha, soloDia } from "./texto";
import { siteConfig } from "@/lib/site-config";

/* ------------------------------------------------------------------ */
/* Estilos                                                              */
/* ------------------------------------------------------------------ */

export interface Paleta {
  /** Color del título y de la fila de cabecera (hex sin #). */
  principal: string;
  /** Fondo de la fila TOTAL. */
  total: string;
}

const FUENTE = "Arial";
export const FMT_NUM = '#,##0.00;[Red]-#,##0.00;"-"';
export const FMT_PESOS = '"$" #,##0.00;[Red]-"$" #,##0.00;"-"';
export const FMT_PCT = '0.0%;-0.0%;"-"';
export const FMT_FECHA = "DD/MM/YYYY";
export const FMT_DIA = "DD/MM";
export const FMT_HORA = "HH:MM";
export const FMT_FECHAHORA = "DD/MM/YYYY HH:MM";
export const FMT_ENT = '#,##0;-#,##0;"-"';

const GRIS_ALT = "F2F2F2";
/** Separador para armar claves compuestas (no aparece en textos de banco). */
const SEP = String.fromCharCode(31);
const AMARILLO_ALERTA = "FFF2CC";
const VERDE_OK = "E2EFDA";
const ROJO_MAL = "FCE4E4";

type Hoja = ExcelJS.Worksheet;
type Celda = ExcelJS.Cell;

const argb = (hex: string) => ({ argb: `FF${hex.toUpperCase()}` });

export const fuentes = {
  titulo: (p: Paleta): Partial<ExcelJS.Font> => ({ name: FUENTE, size: 14, bold: true, color: argb(p.principal) }),
  subtitulo: { name: FUENTE, size: 9, italic: true, color: argb("595959") } as Partial<ExcelJS.Font>,
  cabecera: { name: FUENTE, size: 10, bold: true, color: argb("FFFFFF") } as Partial<ExcelJS.Font>,
  normal: { name: FUENTE, size: 10 } as Partial<ExcelJS.Font>,
  chica: { name: FUENTE, size: 9, color: argb("595959") } as Partial<ExcelJS.Font>,
  total: { name: FUENTE, size: 10, bold: true } as Partial<ExcelJS.Font>,
  ok: { name: FUENTE, size: 10, bold: true, color: argb("1E7B34") } as Partial<ExcelJS.Font>,
  mal: { name: FUENTE, size: 10, bold: true, color: argb("C00000") } as Partial<ExcelJS.Font>,
};

export function relleno(hex: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: argb(hex) };
}

const BORDE_TOP: Partial<ExcelJS.Borders> = { top: { style: "thin", color: argb("808080") } };

/** Letra de columna (1 → A, 27 → AA). */
export function letra(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Nombre de hoja listo para usar en una fórmula ('Detalle Cobros'!). */
export function refHoja(nombre: string): string {
  return /^[A-Za-z0-9_]+$/.test(nombre) ? nombre : `'${nombre.replace(/'/g, "''")}'`;
}

/* ------------------------------------------------------------------ */
/* Libro                                                                */
/* ------------------------------------------------------------------ */

export async function crearLibro(): Promise<ExcelJS.Workbook> {
  // ExcelJS pesa ~900 KB: se importa recién al generar el archivo.
  const mod = await import("exceljs");
  const Lib = (mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS);
  const wb = new Lib.Workbook();
  wb.creator = siteConfig.nombre;
  wb.created = new Date();
  // Las fórmulas no traen resultado guardado: que Excel las calcule al abrir.
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

export async function libroABlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ------------------------------------------------------------------ */
/* Piezas de hoja                                                       */
/* ------------------------------------------------------------------ */

export function encabezadoHoja(ws: Hoja, titulo: string, subtitulo: string, ancho: number, p: Paleta): void {
  ws.getCell("A1").value = titulo;
  ws.getCell("A1").font = fuentes.titulo(p);
  ws.mergeCells(1, 1, 1, Math.max(1, ancho));
  ws.getCell("A2").value = subtitulo;
  ws.getCell("A2").font = fuentes.subtitulo;
  ws.mergeCells(2, 1, 2, Math.max(1, ancho));
  ws.getRow(1).height = 20;
}

export function filaCabecera(ws: Hoja, fila: number, cabeceras: string[], p: Paleta): void {
  cabeceras.forEach((h, j) => {
    const c = ws.getCell(fila, j + 1);
    c.value = h;
    c.font = fuentes.cabecera;
    c.fill = relleno(p.principal);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

export function anchos(ws: Hoja, valores: number[]): void {
  valores.forEach((a, i) => {
    ws.getColumn(i + 1).width = a;
  });
}

export function congelar(ws: Hoja, filas: number, columnas = 0): void {
  ws.views = [{ state: "frozen", xSplit: columnas, ySplit: filas }];
}

export function autofiltro(ws: Hoja, filaDesde: number, colDesde: number, filaHasta: number, colHasta: number): void {
  ws.autoFilter = { from: { row: filaDesde, column: colDesde }, to: { row: Math.max(filaHasta, filaDesde), column: colHasta } };
}

/**
 * ExcelJS guarda las fechas en UTC: una medianoche local (Argentina, UTC−3)
 * quedaría como 03:00 en el Excel. Se reconstruye la fecha "tal cual se ve"
 * en UTC para que en la planilla aparezca 00:00 (y las comparaciones de
 * SUMIFS entre Detalle y cabeceras sigan siendo exactas).
 */
export function fechaExcel(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}

export function formula(texto: string): ExcelJS.CellFormulaValue {
  return { formula: texto, result: undefined };
}

/** Aplica fuente normal/total y relleno de fila alternada o total. */
export function estiloFila(
  ws: Hoja,
  fila: number,
  columnas: number,
  opciones: { total?: boolean; alterna?: boolean; alerta?: boolean } = {},
): void {
  for (let c = 1; c <= columnas; c++) {
    const celda = ws.getCell(fila, c);
    celda.font = opciones.total ? fuentes.total : fuentes.normal;
    if (opciones.total) {
      celda.fill = relleno(GRIS_ALT);
      celda.border = BORDE_TOP;
    } else if (opciones.alerta) {
      celda.fill = relleno(AMARILLO_ALERTA);
    } else if (opciones.alterna) {
      celda.fill = relleno(GRIS_ALT);
    }
  }
}

export function estiloTotal(ws: Hoja, fila: number, columnas: number, p: Paleta): void {
  for (let c = 1; c <= columnas; c++) {
    const celda = ws.getCell(fila, c);
    celda.font = fuentes.total;
    celda.fill = relleno(p.total);
    celda.border = BORDE_TOP;
  }
}

/* ------------------------------------------------------------------ */
/* Hoja Detalle configurable                                            */
/* ------------------------------------------------------------------ */

export interface ColumnaDetalle {
  /** Identificador estable para que los resúmenes encuentren la columna. */
  id: string;
  titulo: string;
  ancho: number;
  valor: (m: Movimiento) => Celda["value"];
  formato?: string;
}

export interface EsquemaDetalle {
  columnas: ColumnaDetalle[];
  /** Nombre de la hoja (por defecto "Detalle"). */
  nombre?: string;
}

export interface DetalleEscrito {
  nombre: string;
  /** Última fila con datos. */
  fin: number;
  /** Letra de cada columna por id. */
  col: Record<string, string>;
  /** Rango absoluto de una columna: Detalle!$E$2:$E$999 */
  rango: (id: string) => string;
}

/**
 * Calcula la geometría del Detalle (letras de columna y última fila) SIN
 * escribirlo, para que los resúmenes puedan crearse antes (el orden de las
 * hojas en el archivo es el orden de creación) y apuntar sus fórmulas a él.
 */
export function planificarDetalle(esquema: EsquemaDetalle, cantidad: number): DetalleEscrito {
  const nombre = esquema.nombre ?? "Detalle";
  const fin = Math.max(2, cantidad + 1);
  const col: Record<string, string> = {};
  esquema.columnas.forEach((c, j) => {
    col[c.id] = letra(j + 1);
  });
  const ref = refHoja(nombre);
  return { nombre, fin, col, rango: (id) => `${ref}!${col[id]}$2:${col[id]}${fin}` };
}

export function escribirDetalle(wb: ExcelJS.Workbook, movimientos: Movimiento[], esquema: EsquemaDetalle, p: Paleta): DetalleEscrito {
  const plan = planificarDetalle(esquema, movimientos.length);
  const ws = wb.addWorksheet(plan.nombre);
  const cols = esquema.columnas;
  filaCabecera(ws, 1, cols.map((c) => c.titulo), p);
  ws.getRow(1).height = 18;

  movimientos.forEach((m, i) => {
    const fila = i + 2;
    cols.forEach((c, j) => {
      const celda = ws.getCell(fila, j + 1);
      const v = c.valor(m);
      celda.value =
        v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v)) ? null : v instanceof Date ? fechaExcel(v) : v;
      celda.font = fuentes.normal;
      if (c.formato) celda.numFmt = c.formato;
    });
  });

  anchos(ws, cols.map((c) => c.ancho));
  congelar(ws, 1);
  autofiltro(ws, 1, 1, plan.fin, cols.length);
  return plan;
}

/* ------------------------------------------------------------------ */
/* Resumen (por concepto / por categoría) con fórmulas al Detalle        */
/* ------------------------------------------------------------------ */

export interface ClaveResumen {
  titulo: string;
  /** id de columna del Detalle contra la que se compara (criterio SUMIFS). */
  columna: string;
  ancho: number;
}

export interface ColumnaExtra {
  titulo: string;
  ancho: number;
  valor: (grupo: Movimiento[]) => Celda["value"];
  formato?: string;
  /** Sumar en la fila TOTAL. */
  sumar?: boolean;
}

export interface OpcionesResumen {
  nombreHoja: string;
  titulo: string;
  subtitulo: string;
  claves: ClaveResumen[];
  /** Columnas informativas entre las claves y las métricas (ej. Categoría, Variantes). */
  extras?: ColumnaExtra[];
  /** id de la columna del Detalle que indica la categoría (para pintar "Otros"). */
  columnaCategoria?: string;
  ordenarPor?: "neto" | "debitos";
}

export function escribirResumen(
  wb: ExcelJS.Workbook,
  movimientos: Movimiento[],
  det: DetalleEscrito,
  o: OpcionesResumen,
  p: Paleta,
): void {
  const ws = wb.addWorksheet(o.nombreHoja);
  const extras = o.extras ?? [];
  const cabeceras = [
    ...o.claves.map((k) => k.titulo),
    ...extras.map((e) => e.titulo),
    "Movimientos",
    "Débitos",
    "Créditos",
    "Neto",
    "% s/Débitos",
    "% s/Créditos",
  ];
  encabezadoHoja(ws, o.titulo, o.subtitulo, cabeceras.length, p);
  const fc = 4;
  filaCabecera(ws, fc, cabeceras, p);

  // Grupos únicos por la tupla de claves, ordenados por neto (o débitos) desc.
  const valorClave = (m: Movimiento, id: string) => String(det.col[id] ? obtenerPorId(m, id) : "");
  const grupos = new Map<string, Movimiento[]>();
  for (const m of movimientos) {
    const k = o.claves.map((c) => valorClave(m, c.columna)).join(SEP);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(m);
  }
  const orden = [...grupos.entries()].sort((a, b) => {
    const neto = (g: Movimiento[]) => g.reduce((s, m) => s + m.importe, 0);
    const deb = (g: Movimiento[]) => g.reduce((s, m) => s + m.debito, 0);
    return o.ordenarPor === "debitos" ? deb(b[1]) - deb(a[1]) : neto(b[1]) - neto(a[1]);
  });

  const nClaves = o.claves.length;
  const off = nClaves + extras.length;
  const cMov = off + 1;
  const cDeb = off + 2;
  const cCre = off + 3;
  const cNeto = off + 4;
  const cPdeb = off + 5;
  const cPcre = off + 6;

  let f = fc + 1;
  const primera = f;
  for (const [, grupo] of orden) {
    const ejemplo = grupo[0];
    const criterios = o.claves.map((k, j) => `${det.rango(k.columna)},$${letra(j + 1)}${f}`).join(",");
    o.claves.forEach((k, j) => {
      ws.getCell(f, j + 1).value = obtenerPorId(ejemplo, k.columna) as Celda["value"];
    });
    extras.forEach((e, j) => {
      const celda = ws.getCell(f, nClaves + j + 1);
      celda.value = e.valor(grupo);
      if (e.formato) celda.numFmt = e.formato;
    });
    ws.getCell(f, cMov).value = formula(`COUNTIFS(${criterios})`);
    ws.getCell(f, cDeb).value = formula(`SUMIFS(${det.rango("debito")},${criterios})`);
    ws.getCell(f, cCre).value = formula(`SUMIFS(${det.rango("credito")},${criterios})`);
    ws.getCell(f, cNeto).value = formula(`${letra(cCre)}${f}-${letra(cDeb)}${f}`);
    f++;
  }
  const ultima = f - 1;
  const total = f;

  ws.getCell(total, 1).value = "TOTAL";
  for (const c of [cMov, cDeb, cCre, cNeto]) {
    ws.getCell(total, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
  }
  extras.forEach((e, j) => {
    if (e.sumar) {
      const c = nClaves + j + 1;
      ws.getCell(total, c).value = formula(`SUM(${letra(c)}${primera}:${letra(c)}${ultima})`);
    }
  });
  for (let r = primera; r <= ultima; r++) {
    ws.getCell(r, cPdeb).value = formula(`IFERROR(${letra(cDeb)}${r}/$${letra(cDeb)}$${total},"")`);
    ws.getCell(r, cPcre).value = formula(`IFERROR(${letra(cCre)}${r}/$${letra(cCre)}$${total},"")`);
  }
  ws.getCell(total, cPdeb).value = formula(`IFERROR(SUM(${letra(cPdeb)}${primera}:${letra(cPdeb)}${ultima}),"")`);
  ws.getCell(total, cPcre).value = formula(`IFERROR(SUM(${letra(cPcre)}${primera}:${letra(cPcre)}${ultima}),"")`);

  // Índice de la columna que muestra la categoría en ESTA hoja (para pintar "Otros").
  const idxCategoria = o.columnaCategoria
    ? o.claves.findIndex((k) => k.columna === o.columnaCategoria) + 1 ||
      (extras.findIndex((e) => e.titulo === "Categoría") >= 0 ? nClaves + extras.findIndex((e) => e.titulo === "Categoría") + 1 : 0)
    : 0;

  for (let r = primera; r <= total; r++) {
    const esTotal = r === total;
    const sinCat = idxCategoria > 0 && ws.getCell(r, idxCategoria).value === CATEGORIA_DEFECTO;
    if (esTotal) estiloTotal(ws, r, cabeceras.length, p);
    else estiloFila(ws, r, cabeceras.length, { alerta: sinCat, alterna: !sinCat && (r - primera) % 2 === 1 });
    ws.getCell(r, cMov).numFmt = FMT_ENT;
    for (const c of [cDeb, cCre, cNeto]) ws.getCell(r, c).numFmt = FMT_NUM;
    for (const c of [cPdeb, cPcre]) ws.getCell(r, c).numFmt = FMT_PCT;
    extras.forEach((e, j) => {
      if (e.formato) ws.getCell(r, nClaves + j + 1).numFmt = e.formato;
    });
  }

  anchos(ws, [...o.claves.map((k) => k.ancho), ...extras.map((e) => e.ancho), 13, 17, 17, 17, 12, 12]);
  congelar(ws, fc);
  autofiltro(ws, fc, 1, ultima, cabeceras.length);
}

/** Lee un campo del movimiento por el id de columna del esquema. */
function obtenerPorId(m: Movimiento, id: string): unknown {
  switch (id) {
    case "fecha":
      return m.fecha;
    case "codigo":
      return m.codigo ?? "";
    case "concepto":
      return m.concepto;
    case "conceptoOriginal":
      return m.conceptoOriginal ?? m.concepto;
    case "categoria":
      return m.categoria;
    case "moneda":
      return m.moneda ?? "";
    case "debito":
      return m.debito;
    case "credito":
      return m.credito;
    case "importe":
      return m.importe;
    case "saldo":
      return m.saldo ?? null;
    case "comprobante":
      return m.comprobante ?? "";
    case "sucursal":
      return m.sucursal ?? "";
    case "cuenta":
      return m.cuenta ?? "";
    case "detalle":
      return m.detalle ?? "";
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Matriz concepto × día                                                */
/* ------------------------------------------------------------------ */

export function escribirPivot(
  wb: ExcelJS.Workbook,
  movimientos: Movimiento[],
  det: DetalleEscrito,
  o: { claves: ClaveResumen[]; subtitulo: string },
  p: Paleta,
): void {
  const dias = new Map<string, Date>();
  for (const m of movimientos) if (m.fecha) dias.set(claveDia(m.fecha), soloDia(m.fecha));
  const fechas = [...dias.values()].sort((a, b) => a.getTime() - b.getTime());
  if (fechas.length === 0) return;

  const grupos = new Map<string, Movimiento[]>();
  for (const m of movimientos) {
    const k = o.claves.map((c) => String(obtenerPorId(m, c.columna))).join(SEP);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(m);
  }
  const orden = [...grupos.values()].sort(
    (a, b) => b.reduce((s, m) => s + m.importe, 0) - a.reduce((s, m) => s + m.importe, 0),
  );

  const ws = wb.addWorksheet("Concepto x Día");
  const nClaves = o.claves.length;
  const totalCols = nClaves + fechas.length + 1;
  encabezadoHoja(ws, "Neto por concepto y día", o.subtitulo, totalCols, p);
  const fc = 4;
  o.claves.forEach((k, j) => {
    ws.getCell(fc, j + 1).value = k.titulo;
  });
  fechas.forEach((fecha, j) => {
    const c = ws.getCell(fc, nClaves + j + 1);
    c.value = fechaExcel(fecha);
    c.numFmt = FMT_DIA;
  });
  ws.getCell(fc, totalCols).value = "TOTAL";
  for (let j = 1; j <= totalCols; j++) {
    const c = ws.getCell(fc, j);
    c.font = fuentes.cabecera;
    c.fill = relleno(p.principal);
    c.alignment = { horizontal: "center", vertical: "middle" };
  }

  let f = fc + 1;
  const primera = f;
  for (const grupo of orden) {
    const ejemplo = grupo[0];
    o.claves.forEach((k, j) => {
      ws.getCell(f, j + 1).value = obtenerPorId(ejemplo, k.columna) as Celda["value"];
    });
    const criterios = o.claves.map((k, j) => `${det.rango(k.columna)},$${letra(j + 1)}${f}`).join(",");
    for (let j = 0; j < fechas.length; j++) {
      const c = nClaves + j + 1;
      ws.getCell(f, c).value = formula(`SUMIFS(${det.rango("importe")},${criterios},${det.rango("fecha")},${letra(c)}$${fc})`);
    }
    ws.getCell(f, totalCols).value = formula(`SUM(${letra(nClaves + 1)}${f}:${letra(totalCols - 1)}${f})`);
    f++;
  }
  const ultima = f - 1;
  const total = f;
  ws.getCell(total, 1).value = "TOTAL";
  for (let j = nClaves + 1; j <= totalCols; j++) {
    ws.getCell(total, j).value = formula(`SUM(${letra(j)}${primera}:${letra(j)}${ultima})`);
  }
  for (let r = primera; r <= total; r++) {
    if (r === total) estiloTotal(ws, r, totalCols, p);
    else estiloFila(ws, r, totalCols);
    for (let c = nClaves + 1; c <= totalCols; c++) ws.getCell(r, c).numFmt = FMT_NUM;
    ws.getCell(r, totalCols).font = fuentes.total;
  }
  anchos(ws, [...o.claves.map((k) => k.ancho), ...fechas.map(() => 15), 15]);
  congelar(ws, fc, nClaves);
}

/* ------------------------------------------------------------------ */
/* Hoja Control (Santander) y Diagnóstico (BBVA)                        */
/* ------------------------------------------------------------------ */

export function escribirControl(
  wb: ExcelJS.Workbook,
  a: AnalisisExtracto,
  det: DetalleEscrito,
  o: { subtitulo: string; recordatorio?: string; lineasDescartadas?: string[] },
  p: Paleta,
): void {
  const ws = wb.addWorksheet("Control");
  encabezadoHoja(ws, "Control del extracto", o.subtitulo, 6, p);

  let f = 4;
  const par = (fila: number, col: number, etiqueta: string, valor: Celda["value"]) => {
    ws.getCell(fila, col).value = etiqueta;
    ws.getCell(fila, col).font = fuentes.total;
    ws.getCell(fila, col + 1).value = valor;
    ws.getCell(fila, col + 1).font = fuentes.normal;
  };
  par(f, 1, "Cuenta", a.cuenta ?? "");
  par(f, 4, "CUIT", a.cuit ?? "");
  f++;
  par(f, 1, "Período", `${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}`);
  par(f, 4, "Movimientos", a.movimientos.length);
  f += 2;

  ws.getCell(f, 1).value = "Saldos";
  ws.getCell(f, 1).font = fuentes.titulo(p);
  f++;
  const filaInicial = f;
  const lineas: [string, Celda["value"]][] = [
    ["Saldo inicial", a.saldoInicial ?? 0],
    ["Débitos del período", formula(`-SUM(${det.rango("debito")})`)],
    ["Créditos del período", formula(`SUM(${det.rango("credito")})`)],
    ["Saldo final calculado", formula(`B${filaInicial}+B${filaInicial + 1}+B${filaInicial + 2}`)],
    ["Saldo final del extracto", a.saldoFinal ?? 0],
  ];
  for (const [etiqueta, valor] of lineas) {
    ws.getCell(f, 1).value = etiqueta;
    ws.getCell(f, 1).font = fuentes.normal;
    const c = ws.getCell(f, 2);
    c.value = valor;
    c.font = fuentes.normal;
    c.numFmt = FMT_NUM;
    f++;
  }
  ws.getCell(f, 1).value = "Diferencia";
  ws.getCell(f, 1).font = fuentes.total;
  const dif = ws.getCell(f, 2);
  dif.value = formula(`B${f - 2}-B${f - 1}`);
  dif.font = fuentes.total;
  dif.numFmt = FMT_NUM;
  f += 2;

  filaCabecera(ws, f, ["Grupo", "Control", "Calculado", "Declarado / esperado", "Diferencia", "Resultado"], p);
  f++;
  for (const c of a.controles) {
    ws.getCell(f, 1).value = c.grupo;
    ws.getCell(f, 1).font = fuentes.chica;
    ws.getCell(f, 2).value = c.control;
    ws.getCell(f, 2).font = fuentes.normal;
    const fmt = c.formato === "ent" ? FMT_ENT : FMT_NUM;
    for (const [col, v] of [
      [3, c.calculado],
      [4, c.declarado],
    ] as const) {
      const celda = ws.getCell(f, col);
      celda.value = v;
      celda.font = fuentes.normal;
      celda.numFmt = fmt;
    }
    const d = ws.getCell(f, 5);
    d.value = formula(`C${f}-D${f}`);
    d.font = fuentes.normal;
    d.numFmt = fmt;
    const r = ws.getCell(f, 6);
    r.value = c.ok ? "OK" : "REVISAR";
    r.font = c.ok ? fuentes.ok : fuentes.mal;
    r.fill = relleno(c.ok ? VERDE_OK : ROJO_MAL);
    r.alignment = { horizontal: "center" };
    f++;
  }

  if (o.lineasDescartadas && o.lineasDescartadas.length > 0) {
    f++;
    ws.getCell(f, 1).value = "Líneas descartadas por formato";
    ws.getCell(f, 1).font = fuentes.titulo(p);
    f++;
    for (const texto of o.lineasDescartadas) {
      ws.getCell(f, 2).value = texto;
      ws.getCell(f, 2).font = fuentes.chica;
      f++;
    }
  }
  if (o.recordatorio) {
    f++;
    ws.getCell(f, 1).value = "Recordatorio";
    ws.getCell(f, 1).font = fuentes.total;
    ws.getCell(f, 2).value = o.recordatorio;
    ws.getCell(f, 2).font = fuentes.chica;
  }
  anchos(ws, [26, 54, 22, 22, 16, 12]);
}

export function escribirDiagnostico(wb: ExcelJS.Workbook, diag: DiagnosticoConcepto[], subtitulo: string, p: Paleta): void {
  const ws = wb.addWorksheet("Diagnóstico Conceptos");
  const cabeceras = [
    "Concepto normalizado",
    "Categoría",
    "Variantes",
    "Movimientos",
    "Crédito",
    "Débito",
    "Neto",
    "Textos originales del banco",
    "Ejemplo de Detalle",
  ];
  encabezadoHoja(ws, "Diagnóstico de conceptos del banco", subtitulo, cabeceras.length, p);
  const fc = 4;
  filaCabecera(ws, fc, cabeceras, p);
  diag.forEach((d, i) => {
    const f = fc + 1 + i;
    const valores: Celda["value"][] = [
      d.concepto,
      d.categoria,
      d.variantes,
      d.movimientos,
      d.credito,
      d.debito,
      d.neto,
      d.textosOriginales,
      d.ejemploDetalle,
    ];
    valores.forEach((v, j) => {
      const c = ws.getCell(f, j + 1);
      c.value = v;
      c.font = j >= 7 ? fuentes.chica : fuentes.normal;
      c.alignment = { vertical: "top", wrapText: j >= 7 };
      if (d.categoria === CATEGORIA_DEFECTO) c.fill = relleno(AMARILLO_ALERTA);
    });
    ws.getCell(f, 3).numFmt = FMT_ENT;
    ws.getCell(f, 4).numFmt = FMT_ENT;
    for (const c of [5, 6, 7]) ws.getCell(f, c).numFmt = FMT_NUM;
  });
  anchos(ws, [40, 24, 10, 12, 15, 15, 15, 60, 40]);
  congelar(ws, fc);
  autofiltro(ws, fc, 1, fc + diag.length, cabeceras.length);
}

/* ------------------------------------------------------------------ */
/* Controles genéricos                                                  */
/* ------------------------------------------------------------------ */

export function control(
  grupo: string,
  texto: string,
  calculado: number,
  declarado: number,
  ok: boolean,
  formato: Control["formato"] = "num",
): Control {
  return { grupo, control: texto, calculado, declarado, ok, formato };
}
