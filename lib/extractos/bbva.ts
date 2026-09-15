/**
 * Analizador de movimientos de cuenta de BBVA (y, en general, de cualquier
 * banco que exporte columnas separadas de Crédito / Débito).
 * Port de `python/BBVA_movimientos.py`, mejorado con archivos reales.
 *
 * Dos ideas centrales:
 *
 * 1. NORMALIZACIÓN de conceptos: el banco escribe el mismo movimiento de
 *    muchas formas ("MANT. CTA. 0123", "MANTENIMIENTO DE CUENTA") y además
 *    RECORTA el concepto a ~12 caracteres ("TRANSFERENCI", "PAGO SERVICI").
 *    Se traducen abreviaturas, se quitan números y palabras de relleno y se
 *    unifican los textos con las mismas palabras.
 *
 * 2. CLASIFICACIÓN por el CÓDIGO de operación del banco (columna "Codigo",
 *    tres dígitos, estable entre cuentas) antes que por el texto. Cuando el
 *    archivo no trae código, o el código no está en la tabla, se usa el texto
 *    normalizado y, como último recurso, el Detalle.
 *
 * Algunas categorías dependen del SENTIDO del movimiento (una transferencia
 * es "recibida" si es crédito y "enviada" si es débito), por eso la
 * clasificación se resuelve por concepto + sentido, y el resumen por
 * concepto se agrupa por (concepto, categoría) para que siempre cierre con
 * el resumen por categoría.
 */

import { CATEGORIA_DEFECTO, ErrorExtracto, type AnalisisExtracto, type Control, type DiagnosticoConcepto, type Movimiento } from "./tipos";
import { aFecha, aNumero, formatearFecha, rangoFechas, sinAcentos } from "./texto";
import { detectarFilaCabecera, leerPlanilla, type Celda, type Hoja } from "./planilla";
import {
  control,
  crearLibro,
  escribirDetalle,
  escribirDiagnostico,
  escribirPivot,
  escribirResumen,
  libroABlob,
  planificarDetalle,
  FMT_FECHA,
  FMT_NUM,
  type EsquemaDetalle,
  type Paleta,
} from "./excel";

const PALETA: Paleta = { principal: "1F4E79", total: "D6E4F0" };
const HOJA_PREFERIDA = "movimientos historicos";
/** Índices (base 0) de respaldo si no se reconocen los títulos: Fecha, Concepto, Código, Nro Doc, Oficina, Crédito, Débito, Detalle. */
const COLUMNAS_IDX = { fecha: 0, concepto: 2, codigo: 3, nroDoc: 4, oficina: 5, credito: 6, debito: 7, detalle: 8 };

/* ------------------------------------------------------------------ */
/* Categorías                                                           */
/* ------------------------------------------------------------------ */

const CAT = {
  sueldos: "Sueldos",
  impCheque: "Impuesto débitos/créditos",
  iibb: "Retenciones y percepciones IIBB",
  iva: "IVA y percepciones",
  afip: "Pagos AFIP / ARCA",
  otrosImp: "Otros impuestos",
  mantenimiento: "Mantenimiento de cuenta",
  comisiones: "Comisiones",
  intereses: "Intereses y préstamos",
  pagoTarjeta: "Pago de tarjeta de crédito",
  comprasDebito: "Compras con tarjeta de débito",
  cobrosTarjeta: "Cobros con tarjeta",
  plataformas: "Cobros de plataformas",
  seguros: "Seguros y prepagas",
  servicios: "Servicios y débitos automáticos",
  proveedores: "Pagos a proveedores",
  embargos: "Embargos y judiciales",
  dolares: "Dólares / bursátil",
  transfRecibidas: "Transferencias recibidas",
  transfEnviadas: "Transferencias enviadas",
  depositos: "Depósitos en efectivo",
  extracciones: "Extracciones de efectivo",
  chequesDep: "Cheques depositados",
  chequesPag: "Cheques pagados",
} as const;

/**
 * Categorías "neutras": el nombre final depende del sentido del movimiento
 * (crédito → primera, débito → segunda).
 */
const NEUTRAS: Record<string, [string, string]> = {
  transferencia: [CAT.transfRecibidas, CAT.transfEnviadas],
  efectivo: [CAT.depositos, CAT.extracciones],
  cheque: [CAT.chequesDep, CAT.chequesPag],
};

/**
 * Códigos de operación de BBVA → categoría. Relevados de archivos reales
 * (2026-09). Un código ausente cae a la clasificación por texto.
 */
