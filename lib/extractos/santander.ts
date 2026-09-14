/**
 * Analizador del extracto de Banco Santander (Argentina).
 * Port de `python/Santander_analizador_extracto.py`.
 *
 * Solo lee el reporte "Cash Management Formato Excel" (Santander Office
 * Banking → Consultas → Extracto → Exportar). A pesar de la extensión .xls
 * es un archivo de texto separado por tabulaciones: una línea de cabecera
 * (CUIT / cuenta / fecha), una línea por movimiento (7 campos) y una línea
 * final con los totales de control del banco.
 */

import { CATEGORIA_DEFECTO, ErrorExtracto, type AnalisisExtracto, type Control, type Movimiento } from "./tipos";
import { aFecha, aNumero, aNumeroSantander, clasificarPorTexto, rangoFechas, sinAcentos, type ReglasCategoria } from "./texto";
import { arranqueDe, esExcelReal, leerTexto } from "./planilla";
import {
  control,
  crearLibro,
  escribirControl,
  escribirDetalle,
  escribirPivot,
  escribirResumen,
  libroABlob,
  planificarDetalle,
  FMT_FECHA,
  FMT_NUM,
  type EsquemaDetalle,
  type Paleta,
} from "./excel";
import { formatearFecha } from "./texto";

export const TIPO_REPORTE = "Cash Management Formato Excel";
const TOLERANCIA = 0.02;
const PALETA: Paleta = { principal: "A50E20", total: "F2DCDB" };

/**
 * Santander numera cada tipo de movimiento: el código es más confiable que
 * el texto. OJO con 1968 "Pago a proveedores": suena a egreso pero es la
 * liquidación que ENTRA desde la plataforma de delivery; por eso manda el
 * código y no la palabra.
 */
const CATEGORIAS_POR_CODIGO: Record<string, string> = {
  "2604": "Cobros con tarjeta",
  "1968": "Cobros de plataformas",
  "1970": "Cobros de plataformas",
  "0216": "Cobros de plataformas",
  "3410": "Transferencias recibidas",
  "1862": "Sueldos",
  "1153": "Sueldos",
  "4712": "Pagos AFIP / impuestos",
  "4719": "Pago de servicios",
  "4085": "Pago de servicios",
  "0824": "Transferencias enviadas",
  "2822": "Transferencias enviadas",
  "1252": "Transferencias enviadas",
  "4648": "Transferencias enviadas",
  "4713": "Transferencias enviadas",
  "2571": "Comisiones tarjeta",
  "2574": "Comisiones tarjeta",
  "2960": "Comisiones banco",
  "3489": "Comisiones banco",
  "0434": "Comisiones banco",
  "4633": "Impuesto al cheque",
  "4637": "Impuesto al cheque",
  "2010": "Retenciones ARBA / IIBB",
  "1628": "Retenciones ARBA / IIBB",
  "3254": "IVA y percepciones",
  "3253": "IVA y percepciones",
};

/** Respaldo por palabras clave para códigos que no están en la tabla. */
const CATEGORIAS_POR_TEXTO: ReglasCategoria = [
  ["Sueldos", ["HABER", "SUELDO", "JORNAL"]],
  ["Pagos AFIP / impuestos", ["AFIP", "INTERBANKING", "VEP"]],
  ["Impuesto al cheque", ["LEY 25.413", "LEY 25413"]],
  ["Retenciones ARBA / IIBB", ["ARBA", "IIBB", "INGRESOS BRUTOS", "SIRCREB"]],
  ["IVA y percepciones", ["IVA", "PERCEPCION", "RETENCION"]],
  ["Comisiones banco", ["COMISION", "MANTENIMIENTO", "SERVICIO DE CUENTA"]],
  ["Cobros con tarjeta", ["ACREDITACION A COMERCIO", "FISERV", "PAYWAY", "POSNET", "TARJETA"]],
  ["Transferencias recibidas", ["RECIBIDA", "RECIBIDO", "ACREDITACION"]],
  ["Pago de servicios", ["PAGO DE SERVICIOS", "DEBITO AUTOMATICO"]],
  ["Transferencias enviadas", ["TRANSFERENCIA", "TRANSF", "PAGO"]],
];

