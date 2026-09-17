/**
 * Analizador de movimientos de cuenta de Banco Comafi.
 * Port de `python/Comafi_movimientos.py`.
 *
 * Lee el Excel de movimientos de cuenta (Comafi Empresas → Cuentas →
 * Movimientos → Exportar): reconoce las columnas por su nombre, clasifica
 * cada concepto por palabras clave y arma los resúmenes.
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
import { aFecha, aNumero, clasificarPorTexto, formatearFecha, normalizarBasico, rangoFechas, sinAcentos, type ReglasCategoria } from "./texto";
import { detectarFilaCabecera, leerPlanilla, type Celda } from "./planilla";
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

const PALETA: Paleta = { principal: "1F3864", total: "D9E1F2" };
const TOLERANCIA = 0.02;

/**
 * Se evalúa en orden: gana la primera categoría cuya palabra clave aparezca
 * en la Descripción. Usa el vocabulario único de categorías (tipos.ts);
 * "transferencia", "efectivo" y "cheque" se resuelven después según el
 * sentido del importe, y los créditos por transferencia se refinan mirando
 * quién paga en las columnas "Descripción Ampliada" (Cabal → tarjeta,
 * Delivery Hero → plataforma). Vocabulario relevado con archivos reales
 * (2026-09): "Impuesto a los debitos - tasa general", "Imp. IB s/Acred.
 * Bcarias.Prov. Bs.As.", "Creditos a comercios Master Card", "Transferencia
 * recibida - Datanet", "Transf Inmed Propias eBanking"…
 */
const CATEGORIAS: ReglasCategoria = [
  [CAT.plataformas, PLATAFORMAS.map((p) => p.toLowerCase())],
  [CAT.sueldos, ["sueldo", "haberes", "acreditacion de sueldos"]],
  [CAT.impCheque, ["ley 25413", "ley 25.413", "impuesto a los debitos", "impuesto a los creditos", "imp. a los deb", "imp. a los cred", "imp. deb", "imp. cred", "impuesto debitos", "impuesto creditos"]],
  [CAT.iibb, ["iibb", "ingresos brutos", "sircreb", "arba", "agip", "imp. ib", "imp ib", "ib s/acred", "percepcion ib", "retencion ib"]],
  [CAT.iva, ["iva", "percepcion", "retencion"]],
  [CAT.impuestos, ["afip", "arca", "vep"]],
  [CAT.otrosImp, ["impuesto", "imp.", "sellos", "sellado"]],
  [CAT.mantenimiento, ["mantenimiento"]],
  // Prepagas antes que seguros: "sancor salud" es prepaga aunque diga sancor.
  [CAT.prepagas, ["prepaga", "osde", "swiss medical", "galeno", "medife", "omint", "salud"]],
  [CAT.seguros, ["seguro", "zurich", "sancor", "la caja", "allianz", "mapfre", "federacion patronal"]],
  [CAT.comisiones, ["comision", "gastos", "chequera", "arancel", "cargo"]],
  [CAT.intereses, ["interes", "prestamo", "cuota", "descubierto"]],
  [CAT.pagoTarjeta, ["pago tarjeta", "pago visa", "pago master", "pago amex"]],
  [CAT.cobrosTarjeta, ["comercios", "master card", "mastercard", "visa", "cabal", "amex", "american express", "liquidacion tarjeta", "fiserv", "prisma", "payway", "posnet"]],
  ["efectivo", ["deposito", "efectivo", "extraccion", "cajero"]],
  [CAT.embargos, ["embargo", "judicial"]],
  [CAT.dolares, ["dolar", "compra moneda", "venta moneda", "mep", "bursatil"]],
  [CAT.propias, ["propias", "cuentas propias", "mismo titular", "entre cuentas"]],
  [CAT.transfRecibidas, ["recibida", "recibido", "acreditacion", "credito inmediato"]],
  [CAT.servicios, ["pago electronico de servicios", "pago de servicios", "pago directo", "debito automatico", "servicios"]],
  [CAT.proveedores, ["pago a proveedores", "proveedores", "b2b", "interbanking"]],
  ["transferencia", ["transferencia", "transf"]],
  ["cheque", ["cheque", "echeq"]],
];

const menciona = (texto: string, lista: readonly string[]) => {
  const t = sinAcentos(texto).toUpperCase();
  return lista.some((k) => t.includes(k));
};