const CODIGOS_BBVA: Record<string, string> = {
  "001": "efectivo", // EFECTIVO (depósito o extracción por caja)
  "005": "cheque", // CH/CLEAR.48: cheque debitado por clearing
  "013": CAT.comisiones, // COM.TRANSFER
  "015": CAT.comisiones, // COM.TRANSF
  "024": CAT.embargos, // SUCES/EMBG ALTA EMBARGO
  "026": CAT.intereses, // INTERES COBR: intereses que cobra el banco (el dueño confirma el concepto, no sobre qué se calculan)
  "030": CAT.otrosImp, // SELLADO (impuesto de sellos)
  "129": "transferencia", // TRF IN COEL (transferencia inmediata, cualquier sentido)
  "137": CAT.servicios, // PAGO SERVICI (pago de servicios por banca online)
  "213": CAT.cobrosTarjeta, // CUPON. ARGEN (Argencard / Mastercard)
  "215": CAT.cobrosTarjeta, // MAE-ACREDITA (Maestro)
  "217": CAT.comisiones, // COMISION MOV
  "236": CAT.iva, // IVA TASA GRA (21 %)
  "241": CAT.comisiones, // COMISION TRA
  "247": CAT.sueldos, // OG-DEB./CRED HABERES OL
  "250": CAT.iibb, // PERC. IIBB S CABA
  "265": "transferencia", // TRANSFERENCI (con CTA.DESTINO)
  "266": "transferencia", // TRANSF. CLIE (de un cliente: crédito)
  "284": CAT.comisiones, // COMISION EXT EFECTIVO
  "286": CAT.iva, // PERCEPCION I
  "319": "transferencia", // TRANSFERENCI (Francés Net Cash)
  "362": CAT.proveedores, // PAGO A PROVE DB MIN (confirmado por el dueño)
  "372": CAT.iva, // IVA SERV DIG (IVA sobre servicios digitales del exterior)
  "381": CAT.afip, // PAGOS AFIP VEP
  "388": CAT.iibb, // RETENCION AR (SIRCREB / ARBA)
  "401": CAT.proveedores, // FB-PAGO A PR DB MIN
  "403": CAT.comisiones, // FB-COMISION (comisión del pago a proveedores)
  "456": CAT.cobrosTarjeta, // CUPONES CABAL
  "457": CAT.proveedores, // PAGO BTOB (Interbanking)
  "515": CAT.pagoTarjeta, // PAGO VISA-IN: débito automático de las tarjetas de crédito de la empresa (confirmado por el dueño)
  "522": CAT.comprasDebito, // PAGO CON VIS (compra con Visa Débito)
  "543": CAT.iva, // PERCEPCION I
  "544": CAT.iva, // PERCEPCION R (RG sobre compras en moneda extranjera)
  "589": CAT.impCheque, // IMPUESTO LEY (25.413)
  "609": CAT.impCheque, // LEY NRO 25.4(13)
  "758": CAT.iva, // IVA TASA RED (10,5 %)
  // 761 OG-DEBITO DI: débito directo genérico → decide el texto (Zurich, plan AFIP, cuotas, servicios)
  "879": CAT.sueldos, // OG-DEBITO HABERES OL
  "933": "transferencia", // TRANSFERENCI -CU (con NRO.TRANSF.)
  // 983 DNET CREDITO: crédito por Datanet/Interbanking. En los archivos del dueño es siempre PedidosYa (Delivery Hero en el
  // detalle) → plataforma si el detalle lo nombra; si otra empresa pagara por Datanet, quedaría como transferencia recibida.
  "983": "transferencia",
  "984": CAT.afip, // PAGOS AFIP NE
  "997": CAT.mantenimiento, // COM MANT FRA
};

/**
 * Reglas por TEXTO, evaluadas en orden sobre el concepto YA normalizado.
 * BBVA recorta el concepto a ~12 caracteres ("TRANSFERENCI", "PAGO SERVICI",
 * "RETENCION AR"), por eso la comparación tolera palabras cortadas (ver
 * `coincide`). El orden importa: lo específico va antes que lo genérico.
 */
