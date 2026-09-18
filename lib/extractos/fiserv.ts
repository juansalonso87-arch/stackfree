/**
 * Lector del reporte "Liquidaciones diarias" de Fiserv (ex First Data / Posnet):
 * portal de comercios → Liquidaciones → Liquidaciones Diarias → filtrar por
 * fecha (y CUIT si hay varios comercios) → descargar el Excel completo.
 *
 * Es un .xlsx con una hoja ("Tabla Operaciones") y UNA FILA POR LIQUIDACIÓN:
 * por cada día de pago y cada tarjeta (Visa Crédito, Mastercard Débito, Amex…)
 * Fiserv arma una liquidación con las ventas presentadas, le descuenta el
 * arancel, el IVA sobre el arancel, la retención de IIBB (SIRTAC) y las
 * percepciones que correspondan, y deposita el IMPORTE NETO en el banco del
 * comercio. Ese neto es lo que aparece como crédito en el extracto bancario,
 * y por eso sirve para conciliar (ver conciliacion-tarjetas.ts).
 *
 * Identidades validadas con reportes reales (Comafi 109 filas y BBVA 92 filas,
 * 2026-09-18), que se usan como controles:
 *   TOTAL IMPORTE ACEPTADO − TOTAL DEDUCCIONES = TOTAL LIQUIDACION
 *   TOTAL DEDUCCIONES = ARANCEL + IVA s/arancel + RET. IIBB SIRTAC + percepciones
 *   TOTAL LIQUIDACION − cargos (reintentos, servicio oper. internac.) = IMPORTE NETO
 * Las columnas de percepciones y cargos varían según el comercio (PER B.A.I.BR,
 * PERCEPCION IVA RG 3337, COB FISERV QRPCT PERC IVA 2408…): por eso se derivan
 * por diferencia en vez de leerlas una por una. Puede haber liquidaciones con
 * neto negativo o cero (solo una percepción, sin ventas): son ajustes que no
 * generan crédito en el banco.
 */

import { control } from "./excel";
import { detectarFilaCabecera, leerPlanilla, type Celda } from "./planilla";
import { aFecha, aNumero, normalizarBasico, round2 } from "./texto";
import { ErrorExtracto, type Control } from "./tipos";

/** Columnas por nombre normalizado (minúsculas, sin acentos); cada clave admite variantes. */
const COLUMNAS: Record<string, string[]> = {
  comercio: ["comercio", "nro comercio", "numero de comercio", "establecimiento"],
  fechaPago: ["fecha de pago", "fecha pago", "fecha de acreditacion"],
  fechaPresentacion: ["fecha de presentacion", "fecha presentacion"],
  nro: ["numero liquidacion", "nro liquidacion", "nro. liquidacion", "liquidacion"],
  tipo: ["tipo"],
  moneda: ["moneda"],
  entidad: ["entidad pagadora", "banco", "entidad"],
  cuenta: ["cuenta bancaria", "cuenta"],
  tarjeta: ["tarjeta", "producto", "marca"],
  neto: ["importe neto", "neto a pagar", "neto"],
  bruto: ["total importe aceptado", "importe aceptado", "ventas aceptadas", "total presentado"],
  arancel: ["arancel", "comision"],
  iva: ["iva cred.fisc.comercio s/aranc", "iva cred fisc comercio s/aranc", "iva s/arancel", "iva sobre arancel", "iva cred.fisc"],
  retIibb: ["retencion ing.brutos sirtac", "retencion ing brutos sirtac", "retencion ingresos brutos", "retencion iibb", "sirtac"],
  deducciones: ["total deducciones", "deducciones"],
  liquidacion: ["total liquidacion", "liquidacion total"],
};
const REQUERIDAS = ["fechaPago", "tarjeta", "neto", "bruto", "deducciones", "liquidacion"];

export type FamiliaTarjeta = "credito" | "debito" | "prepaga" | "otra";

