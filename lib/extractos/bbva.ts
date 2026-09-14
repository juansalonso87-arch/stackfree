/**
 * Analizador de movimientos de cuenta de BBVA (y, en general, de cualquier
 * banco que exporte columnas separadas de Crédito / Débito).
 * Port de `python/BBVA_movimientos.py`.
 *
 * El corazón es la NORMALIZACIÓN de conceptos: el banco escribe el mismo
 * movimiento de muchas formas ("MANT. CTA. 0123", "MANTENIMIENTO DE CUENTA").
 * Se traducen abreviaturas, se quitan números y palabras de relleno y se
 * unifican los textos con las mismas palabras, para que el resumen tenga un
 * renglón por concepto real y no uno por cada redacción del banco.
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
/** Índices (base 0) de respaldo si no se reconocen los títulos: Fecha, Concepto, Nro Doc, Crédito, Débito, Detalle. */
const COLUMNAS_IDX = [0, 2, 4, 6, 7, 8];

/**
 * Se evalúan en orden sobre el concepto YA normalizado. BBVA recorta el
 * concepto a ~12 caracteres ("TRANSFERENCI", "PAGO SERVICI", "RETENCION AR"),
 * por eso la comparación tolera palabras cortadas (ver `coincide`).
 */
const CATEGORIAS: [string, string[]][] = [
  ["Sueldos", ["SUELDO", "HABERES", "PAGO DE HABERES", "JORNAL"]],
  ["Impuesto débitos/créditos", ["LEY 25413", "IMPUESTO CHEQUE", "IMPUESTO LEY"]],
  ["Retenciones ARBA / IIBB", ["ARBA", "INGRESOS BRUTOS", "IIBB", "SIRCREB", "SIRTAC", "RETENCION AR"]],
  ["IVA y percepciones", ["IVA", "PERCEPCION", "RETENCION GANANCIAS", "REGIMEN AFIP", "RETENCION"]],
  ["Pagos AFIP / ARCA", ["AFIP", "ARCA", "VEP", "PAGOS AFIP"]],
  ["Otros impuestos", ["IMPUESTO", "TASA", "SELLOS", "SELLADO"]],
  ["Mantenimiento de cuenta", ["MANTENIMIENTO", "MANT"]],
  ["Comisiones", ["COMISION", "ARANCEL", "CARGO", "GASTO", "CHEQUERA", "ALQUILER DE"]],
  ["Plan de pago / préstamos", ["PLAN DE PAGO", "PRESTAMO", "CUOTA", "AMORTIZACION", "INTERES"]],
  [
    // CUPON. ARGEN / CUPONES CABA / MAE-ACREDITA: liquidaciones de cobros con tarjeta (confirmado por el dueño con archivo real).
    "Cobros con tarjeta",
    ["CUPON", "CUPONES", "CUPON ARGEN", "ARGENCARD", "CABAL", "CUPONES CABA", "MAESTRO", "MAE ACREDITA", "TARJETA", "VISA", "MASTERCARD", "MASTER CARD", "AMEX", "NARANJA", "COMERCIOS", "POSNET", "PRISMA", "FISERV", "PAYWAY", "GETNET", "LIQUIDACION TARJETA"],
  ],
  ["Depósitos en efectivo", ["DEPOSITO", "EFECTIVO"]],
  ["Cheques", ["CHEQUE", "ECHEQ"]],
  ["Dólares / bursátil", ["DOLAR", "MEP", "CCL", "CANJE", "ARBITRAJE", "COMPRA VENTA MONEDA", "BURSATIL"]],
  ["Transferencias recibidas", ["TRANSFERENCIA RECIBIDA", "ACREDITACION", "RECIBIDA", "CREDITO INMEDIATO", "TRANSFERENCIA A FAVOR", "DEBIN CREDITO"]],
  ["Servicios y débitos automáticos", ["DEBITO AUTOMATICO", "PAGO ELECTRONICO", "PAGO DIRECTO", "SERVICIOS", "PAGO DE SERVICIOS", "PAGO SERVICIOS", "DEBITO DIRECTO", "OG DEBITO DI", "SEGURO", "ZURICH", "PREPAGA"]],
  // "PAGO A PROVE DB MIN" = pagos a proveedores (confirmado por el dueño con archivo real).
  ["Transferencias enviadas", ["TRANSFERENCIA", "TRF", "PAGO A PROVEEDORES", "PAGO PROVEEDOR", "PAGO BTOB", "B2B", "INTERBANKING", "DNET DEBITO"]],
];