const CATEGORIAS: [string, string[]][] = [
  [CAT.sueldos, ["SUELDO", "HABERES", "PAGO DE HABERES", "JORNAL"]],
  [CAT.impCheque, ["LEY 25413", "IMPUESTO CHEQUE", "IMPUESTO LEY"]],
  [CAT.iibb, ["ARBA", "AGIP", "INGRESOS BRUTOS", "IIBB", "SIRCREB", "SIRTAC", "RETENCION AR", "PERCEPCION IIBB"]],
  [CAT.afip, ["AFIP", "ARCA", "VEP", "PAGOS AFIP", "PLAN DE PAGOS AFIP"]],
  [CAT.iva, ["IVA", "PERCEPCION", "RETENCION GANANCIAS", "REGIMEN AFIP", "RETENCION"]],
  [CAT.otrosImp, ["IMPUESTO", "TASA", "SELLOS", "SELLADO"]],
  [CAT.mantenimiento, ["MANTENIMIENTO", "MANT"]],
  [CAT.comisiones, ["COMISION", "ARANCEL", "CARGO", "GASTO", "CHEQUERA", "ALQUILER DE"]],
  [CAT.intereses, ["PLAN DE PAGO", "PRESTAMO", "CUOTA", "AMORTIZACION", "INTERES", "DESCUBIERTO", "ADELANTO"]],
  // "PAGO VISA" (débito) es el pago del resumen de la tarjeta: va ANTES de "Cobros con tarjeta", que también contiene VISA.
  [CAT.pagoTarjeta, ["PAGO VISA", "PAGO MASTERCARD", "PAGO MASTER", "PAGO AMEX", "PAGO TARJETA", "PAGO NARANJA", "PAGO CABAL", "PAGO RESUMEN"]],
  [CAT.comprasDebito, ["PAGO CON VIS", "PAGO CON VISA", "COMPRA VISA DEBITO", "VISA DEBITO", "COMPRA DEBITO", "COMPRA CON TARJETA", "COMPRA MAESTRO", "CONSUMO TARJETA"]],
  [
    // CUPON. ARGEN / CUPONES CABAL / MAE-ACREDITA: liquidaciones de cobros con tarjeta (confirmado por el dueño con archivo real).
    CAT.cobrosTarjeta,
    ["CUPON", "CUPONES", "CUPON ARGEN", "ARGENCARD", "CABAL", "CUPONES CABA", "MAESTRO", "MAE ACREDITA", "TARJETA", "VISA", "MASTERCARD", "MASTER CARD", "AMEX", "NARANJA", "COMERCIOS", "POSNET", "PRISMA", "FISERV", "PAYWAY", "GETNET", "LIQUIDACION TARJETA"],
  ],
  // Seguros antes que "Servicios", porque el débito directo genérico (OG DEBITO DI) también matchea servicios.
  [CAT.seguros, ["SEGURO", "ZURICH", "SANCOR", "GALENO", "OSDE", "SWISS MEDICAL", "PREPAGA", "LA CAJA", "FEDERACION PATRONAL", "ALLIANZ", "MAPFRE", "PROVINCIA SEGUROS", "ART"]],
  ["efectivo", ["DEPOSITO", "EFECTIVO", "EXTRACCION", "CAJERO", "ATM"]],
  ["cheque", ["CHEQUE", "ECHEQ", "CLEARING"]],
  [CAT.embargos, ["EMBARGO", "EMBG", "JUDICIAL", "OFICIO"]],
  [CAT.dolares, ["DOLAR", "MEP", "CCL", "CANJE", "ARBITRAJE", "COMPRA VENTA MONEDA", "BURSATIL"]],
  [CAT.transfRecibidas, ["TRANSFERENCIA RECIBIDA", "ACREDITACION", "RECIBIDA", "CREDITO INMEDIATO", "TRANSFERENCIA A FAVOR", "DEBIN CREDITO", "TRANSFERENCIA CLIE"]],
  [CAT.servicios, ["DEBITO AUTOMATICO", "PAGO ELECTRONICO", "PAGO DIRECTO", "SERVICIOS", "PAGO DE SERVICIOS", "PAGO SERVICIOS", "DEBITO DIRECTO", "OG DEBITO DI", "PROSEGUR", "ALARMA"]],
  // "PAGO A PROVE DB MIN" = pagos a proveedores (confirmado por el dueño con archivo real).
  [CAT.proveedores, ["PAGO A PROVEEDORES", "PAGO PROVEEDOR", "PAGO BTOB", "B2B", "INTERBANKING", "DNET DEBITO"]],
  ["transferencia", ["TRANSFERENCIA", "TRF", "TRANSF", "DNET CREDITO"]],
];

/** Plataformas de venta: si aparecen en el concepto o en el detalle de una transferencia recibida, el cobro es de plataforma. */
const PLATAFORMAS = ["DELIVERY HERO", "PEDIDOSYA", "PEDIDOS YA", "RAPPI", "MERCADO PAGO", "MERCADOPAGO", "MERCADO LIBRE", "MERCADOLIBRE", "MODO", "UALA", "GLOVO"];

/* ------------------------------------------------------------------ */
/* Normalización de conceptos                                           */
/* ------------------------------------------------------------------ */

/** Códigos numéricos que SÍ significan algo: se traducen antes de borrar números (solo el primero que coincide). */
const CODIGOS_CON_SIGNIFICADO: [RegExp, string][] = [
  // Ley 25.413 (impuesto al cheque), aunque el banco la recorte a "LEY NRO 25.4".
  [/\bLEY\s*(N(RO|°|º)?\.?\s*)?25[.,\s]?4(13)?\b/, "IMPUESTO CHEQUE"],
  [/\bR\.?G\.?\s*2408\b/, "PERCEPCION IVA"],
  [/\bR\.?G\.?\s*4622\b/, "PERCEPCION IVA"],
  [/\bR\.?G\.?\s*3337\b/, "RETENCION IVA"],
  [/\bR\.?G\.?\s*830\b/, "RETENCION GANANCIAS"],
  [/\bR\.?G\.?\s*\d{3,4}\b/, "REGIMEN AFIP"],
  [/\bDEC\.?\s*\d{3,4}\s*\/\s*\d{2,4}\b/, "DECRETO"],
];