export interface LiquidacionFiserv {
  comercio: string;
  nro: string;
  fechaPago: Date;
  fechaPresentacion: Date | null;
  /** Días entre la presentación de las ventas y el pago. */
  diasPago: number | null;
  tipo: string;
  moneda: string;
  entidad: string;
  cuenta: string;
  /** Nombre normalizado ("Visa Crédito", "Mastercard Débito", "Amex"). */
  tarjeta: string;
  familia: FamiliaTarjeta;
  /** TOTAL IMPORTE ACEPTADO: las ventas presentadas que Fiserv aceptó. */
  bruto: number;
  arancel: number;
  ivaArancel: number;
  retIibb: number;
  /** Deducciones − arancel − IVA − IIBB: percepciones de IVA/IIBB y similares. */
  percepciones: number;
  deducciones: number;
  /** TOTAL LIQUIDACION = bruto − deducciones. */
  liquidacion: number;
  /** Liquidación − neto: reintentos, servicio de operaciones internacionales, etc. */
  cargos: number;
  /** IMPORTE NETO: lo que Fiserv deposita en el banco (o descuenta, si es negativo). */
  neto: number;
  /**
   * Columnas no estándar con importe en esta fila ("COB FISERV QRPCT RET.IB.SIRTAC: 1.520"):
   * explican las percepciones y cargos. Las retenciones sobre cobros QR (QRPCT) llegan
   * como liquidaciones negativas porque esos cobros se acreditan aparte, por CVU.
   */
  detalleCargos: string;
  /** Las identidades del reporte cierran para esta fila (±5 centavos). */
  cierra: boolean;
  archivo: string;
}

export interface AnalisisFiserv {
  liquidaciones: LiquidacionFiserv[];
  /** Con neto > 0: las que deben aparecer como crédito en el banco. */
  pagos: LiquidacionFiserv[];
  /** Con neto ≤ 0: ajustes o débitos de Fiserv sin crédito bancario. */
  ajustes: LiquidacionFiserv[];
  comercios: string[];
  entidades: string[];
  desde: Date;
  hasta: Date;
  controles: Control[];
  avisos: string[];
  archivos: string[];
}

const texto = (v: Celda) => String(v ?? "").trim();

/** "Mastercard Debit" → "Mastercard Débito"; "Visa Crédito" queda igual; detecta la familia. */
export function normalizarTarjeta(crudo: string): { nombre: string; familia: FamiliaTarjeta } {
  const t = normalizarBasico(crudo);
  const marca = /master/.test(t) ? "Mastercard" : /visa/.test(t) ? "Visa" : /amex|american/.test(t) ? "Amex" : /cabal/.test(t) ? "Cabal" : /naranja/.test(t) ? "Naranja" : /maestro/.test(t) ? "Maestro" : /diners/.test(t) ? "Diners" : crudo.trim() || "Sin dato";
  const familia: FamiliaTarjeta = /debit|debito/.test(t) || marca === "Maestro" ? "debito" : /prepag|prepaid/.test(t) ? "prepaga" : /credit|credito/.test(t) || marca === "Amex" || marca === "Diners" ? "credito" : "otra";
  const sufijo = familia === "debito" ? " Débito" : familia === "credito" && marca !== "Amex" && marca !== "Diners" ? " Crédito" : familia === "prepaga" ? " Prepaga" : "";
  return { nombre: `${marca}${sufijo}`, familia };
}

function mapearColumnas(cabecera: Celda[]): Record<string, number> {
  const titulos = cabecera.map((c) => normalizarBasico(c));
  const cols: Record<string, number> = {};
  for (const [clave, variantes] of Object.entries(COLUMNAS)) {
    // Primero igualdad exacta, después "empieza con" (los títulos largos traen porcentajes al final).
    let i = titulos.findIndex((t) => variantes.includes(t));
    if (i < 0) i = titulos.findIndex((t) => t && variantes.some((v) => t.startsWith(v)));
    if (i >= 0) cols[clave] = i;
  }
  return cols;
}

const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

