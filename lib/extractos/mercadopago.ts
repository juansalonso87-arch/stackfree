/**
 * Analizador de cobros de Mercado Pago. Port de `python/MP_analizador_cobros.py`.
 *
 * Toma el reporte de cobros que exporta Mercado Pago y agrupa las
 * operaciones por día de TURNO (un cobro de las 02:30 del sábado pertenece
 * al viernes), por hora, por mes y por medio de pago; separa comisiones,
 * tarifas y retenciones, y lista los cobros rechazados o cancelados.
 */

import { ErrorExtracto } from "./tipos";
import { aFecha, aNumero, clavePeriodo, normalizarBasico, round2, soloDia } from "./texto";
import { leerPlanilla, type Celda } from "./planilla";

export const HORA_CORTE_DEFECTO = 6;

const ESTADOS_COBRO = ["approved"];
const OPERACIONES_QUE_NO_SON_VENTA = ["account_fund", "money_transfer", "withdrawal", "payout", "money_exchange", "credit_payment"];
const OPERACIONES_VENTA_CONOCIDAS = ["regular_payment", "point_payment", "pos_payment", "subscription_payment"];

/**
 * En Argentina es muy común cobrar "por transferencia al alias" en vez de QR
 * para esquivar la comisión. En el reporte esas ventas NO vienen como pago:
 * llegan como `account_fund` (ingreso de dinero a la cuenta) con medio
 * `bank_transfer`, igual que una carga de saldo propia, y así vienen tanto si el
 * cliente transfirió desde un banco como desde su propia cuenta de Mercado Pago
 * (confirmado por el dueño: en 266 transferencias de un mes no apareció ninguna
 * con otra etiqueta). Con la opción `transferenciasComoCobro` (activa por
 * defecto) se cuentan como cobros. Por las dudas también se acepta
 * `money_transfer` con plata efectivamente recibida, y se informa aparte.
 */
export const MEDIO_TRANSFERENCIA_RECIBIDA = "Transferencia recibida (alias / CVU)";

export interface OpcionesMercadoPago {
  /** Contar las transferencias recibidas como cobros a clientes (por defecto, sí). */
  transferenciasComoCobro?: boolean;
}

const ETIQUETAS_MEDIO_PAGO: Record<string, string> = {
  account_money: "Dinero en cuenta (saldo MP)",
  // Igual que account_money, pero es el nombre que usa el reporte de liquidaciones.
  available_money: "Dinero en cuenta (saldo MP)",
  // Pago de un QR o link desde la app de un banco (Transferencias 3.0): tiene comisión, a diferencia
  // de la transferencia directa al alias (MEDIO_TRANSFERENCIA_RECIBIDA).
  bank_transfer: "Transferencia desde app bancaria (por QR o link)",
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
  cc_rejected_bad_filled_other: "Rechazo: datos de la tarjeta incorrectos",
  cc_rejected_blacklist: "Rechazo: tarjeta bloqueada por prevención de fraude",
  cc_rejected_duplicated_payment: "Rechazo: pago duplicado",
  cc_rejected_max_attempts: "Rechazo: superó el máximo de intentos",
  cc_rejected_invalid_installments: "Rechazo: cuotas no disponibles",
  expired: "Cancelada: QR / cobro expirado sin pago",
  cancelled: "Cancelada por el vendedor o el comprador",
  by_collector: "Cancelada por el vendedor",
  by_payer: "Cancelada por el comprador",
};

/** Estados que no son un cobro aprobado ni un rechazo: se listan aparte para que no pasen desapercibidos. */
const ESTADOS_ESPECIALES: Record<string, string> = {
  refunded: "Devuelto al cliente (reembolso total)",
  charged_back: "Contracargo (el banco del cliente revirtió el pago)",
  in_mediation: "En mediación (reclamo abierto)",
  in_process: "Pendiente de acreditación",
  pending: "Pendiente de acreditación",
  authorized: "Autorizado, pendiente de captura",
};

/** "cc_rejected_algo_raro" → "Rechazo: algo raro" cuando el motivo no está en la tabla. */
function etiquetaMotivo(detalle: string, estado: string): string {
  if (ETIQUETAS_MOTIVO[detalle]) return ETIQUETAS_MOTIVO[detalle];
  if (detalle.startsWith("cc_rejected_")) return `Rechazo: ${detalle.slice(12).replace(/_/g, " ")}`;
  if (detalle.startsWith("rejected_")) return `Rechazo: ${detalle.slice(9).replace(/_/g, " ")}`;
  return detalle || estado;
}

