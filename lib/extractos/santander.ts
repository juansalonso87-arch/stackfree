/**
 * Analizador del extracto de Banco Santander (Argentina).
 * Port de `python/Santander_analizador_extracto.py`, validado con archivos reales.
 *
 * Lee el archivo que entrega Santander Office Banking en Cuentas → "Ver
 * saldos y movimientos" → "Descargar movimientos" (es el mismo reporte
 * "Cash Management Formato Excel"). A pesar de la extensión .xls es un
 * archivo de texto separado por tabulaciones: una línea de cabecera
 * (CUIT / cuenta / "Extracto" / fecha), una línea por movimiento (7 campos:
 * fecha, concepto " - " detalle, importe, comprobante, sucursal, saldo,
 * código) y una línea final con los totales de control del banco
 * (cantidad y suma de débitos, cantidad y suma de créditos).
 */

import {
  seguroOPrepaga,
  CATEGORIA as CAT,
  CATEGORIA_DEFECTO,
  ErrorExtracto,
  ORGANISMOS_IMPOSITIVOS,
  PLATAFORMAS,
  PROCESADORAS_TARJETA,
  resolverSentido,
  type AnalisisExtracto,
  type Control,
  type Movimiento,
} from "./tipos";
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

/** Marcadores especiales de la tabla de códigos (además de las categorías neutras de tipos.ts). */
const POR_PAGADOR = "pagador"; // crédito cuya categoría depende de quién paga (plataforma, tarjeta, otro)
const POR_BENEFICIARIO = "beneficiario"; // débito cuya categoría depende de a quién se paga (impuestos, seguros, servicios)

/**
 * Santander numera cada tipo de movimiento: el código es más confiable que
 * el texto. Los códigos van SIN ceros a la izquierda (el export los trae
 * como "216" u "0216" según la versión). Relevados con archivos reales
 * (2026-09). OJO con 1968 "Pago a proveedores" y 216 "Pago a proveedores
 * recibido": suenan a egreso pero son liquidaciones que ENTRAN (PedidosYa,
 * Cabal…); por eso se mira quién paga y no la palabra.
 */
const CATEGORIAS_POR_CODIGO: Record<string, string> = {
  "2604": CAT.cobrosTarjeta, // Acreditacion a comercio fiserv
  "1968": POR_PAGADOR, // Pago a proveedores (Delivery Hero → plataforma)
  "1970": POR_PAGADOR, // Servicios de pago (American Express → tarjeta)
  "216": POR_PAGADOR, // Pago a proveedores recibido (Cabal → tarjeta)
  "3410": POR_PAGADOR, // Transf recibida cvu mismo titular: con "first data sur" son liquidaciones de Fiserv por CVU (confirmado por el dueño); si no, transferencia recibida
  "3413": POR_PAGADOR, // Transf recibida cvu dif titular
  "4805": POR_PAGADOR, // Transferencia recibida
  "1253": POR_PAGADOR, // Credito transf online banking emp
  "1862": CAT.sueldos, // Pago haberes
  "1153": CAT.sueldos, // Pago de haberes por cci
  "4712": CAT.impuestos, // Pago afip servicio interbanking
  "4719": POR_BENEFICIARIO, // Pago de servicios (Edenor → servicios; Arba web → impuestos)
  "4085": POR_BENEFICIARIO, // Debito automatico (Zurich → seguros; OSDE → prepagas)
  "824": CAT.transfEnviadas, // Transferencia realizada
  "2822": CAT.transfEnviadas, // Transferencia inmediata
  "1252": CAT.transfEnviadas, // Debito transf. online banking emp
  "4648": CAT.transfEnviadas, // Transferencia por sistema mep
  "5824": CAT.transfEnviadas, // Anul transferencia realizada (crédito que revierte una enviada)
  "4713": CAT.proveedores, // Pago interbanking b2b
  "2571": CAT.comisionesTarjeta, // Debito comercio fiserv
  "2574": CAT.comisionesTarjeta, // Debito comercio payway
  // El "servicio de cuenta" es el costo fijo mensual de la cuenta: va a Mantenimiento (como en BBVA y Comafi), no a Comisiones
  // por operaciones. Pedido del dueño el 2026-09-17 con archivo real.
  "2960": CAT.mantenimiento, // Comision por servicio de cuenta
  "3489": CAT.mantenimiento, // Comision servicio cuenta dolares
  "434": CAT.comisiones, // Comision transf otros bcos canales
  "4757": CAT.comisiones, // Comision mensual de movs clearing
  "3629": CAT.comisiones, // Comision gestion de cobertura
  "4633": CAT.impCheque, // Impuesto ley 25.413 debito 0,6%
  "4637": CAT.impCheque, // Impuesto ley 25.413 credito 0,6%
  "9633": CAT.impCheque, // Anul imp ley 25.413 (crédito que revierte)
  "2010": CAT.iibb, // Retencion arba alicuota u
  "2009": CAT.iibb, // Retencion arba alicuota t
  "1628": CAT.iibb, // Iibb percepcion pcia buenos aires
  "3254": CAT.iva, // Iva 21% reg de transfisc ley 27743
  "3253": CAT.iva, // Iva percepcion rg 2408
  "133": "cheque", // Cheque debitado
  "2029": "efectivo", // Deposito de efectivo
};