const MENSAJE_FORMATO =
  `El archivo no tiene el formato esperado. Esta herramienta solo lee el reporte "${TIPO_REPORTE}" ` +
  "(Santander Office Banking → Consultas → Extracto → Exportar). Aunque termine en .xls, ese reporte es un " +
  "archivo de texto: si lo abriste y lo guardaste con Excel, se rompe; descargalo de nuevo sin abrirlo.";

function clasificar(codigo: string, concepto: string): string {
  return CATEGORIAS_POR_CODIGO[codigo] ?? clasificarPorTexto(concepto, CATEGORIAS_POR_TEXTO, (t) => sinAcentos(t).toUpperCase());
}

interface Trailer {
  cantDebitos: number;
  sumaDebitos: number;
  cantCreditos: number;
  sumaCreditos: number;
}

interface Lectura {
  movimientos: Movimiento[];
  cuit: string;
  cuenta: string;
  trailer: Trailer | null;
  lineasArchivo: number;
  descartadas: string[];
  ordenDescendente: boolean;
}

async function leerArchivo(archivo: File): Promise<Lectura> {
  const arranque = await arranqueDe(archivo);
  if (esExcelReal(arranque)) {
    throw new ErrorExtracto(`${MENSAJE_FORMATO} (El archivo "${archivo.name}" es un Excel de verdad, no el reporte de texto.)`);
  }
  const texto = await leerTexto(archivo);
  if (texto.trimStart().startsWith("<")) {
    throw new ErrorExtracto(`${MENSAJE_FORMATO} (El archivo "${archivo.name}" es XML/HTML.)`);
  }
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 3) throw new ErrorExtracto(`${MENSAJE_FORMATO} (El archivo está vacío o casi.)`);

  const cab = lineas[0].split("\t");
  if (cab.length < 3 || !sinAcentos(cab[2]).toLowerCase().includes("extracto")) {
    throw new ErrorExtracto(`${MENSAJE_FORMATO} (La primera línea no es la cabecera del extracto.)`);
  }
  const cuit = cab[0].trim();
  const cuenta = (cab[1] ?? "").trim();

  // Trailer: cant y suma de débitos, cant y suma de créditos (formato argentino).
  let trailer: Trailer | null = null;
  let fin = lineas.length;
  const ultima = lineas[lineas.length - 1].split("\t");
  if (ultima.length === 4 || ultima.length === 5) {
    const cant = (s: string) => Number((s ?? "").replace(/\D/g, "") || 0);
    trailer = {
      cantDebitos: cant(ultima[0]),
      sumaDebitos: aNumero(ultima[1]),
      cantCreditos: cant(ultima[2]),
      sumaCreditos: aNumero(ultima[3]),
    };
    fin = lineas.length - 1;
  }

  const movimientos: Movimiento[] = [];
  const descartadas: string[] = [];
  for (let i = 1; i < fin; i++) {
    const campos = lineas[i].split("\t");
    if (campos.length !== 7) {
      descartadas.push(`línea ${i + 1}: ${lineas[i].slice(0, 80)}`);
      continue;
    }
    const [fecha, conceptoFull, importeTxt, comprobante, sucursal, saldoTxt, codigoTxt] = campos;
    const codigo = codigoTxt.trim();
    const sep = conceptoFull.indexOf(" - ");
    const concepto = (sep >= 0 ? conceptoFull.slice(0, sep) : conceptoFull).trim();
    const detalle = (sep >= 0 ? conceptoFull.slice(sep + 3) : "").trim().replace(/\s{2,}/g, " ");
    const importe = aNumeroSantander(importeTxt);
    movimientos.push({
      fecha: aFecha(fecha.trim()),
      codigo,
      concepto,
      detalle,
      importe,
      saldo: aNumeroSantander(saldoTxt),
      comprobante: comprobante.trim(),
      sucursal: sucursal.trim(),
      categoria: clasificar(codigo, concepto),
      debito: importe < 0 ? -importe : 0,
      credito: importe > 0 ? importe : 0,
    });
  }
  if (movimientos.length === 0) throw new ErrorExtracto(`${MENSAJE_FORMATO} (No encontré ninguna fila de movimiento.)`);

  const primera = movimientos[0].fecha;
  const ultimaF = movimientos[movimientos.length - 1].fecha;
  return {
    movimientos,
    cuit,
    cuenta,
    trailer,
    lineasArchivo: lineas.length,
    descartadas,
    ordenDescendente: !!(primera && ultimaF && movimientos.length > 1 && primera > ultimaF),
  };
}

