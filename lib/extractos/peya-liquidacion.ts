/**
 * Liquidación de PedidosYa: cruza los dos reportes del Portal Partner.
 *
 *   - Estado de cuenta (Finanzas → semana): la liquidación tal cual la arma
 *     PedidosYa, con todas las sucursales juntas. Trae la venta neta, tus
 *     promos, los descuentos que PedidosYa te cobra, la comisión, el cargo por
 *     pedidos con Plus, los reclamos confirmados y los reintegros.
 *   - Reporte de pedidos (Reportes → Pedidos): uno por local. Es el único que
 *     trae la TARIFA DE PAGO ONLINE y el IVA sobre las comisiones, más los
 *     cancelados, los horarios y los artículos.
 *
 * Ninguno de los dos alcanza solo: el estado de cuenta esconde dos costos (y
 * por eso sobrestima el depósito) y el reporte de pedidos no ve los reintegros
 * ni separa tu promo del cargo por Plus. Con los dos, cada pedido se controla
 * contra sí mismo y aparecen las diferencias que hay que reclamar.
 *
 * El usuario sube todo junto en un solo recuadro: cada archivo se reconoce por
 * su contenido.
 */

import { ErrorExtracto, type Control } from "./tipos";
import { aFecha, aNumero, claveDia, formatearFecha, round2, soloDia } from "./texto";
import { leerPlanilla, type Hoja } from "./planilla";
import { control } from "./excel";
import { analizarPedidosYa, type AnalisisPedidosYa, type PedidoPeYa } from "./pedidosya";
import { esEstadoDeCuentaPeYa, leerEstadoDeCuenta, type EstadoCuenta, type PedidoEstadoCuenta } from "./peya-estado";

export type { EstadoCuenta, PedidoEstadoCuenta } from "./peya-estado";

/** Una fila de la tabla "Día a día" (una por fecha y sucursal). */
export interface DiaLiquidacion {
  fecha: Date;
  sucursal: string;
  pedidos: number;
  /** Lo que compró el cliente a precio de carta. */
  bruto: number;
  /** Promos que financiás vos; null si esa fecha no tiene estado de cuenta. */
  promos: number | null;
  /** Venta que PedidosYa toma como base; null sin estado de cuenta. */
  neta: number | null;
  /** Lo que cobró el local en mano (pedidos pagados fuera de la app). */
  efectivo: number;
  /** Venta neta que cobra PedidosYa y después deposita; null sin estado de cuenta. */
  porApp: number | null;
  cancelados: number;
  montoCancelado: number;
  /** Lo que valía el pedido cancelado para el local (sin su promo): lo que suele quedar anotado por error. */
  canceladoNeto: number;
  /** De esos cancelados, los que el cliente iba a pagar en efectivo. */
  canceladoNetoEfectivo: number;
  /** Descuentos que PedidosYa cobra sobre pedidos pagados por la app. */
  descuentoPeyaDigital: number;
  /** Descuentos que PedidosYa cobra sobre pedidos cobrados en el local. */
  descuentoPeyaEfectivo: number;
  /** Negativo: reclamos de usuarios sobre pedidos de ese día. */
  reclamos: number;
  tieneEstado: boolean;
  tienePedidos: boolean;
}

/**
 * Qué anota el local en su planilla diaria. Cada local lleva la cuenta a su
 * manera, así que el usuario elige y la comparación cambia de base.
 */
export type ModoPlanillaLocal = "total" | "digital" | "efectivo";
/** Lo que elige el usuario: puede dejar que la herramienta lo deduzca sola. */
export type ModoPlanillaElegido = ModoPlanillaLocal | "auto";

export const MODOS_PLANILLA_LOCAL: { id: ModoPlanillaLocal; etiqueta: string; ayuda: string }[] = [
  { id: "total", etiqueta: "La venta total del día", ayuda: "lo que cobró PedidosYa por la app más lo que cobraste en efectivo en el local" },
  { id: "digital", etiqueta: "Solo lo cobrado por la app", ayuda: "los pedidos que pagó el cliente por PedidosYa, sin los que te pagaron en efectivo" },
  { id: "efectivo", etiqueta: "Solo lo cobrado en efectivo", ayuda: "los pedidos que el cliente pagó en el local, en mano" },
];

/** Una fila de la comparación con la planilla diaria del local. */
export interface FilaPlanillaLocal {
  fecha: Date;
  /** Lo que informó el local ese día, según lo que eligió que anota. */
  informado: number;
  /** Lo que PedidosYa toma como venta de ese día, en la misma base. */
  segunPeya: number;
  descuentosPeya: number;
  canceladoNeto: number;
  /** informado − segunPeya. */
  diferencia: number;
  /** Lo que queda sin explicar después de los descuentos y los cancelados. */
  sinExplicar: number;
  estado: "coincide" | "descuentos" | "cancelados" | "revisar" | "sin-datos";
  detalle: string;
}

export interface ComparacionPlanillaLocal {
  /** La base con la que se comparó (la que eligió el usuario o la que se dedujo). */
  modo: ModoPlanillaLocal;
  /** La eligió la herramienta sola. */
  automatico: boolean;
  filas: FilaPlanillaLocal[];
  informado: number;
  segunPeya: number;
  diferencia: number;
  coinciden: number;
  conDescuentos: number;
  conCancelados: number;
  aRevisar: number;
  sinDatos: number;
  /** Líneas pegadas que no se pudieron leer. */
  ilegibles: number;
  /** Si otra opción explicaría más días, cuál (los números del local son de otra base). */
  sugerencia: ModoPlanillaLocal | null;
}

/** Una semana de liquidación (o una semana suelta si falta su estado de cuenta). */
export interface PeriodoLiquidacion {
  etiqueta: string;
  desde: Date;
  hasta: Date;
  tieneEstado: boolean;
  tienePedidos: boolean;
  pedidos: number;
  bruto: number;
  promos: number;
  /** Sin estado de cuenta, "promos" viene del reporte de pedidos y ya incluye el cargo por Plus. */
  promosIncluyenPlus: boolean;
  descuentoPeya: number;
  neta: number;
  comision: number;
  plus: number;
  tarifaOnline: number;
  iva: number;
  reclamos: number;
  reintegros: number;
  efectivo: number;
  /** Lo que debería depositar PedidosYa por ese período. */
  deposito: number;
  /** Depósito + lo que ya cobraste en efectivo. */
  queda: number;
}

export type TipoIncidencia =
  | "descuento-peya"
  | "cancelado"
  | "cancelado-reintegro"
  | "reclamo-otra-semana"
  | "reclamo-descalzado"
  | "fila-rota"
  | "cruza-medianoche"
  | "solo-estado"
  | "sin-liquidar";

export interface Incidencia {
  tipo: TipoIncidencia;
  titulo: string;
  nro: string;
  fecha: Date | null;
  sucursal: string;
  importe: number;
  detalle: string;
}