/** Plataformas de venta: si aparecen en el concepto o en el detalle, el cobro es de plataforma. */
const PLATAFORMAS = [
  "DELIVERY HERO",
  "PEDIDOSYA",
  "PEDIDOS YA",
  "RAPPI",
  "MERCADO PAGO",
  "MERCADOPAGO",
  "MERCADO LIBRE",
  "MERCADOLIBRE",
  "MODO",
  "UALA",
  "GLOVO",
  // En BBVA, "DNET CREDITO" es la liquidación de PedidosYa (confirmado por el dueño con archivo real).
  "DNET CREDITO",
];

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
  // plurales → singular
  COMISIONES: "COMISION", IMPUESTOS: "IMPUESTO", DEBITOS: "DEBITO", CREDITOS: "CREDITO",
  TRANSFERENCIAS: "TRANSFERENCIA", RETENCIONES: "RETENCION", PERCEPCIONES: "PERCEPCION",
  SERVICIOS: "SERVICIO", GASTOS: "GASTO", CARGOS: "CARGO", CHEQUES: "CHEQUE", SUELDOS: "SUELDO",
  HABERES: "SUELDO", CUENTAS: "CUENTA", DEPOSITOS: "DEPOSITO", TARJETAS: "TARJETA",
  COMERCIOS: "COMERCIO", PROVEEDORES: "PROVEEDOR", SELLOS: "SELLO", GANANCIAS: "GANANCIA",
  INTERESES: "INTERES", CUOTAS: "CUOTA", PRESTAMOS: "PRESTAMO", ACREDITACIONES: "ACREDITACION",
};

const PALABRAS_VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "POR", "SOBRE", "S", "C", "Y", "A", "EN", "SU", "REF", "NRO", "N", "OP", "SEG", "VAR", "RG"]);

