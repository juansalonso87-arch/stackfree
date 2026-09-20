/**
 * Conciliación de las liquidaciones de Fiserv con los créditos del banco.
 *
 * Entrada: el reporte de liquidaciones diarias de Fiserv (fiserv.ts) y el
 * extracto del banco del MISMO período, leído con el analizador que ya existe
 * para ese banco (santander.ts / bbva.ts / comafi.ts). Este módulo no toca
 * esos analizadores: solo les pide los movimientos y se queda con los
 * créditos de la categoría "Cobros con tarjeta".
 *
 * Cruce, en orden: (1) misma fecha de pago y mismo importe neto, al centavo;
 * (2) mismo importe con el banco acreditando hasta 3 días después (o 1 antes);
 * (3) un crédito del banco que es la suma de varias liquidaciones del mismo día
 * (por si el banco las agrupa). Lo que queda sin pareja se explica: crédito de
 * otra procesadora (Cabal, Naranja, Prisma…), fuera del período que cubre el
 * otro archivo, o realmente sin acreditar / sin liquidación.
 *
 * Validado el 2026-09-18 con dos pares reales: Comafi (109/109, mismo día) y
 * BBVA (91/91 con neto > 0, mismo día; el banco decía "Master Card" en todos los
 * créditos aunque la tarjeta fuera Visa o Amex).
 */

import { control } from "./excel";
import { analizarFiserv, type AnalisisFiserv, type LiquidacionFiserv } from "./fiserv";
import { esPdf, leerTextoPdf } from "./pdf-texto";
import { arranqueDe, detectarFilaCabecera, esExcelReal, leerPlanilla, leerTexto } from "./planilla";
import { formatearPesos, normalizarBasico, round2, sinAcentos } from "./texto";
import { CATEGORIA, ErrorExtracto, type AnalisisExtracto, type Banco, type Control, type Movimiento } from "./tipos";

export const BANCOS: { id: Banco; nombre: string }[] = [
  { id: "santander", nombre: "Santander" },
  { id: "bbva", nombre: "BBVA" },
  { id: "comafi", nombre: "Comafi" },
];

export const nombreBanco = (b: Banco) => BANCOS.find((x) => x.id === b)?.nombre ?? b;

/** Procesadoras que NO son Fiserv: un crédito del banco que las nombra no tiene por qué estar en el reporte. */
const OTRAS_PROCESADORAS = ["CABAL", "NARANJA", "PRISMA", "PAYWAY", "LAPOS", "GETNET", "MERCADO PAGO", "MERCADOPAGO", "CLOVER", "AMERICAN EXPRESS"];
const FISERV = ["FISERV", "FIRST DATA", "POSNET"];

/* ------------------------------------------------------------------ */
/* Detección del banco                                                  */
/* ------------------------------------------------------------------ */

/**
 * Reconoce de qué banco es el extracto mirando la firma del archivo, sin
 * intentar analizarlo (los lectores por nombre de columna son tolerantes y
 * podrían aceptar el archivo de otro banco). Devuelve null si no lo reconoce.
 */
export async function detectarBanco(archivo: File): Promise<Banco | null> {
  const arranque = await arranqueDe(archivo);
  if (await esPdf(archivo)) {
    // Resumen de cuenta en PDF: el banco se nombra en el encabezado o en el pie de cada página.
    const { lineas, titulo } = await leerTextoPdf(archivo);
    const texto = `${titulo} ${lineas.slice(0, 400).map((l) => l.texto).join(" ")}`;
    if (/\bcomafi\b/i.test(texto)) return "comafi";
    if (/\bBBVA\b/.test(texto)) return "bbva";
    if (/\bsantander\b/i.test(texto)) return "santander";
    return null;
  }
  if (!esExcelReal(arranque)) {
    // Santander entrega un archivo de texto separado por tabulaciones cuya primera línea es "CUIT \t cuenta \t Extracto…".
    const texto = await leerTexto(archivo);
    if (texto.trimStart().startsWith("<")) return null;
    const primera = (texto.split(/\r?\n/).find((l) => l.trim() !== "") ?? "").split("\t");
    return primera.length >= 3 && sinAcentos(primera[2]).toLowerCase().includes("extracto") ? "santander" : null;
  }
  const hojas = await leerPlanilla(archivo);
  for (const hoja of hojas) {
    if (detectarFilaCabecera(hoja.filas, (c) => c.some((x) => x.startsWith("id operacion")) && c.some((x) => x.startsWith("descripcion ampliada"))) >= 0) return "comafi";
    if (detectarFilaCabecera(hoja.filas, (c) => c.includes("codigo") && c.includes("oficina") && (c.includes("credito") || c.includes("debito"))) >= 0) return "bbva";
  }
  return null;
}