/** Textos pegados o recortados del banco que hay que reescribir antes de normalizar (se aplican todos). */
const REESCRITURAS: [RegExp, string][] = [
  [/\bPAGO\s+A\s+PR(OV[A-Z]*)?\b/, "PAGO A PROVEEDORES"], // FB-PAGO A PR DB MIN
  [/\bCH\s*\/\s*CLEAR[A-Z.]*/, "CHEQUE CLEARING"], // CH/CLEAR.48
  [/\bIVA\s+SERV\.?\s*DIG[A-Z]*\b.*$/, "IVA SERV DIGITALES"], // IVA SERV DIG Spotify (la marca queda en el texto original)
  // En los débitos directos el texto viene pegado a la referencia numérica ("0000PLANRG5321"), por eso no hay \b adelante.
  [/(?<![A-Z])PLAN\s*RG\s*\d*/, " PLAN DE PAGOS AFIP"], // OG-DEBITO DI PLANRG5321 (plan de facilidades de pago de AFIP)
  [/(?<![A-Z])DEB(ZURICH|SANCOR|GALENO|OSDE|SEGURO)\b/, " DEBITO $1"], // DEBZURICH
];

const ABREVIATURAS: Record<string, string> = {
  MANT: "MANTENIMIENTO", MTO: "MANTENIMIENTO", MANTEN: "MANTENIMIENTO",
  CTA: "CUENTA", CTAS: "CUENTAS", CTE: "CORRIENTE", CC: "CUENTA CORRIENTE",
  COM: "COMISION", COMIS: "COMISION", COMS: "COMISIONES",
  IMP: "IMPUESTO", IMPTO: "IMPUESTO", IMPTOS: "IMPUESTOS", IMPS: "IMPUESTOS",
  DEB: "DEBITO", DEBS: "DEBITOS", DTO: "DEBITO", DB: "DEBITO",
  CRED: "CREDITO", CREDS: "CREDITOS", CR: "CREDITO",
  ACRED: "ACREDITACION", ACR: "ACREDITACION",
  TRANSF: "TRANSFERENCIA", TRF: "TRANSFERENCIA", TR: "TRANSFERENCIA", TRANSFS: "TRANSFERENCIAS",
  RET: "RETENCION", RETS: "RETENCIONES", RTN: "RETENCION",
  PERC: "PERCEPCION", PERCEP: "PERCEPCION",
  AUT: "AUTOMATICO", AUTOM: "AUTOMATICO",
  SERV: "SERVICIOS", SRV: "SERVICIOS",
  DEP: "DEPOSITO", DEPOS: "DEPOSITO", EFVO: "EFECTIVO", EFEC: "EFECTIVO",
  SUC: "SUCURSAL", SUCUR: "SUCURSAL",
  TARJ: "TARJETA", TJ: "TARJETA", TJTA: "TARJETA",
  LIQ: "LIQUIDACION", LIQUID: "LIQUIDACION",
  PGO: "PAGO", PG: "PAGO",
  CHQ: "CHEQUE", CHQS: "CHEQUES",
  DESC: "DESCUENTO", DCTO: "DESCUENTO",
  VTO: "VENCIMIENTO", SDO: "SALDO", GS: "GASTOS",
  ELECT: "ELECTRONICO", ELECTR: "ELECTRONICO",
  PROVEED: "PROVEEDOR", PROVEE: "PROVEEDOR",
  EMBG: "EMBARGO", EXTR: "EXTRACCION",
  // plurales → singular
  COMISIONES: "COMISION", IMPUESTOS: "IMPUESTO", DEBITOS: "DEBITO", CREDITOS: "CREDITO",
  TRANSFERENCIAS: "TRANSFERENCIA", RETENCIONES: "RETENCION", PERCEPCIONES: "PERCEPCION",
  SERVICIOS: "SERVICIO", GASTOS: "GASTO", CARGOS: "CARGO", CHEQUES: "CHEQUE", SUELDOS: "SUELDO",
  HABERES: "SUELDO", CUENTAS: "CUENTA", DEPOSITOS: "DEPOSITO", TARJETAS: "TARJETA",
  COMERCIOS: "COMERCIO", PROVEEDORES: "PROVEEDOR", SELLOS: "SELLO", GANANCIAS: "GANANCIA",
  INTERESES: "INTERES", CUOTAS: "CUOTA", PRESTAMOS: "PRESTAMO", ACREDITACIONES: "ACREDITACION",
  EMBARGOS: "EMBARGO", SEGUROS: "SEGURO",
};

const PALABRAS_VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "POR", "SOBRE", "S", "C", "Y", "A", "EN", "SU", "REF", "NRO", "N", "OP", "SEG", "VAR", "RG"]);

