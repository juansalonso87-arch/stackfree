/**
 * Analizador de cobros de Mercado Pago. Port de `python/MP_analizador_cobros.py`.
 *
 * Toma el reporte de cobros que exporta Mercado Pago y agrupa las
 * operaciones por día de TURNO (un cobro de las 02:30 del sábado pertenece
 * al viernes), por hora, por mes y por medio de pago; separa comisiones,
 * tarifas y retenciones, y lista los cobros rechazados o cancelados.
 */

import { ErrorExtracto } from "./tipos";
import { aFecha, aNumero, clavePeriodo, round2, soloDia } from "./texto";
import { leerPlanilla, type Celda } from "./planilla";

export const HORA_CORTE_DEFECTO = 6;

const ESTADOS_COBRO = ["approved"];
const OPERACIONES_QUE_NO_SON_VENTA = ["account_fund", "money_transfer", "withdrawal", "payout", "money_exchange", "credit_payment"];
const OPERACIONES_VENTA_CONOCIDAS = ["regular_payment", "point_payment", "pos_payment", "subscription_payment"];

const ETIQUETAS_MEDIO_PAGO: Record<string, string> = {
  account_money: "Dinero en cuenta (saldo MP)",
  bank_transfer: "Transferencia / débito inmediato",
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  prepaid_card: "Tarjeta prepaga",
  digital_currency: "Moneda digital / cripto",
  ticket: "Pago en efectivo (cupón)",
  atm: "Cajero automático",
};

const ETIQUETAS_MOTIVO: Record<string, string> = {
  cc_rejected_call_for_authorize: "Rechazo: requiere autorización del banco",
  cc_rejected_card_disabled: "Rechazo: tarjeta deshabilitada",
  cc_rejected_other_reason: "Rechazo: motivo no especificado por el banco",
  cc_rejected_insufficient_amount: "Rechazo: fondos insuficientes",
  cc_rejected_time_out: "Rechazo: tiempo de espera agotado",
  cc_rejected_bad_filled_security_code: "Rechazo: código de seguridad incorrecto",
  cc_rejected_bad_filled_date: "Rechazo: fecha de tarjeta incorrecta",
  cc_rejected_high_risk: "Rechazo: riesgo detectado",
  cc_rejected_bad_filled_card_number: "Rechazo: número de tarjeta incorrecto",
  expired: "Cancelada: QR / cobro expirado sin pago",
  cancelled: "Cancelada por el vendedor o el comprador",
};

export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const OTRAS_TARIFAS = ["marketplace_fee", "shipping_cost", "financing_fee"];

export interface Cobro {
  momento: Date;
  diaTurno: Date;
  diaSemana: string;
  hora: number;
  periodo: string;
  medioPago: string;
  tipoOperacion: string;
  bruto: number;
  comisionMp: number;
  otrasTarifas: number;
  retenciones: number;
  neto: number;
  nroOperacion: string;
}

export interface NoConcretada {
  periodo: string;
  motivo: string;
  bruto: number;
}

export interface AnalisisMercadoPago {
  cobros: Cobro[];
  noConcretadas: NoConcretada[];
  fondeos: { cantidad: number; monto: number };
  tieneHora: boolean;
  horaCorte: number;
  desde: Date;
  hasta: Date;
  avisos: string[];
  archivos: string[];
}

/** 'Medio de pago (payment_type)' → 'payment_type'. */
function claveInterna(titulo: unknown): string {
  const t = String(titulo ?? "").trim();
  const m = t.match(/\(([^()]+)\)\s*$/);
  return m ? m[1].trim() : t;
}

/** Día de turno: antes de la hora de corte, pertenece al día anterior. */
export function diaDeTurno(momento: Date, horaCorte: number): Date {
  const dia = soloDia(momento);
  if (momento.getHours() < horaCorte) dia.setDate(dia.getDate() - 1);
  return dia;
}

/** Las 24 horas arrancando por la apertura: 6, 7, …, 23, 0, 1, …, 5. */
export function ordenHorasDelTurno(horaCorte: number): number[] {
  return Array.from({ length: 24 }, (_, i) => (horaCorte + i) % 24);
}

function diaSemanaDe(f: Date): string {
  return DIAS_SEMANA[(f.getDay() + 6) % 7];
}