/** Corre el analizador del banco elegido (se importa a demanda para no cargar los tres). */
export async function analizarBanco(banco: Banco, archivos: File[]): Promise<AnalisisExtracto> {
  switch (banco) {
    case "santander":
      return (await import("./santander")).analizarSantander(archivos);
    case "bbva":
      return (await import("./bbva")).analizarBbva(archivos);
    case "comafi":
      return (await import("./comafi")).analizarComafi(archivos);
  }
}

/* ------------------------------------------------------------------ */
/* Cruce                                                                */
/* ------------------------------------------------------------------ */

export type ComoConcilio = "exacto" | "fecha-cercana" | "agrupado";
export type MotivoSinCredito = "banco-no-cubre" | "sin-acreditar";
export type MotivoSinLiquidacion = "otra-procesadora" | "fiserv-cvu" | "fiserv-no-cubre" | "sin-liquidacion";

export interface Conciliado {
  liquidacion: LiquidacionFiserv;
  credito: Movimiento;
  como: ComoConcilio;
  /** Días entre la fecha de pago de Fiserv y la fecha del crédito en el banco. */
  desfase: number;
}

export interface SinCredito {
  liquidacion: LiquidacionFiserv;
  motivo: MotivoSinCredito;
}

export interface SinLiquidacion {
  credito: Movimiento;
  motivo: MotivoSinLiquidacion;
}

/** Retenciones que el banco debita junto a cada acreditación (solo si las cobra por movimiento, como Comafi). */
export interface RetencionesBanco {
  /** Créditos conciliados a los que se les encontró el débito correspondiente. */
  emparejados: number;
  impuestoCreditos: number;
  iibb: number;
  /** Alícuota de IIBB observada (por ejemplo 0,025). */
  alicuotaIibb: number | null;
}

export interface Conciliacion {
  banco: Banco;
  fiserv: AnalisisFiserv;
  extracto: AnalisisExtracto;
  /** Créditos del banco clasificados como cobros con tarjeta. */
  creditosTarjeta: Movimiento[];
  conciliados: Conciliado[];
  sinCredito: SinCredito[];
  sinLiquidacion: SinLiquidacion[];
  /** Período que cubren ambos archivos a la vez. */
  desde: Date | null;
  hasta: Date | null;
  retenciones: RetencionesBanco | null;
  controles: Control[];
  avisos: string[];
}

const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const diasEntre = (a: Date, b: Date) => Math.round((dia(b) - dia(a)) / 86_400_000);
const centavos = (n: number) => Math.round(n * 100);
const textoDe = (m: Movimiento) => sinAcentos(`${m.conceptoOriginal ?? ""} ${m.concepto} ${m.detalle ?? ""}`).toUpperCase();

/**
 * ¿El texto del banco nombra a alguna de estas empresas? Tolera palabras
 * recortadas por el banco (BBVA escribe "CUPONES CABA" por "CUPONES CABAL"):
 * una palabra de 4 letras o más vale si es el comienzo de la buscada.
 */
function nombra(texto: string, empresas: string[]): boolean {
  // Santander pega la referencia numérica al nombre ("260730078american express"): se separa por letras.
  const palabras = texto.split(/[^A-Z]+/).filter(Boolean);
  return empresas.some((e) => {
    if (texto.includes(e)) return true;
    const partes = e.split(" ");
    for (let i = 0; i + partes.length <= palabras.length; i++) {
      if (partes.every((pt, j) => palabras[i + j] === pt || (palabras[i + j].length >= 4 && pt.startsWith(palabras[i + j])))) return true;
    }
    return false;
  });
}