export interface AnalisisSantander extends AnalisisExtracto {
  banco: "santander";
  descartadas: string[];
}

/** Analiza uno o varios extractos (varios meses juntos). */
export async function analizarSantander(archivos: File[]): Promise<AnalisisSantander> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  const lecturas: Lectura[] = [];
  for (const a of archivos) lecturas.push(await leerArchivo(a));

  const primera = lecturas[0];
  let movimientos = lecturas.flatMap((l) => l.movimientos);
  let trailer: Trailer | null = lecturas.every((l) => l.trailer)
    ? lecturas.reduce<Trailer>(
        (acc, l) => ({
          cantDebitos: acc.cantDebitos + l.trailer!.cantDebitos,
          sumaDebitos: acc.sumaDebitos + l.trailer!.sumaDebitos,
          cantCreditos: acc.cantCreditos + l.trailer!.cantCreditos,
          sumaCreditos: acc.sumaCreditos + l.trailer!.sumaCreditos,
        }),
        { cantDebitos: 0, sumaDebitos: 0, cantCreditos: 0, sumaCreditos: 0 },
      )
    : null;
  const lineasArchivo = lecturas.reduce((s, l) => s + l.lineasArchivo, 0);
  const descartadas = lecturas.flatMap((l) => l.descartadas);
  const avisos: string[] = [];

  if (!trailer) {
    avisos.push("El archivo no trae la línea final de totales del banco: se hacen los demás controles, pero se pierde el más fuerte.");
  }
  if (archivos.length > 1) {
    const antes = movimientos.length;
    const vistos = new Set<string>();
    movimientos = movimientos.filter((m) => {
      const k = [m.fecha?.getTime(), m.comprobante, m.importe, m.saldo].join("|");
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    if (antes - movimientos.length > 0) {
      avisos.push(`Se descartaron ${antes - movimientos.length} movimientos duplicados entre archivos.`);
      // Los totales del banco ya no coinciden con lo deduplicado.
      trailer = null;
    }
  }
  const ilegibles = movimientos.filter((m) => !m.fecha).length;
  if (ilegibles) avisos.push(`${ilegibles} fila(s) con fecha ilegible (se esperaba AAAAMMDD).`);
  if (descartadas.length) avisos.push(`${descartadas.length} línea(s) con un número de campos distinto de 7 (ver hoja Control).`);

  // --- controles ---
  const controles: Control[] = [];
  const deb = movimientos.filter((m) => m.importe < 0);
  const cre = movimientos.filter((m) => m.importe > 0);
  const sumaDeb = deb.reduce((s, m) => s + m.importe, 0);
  const sumaCre = cre.reduce((s, m) => s + m.importe, 0);
  if (trailer) {
    controles.push(control("Totales del banco", "Cantidad de débitos", deb.length, trailer.cantDebitos, deb.length === trailer.cantDebitos, "ent"));
    controles.push(
      control("Totales del banco", "Suma de débitos", sumaDeb, trailer.sumaDebitos, Math.abs(Math.abs(sumaDeb) - Math.abs(trailer.sumaDebitos)) <= TOLERANCIA),
    );
    controles.push(control("Totales del banco", "Cantidad de créditos", cre.length, trailer.cantCreditos, cre.length === trailer.cantCreditos, "ent"));
    controles.push(control("Totales del banco", "Suma de créditos", sumaCre, trailer.sumaCreditos, Math.abs(sumaCre - trailer.sumaCreditos) <= TOLERANCIA));
    const totalDecl = trailer.cantDebitos + trailer.cantCreditos;
    controles.push(control("Totales del banco", "Movimientos totales", movimientos.length, totalDecl, movimientos.length === totalDecl, "ent"));
  }

  // Cadena de saldos en orden cronológico (tal como vino, invertido si era descendente).
  const crono = primera.ordenDescendente ? [...movimientos].reverse() : [...movimientos];
  let rupturas = 0;
  for (let i = 1; i < crono.length; i++) {
    const esperado = (crono[i - 1].saldo ?? 0) + crono[i].importe;
    if (Math.abs((crono[i].saldo ?? 0) - esperado) > TOLERANCIA) rupturas++;
  }
  controles.push(control("Cadena de saldos", "Eslabones sin ruptura", crono.length - 1 - rupturas, crono.length - 1, rupturas === 0, "ent"));
  const saldoInicial = (crono[0].saldo ?? 0) - crono[0].importe;
  const saldoFinal = crono[crono.length - 1].saldo ?? 0;
  const sumaTotal = movimientos.reduce((s, m) => s + m.importe, 0);
  controles.push(
    control("Cadena de saldos", "Saldo inicial + movimientos = saldo final", saldoInicial + sumaTotal, saldoFinal, Math.abs(saldoInicial + sumaTotal - saldoFinal) <= TOLERANCIA),
  );

  const esperadas = lineasArchivo - lecturas.length - lecturas.filter((l) => l.trailer).length;
  const leidas = lecturas.reduce((s, l) => s + l.movimientos.length, 0);
  controles.push(control("Lectura del archivo", "Filas de movimiento leídas", leidas, esperadas, leidas === esperadas, "ent"));
  controles.push(control("Lectura del archivo", "Líneas descartadas por formato", descartadas.length, 0, descartadas.length === 0, "ent"));
  controles.push(control("Lectura del archivo", "Fechas ilegibles", ilegibles, 0, ilegibles === 0, "ent"));
  controles.push(control("Lectura del archivo", "Importes en cero", movimientos.filter((m) => m.importe === 0).length, 0, true, "ent"));

  const conceptosPorCodigo = new Map<string, Set<string>>();
  const signosPorCodigo = new Map<string, { pos: boolean; neg: boolean }>();
  for (const m of movimientos) {
    (conceptosPorCodigo.get(m.codigo!) ?? conceptosPorCodigo.set(m.codigo!, new Set()).get(m.codigo!)!).add(m.concepto);
    const s = signosPorCodigo.get(m.codigo!) ?? { pos: false, neg: false };
    if (m.importe > 0) s.pos = true;
    if (m.importe < 0) s.neg = true;
    signosPorCodigo.set(m.codigo!, s);
  }
  const codigosAmbiguos = [...conceptosPorCodigo.values()].filter((s) => s.size > 1).length;
  const mezclados = [...signosPorCodigo.values()].filter((s) => s.pos && s.neg).length;
  const sinCategoria = movimientos.filter((m) => m.categoria === CATEGORIA_DEFECTO).length;
  controles.push(control("Conceptos", "Códigos con más de un concepto", codigosAmbiguos, 0, codigosAmbiguos === 0, "ent"));
  controles.push(control("Conceptos", "Códigos con signos mezclados", mezclados, 0, true, "ent"));
  controles.push(control("Conceptos", "Movimientos sin categoría", sinCategoria, 0, sinCategoria === 0, "ent"));
  if (sinCategoria) avisos.push(`${sinCategoria} movimiento(s) quedaron en "Otros": son códigos del banco que todavía no tenemos clasificados.`);

  movimientos.sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0) || (a.comprobante ?? "").localeCompare(b.comprobante ?? ""));
  const { desde, hasta } = rangoFechas(movimientos);
  return {
    banco: "santander",
    movimientos,
    desde,
    hasta,
    cuenta: primera.cuenta,
    cuit: primera.cuit,
    saldoInicial,
    saldoFinal,
    controles,
    avisos,
    archivos: archivos.map((a) => a.name),
    descartadas,
  };
}