/** 'MANT. CTA. 0123' → 'MANTENIMIENTO CUENTA'. */
export function normalizarConcepto(texto: unknown): string {
  if (texto === null || texto === undefined) return "";
  let t = sinAcentos(texto).toUpperCase().trim();
  if (!t || t === "NAN") return "";
  for (const [patron, reemplazo] of REESCRITURAS) t = t.replace(patron, reemplazo);
  for (const [patron, reemplazo] of CODIGOS_CON_SIGNIFICADO) {
    const nuevo = t.replace(patron, reemplazo);
    if (nuevo !== t) {
      t = nuevo;
      break;
    }
  }
  t = t.replace(/\b\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?\b/g, " "); // fechas
  t = t.replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " "); // cuota 3/12
  t = t.replace(/\b\d{6,}\b/g, " "); // CUIT, CBU, referencias
  t = t.replace(/\b\d+[.,]\d+\s*%?/g, " "); // 10,5%  1.234,56
  t = t.replace(/\b\d+\s*%/g, " "); // 21%
  t = t.replace(/\b\d+\b/g, " "); // cualquier número suelto
  t = t.replace(/[^A-ZÑ ]/g, " ").replace(/\s+/g, " ").trim();

  const palabras: string[] = [];
  for (const p of t.split(" ")) {
    const traducida = ABREVIATURAS[p] ?? p;
    palabras.push(...traducida.split(" "));
  }
  const vistas = new Set<string>();
  const limpio: string[] = [];
  for (const p of palabras) {
    if (PALABRAS_VACIAS.has(p) || p.length <= 1 || vistas.has(p)) continue;
    vistas.add(p);
    limpio.push(p);
  }
  return limpio.join(" ");
}

/** Une conceptos con las mismas palabras en distinto orden (se queda con la redacción más frecuente). */
function unificarEquivalentes(conceptos: string[]): Map<string, string> {
  const conteo = new Map<string, number>();
  for (const c of conceptos) conteo.set(c, (conteo.get(c) ?? 0) + 1);
  const porConjunto = new Map<string, [number, string][]>();
  for (const [c, n] of conteo) {
    if (!c) continue;
    const clave = [...new Set(c.split(" "))].sort().join(" ");
    (porConjunto.get(clave) ?? porConjunto.set(clave, []).get(clave)!).push([n, c]);
  }
  const mapa = new Map<string, string>();
  for (const lista of porConjunto.values()) {
    if (lista.length < 2) continue;
    const canonico = lista.sort((a, b) => b[0] - a[0] || b[1].localeCompare(a[1]))[0][1];
    for (const [, c] of lista) if (c !== canonico) mapa.set(c, canonico);
  }
  return mapa;
}

/* ------------------------------------------------------------------ */
/* Clasificación                                                        */
/* ------------------------------------------------------------------ */

let categoriasNormalizadas: [string, string[]][] | null = null;
function reglas(): [string, string[]][] {
  // Las palabras clave pasan por el MISMO normalizador que los conceptos.
  categoriasNormalizadas ??= CATEGORIAS.map(([cat, claves]) => [cat, claves.map((c) => normalizarConcepto(c)).filter(Boolean)]);
  return categoriasNormalizadas;
}

/**
 * ¿La clave (una o más palabras) aparece en el concepto? Compara palabra
 * por palabra y acepta palabras RECORTADAS: "TRANSFERENCI" vale por
 * "TRANSFERENCIA" y "PROVE" por "PROVEEDOR" (mínimo 4 letras para no
 * confundir siglas). Las claves de 2-3 letras se comparan exactas.
 */
export function coincide(concepto: string, clave: string): boolean {
  const c = concepto.split(" ").filter(Boolean);
  const k = clave.split(" ").filter(Boolean);
  if (k.length === 0 || c.length < k.length) return false;
  const igual = (ct: string, kt: string) =>
    ct === kt || (ct.length >= 4 && kt.startsWith(ct)) || (kt.length >= 4 && ct.startsWith(kt));
  for (let i = 0; i + k.length <= c.length; i++) {
    if (k.every((kt, j) => igual(c[i + j], kt))) return true;
  }
  return false;
}

const mencionaPlataforma = (texto: string) => PLATAFORMAS.some((p) => coincide(normalizarConcepto(texto), p));

/** Categoría base (puede ser neutra) de un texto normalizado según las reglas por texto. */
function clasificarTexto(texto: string): string {
  const n = texto.toUpperCase();
  if (!n) return CATEGORIA_DEFECTO;
  if (mencionaPlataforma(n)) return CAT.plataformas;
  for (const [categoria, claves] of reglas()) {
    if (claves.some((k) => coincide(n, k))) return categoria;
  }
  return CATEGORIA_DEFECTO;
}

/** Nombre final de una categoría base según el sentido del movimiento. */
function resolverSentido(base: string, esCredito: boolean): string {
  const neutra = NEUTRAS[base];
  return neutra ? (esCredito ? neutra[0] : neutra[1]) : base;
}