/** Ventana en la que se acepta que el banco acredite: mismo día, hasta 3 después o 1 antes (huso/cierre). */
const VENTANA = { antes: -1, despues: 3 };

/** Busca, entre los créditos libres, el que coincide en importe y está más cerca de la fecha de pago. */
function buscarCredito(l: LiquidacionFiserv, creditos: Movimiento[], libres: Set<number>, soloMismoDia: boolean): { i: number; desfase: number } | null {
  const objetivo = centavos(l.neto);
  let mejor: { i: number; desfase: number } | null = null;
  for (const i of libres) {
    const m = creditos[i];
    if (!m.fecha || centavos(m.credito) !== objetivo) continue;
    const d = diasEntre(l.fechaPago, m.fecha);
    if (soloMismoDia ? d !== 0 : d < VENTANA.antes || d > VENTANA.despues) continue;
    if (!mejor || Math.abs(d) < Math.abs(mejor.desfase)) mejor = { i, desfase: d };
    if (d === 0) break;
  }
  return mejor;
}

/** Subconjunto (de 2 a 6 liquidaciones) cuya suma de netos es exactamente `objetivo`, o null. */
function subconjuntoQueSuma(candidatas: LiquidacionFiserv[], objetivo: number): LiquidacionFiserv[] | null {
  const xs = candidatas.slice(0, 12);
  const n = xs.length;
  for (let mascara = 1; mascara < 1 << n; mascara++) {
    let suma = 0;
    let cuantas = 0;
    for (let j = 0; j < n; j++) {
      if (mascara & (1 << j)) {
        suma += centavos(xs[j].neto);
        cuantas++;
      }
    }
    if (cuantas >= 2 && cuantas <= 6 && suma === objetivo) return xs.filter((_, j) => mascara & (1 << j));
  }
  return null;
}

/**
 * Retenciones del banco por acreditación: impuesto a los créditos (0,6 %) e
 * IIBB sobre acreditaciones (alícuota variable). Se emparejan por importe
 * exacto el mismo día. Si el banco las cobra agregadas por día (BBVA,
 * Santander), casi nada empareja y se devuelve null.
 */