/** Respaldo por palabras clave para códigos que no están en la tabla (el orden importa). */
const CATEGORIAS_POR_TEXTO: ReglasCategoria = [
  [CAT.sueldos, ["HABER", "SUELDO", "JORNAL"]],
  [CAT.impCheque, ["LEY 25.413", "LEY 25413"]],
  [CAT.iibb, ["ARBA", "IIBB", "INGRESOS BRUTOS", "SIRCREB", "AGIP"]],
  [CAT.iva, ["IVA", "PERCEPCION", "RETENCION"]],
  [CAT.impuestos, ["AFIP", "ARCA", "VEP"]],
  [CAT.comisionesTarjeta, ["DEBITO COMERCIO"]],
  [CAT.mantenimiento, ["MANTENIMIENTO", "SERVICIO DE CUENTA", "SERVICIO CUENTA"]],
  [CAT.comisiones, ["COMISION"]],
  [CAT.intereses, ["INTERES", "PRESTAMO", "CUOTA", "DESCUBIERTO"]],
  [CAT.cobrosTarjeta, ["ACREDITACION A COMERCIO", "FISERV", "PAYWAY", "POSNET", "TARJETA"]],
  ["cheque", ["CHEQUE", "ECHEQ"]],
  ["efectivo", ["EFECTIVO", "EXTRACCION", "DEPOSITO"]],
  [CAT.embargos, ["EMBARGO", "JUDICIAL"]],
  [CAT.dolares, ["DOLAR", "COMPRA MONEDA", "VENTA MONEDA", "BURSATIL"]],
  [POR_PAGADOR, ["RECIBIDA", "RECIBIDO", "ACREDITACION", "CREDITO TRANSF"]],
  [POR_BENEFICIARIO, ["PAGO DE SERVICIOS", "DEBITO AUTOMATICO"]],
  [CAT.proveedores, ["B2B", "INTERBANKING", "PAGO A PROVEEDORES"]],
  ["transferencia", ["TRANSFERENCIA", "TRANSF", "PAGO"]],
];

const MENSAJE_FORMATO =
  "El archivo no tiene el formato esperado. Esta herramienta lee el archivo que entrega Santander Office Banking en " +
  `Cuentas → "Ver saldos y movimientos" → "Descargar movimientos" (reporte "${TIPO_REPORTE}"). Aunque termine en .xls, es un ` +
  "archivo de texto: si lo abriste y lo guardaste con Excel, se rompe; descargalo de nuevo sin abrirlo.";

const menciona = (texto: string, lista: readonly string[]) => {
  const t = sinAcentos(texto).toUpperCase();
  return lista.some((k) => t.includes(k));
};

/** Créditos: ¿quién paga? Plataforma de ventas, procesadora de tarjetas u otro (transferencia recibida). */
function porPagador(detalle: string, concepto: string): string {
  const t = `${concepto} ${detalle}`;
  if (menciona(t, PLATAFORMAS)) return CAT.plataformas;
  if (menciona(t, PROCESADORAS_TARJETA)) return CAT.cobrosTarjeta;
  return CAT.transfRecibidas;
}

/** Débitos por servicios: ¿a quién se paga? Organismo impositivo, aseguradora, prepaga u otro (servicio). */
function porBeneficiario(detalle: string): string {
  if (menciona(detalle, ORGANISMOS_IMPOSITIVOS)) return CAT.impuestos;
  return seguroOPrepaga(detalle) ?? CAT.servicios;
}