interface Crudo {
  concepto: string;
  codigo: string;
  detalle: string;
  credito: number;
}

/**
 * Categoría BASE de cada CONCEPTO (una sola por concepto; el sentido se
 * resuelve después por movimiento). Prioridad:
 *   1. el código de operación del banco (voto mayoritario si hay varios),
 *   2. el texto normalizado del concepto,
 *   3. el Detalle de sus movimientos (BBVA a veces pone ahí lo que recorta).
 * Una transferencia recibida cuyo detalle nombra una plataforma (Delivery
 * Hero, Rappi…) pasa a "Cobros de plataformas".
 */
function clasificarConceptos(movimientos: Crudo[]): Map<string, string> {
  const porConcepto = new Map<string, Crudo[]>();
  for (const m of movimientos) (porConcepto.get(m.concepto) ?? porConcepto.set(m.concepto, []).get(m.concepto)!).push(m);

  const ganadora = (votos: Map<string, number>) => [...votos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const resultado = new Map<string, string>();
  for (const [concepto, grupo] of porConcepto) {
    const porCodigo = new Map<string, number>();
    for (const m of grupo) {
      const cat = CODIGOS_BBVA[m.codigo];
      if (cat) porCodigo.set(cat, (porCodigo.get(cat) ?? 0) + 1);
    }
    let categoria = ganadora(porCodigo) ?? clasificarTexto(concepto);
    if (categoria === CATEGORIA_DEFECTO) {
      const votos = new Map<string, number>();
      for (const m of grupo) {
        const c = clasificarTexto(normalizarConcepto(m.detalle));
        if (c !== CATEGORIA_DEFECTO) votos.set(c, (votos.get(c) ?? 0) + 1);
      }
      categoria = ganadora(votos) ?? categoria;
    }
    const esEntrada = categoria === "transferencia" || categoria === CAT.transfRecibidas;
    if (esEntrada && grupo.some((m) => m.credito > 0 && mencionaPlataforma(m.detalle))) categoria = CAT.plataformas;
    resultado.set(concepto, categoria);
  }
  return resultado;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

function buscarColumna(cabecera: string[], ...claves: string[]): number {
  for (let i = 0; i < cabecera.length; i++) {
    const n = cabecera[i];
    if (n && claves.some((k) => n === k || n.startsWith(k))) return i;
  }
  return -1;
}

function elegirHoja(hojas: Hoja[]): Hoja {
  const preferida = hojas.find((h) => sinAcentos(h.nombre).toLowerCase().includes(HOJA_PREFERIDA));
  if (preferida && preferida.filas.length > 1) return preferida;
  return hojas.reduce((mejor, h) => (h.filas.length > mejor.filas.length ? h : mejor), hojas[0]);
}

export interface AnalisisBbva extends AnalisisExtracto {
  banco: "bbva";
  diagnostico: DiagnosticoConcepto[];
  textosBanco: number;
}

export async function analizarBbva(archivos: File[]): Promise<AnalisisBbva> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  const crudos: {
    fecha: Date | null;
    nroDoc: string;
    original: string;
    codigo: string;
    oficina: string;
    detalle: string;
    credito: number;
    debito: number;
  }[] = [];
  const avisos: string[] = [];
  let ilegibles = 0;
  let conCodigo = 0;

  for (const archivo of archivos) {
    const hoja = elegirHoja(await leerPlanilla(archivo));
    const filaCab = detectarFilaCabecera(
      hoja.filas,
      (celdas) =>
        celdas.some((c) => c.includes("fecha")) &&
        celdas.some((c) => ["concepto", "descripcion", "detalle", "movimiento"].some((k) => c.includes(k))) &&
        celdas.some((c) => ["credito", "debito", "importe", "haber", "debe"].some((k) => c.includes(k))),
    );
    const idx = filaCab >= 0 ? filaCab : 0;
    const cabecera = hoja.filas[idx].map((c) => sinAcentos(c ?? "").toLowerCase().trim());
    let cols = {
      fecha: buscarColumna(cabecera, "fecha"),
      concepto: buscarColumna(cabecera, "concepto", "descripcion", "movimiento"),
      codigo: buscarColumna(cabecera, "codigo", "cod."),
      nroDoc: buscarColumna(cabecera, "nro documento", "numero documento", "nro doc", "documento", "nro de cheque", "comprobante"),
      oficina: buscarColumna(cabecera, "oficina", "sucursal", "canal"),
      credito: buscarColumna(cabecera, "credito", "haber"),
      debito: buscarColumna(cabecera, "debito", "debe"),
      detalle: buscarColumna(cabecera, "detalle", "observacion", "referencia", "leyenda"),
    };
    if (cols.fecha < 0 || cols.concepto < 0 || (cols.credito < 0 && cols.debito < 0)) {
      if (hoja.filas[idx].length >= 9) {
        avisos.push("No reconocí los títulos de las columnas: usé las posiciones habituales del export de BBVA.");
        cols = { ...COLUMNAS_IDX };
      } else {
        throw new ErrorExtracto(
          `No encontré las columnas Fecha, Concepto y Crédito/Débito en "${archivo.name}". Verificá que sea el Excel de movimientos exportado desde BBVA.`,
        );
      }
    }
    const texto = (fila: Celda[], i: number) => (i >= 0 ? String(fila[i] ?? "").trim().replace(/^(nan|NaN|None|<NA>)$/, "") : "");
    for (const fila of hoja.filas.slice(idx + 1)) {
      const original = texto(fila, cols.concepto);
      if (!original || /^(total|totales)$/i.test(original)) continue;
      const fecha = aFecha(fila[cols.fecha]);
      const credito = cols.credito >= 0 ? aNumero(fila[cols.credito]) : 0;
      const debito = cols.debito >= 0 ? Math.abs(aNumero(fila[cols.debito])) : 0;
      if (!fecha && credito === 0 && debito === 0) continue; // filas de relleno
      if (!fecha) ilegibles++;
      // El código viene como "005" o, si la planilla lo convirtió a número, como 5.
      const codigoBruto = texto(fila, cols.codigo).replace(/\.0+$/, "");
      const codigo = /^\d{1,3}$/.test(codigoBruto) ? codigoBruto.padStart(3, "0") : "";
      if (codigo) conCodigo++;
      crudos.push({
        fecha,
        nroDoc: texto(fila, cols.nroDoc),
        original,
        codigo,
        oficina: texto(fila, cols.oficina),
        detalle: texto(fila, cols.detalle),
        credito,
        debito,
      });
    }
  }
  if (crudos.length === 0) throw new ErrorExtracto("No se encontraron movimientos en el archivo.");

  // Normalización + unificación de equivalentes.
  let conceptos = crudos.map((c) => {
    const n = normalizarConcepto(c.original);
    if (n.length >= 3) return n;
    const respaldo = normalizarConcepto(c.detalle);
    return respaldo.length >= 3 ? respaldo : "SIN CONCEPTO";
  });
  const mapa = unificarEquivalentes(conceptos);
  conceptos = conceptos.map((c) => mapa.get(c) ?? c);
  const unificados = new Set([...mapa.entries()].filter(([o, d]) => o !== d).map(([, d]) => d)).size;

  const categoriaBase = clasificarConceptos(crudos.map((c, i) => ({ concepto: conceptos[i], codigo: c.codigo, detalle: c.detalle, credito: c.credito })));
  const movimientos: Movimiento[] = crudos
    .map((c, i) => ({
      fecha: c.fecha,
      comprobante: c.nroDoc,
      concepto: conceptos[i],
      conceptoOriginal: c.original,
      detalle: c.detalle,
      codigo: c.codigo,
      sucursal: c.oficina,
      categoria: resolverSentido(categoriaBase.get(conceptos[i]) ?? CATEGORIA_DEFECTO, c.credito > 0),
      credito: c.credito,
      debito: c.debito,
      importe: c.credito - c.debito,
    }))
    .sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0) || (a.comprobante ?? "").localeCompare(b.comprobante ?? ""));

  // Diagnóstico: qué textos crudos se unificaron en cada concepto.
  const porConcepto = new Map<string, Movimiento[]>();
  for (const m of movimientos) (porConcepto.get(m.concepto) ?? porConcepto.set(m.concepto, []).get(m.concepto)!).push(m);
  const diagnostico: DiagnosticoConcepto[] = [...porConcepto.entries()]
    .map(([concepto, g]) => {
      const variantes = new Map<string, number>();
      for (const m of g) variantes.set(m.conceptoOriginal!, (variantes.get(m.conceptoOriginal!) ?? 0) + 1);
      const ejemplos = [...new Set(g.map((m) => m.detalle).filter((d) => d && d.trim()))].slice(0, 2);
      return {
        concepto,
        categoria: [...new Set(g.map((m) => m.categoria))].join(" / "),
        variantes: variantes.size,
        movimientos: g.length,
        credito: g.reduce((s, m) => s + m.credito, 0),
        debito: g.reduce((s, m) => s + m.debito, 0),
        neto: g.reduce((s, m) => s + m.importe, 0),
        textosOriginales: [...variantes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([t, n]) => `${t} (x${n})`)
          .join("  |  "),
        ejemploDetalle: ejemplos.join("  |  "),
      };
    })
    .sort((a, b) => b.variantes - a.variantes || b.movimientos - a.movimientos);

  const textosBanco = new Set(crudos.map((c) => c.original)).size;
  const sinCategoria = movimientos.filter((m) => m.categoria === CATEGORIA_DEFECTO).length;
  const controles: Control[] = [
    control("Lectura del archivo", "Movimientos leídos", movimientos.length, movimientos.length, true, "ent"),
    control("Lectura del archivo", "Fechas ilegibles", ilegibles, 0, ilegibles === 0, "ent"),
    control("Lectura del archivo", "Movimientos con código de operación", conCodigo, movimientos.length, conCodigo === movimientos.length || conCodigo === 0, "ent"),
    control("Conceptos", "Textos distintos del banco", textosBanco, textosBanco, true, "ent"),
    control("Conceptos", "Conceptos después de normalizar", porConcepto.size, porConcepto.size, true, "ent"),
    control("Conceptos", "Movimientos sin categoría", sinCategoria, 0, sinCategoria === 0, "ent"),
  ];
  if (unificados) avisos.push(`Se unificaron redacciones distintas del banco en ${unificados} concepto(s) (ver hoja Diagnóstico Conceptos).`);
  if (sinCategoria) avisos.push(`${sinCategoria} movimiento(s) quedaron en "Otros": revisalos en el resumen (fila amarilla).`);
  if (ilegibles) avisos.push(`${ilegibles} movimiento(s) con fecha ilegible.`);
  if (conCodigo === 0) avisos.push("El archivo no trae la columna Código del banco: clasifiqué solo por el texto del concepto.");

  const { desde, hasta } = rangoFechas(movimientos);
  return { banco: "bbva", movimientos, desde, hasta, controles, avisos, archivos: archivos.map((a) => a.name), diagnostico, textosBanco };
}