function retencionesPorCredito(conciliados: Conciliado[], movimientos: Movimiento[]): RetencionesBanco | null {
  if (conciliados.length === 0) return null;
  const debitos = movimientos.filter((m) => m.debito > 0 && m.fecha);
  const impCheque = debitos.filter((m) => m.categoria === CATEGORIA.impCheque);
  const iibb = debitos.filter((m) => m.categoria === CATEGORIA.iibb);
  const ALICUOTAS = [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05];
  const usadosI = new Set<number>();
  const usadosB = new Set<number>();
  const alicuotas = new Map<number, number>();
  let emparejados = 0;
  let totalI = 0;
  let totalB = 0;
  for (const c of conciliados) {
    const fecha = c.credito.fecha!;
    const esperadoI = centavos(round2(c.credito.credito * 0.006));
    const i = impCheque.findIndex((m, k) => !usadosI.has(k) && dia(m.fecha!) === dia(fecha) && Math.abs(centavos(m.debito) - esperadoI) <= 1);
    let b = -1;
    let alicuota = 0;
    for (const a of ALICUOTAS) {
      const esperadoB = centavos(round2(c.credito.credito * a));
      b = iibb.findIndex((m, k) => !usadosB.has(k) && dia(m.fecha!) === dia(fecha) && Math.abs(centavos(m.debito) - esperadoB) <= 1);
      if (b >= 0) {
        alicuota = a;
        break;
      }
    }
    if (i >= 0) {
      usadosI.add(i);
      totalI += impCheque[i].debito;
    }
    if (b >= 0) {
      usadosB.add(b);
      totalB += iibb[b].debito;
      alicuotas.set(alicuota, (alicuotas.get(alicuota) ?? 0) + 1);
    }
    if (i >= 0 || b >= 0) emparejados++;
  }
  // Solo tiene sentido informarlo si el banco realmente debita por acreditación.
  if (emparejados < conciliados.length * 0.8) return null;
  const alicuotaIibb = [...alicuotas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  return { emparejados, impuestoCreditos: round2(totalI), iibb: round2(totalB), alicuotaIibb };
}

export interface OpcionesConciliacion {
  /** Banco del extracto; si no se indica, se detecta por la firma del archivo. */
  banco?: Banco;
}

export async function conciliarFiservConBanco(archivosFiserv: File[], archivosBanco: File[], opciones: OpcionesConciliacion = {}): Promise<Conciliacion> {
  if (archivosBanco.length === 0) throw new ErrorExtracto("Falta el extracto del banco.");
  if (archivosFiserv.length === 0) throw new ErrorExtracto("Falta el reporte de liquidaciones de Fiserv.");

  let banco = opciones.banco;
  if (!banco) {
    const detectados = await Promise.all(archivosBanco.map(detectarBanco));
    const distintos = [...new Set(detectados)];
    if (distintos.length !== 1 || !distintos[0]) {
      throw new ErrorExtracto(
        distintos.length > 1
          ? "Los archivos del banco parecen ser de bancos distintos: subí los de un solo banco por vez."
          : `No reconocí de qué banco es "${archivosBanco[0].name}". Elegí el banco en la lista y volvé a intentar; hoy se aceptan Santander, BBVA y Comafi.`,
      );
    }
    banco = distintos[0];
  }

  const [fiserv, extracto] = await Promise.all([analizarFiserv(archivosFiserv), analizarBanco(banco, archivosBanco)]);
  const avisos: string[] = [...fiserv.avisos.map((a) => `Fiserv: ${a}`), ...extracto.avisos.map((a) => `${nombreBanco(banco!)}: ${a}`)];

  const creditosTarjeta = extracto.movimientos
    .filter((m) => m.categoria === CATEGORIA.cobrosTarjeta && m.credito > 0 && m.fecha)
    .sort((a, b) => a.fecha!.getTime() - b.fecha!.getTime());

  // Período común: donde los dos archivos tienen datos.
  const fechasBanco = extracto.movimientos.map((m) => m.fecha).filter((f): f is Date => !!f);
  const bancoDesde = fechasBanco.length ? new Date(Math.min(...fechasBanco.map(dia))) : null;
  const bancoHasta = fechasBanco.length ? new Date(Math.max(...fechasBanco.map(dia))) : null;
  const desde = bancoDesde ? new Date(Math.max(dia(bancoDesde), dia(fiserv.desde))) : null;
  const hasta = bancoHasta ? new Date(Math.min(dia(bancoHasta), dia(fiserv.hasta))) : null;

  /* --- cruce --- */
  const libres = new Set(creditosTarjeta.map((_, i) => i));
  const conciliados: Conciliado[] = [];
  const pendientes: LiquidacionFiserv[] = [];
  const asignar = (l: LiquidacionFiserv, r: { i: number; desfase: number }, como: ComoConcilio) => {
    libres.delete(r.i);
    conciliados.push({ liquidacion: l, credito: creditosTarjeta[r.i], como, desfase: r.desfase });
  };
  // 1) mismo día y mismo importe
  for (const l of fiserv.pagos) {
    const r = buscarCredito(l, creditosTarjeta, libres, true);
    if (r) asignar(l, r, "exacto");
    else pendientes.push(l);
  }
  // 2) mismo importe, fecha cercana
  const pendientes2: LiquidacionFiserv[] = [];
  for (const l of pendientes) {
    const r = buscarCredito(l, creditosTarjeta, libres, false);
    if (r) asignar(l, r, "fecha-cercana");
    else pendientes2.push(l);
  }
  // 3) un crédito = suma de varias liquidaciones del mismo día de pago
  const pendientes3 = new Set(pendientes2);
  for (const i of [...libres]) {
    const m = creditosTarjeta[i];
    const candidatas = [...pendientes3].filter((l) => {
      const d = diasEntre(l.fechaPago, m.fecha!);
      return d >= VENTANA.antes && d <= VENTANA.despues;
    });
    if (candidatas.length < 2) continue;
    const grupo = subconjuntoQueSuma(candidatas, centavos(m.credito));
    if (!grupo) continue;
    libres.delete(i);
    for (const l of grupo) {
      pendientes3.delete(l);
      conciliados.push({ liquidacion: l, credito: m, como: "agrupado", desfase: diasEntre(l.fechaPago, m.fecha!) });
    }
  }

  /* --- explicar lo que quedó suelto --- */
  const sinCredito: SinCredito[] = [...pendientes3].map((l) => ({
    liquidacion: l,
    motivo: bancoHasta && bancoDesde && (dia(l.fechaPago) > dia(bancoHasta) || dia(l.fechaPago) < dia(bancoDesde)) ? "banco-no-cubre" : "sin-acreditar",
  }));
  const sinLiquidacion: SinLiquidacion[] = [...libres].map((i) => {
    const m = creditosTarjeta[i];
    const t = textoDe(m);
    const esFiserv = nombra(t, FISERV);
    let motivo: MotivoSinLiquidacion = "sin-liquidacion";
    if (!esFiserv && nombra(t, OTRAS_PROCESADORAS)) motivo = "otra-procesadora";
    // Cobros QR de Fiserv ("pago con transferencia"): llegan al banco como transferencias por CVU, en el momento y también
    // los fines de semana. No pasan por la liquidación diaria (que solo trae sus retenciones, como filas negativas).
    else if (esFiserv && /TRANSF|CVU|COELSA|DATANET/.test(t)) motivo = "fiserv-cvu";
    else if (dia(m.fecha!) > dia(fiserv.hasta) || dia(m.fecha!) < dia(fiserv.desde)) motivo = "fiserv-no-cubre";
    return { credito: m, motivo };
  });
  sinCredito.sort((a, b) => a.liquidacion.fechaPago.getTime() - b.liquidacion.fechaPago.getTime());
  sinLiquidacion.sort((a, b) => a.credito.fecha!.getTime() - b.credito.fecha!.getTime());
  conciliados.sort((a, b) => a.liquidacion.fechaPago.getTime() - b.liquidacion.fechaPago.getTime() || a.liquidacion.tarjeta.localeCompare(b.liquidacion.tarjeta));

  const cuenta = (xs: { motivo: string }[], motivo: string) => xs.filter((x) => x.motivo === motivo).length;
  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
  if (cuenta(sinCredito, "banco-no-cubre")) {
    avisos.push(
      `${cuenta(sinCredito, "banco-no-cubre")} liquidación(es) de Fiserv tienen fecha de pago fuera de las fechas del extracto: no se pueden conciliar con este archivo del banco. Si querés cubrirlas, bajá el extracto hasta ${formatear(fiserv.hasta)}.`,
    );
  }
  if (cuenta(sinLiquidacion, "fiserv-no-cubre")) {
    avisos.push(
      `${cuenta(sinLiquidacion, "fiserv-no-cubre")} crédito(s) del banco son anteriores o posteriores al reporte de Fiserv (${formatear(fiserv.desde)} a ${formatear(fiserv.hasta)}): descargá el reporte cubriendo todo el período del extracto para conciliarlos.`,
    );
  }
  if (cuenta(sinLiquidacion, "fiserv-cvu")) {
    avisos.push(
      `${cuenta(sinLiquidacion, "fiserv-cvu")} crédito(s) del banco son cobros QR de Fiserv acreditados por transferencia (CVU), por ${formatearPesos(sum(sinLiquidacion.filter((x) => x.motivo === "fiserv-cvu").map((x) => x.credito.credito)))}: no figuran como pagos en la liquidación diaria (que solo trae sus retenciones) y se muestran aparte.`,
    );
  }
  if (cuenta(sinLiquidacion, "otra-procesadora")) {
    avisos.push(`${cuenta(sinLiquidacion, "otra-procesadora")} crédito(s) del banco vienen de otra procesadora o marca que liquida directo (Cabal, Naranja, American Express, Prisma…): no corresponden a Fiserv y se listan aparte.`);
  }
  const cercanas = conciliados.filter((c) => c.como === "fecha-cercana").length;
  if (cercanas) avisos.push(`${cercanas} liquidación(es) se acreditaron en el banco con uno o más días de diferencia respecto de la fecha de pago de Fiserv.`);
  const agrupadas = conciliados.filter((c) => c.como === "agrupado").length;
  if (agrupadas) avisos.push(`${agrupadas} liquidación(es) llegaron al banco agrupadas en un solo crédito.`);

  const retenciones = retencionesPorCredito(conciliados, extracto.movimientos);

  const enRango = fiserv.pagos.filter((l) => desde && hasta && dia(l.fechaPago) >= dia(desde) && dia(l.fechaPago) <= dia(hasta));
  const conciliadasEnRango = conciliados.filter((c) => desde && hasta && dia(c.liquidacion.fechaPago) >= dia(desde) && dia(c.liquidacion.fechaPago) <= dia(hasta)).length;
  const controles: Control[] = [
    ...fiserv.controles,
    control("Conciliación", "Liquidaciones con pago acreditadas en el banco (dentro del período común)", conciliadasEnRango, enRango.length, conciliadasEnRango === enRango.length, "ent"),
    control(
      "Conciliación",
      "Neto de las liquidaciones conciliadas = créditos del banco conciliados",
      sum(conciliados.map((c) => c.liquidacion.neto)),
      sum([...new Set(conciliados.map((c) => c.credito))].map((m) => m.credito)),
      Math.abs(sum(conciliados.map((c) => c.liquidacion.neto)) - sum([...new Set(conciliados.map((c) => c.credito))].map((m) => m.credito))) < 0.05,
    ),
    control(
      "Conciliación",
      "Créditos del banco por tarjeta (de Fiserv) con su liquidación",
      creditosTarjeta.length - cuenta(sinLiquidacion, "sin-liquidacion") - cuenta(sinLiquidacion, "otra-procesadora") - cuenta(sinLiquidacion, "fiserv-no-cubre") - cuenta(sinLiquidacion, "fiserv-cvu"),
      creditosTarjeta.length - cuenta(sinLiquidacion, "otra-procesadora") - cuenta(sinLiquidacion, "fiserv-no-cubre") - cuenta(sinLiquidacion, "fiserv-cvu"),
      cuenta(sinLiquidacion, "sin-liquidacion") === 0,
      "ent",
    ),
    ...extracto.controles.map((c) => ({ ...c, grupo: `${nombreBanco(banco!)}: ${c.grupo}` })),
  ];

  return { banco, fiserv, extracto, creditosTarjeta, conciliados, sinCredito, sinLiquidacion, desde, hasta, retenciones, controles, avisos };
}

function formatear(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* Resúmenes                                                            */
/* ------------------------------------------------------------------ */

export const ETIQUETA_COMO: Record<ComoConcilio, string> = {
  exacto: "Mismo día",
  "fecha-cercana": "Fecha cercana",
  agrupado: "Agrupada en un crédito",
};
export const ETIQUETA_SIN_CREDITO: Record<MotivoSinCredito, string> = {
  "banco-no-cubre": "Fuera de las fechas del extracto",
  "sin-acreditar": "Sin acreditar en el banco",
};
export const ETIQUETA_SIN_LIQUIDACION: Record<MotivoSinLiquidacion, string> = {
  "otra-procesadora": "Otra procesadora o marca (no Fiserv)",
  "fiserv-cvu": "Cobro QR de Fiserv acreditado por CVU",
  "fiserv-no-cubre": "Fuera de las fechas del reporte de Fiserv",
  "sin-liquidacion": "Sin liquidación en Fiserv",
};

/**
 * Cadena completa: ventas con tarjeta → lo que se queda Fiserv → lo que retiene
 * el banco → lo que queda. Se calcula sobre las liquidaciones CON pago; las de
 * neto ≤ 0 (retenciones sobre cobros QR y otros ajustes sin ventas) van aparte
 * en `ajustes`, porque no salen de estas ventas.
 */
export interface CostoReal {
  bruto: number;
  arancel: number;
  ivaArancel: number;
  retIibb: number;
  percepciones: number;
  /** Reintentos, operaciones internacionales, menos reembolsos (dentro de las liquidaciones con pago). */
  cargos: number;
  /** Total que se queda Fiserv de estas ventas: deducciones + cargos. */
  seLlevaFiserv: number;
  /** Neto depositado por las liquidaciones con pago. */
  netoFiserv: number;
  /** Liquidaciones con neto ≤ 0 (en negativo): retenciones sobre cobros QR y otros ajustes sin ventas. */
  ajustes: number;
  /** Cobros QR de Fiserv acreditados por CVU (si el banco los muestra), base de esas retenciones. */
  cobrosQr: number;
  /** Retenciones del banco emparejadas por crédito (null si el banco las cobra agregadas). */
  impuestoCreditos: number | null;
  iibbBanco: number | null;
  /** Neto de Fiserv menos las retenciones del banco (si se conocen). */
  queda: number;
}

export function costoReal(c: Conciliacion): CostoReal {
  const s = (xs: LiquidacionFiserv[], f: (l: LiquidacionFiserv) => number) => round2(xs.reduce((acc, l) => acc + f(l), 0));
  const pagos = c.fiserv.pagos;
  const netoFiserv = s(pagos, (l) => l.neto);
  const r = c.retenciones;
  const deducciones = s(pagos, (l) => l.deducciones);
  const cargos = s(pagos, (l) => l.cargos);
  return {
    bruto: s(pagos, (l) => l.bruto),
    arancel: s(pagos, (l) => l.arancel),
    ivaArancel: s(pagos, (l) => l.ivaArancel),
    retIibb: s(pagos, (l) => l.retIibb),
    percepciones: s(pagos, (l) => l.percepciones),
    cargos,
    seLlevaFiserv: round2(deducciones + cargos),
    netoFiserv,
    ajustes: s(c.fiserv.ajustes, (l) => l.neto),
    cobrosQr: round2(c.sinLiquidacion.filter((x) => x.motivo === "fiserv-cvu").reduce((acc, x) => acc + x.credito.credito, 0)),
    impuestoCreditos: r ? r.impuestoCreditos : null,
    iibbBanco: r ? r.iibb : null,
    queda: round2(netoFiserv - (r ? r.impuestoCreditos + r.iibb : 0)),
  };
}

/** Días entre la fecha de pago de Fiserv y la acreditación, por familia de tarjeta (mediana de presentación → pago). */
export function plazosPorFamilia(c: Conciliacion): { familia: string; liquidaciones: number; diasPresentacionAPago: number | null; diasHastaBanco: number | null }[] {
  const grupos = new Map<string, { dias: number[]; banco: number[] }>();
  for (const l of c.fiserv.pagos) {
    const g = grupos.get(l.familia) ?? { dias: [], banco: [] };
    if (l.diasPago !== null) g.dias.push(l.diasPago);
    grupos.set(l.familia, g);
  }
  for (const x of c.conciliados) grupos.get(x.liquidacion.familia)?.banco.push(x.desfase);
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const nombre: Record<string, string> = { credito: "Crédito", debito: "Débito", prepaga: "Prepaga", otra: "Otras" };
  return [...grupos.entries()].map(([familia, g]) => ({ familia: nombre[familia] ?? familia, liquidaciones: g.dias.length, diasPresentacionAPago: med(g.dias), diasHastaBanco: med(g.banco) }));
}

/** Descripción corta de un crédito del banco para mostrar al lado de la liquidación. */
export function describirCredito(m: Movimiento): string {
  const base = (m.conceptoOriginal ?? m.concepto).replace(/\s+/g, " ").trim();
  const det = (m.detalle ?? "").replace(/\s+/g, " ").trim();
  return det && !normalizarBasico(base).includes(normalizarBasico(det)) ? `${base} · ${det}` : base;
}