/**
 * CANAL de cobro: cómo le cobraste al cliente. Distinto del medio de pago
 * (con qué pagó él). El reporte "ancho" lo trae en `sub_unit`; el compacto no,
 * así que se deduce del tipo de operación y de la referencia (los QR en el
 * local llevan external_reference "INSTORE-…").
 */
export const CANAL = {
  qr: "QR / cobro online",
  point: "Point (presencial)",
  link: "Link de pago",
  transferencia: "Transferencia al alias / CVU",
  tienda: "Tienda online / checkout",
  suscripcion: "Suscripciones",
} as const;

function canalDe(f: Record<string, Celda>, tipo: string, esTransferenciaRecibida: boolean): string {
  if (esTransferenciaRecibida) return CANAL.transferencia;
  const sub = normalizarBasico(f.sub_unit);
  const motivo = normalizarBasico(f.reason);
  if (tipo === "pos_payment" || /point/.test(sub) || /venta presencial/.test(motivo)) return CANAL.point;
  if (/link/.test(sub) || /link de pago/.test(motivo)) return CANAL.link;
  if (/checkout|tienda|shop|online/.test(sub)) return CANAL.tienda;
  if (/suscri|subscri/.test(sub) || /subscription|recurring/.test(tipo)) return CANAL.suscripcion;
  return CANAL.qr;
}

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
  /** Parte del cobro devuelta al cliente después (amount_refunded). */
  devuelto: number;
  nroOperacion: string;
  /** Local / sucursal de Mercado Pago ("Nombre del local"), si el reporte lo trae. */
  local: string;
  /** Cómo se cobró: QR, Point, link, transferencia al alias… (ver CANAL). */
  canal: string;
  /** Cuándo Mercado Pago libera la plata (date_released); null si el reporte no lo trae. */
  liberacion: Date | null;
  /** Días entre el cobro y la liberación (0 = inmediato). */
  diasLiberacion: number | null;
}

export interface NoConcretada {
  periodo: string;
  motivo: string;
  bruto: number;
}

export interface AnalisisMercadoPago {
  cobros: Cobro[];
  noConcretadas: NoConcretada[];
  /** Cargas de saldo y movimientos propios que no se contaron como venta. */
  fondeos: { cantidad: number; monto: number };
  /** Transferencias recibidas: cuántas se contaron como cobro (o se dejaron afuera si la opción está apagada). */
  transferencias: { cantidad: number; monto: number; retenido: number; contadas: boolean; desdeMercadoPago: number };
  /** Plata que salió de la cuenta y no se contó como venta (solo en el reporte de liquidaciones). */
  salidas: SalidasDeDinero;
  /** true si se leyó el reporte completo ("Todas las transacciones") y no el de Cobros. */
  deLiquidaciones: boolean;
  tieneHora: boolean;
  horaCorte: number;
  desde: Date;
  hasta: Date;
  avisos: string[];
  archivos: string[];
}

/* ------------------------------------------------------------------ */
/* Reporte "Todas las transacciones" (liquidaciones)                    */
/* ------------------------------------------------------------------ */

/**
 * Mercado Pago tiene dos reportes y **no traen lo mismo**.
 *
 * El de **Cobros** (`collection-…`) puede quedarse corto: en la cuenta real del
 * dueño (septiembre 2026) traía 126 movimientos contra 336, y lo que faltaba
 * eran TODOS los cobros pagados con dinero en cuenta de Mercado Pago (el 57 %
 * de la facturación), más algunas transferencias y tarjetas. Contra la planilla
 * del local daba un 66 % menos de lo cobrado.
 *
 * El de **liquidaciones** (Reportes → "Cerrar y conciliar mes" → Todas las
 * transacciones) sí trae todo: comparado día por día con los 21 días que
 * informó el local, **19 coincidieron al peso** (los otros dos resultaron un
 * cobro anotado después del cierre de caja y una diferencia del local).
 *
 * Trae menos columnas (no hay local, caja, cuotas ni contraparte) pero las que
 * importan están, y las retenciones vienen explícitas en vez de estimadas.
 */