/* ------------------------------------------------------------------ */
/* Excel                                                                */
/* ------------------------------------------------------------------ */

const ESQUEMA: EsquemaDetalle = {
  columnas: [
    { id: "fecha", titulo: "Fecha", ancho: 12, valor: (m) => m.fecha, formato: FMT_FECHA },
    { id: "codigo", titulo: "Código", ancho: 9, valor: (m) => m.codigo ?? "" },
    { id: "concepto", titulo: "Concepto", ancho: 36, valor: (m) => m.concepto },
    { id: "categoria", titulo: "Categoría", ancho: 26, valor: (m) => m.categoria },
    { id: "debito", titulo: "Débito", ancho: 16, valor: (m) => m.debito, formato: FMT_NUM },
    { id: "credito", titulo: "Crédito", ancho: 16, valor: (m) => m.credito, formato: FMT_NUM },
    { id: "importe", titulo: "Importe", ancho: 16, valor: (m) => m.importe, formato: FMT_NUM },
    { id: "saldo", titulo: "Saldo", ancho: 17, valor: (m) => m.saldo ?? null, formato: FMT_NUM },
    { id: "comprobante", titulo: "Comprobante", ancho: 14, valor: (m) => m.comprobante ?? "" },
    { id: "sucursal", titulo: "Sucursal", ancho: 10, valor: (m) => m.sucursal ?? "" },
    { id: "detalle", titulo: "Detalle", ancho: 52, valor: (m) => m.detalle ?? "" },
  ],
};