/** Fila del Detalle del Excel: un pedido con lo que dice cada reporte. */
export interface FilaDetalleLiquidacion {
  fecha: Date;
  hora: string;
  /** Hora del día 0-23 (para el cuadro por hora); null si el pedido solo está en el estado de cuenta. */
  horaDelDia: number | null;
  diaSemana: string;
  sucursal: string;
  nro: string;
  estado: string;
  formaPago: string;
  entrega: string;
  periodo: string;
  bruto: number;
  promos: number | null;
  descuentoPeya: number | null;
  neta: number | null;
  efectivo: number;
  comision: number;
  plus: number | null;
  tarifaOnline: number | null;
  iva: number | null;
  reclamo: number;
  queda: number | null;
  aDepositar: number | null;
  cancelado: number;
  articulos: string;
}

export interface CruceLiquidacion {
  enAmbos: number;
  soloEstado: number;
  soloPedidos: number;
  brutoEstado: number;
  brutoPedidos: number;
  comisionEstado: number;
  comisionPedidos: number;
  efectivoEstado: number;
  efectivoPedidos: number;
}

export interface AnalisisLiquidacionPeYa {
  estados: EstadoCuenta[];
  pedidos: AnalisisPedidosYa | null;
  periodos: PeriodoLiquidacion[];
  total: PeriodoLiquidacion;
  dias: DiaLiquidacion[];
  sucursales: string[];
  cruce: CruceLiquidacion | null;
  incidencias: Incidencia[];
  detalle: FilaDetalleLiquidacion[];
  controles: Control[];
  avisos: string[];
  desde: Date;
  hasta: Date;
  archivos: string[];
  /** Están los dos reportes y el estado de cuenta cubre todo el período. */
  completo: boolean;
  /** Comparación con lo que informó el local, si pegó su planilla diaria. */
  planillaLocal: ComparacionPlanillaLocal | null;
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const dd = (f: Date) => `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}`;
const hhmm = (f: Date) => `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;

/** Lunes de la semana de esa fecha (PedidosYa liquida de lunes a domingo). */
function lunesDe(f: Date): Date {
  const d = soloDia(f);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function sumar<T>(xs: T[], f: (x: T) => number): number {
  return round2(xs.reduce((s, x) => s + f(x), 0));
}

/* ------------------------------------------------------------------ */
/* Lectura: reconocer qué es cada archivo                               */
/* ------------------------------------------------------------------ */

export async function analizarLiquidacionPeYa(
  archivos: File[],
  planillaLocal = "",
  modoPlanilla: ModoPlanillaElegido = "auto",
): Promise<AnalisisLiquidacionPeYa> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  const avisos: string[] = [];
  const estados: EstadoCuenta[] = [];
  const archivosPedidos: File[] = [];
  const hojasLeidas = new Map<string, Hoja[]>();

  for (const archivo of archivos) {
    const hojas = await leerPlanilla(archivo);
    hojasLeidas.set(archivo.name, hojas);
    if (esEstadoDeCuentaPeYa(hojas)) estados.push(await leerEstadoDeCuenta(archivo, hojas));
    else archivosPedidos.push(archivo);
  }

  // Dos veces la misma semana: se usa una sola (pasa al subir toda la carpeta de descargas).
  const vistas = new Set<string>();
  const unicos: EstadoCuenta[] = [];
  for (const e of estados.sort((a, b) => a.desde.getTime() - b.desde.getTime())) {
    const clave = `${claveDia(e.desde)}|${claveDia(e.hasta)}|${e.pedidos.length}|${Math.round(sumar(e.pedidos, (p) => p.bruto))}`;
    if (vistas.has(clave)) {
      avisos.push(`"${e.archivo}" es el mismo estado de cuenta que otro archivo que subiste (${e.etiqueta}): se contó una sola vez.`);
      continue;
    }
    vistas.add(clave);
    unicos.push(e);
  }

  let pedidos: AnalisisPedidosYa | null = null;
  if (archivosPedidos.length) {
    // Si no es el reporte de pedidos, analizarPedidosYa explica qué archivo hace falta.
    // Hora de corte 0: acá el día es el día calendario del pedido, igual que en el
    // estado de cuenta (así las dos tablas "día a día" se pueden comparar).
    pedidos = await analizarPedidosYa(archivosPedidos, 0, hojasLeidas);
    // Los avisos del reporte de pedidos nombran hojas de su propio Excel.
    avisos.push(...pedidos.avisos.map((av) => av.replace(/hoja "[^"]+"/g, 'hoja "Revisar"')));
  }
  if (!unicos.length && !pedidos) {
    throw new ErrorExtracto(
      "Ninguno de los archivos es del Portal Partner de PedidosYa. Subí el estado de cuenta (Finanzas → semana → Descargar, el Excel) " +
        "y/o el reporte de pedidos (Reportes → Pedidos → Descargar), tal cual se descargan.",
    );
  }
  for (const e of unicos) avisos.push(...e.avisos);

  const analisis = cruzar(unicos, pedidos, archivos.map((a) => a.name), avisos);
  if (planillaLocal.trim()) {
    const pl = compararConPlanillaLocal(analisis, parsearPlanillaLocal(planillaLocal), modoPlanilla);
    analisis.planillaLocal = pl;
    if (pl.ilegibles) {
      avisos.push(
        `${pl.ilegibles} línea(s) de la planilla del local no se entendieron (hace falta una fecha y un importe por línea, por ejemplo "30/08/2026  $ 1.369.576,00").`,
      );
    }
    const base = MODOS_PLANILLA_LOCAL.find((m) => m.id === pl.modo)!;
    if (pl.automatico) {
      avisos.push(
        `De tu planilla del local entendimos que anota ${base.etiqueta.toLowerCase()} (${base.ayuda}). Si no es eso, elegilo a mano en el recuadro y volvé a analizar.`,
      );
    } else if (pl.sugerencia) {
      const otro = MODOS_PLANILLA_LOCAL.find((m) => m.id === pl.sugerencia)!;
      avisos.push(
        `Los números de tu planilla cierran mucho mejor con la opción "${otro.etiqueta}" (${otro.ayuda}): volvé a cargar los archivos eligiéndola, o dejá que la detecte sola.`,
      );
    }
  }
  return analisis;
}

/**
 * Lee lo que el dueño pega de su planilla: una línea por día con la fecha y el
 * importe, separados por tabulación, punto y coma, coma o espacios. Tolera el
 * signo $, los puntos de miles y las filas de encabezado (se ignoran).
 */
export function parsearPlanillaLocal(texto: string): { fecha: Date; importe: number }[] {
  const filas: { fecha: Date; importe: number }[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia) continue;
    const fechaTexto = limpia.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)?.[0];
    const fecha = fechaTexto ? aFecha(fechaTexto) : null;
    if (!fecha) {
      // Sin fecha y sin números es un encabezado o un título: se saltea sin avisar.
      if (/\d/.test(limpia)) filas.push({ fecha: new Date(NaN), importe: 0 });
      continue;
    }
    // El importe es el último número de la línea que no sea la fecha.
    const resto = limpia.replace(fechaTexto!, " ");
    const numeros = resto.match(/-?\$?\s?\d[\d.,]*/g) ?? [];
    if (!numeros.length) {
      filas.push({ fecha: new Date(NaN), importe: 0 });
      continue;
    }
    filas.push({ fecha: soloDia(fecha), importe: aNumero(numeros[numeros.length - 1]) });
  }
  return filas;
}

/** Lo que hay que mirar de cada día según lo que anote el local. */
interface BaseDelDia {
  /** Lo que PedidosYa toma como venta de ese día, en la base elegida. */
  base: number;
  /** Los descuentos que PedidosYa cobra sobre esos mismos pedidos. */
  descuentos: number;
  /** Los cancelados que pudieron quedar anotados en esa base. */
  cancelado: number;
  /** Con esta base hace falta el estado de cuenta (la venta neta sale de ahí). */
  necesitaEstado: boolean;
  tieneEstado: boolean;
  /** Sucursales de ese día que el estado de cuenta subido no cubre. */
  sinEstado: string[];
}

const BASE_POR_MODO: Record<ModoPlanillaLocal, { texto: string; falta: string }> = {
  total: { texto: "la venta neta del día (app + efectivo)", falta: "Para comparar la venta total hace falta el estado de cuenta de esa semana." },
  digital: { texto: "la venta neta cobrada por la app", falta: "Para comparar lo cobrado por la app hace falta el estado de cuenta de esa semana." },
  efectivo: { texto: "lo que cobraste en efectivo en el local", falta: "" },
};

/** Explica, día por día, la diferencia entre la planilla del local y la liquidación. */
export function compararConPlanillaLocal(
  a: AnalisisLiquidacionPeYa,
  entradas: { fecha: Date; importe: number }[],
  elegido: ModoPlanillaElegido = "auto",
): ComparacionPlanillaLocal {
  const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const porDia = new Map<string, Record<ModoPlanillaLocal, BaseDelDia>>();
  for (const d of a.dias) {
    const k = claveDia(d.fecha);
    const x =
      porDia.get(k) ??
      ({
        total: { base: 0, descuentos: 0, cancelado: 0, necesitaEstado: true, tieneEstado: true, sinEstado: [] },
        digital: { base: 0, descuentos: 0, cancelado: 0, necesitaEstado: true, tieneEstado: true, sinEstado: [] },
        efectivo: { base: 0, descuentos: 0, cancelado: 0, necesitaEstado: false, tieneEstado: true, sinEstado: [] },
      } as Record<ModoPlanillaLocal, BaseDelDia>);
    x.total.base = round2(x.total.base + (d.neta ?? 0));
    x.total.descuentos = round2(x.total.descuentos + d.descuentoPeyaDigital);
    x.total.cancelado = round2(x.total.cancelado + d.canceladoNeto);
    x.digital.base = round2(x.digital.base + (d.porApp ?? 0));
    x.digital.descuentos = round2(x.digital.descuentos + d.descuentoPeyaDigital);
    x.digital.cancelado = round2(x.digital.cancelado + d.canceladoNeto - d.canceladoNetoEfectivo);
    x.efectivo.base = round2(x.efectivo.base + d.efectivo);
    x.efectivo.descuentos = round2(x.efectivo.descuentos + d.descuentoPeyaEfectivo);
    x.efectivo.cancelado = round2(x.efectivo.cancelado + d.canceladoNetoEfectivo);
    for (const m of ["total", "digital", "efectivo"] as const) {
      if (d.tieneEstado) continue;
      x[m].tieneEstado = false;
      if (!x[m].sinEstado.includes(d.sucursal)) x[m].sinEstado.push(d.sucursal);
    }
    porDia.set(k, x);
  }

  /** ¿Hay algún estado de cuenta subido que cubra ese día? */
  const haySemana = (f: Date) => a.estados.some((e) => f >= soloDia(e.desde) && f <= soloDia(e.hasta));

  const evaluar = (m: ModoPlanillaLocal): FilaPlanillaLocal[] => {
    const filas: FilaPlanillaLocal[] = [];
    for (const e of entradas) {
      if (Number.isNaN(e.fecha.getTime())) continue;
      const dia = porDia.get(claveDia(e.fecha))?.[m];
      if (!dia || (dia.necesitaEstado && !dia.tieneEstado)) {
        filas.push({
          fecha: e.fecha,
          informado: e.importe,
          segunPeya: 0,
          descuentosPeya: 0,
          canceladoNeto: 0,
          diferencia: 0,
          sinExplicar: 0,
          estado: "sin-datos",
          detalle: !dia
            ? "Ese día no está en los reportes que subiste."
            : haySemana(e.fecha) && dia.sinEstado.length
              ? `El estado de cuenta de esa semana sí está, pero no incluye ${dia.sinEstado.join(", ")}: PedidosYa lo emite por cuenta, no por local.`
              : BASE_POR_MODO[m].falta,
        });
        continue;
      }
      const diferencia = round2(e.importe - dia.base);
      const restoDescuentos = round2(diferencia - dia.descuentos);
      const restoCancelados = round2(restoDescuentos - dia.cancelado);
      let estado: FilaPlanillaLocal["estado"] = "revisar";
      let detalle = "";
      let sinExplicar = restoDescuentos;
      if (Math.abs(diferencia) < 1) {
        estado = "coincide";
        detalle = `Coincide con ${BASE_POR_MODO[m].texto}.`;
        sinExplicar = 0;
      } else if (dia.descuentos > 0 && Math.abs(restoDescuentos) < 1) {
        estado = "descuentos";
        detalle = `La diferencia son los ${pesos(dia.descuentos)} de descuentos que PedidosYa te cobra: el local anota la venta como la mostró la app y PedidosYa los descuenta después.`;
        sinExplicar = 0;
      } else if (dia.cancelado > 0 && Math.abs(restoCancelados) < 1) {
        estado = "cancelados";
        detalle =
          (dia.descuentos ? `${pesos(dia.descuentos)} de descuentos que PedidosYa te cobra y ` : "") +
          `${pesos(dia.cancelado)} de un pedido cancelado que quedó anotado como venta.`;
        sinExplicar = 0;
      } else {
        const partes: string[] = [];
        if (dia.descuentos) partes.push(`${pesos(dia.descuentos)} de descuentos de PedidosYa`);
        if (dia.cancelado) partes.push(`${pesos(dia.cancelado)} de pedidos cancelados`);
        detalle = `Quedan ${pesos(Math.abs(restoDescuentos))} sin explicar${partes.length ? ` (ese día hubo ${partes.join(" y ")})` : ""}.`;
      }
      filas.push({
        fecha: e.fecha,
        informado: e.importe,
        segunPeya: dia.base,
        descuentosPeya: dia.descuentos,
        canceladoNeto: dia.cancelado,
        diferencia,
        sinExplicar,
        estado,
        detalle,
      });
    }
    return filas.sort((x, y) => x.fecha.getTime() - y.fecha.getTime());
  };

  const explicados = (filas: FilaPlanillaLocal[]) => filas.filter((f) => f.estado !== "revisar" && f.estado !== "sin-datos").length;
  const exactos = (filas: FilaPlanillaLocal[]) => filas.filter((f) => f.estado === "coincide").length;
  const candidatos = (["total", "digital", "efectivo"] as const).map((m) => ({ m, filas: evaluar(m) }));

  // Sin indicación del usuario, se queda con la base que explica más días (ante empate,
  // la que tenga más coincidencias exactas y, si sigue igual, la venta total).
  const automatico = elegido === "auto";
  const mejor = [...candidatos].sort((x, y) => explicados(y.filas) - explicados(x.filas) || exactos(y.filas) - exactos(x.filas))[0];
  const modo: ModoPlanillaLocal = automatico ? mejor.m : elegido;
  const filas = candidatos.find((c) => c.m === modo)!.filas;

  // Si el usuario eligió una base y los números cierran mucho mejor con otra, se lo decimos.
  let sugerencia: ModoPlanillaLocal | null = null;
  if (!automatico && explicados(mejor.filas) > explicados(filas) + 1) sugerencia = mejor.m;

  const cuenta = (e: FilaPlanillaLocal["estado"]) => filas.filter((f) => f.estado === e).length;
  // Los días que no cubren los reportes no entran en los totales: inflarían la diferencia.
  const comparables = filas.filter((f) => f.estado !== "sin-datos");
  return {
    modo,
    automatico,
    filas,
    informado: sumar(comparables, (f) => f.informado),
    segunPeya: sumar(comparables, (f) => f.segunPeya),
    diferencia: sumar(comparables, (f) => f.diferencia),
    coinciden: cuenta("coincide"),
    conDescuentos: cuenta("descuentos"),
    conCancelados: cuenta("cancelados"),
    aRevisar: cuenta("revisar"),
    sinDatos: cuenta("sin-datos"),
    ilegibles: entradas.filter((e) => Number.isNaN(e.fecha.getTime())).length,
    sugerencia,
  };
}

/* ------------------------------------------------------------------ */
/* Cruce                                                                */
/* ------------------------------------------------------------------ */

function cruzar(estados: EstadoCuenta[], analisis: AnalisisPedidosYa | null, archivos: string[], avisos: string[]): AnalisisLiquidacionPeYa {
  // Índices por número de pedido.
  const porNroEstado = new Map<string, PedidoEstadoCuenta>();
  const semanaDe = new Map<string, EstadoCuenta>();
  for (const e of estados) {
    for (const p of e.pedidos) {
      if (porNroEstado.has(p.nro)) continue;
      porNroEstado.set(p.nro, p);
      semanaDe.set(p.nro, e);
    }
  }
  const reclamoDe = new Map<string, number>();
  const semanaDelReclamo = new Map<string, EstadoCuenta>();
  for (const e of estados) {
    for (const r of e.reclamos) {
      reclamoDe.set(r.nro, round2((reclamoDe.get(r.nro) ?? 0) + r.cargo));
      semanaDelReclamo.set(r.nro, e);
    }
  }
  const porNroPedido = new Map<string, PedidoPeYa>();
  for (const p of analisis?.pedidos ?? []) porNroPedido.set(p.nro, p);

  /* --- Detalle: un pedido por fila, con lo que aporta cada reporte --- */
  const detalle: FilaDetalleLiquidacion[] = [];
  for (const p of analisis?.pedidos ?? []) {
    const e = porNroEstado.get(p.nro);
    const sem = semanaDe.get(p.nro);
    const reclamo = reclamoDe.get(p.nro) ?? (p.cargosReclamos ? -p.cargosReclamos : 0);
    // "Lo que te queda" se arma igual que la cascada de la semana, para que el
    // Detalle sume exactamente lo mismo que la hoja Liquidación: con estado de
    // cuenta manda su venta neta; sin él, el ingreso estimado del reporte.
    const queda = !p.entregado
      ? 0
      : e
        ? round2(e.neta - e.comision - e.cargoPlus - p.tarifaOnline - p.impuestos + reclamo)
        : p.ingreso;
    detalle.push({
      fecha: soloDia(p.momento),
      hora: hhmm(p.momento),
      horaDelDia: p.momento.getHours(),
      diaSemana: DIAS_SEMANA[soloDia(p.momento).getDay()],
      sucursal: p.local,
      nro: p.nro,
      estado: p.entregado ? "Entregado" : "Cancelado",
      formaPago: p.formaPago,
      entrega: p.metodoEntrega,
      periodo: sem?.etiqueta ?? "Sin estado de cuenta",
      bruto: p.entregado ? p.venta : 0,
      promos: e ? e.descuentoLocal : null,
      descuentoPeya: e ? e.descuentoPeyaACobrar : null,
      neta: e ? e.neta : null,
      efectivo: p.efectivo,
      comision: e ? e.comision : p.comision,
      plus: e ? e.cargoPlus : null,
      tarifaOnline: p.tarifaOnline,
      iva: p.impuestos,
      reclamo,
      queda,
      aDepositar: round2(queda - p.efectivo),
      cancelado: p.entregado ? 0 : p.venta,
      articulos: p.articulos,
    });
  }
  // Pedidos que solo están en el estado de cuenta (falta el reporte de ese local o período).
  for (const [nro, e] of porNroEstado) {
    if (porNroPedido.has(nro)) continue;
    const reclamo = reclamoDe.get(nro) ?? 0;
    detalle.push({
      fecha: e.fecha,
      hora: "",
      horaDelDia: null,
      diaSemana: DIAS_SEMANA[e.fecha.getDay()],
      sucursal: e.sucursal,
      nro,
      estado: "Entregado",
      formaPago: e.fueraDeLaApp ? "Efectivo" : "Pago online",
      entrega: e.metodoEntrega,
      periodo: semanaDe.get(nro)?.etiqueta ?? "",
      bruto: e.bruto,
      promos: e.descuentoLocal,
      descuentoPeya: e.descuentoPeyaACobrar,
      neta: e.neta,
      efectivo: e.cobradoLocal,
      comision: e.comision,
      plus: e.cargoPlus,
      tarifaOnline: null,
      iva: null,
      reclamo,
      queda: round2(e.neta - e.comision - e.cargoPlus + reclamo),
      aDepositar: round2(e.neta - e.comision - e.cargoPlus + reclamo - e.cobradoLocal),
      cancelado: 0,
      articulos: "",
    });
  }
  detalle.sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.hora.localeCompare(b.hora) || a.nro.localeCompare(b.nro));

  /* --- Día a día (fecha × sucursal) --- */
  // Para los cancelados, lo que valía el pedido sin la promo del local: es el número
  // que suele quedar anotado en la planilla del local y lo informa la hoja "Reintegros".
  const netoDelCancelado = new Map<string, number>();
  for (const e of estados) for (const r of e.reintegros) netoDelCancelado.set(r.nro, r.montoPedido);
  const dias = armarDias(detalle, porNroEstado, netoDelCancelado);

  /* --- Períodos: una columna por estado de cuenta + las semanas sin liquidar --- */
  const periodos = armarPeriodos(estados, detalle, porNroEstado, semanaDe, analisis);
  const total = totalizar(periodos, estados, detalle);

  /* --- Incidencias --- */
  const incidencias = buscarIncidencias(estados, analisis, porNroEstado, porNroPedido, reclamoDe, semanaDelReclamo);

  /* --- Controles y avisos --- */
  const conEstado = estados.length > 0;
  const enAmbos = [...porNroEstado.keys()].filter((n) => porNroPedido.has(n));
  let cruce: CruceLiquidacion | null = null;
  const controles: Control[] = [];
  for (const e of estados) {
    for (const c of e.controles) controles.push(estados.length > 1 ? { ...c, control: `${c.control} (${e.etiqueta})` } : c);
  }
  if (conEstado && analisis) {
    const comunes = enAmbos.map((n) => ({ e: porNroEstado.get(n)!, p: porNroPedido.get(n)! }));
    const soloEstado = [...porNroEstado.keys()].filter((n) => !porNroPedido.has(n));
    // Entregados del reporte que caen dentro de alguna semana liquidada y no están en ella.
    const cubierto = (f: Date) => estados.some((e) => f >= soloDia(e.desde) && f <= soloDia(e.hasta));
    const soloPedidos = (analisis.ventas ?? []).filter((p) => !porNroEstado.has(p.nro) && cubierto(soloDia(p.momento)));
    cruce = {
      enAmbos: comunes.length,
      soloEstado: soloEstado.length,
      soloPedidos: soloPedidos.length,
      brutoEstado: sumar(comunes, (x) => x.e.bruto),
      brutoPedidos: sumar(comunes, (x) => x.p.venta),
      comisionEstado: sumar(comunes, (x) => x.e.comision),
      comisionPedidos: sumar(comunes, (x) => x.p.comision),
      efectivoEstado: sumar(comunes, (x) => x.e.cobradoLocal),
      efectivoPedidos: sumar(comunes, (x) => x.p.efectivo),
    };
    const cerca = (a: number, b: number) => Math.abs(a - b) < 1;
    controles.push(
      control("Estado de cuenta ↔ reporte de pedidos", "Pedidos liquidados que están en los dos reportes", porNroEstado.size, comunes.length, soloEstado.length === 0, "ent"),
      control("Estado de cuenta ↔ reporte de pedidos", "Venta bruta de esos pedidos", cruce.brutoEstado, cruce.brutoPedidos, cerca(cruce.brutoEstado, cruce.brutoPedidos)),
      control("Estado de cuenta ↔ reporte de pedidos", "Comisión de esos pedidos", cruce.comisionEstado, cruce.comisionPedidos, cerca(cruce.comisionEstado, cruce.comisionPedidos)),
      control("Estado de cuenta ↔ reporte de pedidos", "Cobrado en efectivo por el local", cruce.efectivoEstado, cruce.efectivoPedidos, cerca(cruce.efectivoEstado, cruce.efectivoPedidos)),
    );
    // Caso real (2026-09-23): el dueño subió el estado de cuenta de una cuenta y
    // el reporte de pedidos de un local de OTRA. No comparten un solo pedido, y
    // los mensajes de "falta el estado de cuenta de esa semana" lo mandaban a
    // buscar justo lo que ya había subido. PedidosYa emite un estado de cuenta
    // por CUENTA, no por local: dos locales pueden estar en cuentas distintas.
    if (enAmbos.length === 0) {
      const sucEstado = [...new Set([...porNroEstado.values()].map((p) => p.sucursal))];
      const sucPedidos = [...new Set(detalle.filter((d) => !porNroEstado.has(d.nro)).map((d) => d.sucursal))];
      avisos.push(
        `Los dos archivos son de cuentas distintas: no tienen ningún pedido en común. El estado de cuenta es de ${sucEstado.join(", ")} y el reporte de pedidos, de ${sucPedidos.join(", ")}. ` +
          "PedidosYa emite un estado de cuenta por cuenta, no por local: bajá el estado de cuenta de la cuenta a la que pertenece ese local (o el reporte de pedidos de las sucursales del estado que ya subiste).",
      );
    }
    if (soloEstado.length) {
      const sucursales = [...new Set(soloEstado.map((n) => porNroEstado.get(n)!.sucursal))];
      avisos.push(
        `${soloEstado.length} pedido(s) del estado de cuenta no están en el reporte de pedidos (${sucursales.join(", ")}). ` +
          "El reporte de pedidos se baja por local: bajá también el de esa sucursal para ver su IVA y su tarifa de pago online.",
      );
    }
    if (soloPedidos.length) {
      avisos.push(`${soloPedidos.length} pedido(s) entregados del reporte no aparecen en el estado de cuenta de esa semana: puede que PedidosYa los liquide en la semana siguiente.`);
    }
  }

  // Ojo: una semana puede no tener estado para ESTOS pedidos y tener igual un
  // estado de cuenta subido (el de otra sucursal). Decirle "falta el estado de
  // cuenta de esa semana" cuando lo subió es mandarlo a buscar lo que ya tiene.
  const semanaCubierta = (p: PeriodoLiquidacion) =>
    estados.some((e) => p.desde <= soloDia(e.hasta) && p.hasta >= soloDia(e.desde));
  const faltanSemanas = periodos.filter((p) => !p.tieneEstado && !semanaCubierta(p));
  if (faltanSemanas.length) {
    avisos.push(
      `Falta el estado de cuenta de ${faltanSemanas.length === 1 ? "la semana" : "las semanas"} ${faltanSemanas.map((p) => p.etiqueta).join(", ")}: ` +
        "de esos días no se puede separar tu promo del cargo por Plus, ni ver reintegros ni el depósito exacto.",
    );
  }
  if (!conEstado) {
    avisos.push(
      "Subiste solo el reporte de pedidos: el análisis muestra el costo real (incluye la tarifa de pago online y el IVA), pero no los reintegros por pedidos rechazados " +
        "ni cuánto de tus descuentos es el cargo por Plus. Sumá el estado de cuenta de esas semanas (Finanzas → semana) para controlar cada depósito.",
    );
  }
  if (!analisis) {
    avisos.push(
      "Subiste solo el estado de cuenta: ese archivo NO incluye la tarifa de pago online ni el IVA sobre las comisiones, así que el depósito estimado es más alto que el que vas a cobrar. " +
        "Sumá el reporte de pedidos del mismo período (Reportes → Pedidos, uno por local) para ver el costo completo.",
    );
  } else if (conEstado) {
    const sinCosto = [...porNroEstado.keys()].filter((n) => !porNroPedido.has(n)).length;
    if (sinCosto) avisos.push(`De ${sinCosto} pedido(s) no tenemos el reporte de pedidos, así que su tarifa de pago online y su IVA no están contados: el depósito estimado de esas semanas queda un poco alto.`);
  }

  const fechas = detalle.map((d) => d.fecha.getTime());
  const sucursales = [...new Set(detalle.map((d) => d.sucursal))].sort();
  return {
    estados,
    pedidos: analisis,
    periodos,
    total,
    dias,
    sucursales,
    cruce,
    incidencias,
    detalle,
    controles,
    avisos,
    desde: new Date(Math.min(...fechas)),
    hasta: new Date(Math.max(...fechas)),
    archivos,
    completo: conEstado && !!analisis && faltanSemanas.length === 0,
    planillaLocal: null,
  };
}

function armarDias(
  detalle: FilaDetalleLiquidacion[],
  porNroEstado: Map<string, PedidoEstadoCuenta>,
  netoDelCancelado: Map<string, number>,
): DiaLiquidacion[] {
  const mapa = new Map<string, DiaLiquidacion>();
  for (const f of detalle) {
    const clave = `${claveDia(f.fecha)}|${f.sucursal}`;
    const d =
      mapa.get(clave) ??
      ({
        fecha: f.fecha,
        sucursal: f.sucursal,
        pedidos: 0,
        bruto: 0,
        promos: 0,
        neta: 0,
        efectivo: 0,
        porApp: 0,
        cancelados: 0,
        montoCancelado: 0,
        canceladoNeto: 0,
        canceladoNetoEfectivo: 0,
        descuentoPeyaDigital: 0,
        descuentoPeyaEfectivo: 0,
        reclamos: 0,
        tieneEstado: true,
        tienePedidos: false,
      } as DiaLiquidacion);
    if (f.estado === "Entregado") {
      d.pedidos++;
      d.bruto = round2(d.bruto + f.bruto);
      d.efectivo = round2(d.efectivo + f.efectivo);
      // El descuento de PedidosYa se separa según dónde cobró el pedido: no mezcla la venta digital con la de mostrador.
      if (f.efectivo === 0) d.descuentoPeyaDigital = round2(d.descuentoPeyaDigital + (f.descuentoPeya ?? 0));
      else d.descuentoPeyaEfectivo = round2(d.descuentoPeyaEfectivo + (f.descuentoPeya ?? 0));
      if (porNroEstado.has(f.nro)) {
        d.promos = round2((d.promos ?? 0) + (f.promos ?? 0));
        d.neta = round2((d.neta ?? 0) + (f.neta ?? 0));
      } else {
        d.tieneEstado = false;
      }
    } else {
      d.cancelados++;
      d.montoCancelado = round2(d.montoCancelado + f.cancelado);
      const neto = netoDelCancelado.get(f.nro) ?? f.cancelado;
      d.canceladoNeto = round2(d.canceladoNeto + neto);
      if (/efectivo/i.test(f.formaPago)) d.canceladoNetoEfectivo = round2(d.canceladoNetoEfectivo + neto);
    }
    d.reclamos = round2(d.reclamos + f.reclamo);
    if (f.hora) d.tienePedidos = true;
    mapa.set(clave, d);
  }
  const dias = [...mapa.values()];
  for (const d of dias) {
    if (!d.tieneEstado) {
      d.promos = null;
      d.neta = null;
      d.porApp = null;
    } else {
      d.porApp = round2((d.neta ?? 0) - d.efectivo);
    }
  }
  return dias.sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.sucursal.localeCompare(b.sucursal));
}

/** Una columna por estado de cuenta; los días sin liquidar se agrupan por semana (lunes a domingo). */
function armarPeriodos(
  estados: EstadoCuenta[],
  detalle: FilaDetalleLiquidacion[],
  porNroEstado: Map<string, PedidoEstadoCuenta>,
  semanaDe: Map<string, EstadoCuenta>,
  analisis: AnalisisPedidosYa | null,
): PeriodoLiquidacion[] {
  const periodos: PeriodoLiquidacion[] = [];

  for (const e of estados) {
    const suyos = detalle.filter((f) => semanaDe.get(f.nro) === e);
    const neta = sumar(e.pedidos, (p) => p.neta);
    const comision = sumar(e.pedidos, (p) => p.comision);
    const plus = sumar(e.pedidos, (p) => p.cargoPlus);
    const tarifaOnline = sumar(suyos, (f) => f.tarifaOnline ?? 0);
    const iva = sumar(suyos, (f) => f.iva ?? 0);
    const reclamos = sumar(e.reclamos, (r) => r.cargo);
    const reintegros = sumar(e.reintegros, (r) => r.neto);
    const efectivo = sumar(e.pedidos, (p) => p.cobradoLocal);
    const deposito = round2(neta - comision - plus - tarifaOnline - iva + reclamos + reintegros - efectivo);
    periodos.push({
      etiqueta: e.etiqueta,
      desde: e.desde,
      hasta: e.hasta,
      tieneEstado: true,
      tienePedidos: suyos.some((f) => f.hora !== ""),
      pedidos: e.pedidos.length,
      bruto: sumar(e.pedidos, (p) => p.bruto),
      promos: sumar(e.pedidos, (p) => p.descuentoLocal),
      promosIncluyenPlus: false,
      descuentoPeya: sumar(e.pedidos, (p) => p.descuentoPeyaACobrar),
      neta,
      comision,
      plus,
      tarifaOnline,
      iva,
      reclamos,
      reintegros,
      efectivo,
      deposito,
      queda: round2(deposito + efectivo),
    });
  }

  // Días con pedidos pero sin estado de cuenta: se agrupan por semana de lunes a domingo.
  const sueltos = (analisis?.pedidos ?? []).filter((p) => !porNroEstado.has(p.nro));
  const porSemana = new Map<string, PedidoPeYa[]>();
  for (const p of sueltos) {
    const clave = claveDia(lunesDe(p.momento));
    porSemana.set(clave, [...(porSemana.get(clave) ?? []), p]);
  }
  for (const [clave, lista] of porSemana) {
    const entregados = lista.filter((p) => p.entregado);
    if (!entregados.length) continue;
    const lunes = new Date(`${clave}T00:00:00`);
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);
    const fechas = entregados.map((p) => soloDia(p.momento).getTime());
    const bruto = sumar(entregados, (p) => p.venta);
    const promos = sumar(entregados, (p) => p.descuentoPropio);
    const comision = sumar(entregados, (p) => p.comision);
    const tarifaOnline = sumar(entregados, (p) => p.tarifaOnline);
    const iva = sumar(entregados, (p) => p.impuestos);
    const reclamos = -sumar(entregados, (p) => p.cargosReclamos);
    const efectivo = sumar(entregados, (p) => p.efectivo);
    const deposito = round2(bruto - promos - comision - tarifaOnline - iva + reclamos - efectivo);
    periodos.push({
      etiqueta: `${dd(lunes)} al ${dd(domingo)}`,
      desde: new Date(Math.min(...fechas)),
      hasta: new Date(Math.max(...fechas)),
      tieneEstado: false,
      tienePedidos: true,
      pedidos: entregados.length,
      bruto,
      promos,
      promosIncluyenPlus: true,
      descuentoPeya: 0,
      neta: round2(bruto - promos),
      comision,
      plus: 0,
      tarifaOnline,
      iva,
      reclamos,
      reintegros: 0,
      efectivo,
      deposito,
      queda: round2(deposito + efectivo),
    });
  }

  return periodos.sort((a, b) => a.desde.getTime() - b.desde.getTime());
}

function totalizar(periodos: PeriodoLiquidacion[], estados: EstadoCuenta[], detalle: FilaDetalleLiquidacion[]): PeriodoLiquidacion {
  const s = (f: (p: PeriodoLiquidacion) => number) => sumar(periodos, f);
  const fechas = detalle.map((d) => d.fecha.getTime());
  return {
    etiqueta: "Total",
    desde: fechas.length ? new Date(Math.min(...fechas)) : new Date(),
    hasta: fechas.length ? new Date(Math.max(...fechas)) : new Date(),
    tieneEstado: estados.length > 0,
    tienePedidos: periodos.some((p) => p.tienePedidos),
    pedidos: periodos.reduce((t, p) => t + p.pedidos, 0),
    bruto: s((p) => p.bruto),
    promos: s((p) => p.promos),
    promosIncluyenPlus: periodos.some((p) => p.promosIncluyenPlus),
    descuentoPeya: s((p) => p.descuentoPeya),
    neta: s((p) => p.neta),
    comision: s((p) => p.comision),
    plus: s((p) => p.plus),
    tarifaOnline: s((p) => p.tarifaOnline),
    iva: s((p) => p.iva),
    reclamos: s((p) => p.reclamos),
    reintegros: s((p) => p.reintegros),
    efectivo: s((p) => p.efectivo),
    deposito: s((p) => p.deposito),
    queda: s((p) => p.queda),
  };
}

/* ------------------------------------------------------------------ */
/* Incidencias: lo que hay que mirar (y en varios casos, reclamar)      */
/* ------------------------------------------------------------------ */

function buscarIncidencias(
  estados: EstadoCuenta[],
  analisis: AnalisisPedidosYa | null,
  porNroEstado: Map<string, PedidoEstadoCuenta>,
  porNroPedido: Map<string, PedidoPeYa>,
  reclamoDe: Map<string, number>,
  semanaDelReclamo: Map<string, EstadoCuenta>,
): Incidencia[] {
  const out: Incidencia[] = [];
  const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // 1. Descuentos que PedidosYa otorgó y te cobra (el reporte de pedidos suele decir que los financia él).
  for (const [nro, e] of porNroEstado) {
    if (e.descuentoPeyaACobrar <= 0) continue;
    const p = porNroPedido.get(nro);
    const financiado = p && p.descuentoPeYa > 0;
    out.push({
      tipo: "descuento-peya",
      titulo: financiado ? "PedidosYa te cobra un descuento que su otro reporte dice financiar" : "Descuento de PedidosYa que te descuentan de la liquidación",
      nro,
      fecha: e.fecha,
      sucursal: e.sucursal,
      importe: -e.descuentoPeyaACobrar,
      detalle:
        `Venta ${pesos(e.bruto)} · te liquidan ${pesos(e.neta)} y te cobran ${pesos(e.comision)} de comisión` +
        (financiado ? ` · el reporte de pedidos informa ${pesos(p!.descuentoPeYa)} como “descuento financiado por PedidosYa”.` : "."),
    });
  }

  // 2. Cancelados: no son venta (el local suele anotarlos igual).
  for (const p of analisis?.cancelados ?? []) {
    const reintegro = estados.flatMap((e) => e.reintegros).find((r) => r.nro === p.nro);
    out.push({
      tipo: reintegro ? "cancelado-reintegro" : "cancelado",
      titulo: reintegro ? "Pedido cancelado con reintegro de PedidosYa" : "Pedido cancelado: no es venta",
      nro: p.nro,
      fecha: soloDia(p.momento),
      sucursal: p.local,
      importe: reintegro ? reintegro.neto : -p.venta,
      detalle: reintegro
        ? `PedidosYa te compensa ${pesos(reintegro.neto)} (el ${(reintegro.porcentaje * 100).toFixed(0)} % del pedido menos la comisión). ${p.motivoCancelacion || "Sin motivo informado"}.`
        : `${p.motivoCancelacion || "Sin motivo informado"}${p.responsableCancelacion ? ` · responsable: ${p.responsableCancelacion}` : ""}. Si figura como venta en la planilla del local, hay que sacarlo.`,
    });
  }

  // 3. Reclamos cobrados en una semana distinta a la del pedido, o que un reporte tiene y el otro no.
  for (const [nro, cargo] of reclamoDe) {
    const sem = semanaDelReclamo.get(nro);
    const p = porNroPedido.get(nro);
    const e = porNroEstado.get(nro);
    const fecha = p ? soloDia(p.momento) : (e?.fecha ?? null);
    const sucursal = p?.local ?? e?.sucursal ?? "";
    if (sem && fecha && (fecha < soloDia(sem.desde) || fecha > soloDia(sem.hasta))) {
      out.push({
        tipo: "reclamo-otra-semana",
        titulo: "Reclamo de un pedido de otra semana",
        nro,
        fecha,
        sucursal,
        importe: cargo,
        detalle: `El pedido es del ${formatearFecha(fecha)} y el cargo cayó en el estado de cuenta del ${sem.etiqueta}: los reclamos se descuentan cuando se confirman.`,
      });
    }
    if (p && Math.abs(cargo + p.cargosReclamos) > 1) {
      out.push({
        tipo: "reclamo-descalzado",
        titulo: "El reclamo no coincide entre los dos reportes",
        nro,
        fecha,
        sucursal,
        importe: cargo,
        detalle: `El estado de cuenta descuenta ${pesos(-cargo)} y el reporte de pedidos informa ${pesos(p.cargosReclamos)}. Conviene consultarlo con el número de pedido.`,
      });
    }
  }
  // Reclamos que el reporte de pedidos cobra y ningún estado de cuenta descontó todavía.
  for (const p of analisis?.ventas ?? []) {
    if (p.cargosReclamos <= 0 || reclamoDe.has(p.nro)) continue;
    const liquidado = porNroEstado.has(p.nro);
    out.push({
      tipo: "reclamo-descalzado",
      titulo: liquidado ? "Reclamo del reporte de pedidos que el estado de cuenta no descontó" : "Reclamo todavía sin estado de cuenta",
      nro: p.nro,
      fecha: soloDia(p.momento),
      sucursal: p.local,
      importe: -p.cargosReclamos,
      detalle: liquidado
        ? `El reporte de pedidos descuenta ${pesos(p.cargosReclamos)} por “${p.motivoReclamo || "reclamo"}” y no aparece en el estado de cuenta de esa semana: puede caer en la siguiente.`
        : `${p.motivoReclamo || "Reclamo"} · falta el estado de cuenta de esa semana para confirmar el cargo.`,
    });
  }

  // 4. Filas rotas del reporte de pedidos que el estado de cuenta sí liquida.
  for (const p of analisis?.ventas ?? []) {
    if (!p.sinLiquidar) continue;
    const e = porNroEstado.get(p.nro);
    out.push({
      tipo: e ? "fila-rota" : "sin-liquidar",
      titulo: e ? "Fila incompleta en el reporte de pedidos (el estado de cuenta sí lo liquida)" : "Pedido entregado que PedidosYa no liquidó",
      nro: p.nro,
      fecha: soloDia(p.momento),
      sucursal: p.local,
      importe: e ? e.neta : p.venta,
      detalle: e
        ? `El reporte de pedidos no informa pago, deuda ni efectivo; el estado de cuenta del ${semanaDeTexto(estados, p.nro)} liquida ${pesos(e.neta)} con ${pesos(e.comision)} de comisión.`
        : "Entregado, pero sin pago, sin deuda y sin efectivo cobrado. Conviene consultarlo en el Portal Partner.",
    });
  }

  // 5. Pedidos tomados un día y entregados al siguiente: mueven la caja de un día al otro.
  for (const p of analisis?.ventas ?? []) {
    if (p.minutosTotal === null) continue;
    const entrega = new Date(p.momento.getTime() + p.minutosTotal * 60000);
    if (claveDia(entrega) === claveDia(p.momento)) continue;
    out.push({
      tipo: "cruza-medianoche",
      titulo: "Pedido tomado un día y entregado al siguiente",
      nro: p.nro,
      fecha: soloDia(p.momento),
      sucursal: p.local,
      importe: p.venta,
      detalle: `PedidosYa lo cuenta el ${formatearFecha(p.momento)} (${hhmm(p.momento)}) y se entregó el ${formatearFecha(entrega)} a las ${hhmm(entrega)}: la caja del local puede tenerlo al día siguiente.`,
    });
  }

  // 6. Pedidos liquidados que no están en ningún reporte de pedidos.
  if (analisis) {
    for (const [nro, e] of porNroEstado) {
      if (porNroPedido.has(nro)) continue;
      out.push({
        tipo: "solo-estado",
        titulo: "Pedido liquidado que no está en el reporte de pedidos",
        nro,
        fecha: e.fecha,
        sucursal: e.sucursal,
        importe: e.neta,
        detalle: `Falta el reporte de pedidos de ${e.sucursal} para ese período: sin él no se ven ni la tarifa de pago online ni el IVA de este pedido.`,
      });
    }
  }

  const orden: Record<TipoIncidencia, number> = {
    "descuento-peya": 0,
    "fila-rota": 1,
    "sin-liquidar": 2,
    "reclamo-descalzado": 3,
    "reclamo-otra-semana": 4,
    cancelado: 5,
    "cancelado-reintegro": 6,
    "cruza-medianoche": 7,
    "solo-estado": 8,
  };
  return out.sort((a, b) => orden[a.tipo] - orden[b.tipo] || (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0));
}

function semanaDeTexto(estados: EstadoCuenta[], nro: string): string {
  const e = estados.find((x) => x.pedidos.some((p) => p.nro === nro));
  return e ? e.etiqueta : "";
}

/* ------------------------------------------------------------------ */
/* Vistas derivadas (pantalla y Excel)                                  */
/* ------------------------------------------------------------------ */

export interface ResumenSucursal {
  sucursal: string;
  pedidos: number;
  bruto: number;
  promos: number;
  neta: number;
  comision: number;
  costos: number;
  efectivo: number;
  /** Reintegros por pedidos rechazados: no son pedidos de la lista, se suman aparte. */
  reintegros: number;
  queda: number;
}

export function porSucursal(a: AnalisisLiquidacionPeYa): ResumenSucursal[] {
  const mapa = new Map<string, ResumenSucursal>();
  const vacio = (sucursal: string): ResumenSucursal => ({ sucursal, pedidos: 0, bruto: 0, promos: 0, neta: 0, comision: 0, costos: 0, efectivo: 0, reintegros: 0, queda: 0 });
  for (const f of a.detalle) {
    if (f.estado !== "Entregado") continue;
    const r = mapa.get(f.sucursal) ?? vacio(f.sucursal);
    r.pedidos++;
    r.bruto = round2(r.bruto + f.bruto);
    r.promos = round2(r.promos + (f.promos ?? 0));
    r.neta = round2(r.neta + (f.neta ?? f.bruto));
    r.comision = round2(r.comision + f.comision);
    r.costos = round2(r.costos + f.comision + (f.plus ?? 0) + (f.tarifaOnline ?? 0) + (f.iva ?? 0));
    r.efectivo = round2(r.efectivo + f.efectivo);
    r.queda = round2(r.queda + (f.queda ?? 0));
    mapa.set(f.sucursal, r);
  }
  for (const e of a.estados) {
    for (const rein of e.reintegros) {
      const r = mapa.get(rein.sucursal) ?? vacio(rein.sucursal);
      r.reintegros = round2(r.reintegros + rein.neto);
      r.queda = round2(r.queda + rein.neto);
      mapa.set(rein.sucursal, r);
    }
  }
  return [...mapa.values()].sort((x, y) => y.bruto - x.bruto);
}

/** Nombre del grupo en la tabla de pantalla (uno por tipo, no el del primer caso). */
export const TITULO_INCIDENCIA: Record<TipoIncidencia, string> = {
  "descuento-peya": "Descuentos de PedidosYa que te descuentan de la liquidación",
  "fila-rota": "Pedidos con la fila incompleta en el reporte de pedidos",
  "sin-liquidar": "Pedidos entregados que PedidosYa todavía no liquidó",
  "reclamo-descalzado": "Reclamos que no coinciden entre los dos reportes",
  "reclamo-otra-semana": "Reclamos cobrados en una semana distinta a la del pedido",
  cancelado: "Pedidos cancelados (no son venta)",
  "cancelado-reintegro": "Pedidos cancelados con reintegro de PedidosYa",
  "cruza-medianoche": "Pedidos tomados un día y entregados al siguiente",
  "solo-estado": "Pedidos liquidados que no están en el reporte de pedidos",
};

/** Agrupación de incidencias para la tabla de pantalla. */
export function incidenciasPorTipo(a: AnalisisLiquidacionPeYa): { tipo: TipoIncidencia; titulo: string; cantidad: number; importe: number }[] {
  const mapa = new Map<TipoIncidencia, { tipo: TipoIncidencia; titulo: string; cantidad: number; importe: number }>();
  for (const i of a.incidencias) {
    const x = mapa.get(i.tipo) ?? { tipo: i.tipo, titulo: TITULO_INCIDENCIA[i.tipo], cantidad: 0, importe: 0 };
    x.cantidad++;
    x.importe = round2(x.importe + i.importe);
    mapa.set(i.tipo, x);
  }
  return [...mapa.values()];
}