const COLUMNAS_LIQUIDACIONES = ["SOURCE_ID", "TRANSACTION_TYPE", "TRANSACTION_AMOUNT", "REAL_AMOUNT"];

export function esReporteDeLiquidaciones(claves: string[]): boolean {
  return COLUMNAS_LIQUIDACIONES.every((c) => claves.includes(c));
}

/** Plata que salió de la cuenta (no son ventas): se informa aparte. */
export interface SalidasDeDinero {
  cantidad: number;
  monto: number;
}

/**
 * Traduce las filas del reporte de liquidaciones a las mismas claves que usa el
 * reporte de cobros, así el resto del analizador no cambia.
 *
 * Ojo con dos cosas:
 * - **La fecha se toma tal cual viene.** El archivo escribe las horas con
 *   desfasaje `-04:00` aunque sean horas de Argentina (-03:00); `aFecha` ignora
 *   el desfasaje y se queda con la hora escrita, que es lo correcto. Convertir
 *   la zona horaria rompe la comparación con la planilla del local (pasa de 19
 *   días exactos sobre 21 a ninguno).
 * - Las **devoluciones** vienen en una fila aparte, con el mismo SOURCE_ID y el
 *   importe en negativo. Se suman al cobro original como devuelto; si tapan el
 *   cobro entero, la operación pasa a "no concretadas" como reembolso.
 */