/* ------------------------------------------------------------------ */
/* Excel                                                                */
/* ------------------------------------------------------------------ */

const ESQUEMA: EsquemaDetalle = {
  columnas: [
    { id: "fecha", titulo: "Fecha", ancho: 12, valor: (m) => m.fecha, formato: FMT_FECHA },
    { id: "comprobante", titulo: "Nro Documento", ancho: 15, valor: (m) => m.comprobante ?? "" },
    { id: "concepto", titulo: "Concepto", ancho: 40, valor: (m) => m.concepto },
    { id: "categoria", titulo: "Categoría", ancho: 30, valor: (m) => m.categoria },
    { id: "credito", titulo: "Crédito", ancho: 15, valor: (m) => m.credito, formato: FMT_NUM },
    { id: "debito", titulo: "Débito", ancho: 15, valor: (m) => m.debito, formato: FMT_NUM },
    { id: "importe", titulo: "Neto", ancho: 15, valor: (m) => m.importe, formato: FMT_NUM },
    { id: "codigo", titulo: "Cód. BBVA", ancho: 10, valor: (m) => m.codigo ?? "" },
    { id: "sucursal", titulo: "Oficina / canal", ancho: 22, valor: (m) => m.sucursal ?? "" },
    { id: "conceptoOriginal", titulo: "Concepto original", ancho: 34, valor: (m) => m.conceptoOriginal ?? "" },
    { id: "detalle", titulo: "Detalle", ancho: 30, valor: (m) => m.detalle ?? "" },
  ],
};