function clasificar(codigo: string, concepto: string, detalle: string, importe: number): string {
  const base = CATEGORIAS_POR_CODIGO[codigo] ?? clasificarPorTexto(concepto, CATEGORIAS_POR_TEXTO, (t) => sinAcentos(t).toUpperCase());
  if (base === POR_PAGADOR) return importe >= 0 ? porPagador(detalle, concepto) : CAT.transfEnviadas;
  if (base === POR_BENEFICIARIO) return porBeneficiario(detalle);
  return resolverSentido(base, importe > 0);
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
  // La última línea trae los totales; según la versión del export viene con tabulaciones vacías al final.
  const ultima = lineas[lineas.length - 1].split("\t");
  while (ultima.length > 0 && ultima[ultima.length - 1].trim() === "") ultima.pop();
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
    const codigo = codigoTxt.trim().replace(/^0+(?=\d)/, "");
    const sep = conceptoFull.indexOf(" - ");
    const concepto = (sep >= 0 ? conceptoFull.slice(0, sep) : conceptoFull).trim();
    const detalle = (sep >= 0 ? conceptoFull.slice(sep + 3) : "").trim().replace(/\s{2,}/g, " ");
    const importe = aNumeroSantander(importeTxt);
    movimientos.push({
      fecha: aFecha(fecha.trim()),
      cuenta,
      codigo,
      concepto,
      detalle,
      importe,
      saldo: aNumeroSantander(saldoTxt),
      comprobante: comprobante.trim(),
      sucursal: sucursal.trim(),
      categoria: clasificar(codigo, concepto, detalle, importe),
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

  // Cadena de saldos POR CUENTA, en orden cronológico: cada archivo tal como vino (invertido si era
  // descendente) y los archivos de una misma cuenta encadenados por fecha. Si se suben cuentas distintas,
  // los saldos inicial/final son la suma de todas.
  const porCuenta = new Map<string, Lectura[]>();
  for (const l of lecturas) (porCuenta.get(l.cuenta) ?? porCuenta.set(l.cuenta, []).get(l.cuenta)!).push(l);
  const sobrevivientes = new Set(movimientos);
  let rupturas = 0;
  let eslabones = 0;
  let saldoInicial = 0;
  let saldoFinal = 0;
  for (const lista of porCuenta.values()) {
    const crono = lista
      .map((l) => (l.ordenDescendente ? [...l.movimientos].reverse() : [...l.movimientos]))
      .sort((a, b) => (a[0]?.fecha?.getTime() ?? 0) - (b[0]?.fecha?.getTime() ?? 0))
      .flat()
      .filter((m) => sobrevivientes.has(m));
    if (crono.length === 0) continue;
    for (let i = 1; i < crono.length; i++) {
      eslabones++;
      const esperado = (crono[i - 1].saldo ?? 0) + crono[i].importe;
      if (Math.abs((crono[i].saldo ?? 0) - esperado) > TOLERANCIA) rupturas++;
    }
    saldoInicial += (crono[0].saldo ?? 0) - crono[0].importe;
    saldoFinal += crono[crono.length - 1].saldo ?? 0;
  }
  if (porCuenta.size > 1) {
    avisos.push(`Se analizaron ${porCuenta.size} cuentas distintas: la cadena de saldos se controló por cuenta y los saldos inicial y final son la suma de todas.`);
  }
  controles.push(control("Cadena de saldos", "Eslabones sin ruptura", eslabones - rupturas, eslabones, rupturas === 0, "ent"));
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
    cuenta: [...porCuenta.keys()].join(", "),
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
    { id: "cuenta", titulo: "Cuenta", ancho: 17, valor: (m) => m.cuenta ?? "" },
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
      // Un mismo código puede tener dos categorías (ej. "Transf recibida" de una procesadora de tarjetas o de un cliente),
      // por eso la categoría es parte de la clave: cada renglón cierra con el Resumen por Categoría.
      claves: [
        { titulo: "Código", columna: "codigo", ancho: 9 },
        { titulo: "Concepto", columna: "concepto", ancho: 38 },
        { titulo: "Categoría", columna: "categoria", ancho: 30 },
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
      recordatorio: `El archivo de entrada es el que entrega "Descargar movimientos" (reporte "${TIPO_REPORTE}"). No abrirlo ni volver a guardarlo con Excel antes de procesarlo: eso rompe el formato.`,
      lineasDescartadas: a.descartadas,
    },
    PALETA,
  );
  escribirDetalle(wb, a.movimientos, ESQUEMA, PALETA);
  return libroABlob(wb);
}