function filasDeLiquidaciones(
  filasHoja: Celda[][],
  claves: string[],
  salidas: SalidasDeDinero,
): Record<string, Celda>[] {
  const i = (nombre: string) => claves.indexOf(nombre);
  const C = {
    id: i("SOURCE_ID"),
    medio: i("PAYMENT_METHOD_TYPE"),
    tipo: i("TRANSACTION_TYPE"),
    monto: i("TRANSACTION_AMOUNT"),
    fecha: i("TRANSACTION_DATE"),
    tarifa: i("FEE_AMOUNT"),
    neto: i("REAL_AMOUNT"),
    liberacion: i("MONEY_RELEASE_DATE"),
    unidad: i("BUSINESS_UNIT"),
    subUnidad: i("SUB_UNIT"),
  };
  const filas = filasHoja.slice(1).filter((f) => String(f[C.id] ?? "").trim() !== "");

  const devueltoPorId = new Map<string, number>();
  for (const f of filas) {
    if (String(f[C.tipo] ?? "").toUpperCase() !== "REFUND") continue;
    const id = String(f[C.id] ?? "");
    devueltoPorId.set(id, (devueltoPorId.get(id) ?? 0) + Math.abs(aNumero(f[C.monto])));
  }

  const salida: Record<string, Celda>[] = [];
  for (const f of filas) {
    if (String(f[C.tipo] ?? "").toUpperCase() === "REFUND") continue;
    const bruto = aNumero(f[C.monto]);
    if (bruto <= 0) {
      // Plata que salió: pagos hechos con el saldo, contracargos, cargos.
      salidas.cantidad++;
      salidas.monto += Math.abs(bruto);
      continue;
    }
    const id = String(f[C.id] ?? "");
    const devuelto = devueltoPorId.get(id) ?? 0;
    const medio = String(f[C.medio] ?? "").trim();
    salida.push({
      operation_id: id,
      date_created: f[C.fecha] ?? null,
      date_released: C.liberacion >= 0 ? (f[C.liberacion] ?? null) : null,
      transaction_amount: bruto,
      mercadopago_fee: C.tarifa >= 0 ? f[C.tarifa] : 0,
      net_received_amount: f[C.neto] ?? 0,
      amount_refunded: devuelto,
      payment_type: medio,
      // Una transferencia al alias no paga comisión; si la tiene, es un QR o un
      // link pagado desde la app del banco, que sí la paga.
      operation_type:
        medio === "bank_transfer" && Math.abs(aNumero(f[C.tarifa])) === 0 ? "account_fund" : "regular_payment",
      status: devuelto > 0 && devuelto >= bruto - 0.005 ? "refunded" : "approved",
      business_unit: C.unidad >= 0 ? f[C.unidad] : null,
      sub_unit: C.subUnidad >= 0 ? f[C.subUnidad] : null,
    });
  }
  return salida;
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

export async function analizarMercadoPago(
  archivos: File[],
  horaCorte = HORA_CORTE_DEFECTO,
  opciones: OpcionesMercadoPago = {},
): Promise<AnalisisMercadoPago> {
  let transferenciasComoCobro = opciones.transferenciasComoCobro ?? true;
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  if (horaCorte < 0 || horaCorte > 23) throw new ErrorExtracto("La hora de corte tiene que estar entre 0 y 23.");
  const avisos: string[] = [];
  const filas: Record<string, Celda>[] = [];
  const salidas: SalidasDeDinero = { cantidad: 0, monto: 0 };
  let deLiquidaciones = false;
  let deCobros = false;

  for (const archivo of archivos) {
    const hojas = await leerPlanilla(archivo);
    const hoja = hojas.find((h) => h.filas.length > 1) ?? hojas[0];
    const claves = hoja.filas[0].map(claveInterna);
    if (esReporteDeLiquidaciones(claves)) {
      deLiquidaciones = true;
      filas.push(...filasDeLiquidaciones(hoja.filas, claves, salidas));
      continue;
    }
    if (!claves.some((k) => /^(date_created|date_approved|date_created_short)$/.test(k))) {
      throw new ErrorExtracto(
        `"${archivo.name}" no parece un reporte de Mercado Pago (no trae ni la columna "date_created" ni "SOURCE_ID"). ` +
          "Descargalo desde Mercado Pago → Reportes → Cerrar y conciliar mes → Todas las transacciones.",
      );
    }
    deCobros = true;
    for (const fila of hoja.filas.slice(1)) {
      const obj: Record<string, Celda> = {};
      claves.forEach((k, i) => {
        if (k) obj[k] = fila[i] ?? null;
      });
      filas.push(obj);
    }
  }

  if (deCobros) {
    // Comprobado con una cuenta real: el reporte de Cobros puede dejar afuera
    // buena parte de lo cobrado (ver `esReporteDeLiquidaciones`).
    avisos.push(
      'Este es el reporte de "Cobros", que en algunas cuentas deja afuera operaciones (sobre todo las pagadas con dinero en cuenta de Mercado Pago). Si el total no coincide con lo que registra tu local, bajá el de Reportes → "Cerrar y conciliar mes" → Todas las transacciones, que trae todo.',
    );
  }
  if (deLiquidaciones && !transferenciasComoCobro) {
    // Acá no hay ambigüedad: Mercado Pago ya las liquidó como cobro y les
    // aplicó su retención, así que la duda que resuelve la opción no existe.
    transferenciasComoCobro = true;
    avisos.push(
      "En este reporte las transferencias ya vienen liquidadas por Mercado Pago como cobro (con su retención), así que se cuentan como venta aunque hayas desmarcado la opción.",
    );
  }
  if (salidas.cantidad > 0) {
    avisos.push(
      `Se dejaron afuera ${salidas.cantidad} movimientos de salida de dinero por ${salidas.monto.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} (pagos hechos con el saldo, contracargos o cargos). No son ventas.`,
    );
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
  const transferencias = { cantidad: 0, monto: 0, retenido: 0, contadas: transferenciasComoCobro, desdeMercadoPago: 0 };
  for (const { f, momento } of conFecha) {
    const estado = texto(f.status) || "approved";
    const tipo = texto(f.operation_type) || "regular_payment";
    const tipoPago = texto(f.payment_type);
    const diaTurno = tieneHora ? diaDeTurno(momento, horaCorte) : soloDia(momento);
    const periodo = clavePeriodo(diaTurno);
    const bruto = aNumero(f.transaction_amount);
    // Plata que entró por transferencia (alias/CVU o desde otra cuenta de MP): puede ser un cobro.
    const esTransferenciaRecibida =
      ESTADOS_COBRO.includes(estado) &&
      bruto > 0 &&
      ((tipo === "account_fund" && tipoPago === "bank_transfer") || (tipo === "money_transfer" && aNumero(f.net_received_amount) > 0));
    const esVenta = ESTADOS_COBRO.includes(estado) && !OPERACIONES_QUE_NO_SON_VENTA.includes(tipo);
    if (esTransferenciaRecibida) {
      transferencias.cantidad++;
      transferencias.monto += bruto;
      transferencias.retenido += round2(bruto - Math.abs(aNumero(f.mercadopago_fee)) - aNumero(f.net_received_amount));
      if (tipo === "money_transfer") transferencias.desdeMercadoPago++;
    }

    if (esVenta || (esTransferenciaRecibida && transferenciasComoCobro)) {
      const neto = aNumero(f.net_received_amount);
      const comisionMp = Math.abs(aNumero(f.mercadopago_fee));
      const otrasTarifas = OTRAS_TARIFAS.reduce((s, c) => s + Math.abs(aNumero(f[c])), 0);
      const liberacion = aFecha(f.date_released) ?? aFecha(f.date_released_short);
      cobros.push({
        momento,
        diaTurno,
        diaSemana: diaSemanaDe(diaTurno),
        hora: momento.getHours(),
        periodo,
        medioPago: esTransferenciaRecibida
          ? MEDIO_TRANSFERENCIA_RECIBIDA
          : (ETIQUETAS_MEDIO_PAGO[tipoPago] ?? (tipoPago ? tipoPago.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Sin dato")),
        tipoOperacion: tipo,
        bruto,
        comisionMp,
        otrasTarifas,
        // Lo no discriminado (suele ser IIBB que MP retiene como agente): bruto − tarifas − neto.
        // En las transferencias recibidas no hay comisión, pero esta retención aparece igual.
        retenciones: round2(bruto - comisionMp - otrasTarifas - neto),
        neto,
        devuelto: Math.abs(aNumero(f.amount_refunded)),
        nroOperacion: texto(f.operation_id),
        local: texto(f.description) || texto(f.store_name) || "",
        canal: canalDe(f, tipo, esTransferenciaRecibida),
        liberacion,
        diasLiberacion: liberacion ? Math.round((soloDia(liberacion).getTime() - soloDia(momento).getTime()) / 86_400_000) : null,
      });
    } else if (estado === "rejected" || estado === "cancelled") {
      const detalle = texto(f.status_detail);
      noConcretadas.push({ periodo, motivo: etiquetaMotivo(detalle, estado), bruto });
    } else if (ESTADOS_ESPECIALES[estado] && !OPERACIONES_QUE_NO_SON_VENTA.includes(tipo)) {
      noConcretadas.push({ periodo, motivo: ESTADOS_ESPECIALES[estado], bruto });
    } else if (OPERACIONES_QUE_NO_SON_VENTA.includes(tipo) && ESTADOS_COBRO.includes(estado) && !esTransferenciaRecibida) {
      fondeos.cantidad++;
      fondeos.monto += bruto;
    }
  }
  if (cobros.length === 0) {
    throw new ErrorExtracto(
      transferencias.cantidad > 0
        ? `El archivo solo trae ${transferencias.cantidad} transferencias recibidas y la opción "Contar transferencias recibidas como cobros" está desactivada: no queda ningún cobro para analizar.`
        : "No se encontró ningún cobro aprobado en el archivo.",
    );
  }
  cobros.sort((a, b) => a.momento.getTime() - b.momento.getTime());

  const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  if (transferencias.cantidad > 0) {
    const pct = transferencias.monto ? ((transferencias.retenido / transferencias.monto) * 100).toFixed(2) : "0";
    avisos.push(
      transferenciasComoCobro
        ? `${transferencias.cantidad} transferencias recibidas por ${pesos(transferencias.monto)} se contaron como cobros (venta por alias/CVU)${transferencias.desdeMercadoPago ? `, ${transferencias.desdeMercadoPago} de ellas con la etiqueta "money_transfer": si no son cobros, avisanos` : ""}. Mercado Pago no cobra comisión por recibirlas, pero retuvo ${pesos(transferencias.retenido)} (${pct} %; suele ser IIBB). Si en realidad son cargas de saldo tuyas, desactivá la opción "Contar transferencias recibidas como cobros".`
        : `${transferencias.cantidad} transferencias recibidas por ${pesos(transferencias.monto)} quedaron afuera del análisis porque la opción "Contar transferencias recibidas como cobros" está desactivada. Si tus clientes te pagan por alias/CVU, activala.`,
    );
  }
  if (fondeos.cantidad > 0) {
    avisos.push(`${fondeos.cantidad} movimiento(s) de saldo propio por ${pesos(fondeos.monto)} (cargas de dinero, retiros) no se cuentan como venta.`);
  }

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

  const parciales = cobros.filter((c) => c.devuelto > 0);
  if (parciales.length) {
    const monto = parciales.reduce((s, c) => s + c.devuelto, 0);
    avisos.push(
      `${parciales.length} cobro(s) tuvieron una devolución parcial por ${monto.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}: figuran completos en el bruto y lo devuelto en la columna "Devuelto".`,
    );
  }

  const dias = cobros.map((c) => c.diaTurno.getTime());
  return {
    cobros,
    noConcretadas,
    fondeos,
    transferencias,
    salidas,
    deLiquidaciones,
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

/** Cobros por local (solo tiene sentido cuando el reporte trae más de un local). */
export function porLocal(cobros: Cobro[]) {
  const mapa = new Map<string, { local: string; cobros: number; bruto: number; neto: number }>();
  for (const c of cobros) {
    const k = c.local || "Sin local";
    const f = mapa.get(k) ?? { local: k, cobros: 0, bruto: 0, neto: 0 };
    f.cobros++;
    f.bruto += c.bruto;
    f.neto += c.neto;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => b.bruto - a.bruto);
}

export function porCanal(cobros: Cobro[]) {
  const mapa = new Map<string, { canal: string; cobros: number; bruto: number; comision: number; neto: number }>();
  for (const c of cobros) {
    const f = mapa.get(c.canal) ?? { canal: c.canal, cobros: 0, bruto: 0, comision: 0, neto: 0 };
    f.cobros++;
    f.bruto += c.bruto;
    f.comision += c.comisionMp;
    f.neto += c.neto;
    mapa.set(c.canal, f);
  }
  return [...mapa.values()].sort((a, b) => b.bruto - a.bruto);
}

/** Último día calendario con cobros: contra eso se mide qué quedó sin liberar. */
function diaDeCierre(cobros: Cobro[]): number {
  return cobros.reduce((max, c) => Math.max(max, soloDia(c.momento).getTime()), 0);
}

/** Plata cobrada que al último día del reporte Mercado Pago todavía no había liberado (tarjetas, sobre todo). */
export function pendienteDeLiberar(cobros: Cobro[]): { cobros: number; neto: number } {
  const cierre = diaDeCierre(cobros);
  const pend = cobros.filter((c) => c.liberacion !== null && soloDia(c.liberacion).getTime() > cierre);
  return { cobros: pend.length, neto: pend.reduce((s, c) => s + c.neto, 0) };
}

/**
 * Cuándo se libera la plata, por medio de pago: las tarjetas de crédito
 * tardan (10 días en los reportes reales), el débito un par, el resto es
 * inmediato. "Pendiente" es lo que al último día del reporte todavía no se
 * había liberado.
 */
export function liberacionPorMedio(cobros: Cobro[]) {
  const cierre = diaDeCierre(cobros);
  const mapa = new Map<string, { medio: string; cobros: number; diasPromedio: number; pendiente: number; sumaDias: number }>();
  for (const c of cobros) {
    if (c.liberacion === null || c.diasLiberacion === null) continue;
    const f = mapa.get(c.medioPago) ?? { medio: c.medioPago, cobros: 0, diasPromedio: 0, pendiente: 0, sumaDias: 0 };
    f.cobros++;
    f.sumaDias += c.diasLiberacion;
    if (soloDia(c.liberacion).getTime() > cierre) f.pendiente += c.neto;
    mapa.set(c.medioPago, f);
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, diasPromedio: f.cobros ? f.sumaDias / f.cobros : 0 }))
    .sort((a, b) => b.diasPromedio - a.diasPromedio || b.pendiente - a.pendiente);
}

export function porMedioDePago(cobros: Cobro[]) {
  const mapa = new Map<string, { medio: string; cobros: number; bruto: number; comision: number; retenciones: number }>();
  for (const c of cobros) {
    const f = mapa.get(c.medioPago) ?? { medio: c.medioPago, cobros: 0, bruto: 0, comision: 0, retenciones: 0 };
    f.cobros++;
    f.bruto += c.bruto;
    f.comision += c.comisionMp;
    f.retenciones += c.retenciones;
    mapa.set(c.medioPago, f);
  }
  return [...mapa.values()].sort((a, b) => b.bruto - a.bruto);
}