export async function generarExcelBbva(a: AnalisisBbva): Promise<Blob> {
  const wb = await crearLibro();
  const det = planificarDetalle(ESQUEMA, a.movimientos.length);
  const conceptosNorm = new Set(a.movimientos.map((m) => m.concepto)).size;
  const subtitulo =
    `Período: ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${a.movimientos.length} movimientos  |  ` +
    `${a.textosBanco} textos del banco agrupados en ${conceptosNorm} conceptos  |  Origen: ${a.archivos.join(", ")}  |  Generado: ${formatearFecha(new Date())}`;
  const variantes = (g: Movimiento[]) => new Set(g.map((m) => m.conceptoOriginal)).size;
  const codigos = (g: Movimiento[]) => [...new Set(g.map((m) => m.codigo).filter(Boolean))].sort().join(", ");

  // Agrupado por (concepto, categoría): una transferencia recibida y una enviada
  // con el mismo texto son dos renglones, y todo cierra con el resumen por categoría.
  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Concepto",
      titulo: "Resumen por concepto",
      subtitulo,
      claves: [
        { titulo: "Concepto", columna: "concepto", ancho: 44 },
        { titulo: "Categoría", columna: "categoria", ancho: 30 },
      ],
      extras: [
        { titulo: "Variantes", ancho: 11, valor: variantes, formato: '#,##0;-#,##0;"-"', sumar: true },
        { titulo: "Cód. BBVA", ancho: 12, valor: codigos },
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
      claves: [{ titulo: "Categoría", columna: "categoria", ancho: 32 }],
      extras: [{ titulo: "Variantes", ancho: 11, valor: variantes, formato: '#,##0;-#,##0;"-"', sumar: true }],
      columnaCategoria: "categoria",
    },
    PALETA,
  );
  escribirPivot(wb, a.movimientos, det, { claves: [{ titulo: "Concepto", columna: "concepto", ancho: 46 }], subtitulo }, PALETA);
  escribirDiagnostico(wb, a.diagnostico, subtitulo, PALETA);
  escribirDetalle(wb, a.movimientos, ESQUEMA, PALETA);
  return libroABlob(wb);
}