/** 'MANT. CTA. 0123' → 'MANTENIMIENTO CUENTA'. */
export function normalizarConcepto(texto: unknown): string {
  if (texto === null || texto === undefined) return "";
  let t = sinAcentos(texto).toUpperCase().trim();
  if (!t || t === "NAN") return "";
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

/** Categoría de un texto normalizado (concepto o detalle) según las reglas. */
function clasificarTexto(texto: string): string {
  const n = texto.toUpperCase();
  if (!n) return CATEGORIA_DEFECTO;
  if (PLATAFORMAS.some((p) => coincide(n, p))) return "Cobros de plataformas";
  for (const [categoria, claves] of reglas()) {
    if (claves.some((k) => coincide(n, k))) return categoria;
  }
  return CATEGORIA_DEFECTO;
}

/**
 * Categoría de cada CONCEPTO (una sola por concepto, así el resumen por
 * concepto y el resumen por categoría siempre coinciden). Si el concepto
 * no dice nada, se vota con los detalles de sus movimientos (BBVA a veces
 * pone en el detalle lo que recorta en el concepto).
 */
function clasificarConceptos(movimientos: { concepto: string; detalle: string }[]): Map<string, string> {
  const resultado = new Map<string, string>();
  const detallesPorConcepto = new Map<string, string[]>();
  for (const m of movimientos) (detallesPorConcepto.get(m.concepto) ?? detallesPorConcepto.set(m.concepto, []).get(m.concepto)!).push(m.detalle);
  for (const [concepto, detalles] of detallesPorConcepto) {
    let categoria = clasificarTexto(concepto);
    if (categoria === CATEGORIA_DEFECTO) {
      const votos = new Map<string, number>();
      for (const d of detalles) {
        const c = clasificarTexto(normalizarConcepto(d));
        if (c !== CATEGORIA_DEFECTO) votos.set(c, (votos.get(c) ?? 0) + 1);
      }
      const ganadora = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
      if (ganadora) categoria = ganadora[0];
    }
    resultado.set(concepto, categoria);
  }
  return resultado;
}

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
  const crudos: { fecha: Date | null; nroDoc: string; original: string; detalle: string; credito: number; debito: number }[] = [];
  const avisos: string[] = [];
  let ilegibles = 0;

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
      nroDoc: buscarColumna(cabecera, "nro documento", "nro doc", "documento", "comprobante"),
      credito: buscarColumna(cabecera, "credito", "haber"),
      debito: buscarColumna(cabecera, "debito", "debe"),
      detalle: buscarColumna(cabecera, "detalle", "observacion", "referencia", "leyenda"),
    };
    if (cols.fecha < 0 || cols.concepto < 0 || (cols.credito < 0 && cols.debito < 0)) {
      if (hoja.filas[idx].length >= 9) {
        avisos.push("No reconocí los títulos de las columnas: usé las posiciones habituales del export de BBVA.");
        cols = { fecha: COLUMNAS_IDX[0], concepto: COLUMNAS_IDX[1], nroDoc: COLUMNAS_IDX[2], credito: COLUMNAS_IDX[3], debito: COLUMNAS_IDX[4], detalle: COLUMNAS_IDX[5] };
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
      crudos.push({ fecha, nroDoc: texto(fila, cols.nroDoc), original, detalle: texto(fila, cols.detalle), credito, debito });
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

  const categoriaDe = clasificarConceptos(crudos.map((c, i) => ({ concepto: conceptos[i], detalle: c.detalle })));
  const movimientos: Movimiento[] = crudos
    .map((c, i) => ({
      fecha: c.fecha,
      comprobante: c.nroDoc,
      concepto: conceptos[i],
      conceptoOriginal: c.original,
      detalle: c.detalle,
      categoria: categoriaDe.get(conceptos[i]) ?? CATEGORIA_DEFECTO,
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
        categoria: g[0].categoria,
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
    control("Conceptos", "Textos distintos del banco", textosBanco, textosBanco, true, "ent"),
    control("Conceptos", "Conceptos después de normalizar", porConcepto.size, porConcepto.size, true, "ent"),
    control("Conceptos", "Movimientos sin categoría", sinCategoria, 0, sinCategoria === 0, "ent"),
  ];
  if (unificados) avisos.push(`Se unificaron redacciones distintas del banco en ${unificados} concepto(s) (ver hoja Diagnóstico Conceptos).`);
  if (sinCategoria) avisos.push(`${sinCategoria} movimiento(s) quedaron en "Otros": revisalos en el resumen (fila amarilla).`);
  if (ilegibles) avisos.push(`${ilegibles} movimiento(s) con fecha ilegible.`);

  const { desde, hasta } = rangoFechas(movimientos);
  return { banco: "bbva", movimientos, desde, hasta, controles, avisos, archivos: archivos.map((a) => a.name), diagnostico, textosBanco };
}

const ESQUEMA: EsquemaDetalle = {
  columnas: [
    { id: "fecha", titulo: "Fecha", ancho: 12, valor: (m) => m.fecha, formato: FMT_FECHA },
    { id: "comprobante", titulo: "Nro Documento", ancho: 15, valor: (m) => m.comprobante ?? "" },
    { id: "concepto", titulo: "Concepto", ancho: 40, valor: (m) => m.concepto },
    { id: "categoria", titulo: "Categoría", ancho: 26, valor: (m) => m.categoria },
    { id: "credito", titulo: "Crédito", ancho: 15, valor: (m) => m.credito, formato: FMT_NUM },
    { id: "debito", titulo: "Débito", ancho: 15, valor: (m) => m.debito, formato: FMT_NUM },
    { id: "importe", titulo: "Neto", ancho: 15, valor: (m) => m.importe, formato: FMT_NUM },
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

  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Concepto",
      titulo: "Resumen por concepto",
      subtitulo,
      claves: [{ titulo: "Concepto", columna: "concepto", ancho: 46 }],
      extras: [
        { titulo: "Variantes", ancho: 11, valor: variantes, formato: '#,##0;-#,##0;"-"', sumar: true },
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