export async function analizarMercadoPago(archivos: File[], horaCorte = HORA_CORTE_DEFECTO): Promise<AnalisisMercadoPago> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  if (horaCorte < 0 || horaCorte > 23) throw new ErrorExtracto("La hora de corte tiene que estar entre 0 y 23.");
  const avisos: string[] = [];
  const filas: Record<string, Celda>[] = [];

  for (const archivo of archivos) {
    const hojas = await leerPlanilla(archivo);
    const hoja = hojas.find((h) => h.filas.length > 1) ?? hojas[0];
    const claves = hoja.filas[0].map(claveInterna);
    if (!claves.some((k) => /^(date_created|date_approved|date_created_short)$/.test(k))) {
      throw new ErrorExtracto(
        `"${archivo.name}" no parece el reporte de cobros de Mercado Pago (no trae la columna de fecha "date_created"). ` +
          "Descargalo desde Mercado Pago → Reportes → Cobros (o Actividad → Descargar reporte).",
      );
    }
    for (const fila of hoja.filas.slice(1)) {
      const obj: Record<string, Celda> = {};
      claves.forEach((k, i) => {
        if (k) obj[k] = fila[i] ?? null;
      });
      filas.push(obj);
    }
  }

  // Varios exports pueden solaparse: una operación se cuenta una sola vez.
  let datos = filas;
  if (filas.some((f) => f.operation_id !== null && f.operation_id !== undefined)) {
    const vistos = new Set<string>();
    datos = filas.filter((f) => {
      const id = String(f.operation_id ?? "");
      if (!id) return true;
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    });
    if (filas.length - datos.length > 0) avisos.push(`Se descartaron ${filas.length - datos.length} operaciones duplicadas entre archivos.`);
  }

  const colFecha = ["date_created", "date_approved", "date_created_short"].find((c) => datos.some((f) => c in f))!;
  const conFecha = datos.map((f) => ({ f, momento: aFecha(f[colFecha]) })).filter((x): x is { f: Record<string, Celda>; momento: Date } => !!x.momento);
  if (conFecha.length === 0) throw new ErrorExtracto("No se pudo leer ninguna fecha del reporte.");
  const tieneHora = conFecha.some((x) => x.momento.getHours() !== 0 || x.momento.getMinutes() !== 0);
  if (!tieneHora) {
    avisos.push(
      "El archivo trae la fecha SIN hora, así que no se puede aplicar el corte de turno: cada cobro queda en su día calendario. Descargá el reporte con la fecha completa (date_created).",
    );
  }

  const texto = (v: Celda) => String(v ?? "").trim();
  const tipos = new Set(conFecha.map((x) => texto(x.f.operation_type) || "regular_payment"));
  const desconocidos = [...tipos].filter((t) => !OPERACIONES_VENTA_CONOCIDAS.includes(t) && !OPERACIONES_QUE_NO_SON_VENTA.includes(t));
  if (desconocidos.length) avisos.push(`Tipos de operación nuevos, contados como venta: ${desconocidos.join(", ")}.`);

  const cobros: Cobro[] = [];
  const noConcretadas: NoConcretada[] = [];
  const fondeos = { cantidad: 0, monto: 0 };
  for (const { f, momento } of conFecha) {
    const estado = texto(f.status) || "approved";
    const tipo = texto(f.operation_type) || "regular_payment";
    const diaTurno = tieneHora ? diaDeTurno(momento, horaCorte) : soloDia(momento);
    const periodo = clavePeriodo(diaTurno);
    const bruto = aNumero(f.transaction_amount);
    if (ESTADOS_COBRO.includes(estado) && !OPERACIONES_QUE_NO_SON_VENTA.includes(tipo)) {
      const neto = aNumero(f.net_received_amount);
      const comisionMp = Math.abs(aNumero(f.mercadopago_fee));
      const otrasTarifas = OTRAS_TARIFAS.reduce((s, c) => s + Math.abs(aNumero(f[c])), 0);
      const tipoPago = texto(f.payment_type);
      cobros.push({
        momento,
        diaTurno,
        diaSemana: diaSemanaDe(diaTurno),
        hora: momento.getHours(),
        periodo,
        medioPago: ETIQUETAS_MEDIO_PAGO[tipoPago] ?? (tipoPago ? tipoPago.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Sin dato"),
        tipoOperacion: tipo,
        bruto,
        comisionMp,
        otrasTarifas,
        // Lo no discriminado (suele ser IIBB que MP retiene como agente): bruto − tarifas − neto.
        retenciones: round2(bruto - comisionMp - otrasTarifas - neto),
        neto,
        nroOperacion: texto(f.operation_id),
      });
    } else if (estado === "rejected" || estado === "cancelled") {
      const detalle = texto(f.status_detail);
      noConcretadas.push({ periodo, motivo: ETIQUETAS_MOTIVO[detalle] ?? detalle ?? estado, bruto });
    } else if (OPERACIONES_QUE_NO_SON_VENTA.includes(tipo) && ESTADOS_COBRO.includes(estado)) {
      fondeos.cantidad++;
      fondeos.monto += bruto;
    }
  }
  if (cobros.length === 0) throw new ErrorExtracto("No se encontró ningún cobro aprobado en el archivo.");
  cobros.sort((a, b) => a.momento.getTime() - b.momento.getTime());

  if (tieneHora) {
    const madrugada = cobros.filter((c) => c.hora < horaCorte);
    if (madrugada.length) {
      const monto = madrugada.reduce((s, c) => s + c.bruto, 0);
      const total = cobros.reduce((s, c) => s + c.bruto, 0);
      avisos.push(
        `Regla del turno (corte ${String(horaCorte).padStart(2, "0")}:00): ${madrugada.length} cobros por ${monto.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} (${((monto / total) * 100).toFixed(1)} % del total) se imputaron al día anterior.`,
      );
    }
  }

  const dias = cobros.map((c) => c.diaTurno.getTime());
  return {
    cobros,
    noConcretadas,
    fondeos,
    tieneHora,
    horaCorte,
    desde: new Date(Math.min(...dias)),
    hasta: new Date(Math.max(...dias)),
    avisos,
    archivos: archivos.map((a) => a.name),
  };
}