/** Categoría final: reglas por texto + sentido + quién paga / a quién se paga (según el detalle). */
function clasificar(concepto: string, detalle: string, importe: number): string {
  const base = resolverSentido(clasificarPorTexto(concepto, CATEGORIAS), importe > 0);
  const todo = `${concepto} ${detalle}`;
  if (base === CAT.transfRecibidas || base === CAT.propias) {
    if (menciona(todo, PLATAFORMAS)) return CAT.plataformas;
    if (menciona(todo, PROCESADORAS_TARJETA)) return CAT.cobrosTarjeta;
  }
  if (base === CAT.servicios || base === CAT.transfEnviadas) {
    if (menciona(detalle, ORGANISMOS_IMPOSITIVOS)) return CAT.impuestos;
    const salud = seguroOPrepaga(detalle);
    if (salud) return salud;
  }
  return base;
}

/** Nombres de columna que se reconocen (normalizados, sin acentos). */
const ALIAS: Record<string, string[]> = {
  concepto: ["descripcion", "concepto", "movimiento", "descripcion movimiento"],
  fecha: ["fecha", "fecha movimiento", "fecha operacion"],
  id: ["id operacion", "id", "nro operacion", "numero de operacion", "comprobante"],
  moneda: ["moneda", "divisa"],
  importe: ["importe", "monto", "importe movimiento", "credito/debito"],
  saldo: ["saldo", "saldo acumulado"],
};
/** Columnas de detalle: se concatenan todas las que existan (Comafi trae "Descripción Ampliada 1/2/3"). */
const ALIAS_DETALLE = ["descripcion ampliada", "detalle", "referencia", "observacion", "leyenda"];

function mapearColumnas(cabecera: Celda[]): { cols: Record<string, number>; detalle: number[] } {
  const encontradas: Record<string, number> = {};
  const usadas = new Set<number>();
  const normalizadas = cabecera.map((c) => normalizarBasico(c));
  for (const [clave, alias] of Object.entries(ALIAS)) {
    // Coincidencia exacta primero; después, por prefijo.
    let idx = normalizadas.findIndex((n, i) => !usadas.has(i) && alias.includes(n));
    if (idx < 0) idx = normalizadas.findIndex((n, i) => !usadas.has(i) && alias.some((a) => n.startsWith(a)));
    if (idx >= 0) {
      encontradas[clave] = idx;
      usadas.add(idx);
    }
  }
  const detalle = normalizadas.map((n, i) => (!usadas.has(i) && ALIAS_DETALLE.some((a) => n.startsWith(a)) ? i : -1)).filter((i) => i >= 0);
  return { cols: encontradas, detalle };
}

export interface AnalisisComafi extends AnalisisExtracto {
  banco: "comafi";
}

/** Lectura de un archivo en el orden cronológico del banco (el export viene del más nuevo al más viejo). */
interface LecturaComafi {
  movimientos: Movimiento[];
  conSaldo: boolean;
}

async function leerArchivo(archivo: File): Promise<LecturaComafi & { ilegibles: number }> {
  const hojas = await leerPlanilla(archivo);
  const hoja = hojas.find((h) => h.filas.length > 1) ?? hojas[0];
  const filaCab = detectarFilaCabecera(
    hoja.filas,
    (celdas) => celdas.some((c) => ALIAS.concepto.includes(c)) && celdas.some((c) => ALIAS.importe.includes(c)),
  );
  if (filaCab < 0) {
    throw new ErrorExtracto(
      `No encontré las columnas de movimientos en "${archivo.name}". Se esperan títulos como "Descripción" e "Importe". ` +
        `Verificá que sea el Excel de movimientos de cuenta exportado desde Comafi.`,
    );
  }
  const { cols, detalle: colsDetalle } = mapearColumnas(hoja.filas[filaCab]);
  if (cols.concepto === undefined || cols.importe === undefined) {
    throw new ErrorExtracto(`No encontré las columnas "Descripción" e "Importe" en "${archivo.name}".`);
  }
  const texto = (fila: Celda[], i: number) => String(fila[i] ?? "").trim().replace(/\s{2,}/g, " ");

  const movimientos: Movimiento[] = [];
  let ilegibles = 0;
  for (const fila of hoja.filas.slice(filaCab + 1)) {
    const concepto = texto(fila, cols.concepto);
    if (!concepto || /^(nan|total|totales)$/i.test(concepto)) continue;
    const importe = aNumero(fila[cols.importe]);
    const fecha = cols.fecha !== undefined ? aFecha(fila[cols.fecha]) : null;
    if (cols.fecha !== undefined && !fecha) ilegibles++;
    const detalle = colsDetalle.map((i) => texto(fila, i)).filter(Boolean).join(" | ");
    movimientos.push({
      fecha,
      comprobante: cols.id !== undefined ? texto(fila, cols.id) : "",
      concepto,
      detalle,
      categoria: clasificar(concepto, detalle, importe),
      moneda: cols.moneda !== undefined ? texto(fila, cols.moneda).toUpperCase() || "PESOS" : "PESOS",
      importe,
      debito: importe < 0 ? -importe : 0,
      credito: importe > 0 ? importe : 0,
      saldo: cols.saldo !== undefined ? aNumero(fila[cols.saldo]) : null,
    });
  }
  // El export de Comafi viene del más nuevo al más viejo: se invierte para tener el orden cronológico del banco.
  const primera = movimientos[0]?.fecha;
  const ultima = movimientos[movimientos.length - 1]?.fecha;
  if (primera && ultima && primera > ultima) movimientos.reverse();
  return { movimientos, conSaldo: cols.saldo !== undefined, ilegibles };
}