export async function analizarFiserv(archivos: File[]): Promise<AnalisisFiserv> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos de Fiserv para analizar.");
  const liquidaciones: LiquidacionFiserv[] = [];
  const avisos: string[] = [];
  const vistas = new Set<string>();
  let duplicadas = 0;
  let sinFecha = 0;

  for (const archivo of archivos) {
    const hojas = await leerPlanilla(archivo);
    const hoja = hojas.find((h) => h.filas.length > 1) ?? hojas[0];
    const filaCab = detectarFilaCabecera(hoja.filas, (celdas) => celdas.some((c) => c.startsWith("importe neto")) && celdas.some((c) => c.startsWith("fecha de pago")));
    if (filaCab < 0) {
      throw new ErrorExtracto(
        `"${archivo.name}" no parece el reporte de liquidaciones diarias de Fiserv: no encontré las columnas "FECHA DE PAGO" e "IMPORTE NETO". ` +
          "Descargalo desde Liquidaciones → Liquidaciones Diarias → Descargar Excel completo, y subilo tal cual.",
      );
    }
    const cabecera = hoja.filas[filaCab];
    const cols = mapearColumnas(cabecera);
    const faltan = REQUERIDAS.filter((k) => cols[k] === undefined);
    if (faltan.length) throw new ErrorExtracto(`Al reporte de Fiserv "${archivo.name}" le faltan columnas: ${faltan.join(", ")}.`);
    const celda = (fila: Celda[], k: string): Celda => (cols[k] === undefined ? null : fila[cols[k]]);
    // Columnas que no son las estándar (percepciones y cargos variables): se listan por fila para explicar cada ajuste.
    const conocidas = new Set(Object.values(cols));
    const extras = cabecera
      .map((t, i) => ({ i, titulo: texto(t).replace(/\s+/g, " ") }))
      .filter((x) => x.titulo && !conocidas.has(x.i) && !/^(ventas [cs]\/descuento|subtotal neto|total pagos de comercios)/i.test(x.titulo));
    const detalleCargosDe = (fila: Celda[]) =>
      extras
        .map((x) => ({ titulo: x.titulo, valor: aNumero(fila[x.i]) }))
        .filter((x) => x.valor !== 0)
        .map((x) => `${x.titulo}: ${x.valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join(" · ");

    for (const fila of hoja.filas.slice(filaCab + 1)) {
      if (fila.every((c) => c === null || c === "")) continue;
      const fechaPago = aFecha(celda(fila, "fechaPago"));
      if (!fechaPago) {
        // Las filas de totales o pie del reporte no tienen fecha.
        if (aNumero(celda(fila, "neto")) !== 0) sinFecha++;
        continue;
      }
      const nro = texto(celda(fila, "nro"));
      const neto = round2(aNumero(celda(fila, "neto")));
      const clave = `${nro}|${fechaPago.getTime()}|${neto}`;
      if (nro && vistas.has(clave)) {
        duplicadas++;
        continue;
      }
      vistas.add(clave);

      const bruto = round2(aNumero(celda(fila, "bruto")));
      const arancel = round2(aNumero(celda(fila, "arancel")));
      const ivaArancel = round2(aNumero(celda(fila, "iva")));
      const retIibb = round2(aNumero(celda(fila, "retIibb")));
      const deducciones = round2(aNumero(celda(fila, "deducciones")));
      const liquidacion = round2(aNumero(celda(fila, "liquidacion")));
      const percepciones = round2(deducciones - arancel - ivaArancel - retIibb);
      const cargos = round2(liquidacion - neto);
      const fechaPresentacion = aFecha(celda(fila, "fechaPresentacion"));
      const { nombre, familia } = normalizarTarjeta(texto(celda(fila, "tarjeta")));
      liquidaciones.push({
        comercio: texto(celda(fila, "comercio")),
        nro,
        fechaPago,
        fechaPresentacion,
        diasPago: fechaPresentacion ? diasEntre(fechaPresentacion, fechaPago) : null,
        tipo: texto(celda(fila, "tipo")),
        moneda: texto(celda(fila, "moneda")) || "$",
        entidad: texto(celda(fila, "entidad")),
        cuenta: texto(celda(fila, "cuenta")),
        tarjeta: nombre,
        familia,
        bruto,
        arancel,
        ivaArancel,
        retIibb,
        percepciones,
        deducciones,
        liquidacion,
        cargos,
        neto,
        detalleCargos: detalleCargosDe(fila),
        cierra: Math.abs(bruto - deducciones - liquidacion) < 0.05 && percepciones > -0.05,
        archivo: archivo.name,
      });
    }
  }

  if (liquidaciones.length === 0) throw new ErrorExtracto("No encontré ninguna liquidación con fecha de pago en el reporte de Fiserv.");
  liquidaciones.sort((a, b) => a.fechaPago.getTime() - b.fechaPago.getTime() || a.tarjeta.localeCompare(b.tarjeta));

  if (duplicadas) avisos.push(`${duplicadas} liquidación(es) repetidas entre los archivos se contaron una sola vez.`);
  if (sinFecha) avisos.push(`${sinFecha} fila(s) sin fecha de pago se ignoraron (suelen ser totales del reporte).`);
  const monedas = [...new Set(liquidaciones.map((l) => l.moneda))];
  if (monedas.length > 1) avisos.push(`El reporte mezcla monedas (${monedas.join(", ")}): la conciliación compara importes tal cual, sin convertir.`);

  const pagos = liquidaciones.filter((l) => l.neto > 0);
  const ajustes = liquidaciones.filter((l) => l.neto <= 0);
  if (ajustes.length) {
    avisos.push(
      `${ajustes.length} liquidación(es) con neto cero o negativo: son retenciones o cargos sin ventas (por ejemplo, las retenciones sobre los cobros QR, que Fiserv acredita aparte por CVU). No generan crédito en el banco y se listan aparte con su detalle.`,
    );
  }

  const sum = (xs: LiquidacionFiserv[], f: (l: LiquidacionFiserv) => number) => round2(xs.reduce((s, l) => s + f(l), 0));
  const noCierran = liquidaciones.filter((l) => !l.cierra).length;
  const liquidado = sum(liquidaciones, (l) => l.bruto - l.deducciones);
  const declarado = sum(liquidaciones, (l) => l.liquidacion);
  // Percepciones y cargos se derivan por diferencia, así que los únicos controles con sentido son los de la identidad principal.
  const controles: Control[] = [
    control("Fiserv", "Liquidaciones cuyo bruto − deducciones = total liquidación", liquidaciones.length - noCierran, liquidaciones.length, noCierran === 0, "ent"),
    control("Fiserv", "Total liquidado: bruto − deducciones = suma de liquidaciones", liquidado, declarado, Math.abs(liquidado - declarado) < 0.05),
  ];

  return {
    liquidaciones,
    pagos,
    ajustes,
    comercios: [...new Set(liquidaciones.map((l) => l.comercio).filter(Boolean))],
    entidades: [...new Set(liquidaciones.map((l) => l.entidad).filter(Boolean))],
    desde: liquidaciones[0].fechaPago,
    hasta: liquidaciones[liquidaciones.length - 1].fechaPago,
    controles,
    avisos,
    archivos: archivos.map((a) => a.name),
  };
}

export interface ResumenTarjeta {
  tarjeta: string;
  familia: FamiliaTarjeta;
  liquidaciones: number;
  bruto: number;
  arancel: number;
  ivaArancel: number;
  retIibb: number;
  percepciones: number;
  cargos: number;
  neto: number;
  /** Mediana de días entre presentación y pago. */
  diasPago: number | null;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function porTarjeta(liquidaciones: LiquidacionFiserv[]): ResumenTarjeta[] {
  const mapa = new Map<string, ResumenTarjeta & { dias: number[] }>();
  for (const l of liquidaciones) {
    const r = mapa.get(l.tarjeta) ?? { tarjeta: l.tarjeta, familia: l.familia, liquidaciones: 0, bruto: 0, arancel: 0, ivaArancel: 0, retIibb: 0, percepciones: 0, cargos: 0, neto: 0, diasPago: null, dias: [] };
    r.liquidaciones++;
    r.bruto += l.bruto;
    r.arancel += l.arancel;
    r.ivaArancel += l.ivaArancel;
    r.retIibb += l.retIibb;
    r.percepciones += l.percepciones;
    r.cargos += l.cargos;
    r.neto += l.neto;
    if (l.diasPago !== null && l.bruto > 0) r.dias.push(l.diasPago);
    mapa.set(l.tarjeta, r);
  }
  return [...mapa.values()]
    .map(({ dias, ...r }) => ({ ...r, diasPago: mediana(dias) }))
    .sort((a, b) => b.bruto - a.bruto);
}

export function porDiaDePago(liquidaciones: LiquidacionFiserv[]) {
  const mapa = new Map<number, { dia: Date; liquidaciones: number; bruto: number; deducciones: number; neto: number; tarjetas: Set<string> }>();
  for (const l of liquidaciones) {
    const k = l.fechaPago.getTime();
    const f = mapa.get(k) ?? { dia: l.fechaPago, liquidaciones: 0, bruto: 0, deducciones: 0, neto: 0, tarjetas: new Set<string>() };
    f.liquidaciones++;
    f.bruto += l.bruto;
    f.deducciones += l.deducciones + l.cargos;
    f.neto += l.neto;
    f.tarjetas.add(l.tarjeta);
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => a.dia.getTime() - b.dia.getTime());
}