/* ------------------------------------------------------------------ */
/* Agregaciones para la pantalla                                        */
/* ------------------------------------------------------------------ */

export function porDiaDeTurno(cobros: Cobro[]) {
  const mapa = new Map<number, { dia: Date; diaSemana: string; cobros: number; bruto: number; neto: number; primero: Date; ultimo: Date }>();
  for (const c of cobros) {
    const k = c.diaTurno.getTime();
    const f = mapa.get(k) ?? { dia: c.diaTurno, diaSemana: c.diaSemana, cobros: 0, bruto: 0, neto: 0, primero: c.momento, ultimo: c.momento };
    f.cobros++;
    f.bruto += c.bruto;
    f.neto += c.neto;
    if (c.momento < f.primero) f.primero = c.momento;
    if (c.momento > f.ultimo) f.ultimo = c.momento;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => a.dia.getTime() - b.dia.getTime());
}

export function promedioPorDiaSemana(cobros: Cobro[]): { dia: string; promedio: number; turnos: number }[] {
  const porDia = porDiaDeTurno(cobros);
  return DIAS_SEMANA.map((dia) => {
    const turnos = porDia.filter((d) => d.diaSemana === dia);
    return { dia, turnos: turnos.length, promedio: turnos.length ? turnos.reduce((s, t) => s + t.bruto, 0) / turnos.length : 0 };
  }).filter((d) => d.turnos > 0);
}

export function resumenMensual(cobros: Cobro[]) {
  const mapa = new Map<string, { periodo: string; cobros: number; bruto: number; comision: number; otras: number; retenciones: number; neto: number }>();
  for (const c of cobros) {
    const f = mapa.get(c.periodo) ?? { periodo: c.periodo, cobros: 0, bruto: 0, comision: 0, otras: 0, retenciones: 0, neto: 0 };
    f.cobros++;
    f.bruto += c.bruto;
    f.comision += c.comisionMp;
    f.otras += c.otrasTarifas;
    f.retenciones += c.retenciones;
    f.neto += c.neto;
    mapa.set(c.periodo, f);
  }
  return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export function porMedioDePago(cobros: Cobro[]) {
  const mapa = new Map<string, { medio: string; cobros: number; bruto: number }>();
  for (const c of cobros) {
    const f = mapa.get(c.medioPago) ?? { medio: c.medioPago, cobros: 0, bruto: 0 };
    f.cobros++;
    f.bruto += c.bruto;
    mapa.set(c.medioPago, f);
  }
  return [...mapa.values()].sort((a, b) => b.bruto - a.bruto);
}