export async function analizarComafi(archivos: File[]): Promise<AnalisisComafi> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  const lecturas: (LecturaComafi & { ilegibles: number })[] = [];
  for (const a of archivos) lecturas.push(await leerArchivo(a));
  // Archivos en orden cronológico (varios meses juntos), cada uno con el orden interno del banco.
  lecturas.sort((a, b) => (a.movimientos[0]?.fecha?.getTime() ?? 0) - (b.movimientos[0]?.fecha?.getTime() ?? 0));

  let movimientos = lecturas.flatMap((l) => l.movimientos);
  if (movimientos.length === 0) throw new ErrorExtracto("No se encontraron movimientos en el archivo.");
  const avisos: string[] = [];
  const ilegibles = lecturas.reduce((s, l) => s + l.ilegibles, 0);
  const saldoDisponible = lecturas.every((l) => l.conSaldo);

  if (archivos.length > 1) {
    const antes = movimientos.length;
    const vistos = new Set<string>();
    movimientos = movimientos.filter((m) => {
      const k = [m.fecha?.getTime(), m.comprobante, m.importe, m.saldo].join("|");
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    if (antes - movimientos.length > 0) avisos.push(`Se descartaron ${antes - movimientos.length} movimientos duplicados entre archivos.`);
  }

  const controles: Control[] = [];
  const sinCategoria = movimientos.filter((m) => m.categoria === CATEGORIA_DEFECTO).length;
  controles.push(control("Lectura del archivo", "Movimientos leídos", movimientos.length, movimientos.length, true, "ent"));
  controles.push(control("Lectura del archivo", "Fechas ilegibles", ilegibles, 0, ilegibles === 0, "ent"));
  controles.push(control("Conceptos", "Movimientos sin categoría", sinCategoria, 0, sinCategoria === 0, "ent"));
  if (ilegibles) avisos.push(`${ilegibles} movimiento(s) con fecha ilegible: quedan sin fecha en el Detalle.`);
  if (sinCategoria) avisos.push(`${sinCategoria} movimiento(s) quedaron en "Otros": revisalos en el resumen (fila amarilla).`);

  // Si el archivo trae saldo, se verifica la cadena movimiento por movimiento, por moneda, en el orden del banco.
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  if (saldoDisponible && movimientos.every((m) => typeof m.saldo === "number")) {
    const monedas = [...new Set(movimientos.map((m) => m.moneda ?? "PESOS"))];
    let rupturas = 0;
    let eslabones = 0;
    for (const moneda of monedas) {
      const lista = movimientos.filter((m) => (m.moneda ?? "PESOS") === moneda);
      for (let i = 1; i < lista.length; i++) {
        eslabones++;
        const esperado = (lista[i - 1].saldo ?? 0) + lista[i].importe;
        if (Math.abs((lista[i].saldo ?? 0) - esperado) > TOLERANCIA) rupturas++;
      }
      if (moneda === "PESOS" || monedas.length === 1) {
        saldoInicial = (lista[0].saldo ?? 0) - lista[0].importe;
        saldoFinal = lista[lista.length - 1].saldo ?? 0;
      }
    }
    if (eslabones > 0) {
      controles.push(control("Cadena de saldos", "Eslabones sin ruptura", eslabones - rupturas, eslabones, rupturas === 0, "ent"));
      if (saldoInicial !== undefined && saldoFinal !== undefined) {
        const suma = movimientos.filter((m) => (m.moneda ?? "PESOS") === (monedas.length === 1 ? monedas[0] : "PESOS")).reduce((s, m) => s + m.importe, 0);
        controles.push(
          control("Cadena de saldos", "Saldo inicial + movimientos = saldo final", saldoInicial + suma, saldoFinal, Math.abs(saldoInicial + suma - saldoFinal) <= TOLERANCIA),
        );
      }
      if (rupturas > 0) {
        avisos.push(
          "La cadena de saldos no cierra en algunos puntos: puede que falten movimientos entre dos archivos o que el archivo esté ordenado de otra forma. Los totales igual son correctos.",
        );
      }
    }
  }

  const { desde, hasta } = rangoFechas(movimientos);
  return {
    banco: "comafi",
    movimientos,
    desde,
    hasta,
    saldoInicial,
    saldoFinal,
    controles,
    avisos,
    archivos: archivos.map((a) => a.name),
  };
}

const ESQUEMA: EsquemaDetalle = {
  columnas: [
    { id: "fecha", titulo: "Fecha", ancho: 12, valor: (m) => m.fecha, formato: FMT_FECHA },
    { id: "comprobante", titulo: "ID Operación", ancho: 14, valor: (m) => m.comprobante ?? "" },
    { id: "concepto", titulo: "Concepto", ancho: 42, valor: (m) => m.concepto },
    { id: "categoria", titulo: "Categoría", ancho: 26, valor: (m) => m.categoria },
    { id: "moneda", titulo: "Moneda", ancho: 10, valor: (m) => m.moneda ?? "" },
    { id: "debito", titulo: "Débito", ancho: 16, valor: (m) => m.debito, formato: FMT_NUM },
    { id: "credito", titulo: "Crédito", ancho: 16, valor: (m) => m.credito, formato: FMT_NUM },
    { id: "importe", titulo: "Importe", ancho: 16, valor: (m) => m.importe, formato: FMT_NUM },
    { id: "saldo", titulo: "Saldo", ancho: 16, valor: (m) => m.saldo ?? null, formato: FMT_NUM },
    { id: "detalle", titulo: "Detalle (descripción ampliada)", ancho: 44, valor: (m) => m.detalle ?? "" },
  ],
};

export async function generarExcelComafi(a: AnalisisComafi): Promise<Blob> {
  const wb = await crearLibro();
  const det = planificarDetalle(ESQUEMA, a.movimientos.length);
  const subtitulo =
    `Período: ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${a.movimientos.length} movimientos  |  ` +
    `Origen: ${a.archivos.join(", ")}  |  Generado: ${formatearFecha(new Date())}`;
  const claveMoneda = { titulo: "Moneda", columna: "moneda", ancho: 10 };

  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Concepto",
      titulo: "Resumen por concepto",
      subtitulo,
      // La categoría es parte de la clave: un mismo concepto ("Transferencia recibida - Datanet") puede ser
      // cobro de plataforma o cobro con tarjeta según quién paga, y cada renglón cierra con el Resumen por Categoría.
      claves: [{ titulo: "Concepto", columna: "concepto", ancho: 44 }, claveMoneda, { titulo: "Categoría", columna: "categoria", ancho: 30 }],
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
      claves: [{ titulo: "Categoría", columna: "categoria", ancho: 30 }, claveMoneda],
      columnaCategoria: "categoria",
    },
    PALETA,
  );
  escribirPivot(
    wb,
    a.movimientos,
    det,
    { claves: [{ titulo: "Concepto", columna: "concepto", ancho: 44 }, claveMoneda], subtitulo },
    PALETA,
  );
  if (a.controles.length > 0) {
    escribirControl(wb, a, det, { subtitulo: `Archivo: ${a.archivos.join(", ")}  |  Generado: ${formatearFecha(new Date())}` }, PALETA);
  }
  escribirDetalle(wb, a.movimientos, ESQUEMA, PALETA);
  return libroABlob(wb);
}