export async function generarExcelSantander(a: AnalisisSantander): Promise<Blob> {
  const wb = await crearLibro();
  const det = planificarDetalle(ESQUEMA, a.movimientos.length);
  const subtitulo =
    `Cuenta ${a.cuenta}  |  ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${a.movimientos.length} movimientos  |  ` +
    `Reporte: ${TIPO_REPORTE}  |  Generado: ${formatearFecha(new Date())}`;

  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Concepto",
      titulo: "Resumen por concepto",
      subtitulo,
      claves: [{ titulo: "Código", columna: "codigo", ancho: 9 }],
      extras: [
        { titulo: "Concepto", ancho: 38, valor: (g) => g[0].concepto },
        { titulo: "Categoría", ancho: 26, valor: (g) => g[0].categoria },
      ],
      columnaCategoria: "categoria",
    },
    PALETA,
  );
  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Categoría",
      titulo: "Resumen por categoría",
      subtitulo,
      claves: [{ titulo: "Categoría", columna: "categoria", ancho: 30 }],
      columnaCategoria: "categoria",
    },
    PALETA,
  );
  escribirPivot(
    wb,
    a.movimientos,
    det,
    {
      claves: [
        { titulo: "Código", columna: "codigo", ancho: 9 },
        { titulo: "Concepto", columna: "concepto", ancho: 38 },
      ],
      subtitulo,
    },
    PALETA,
  );
  escribirControl(
    wb,
    a,
    det,
    {
      subtitulo: `Reporte requerido: ${TIPO_REPORTE}  |  Archivo: ${a.archivos.join(", ")}  |  Generado: ${formatearFecha(new Date())}`,
      recordatorio: `El archivo de entrada debe ser el reporte "${TIPO_REPORTE}". No abrirlo ni volver a guardarlo con Excel antes de procesarlo: eso rompe el formato.`,
      lineasDescartadas: a.descartadas,
    },
    PALETA,
  );
  escribirDetalle(wb, a.movimientos, ESQUEMA, PALETA);
  return libroABlob(wb);
}
