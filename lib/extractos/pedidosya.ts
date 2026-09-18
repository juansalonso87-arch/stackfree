/**
 * Analizador del reporte de pedidos de PedidosYa (Portal Partner → Reportes →
 * Pedidos → Descargar). El reporte puede traer varios locales a la vez.
 *
 * Qué hace con cada pedido:
 *   - Lo ubica en su día de TURNO (un pedido de las 00:30 pertenece a la noche
 *     anterior), hora, día de la semana y mes.
 *   - Separa la venta (lo que compró el cliente) de lo que descuenta PedidosYa
 *     (comisión, tarifa de pago online, impuestos sobre esas comisiones, cargos
 *     por reclamos, marketing) y de los descuentos que financia el local.
 *   - Comprueba que la liquidación cierre: ingreso estimado = venta − deducciones
 *     y pago − adeudado = ingreso − efectivo cobrado por el local.
 *   - Desarma la columna "Artículos" para rankear productos por local.
 *   - Mide tiempos operativos (preparación y entrega) a partir de las horas.
 *
 * Los cancelados no son venta: se listan aparte con motivo y responsable.
 */

import { ErrorExtracto, type Control } from "./tipos";
import { aFecha, aNumero, clavePeriodo, normalizarBasico, round2 } from "./texto";
import { detectarFilaCabecera, leerPlanilla, type Celda } from "./planilla";
import { control } from "./excel";
import { DIAS_SEMANA, HORA_CORTE_DEFECTO, diaDeTurno } from "./mercadopago";

export { HORA_CORTE_DEFECTO };

/**
 * Columnas del reporte, por nombre normalizado (minúsculas, sin acentos).
 * Cada clave interna admite varias redacciones por si PedidosYa las cambia.
 */
const COLUMNAS: Record<string, string[]> = {
  local: ["nombre del local", "local", "restaurant name", "vendor name"],
  idTienda: ["id de tienda", "id tienda", "store id", "vendor id"],
  nro: ["nro de pedido", "numero de pedido", "nro pedido", "order id", "order code"],
  metodoEntrega: ["metodo de entrega", "tipo de entrega", "delivery type"],
  formaPago: ["forma de pago", "metodo de pago", "payment type", "payment method"],
  estado: ["estado del pedido", "estado", "order status", "status"],
  fecha: ["fecha del pedido", "fecha", "order date", "ordered at"],
  aceptado: ["aceptado en", "accepted at"],
  listo: ["lista para retiro", "listo para retiro", "ready for pickup"],
  retirado: ["retirado del local el", "picked up at"],
  entregado: ["entregado el", "delivered at"],
  tieneReclamo: ["tiene reclamos?", "¿tiene reclamos?", "tiene reclamos", "has complaints"],
  motivoReclamo: ["motivo del reclamo", "complaint reason"],
  cancelado: ["cancelado el", "cancelled at"],
  motivoCancelacion: ["motivo de rechazo", "motivo de cancelacion", "cancellation reason"],
  responsableCancelacion: ["responsable del rechazo", "responsable de la cancelacion", "cancellation owner"],
  venta: ["total parcial", "subtotal"],
  tarifaMinima: ["tarifa minima por pedido", "minimum order fee"],
  resarcimientos: ["resarcimientos", "compensations"],
  customerFee: ["customer fee total", "customer fee"],
  impuestos: ["cargo impositivo", "impuestos sobre comisiones", "tax charge"],
  tarifaOnline: ["tarifa de pago en linea", "tarifa de pago online", "online payment fee"],
  descuentoPropio: ["descuento financiado por usted", "descuento financiado por el local", "vendor funded discount"],
  valePropio: ["vale financiado por usted", "voucher financiado por usted", "vendor funded voucher"],
  comision: ["comision", "commission"],
  cargos: ["cargos", "charges"],
  fugaces: ["cargos por descuentos fugaces", "flash discount charges"],
  espera: ["tarifa por espera", "waiting fee"],
  publicidad: ["tarifa por servicios de publicidad total", "tarifa por servicios de publicidad", "advertising fee total"],
  cancelacionEvitable: ["avoidable cancellation fee", "cargo por cancelacion evitable"],
  ingreso: ["ingreso estimado", "estimated revenue", "estimated income"],
  efectivo: ["monto en efectivo ya cobrado por el local", "cash already collected", "efectivo cobrado"],
  adeudado: ["monto adeudado a pedidosya", "amount owed to pedidosya"],
  pago: ["monto de pago", "payout amount", "payment amount"],
  descuentoPeYa: ["descuento financiado por pedidosya", "pedidosya funded discount"],
  valePeYa: ["voucher financiado por pedidosya", "vale financiado por pedidosya"],
  descuentoTotal: ["descuento total", "total discount"],
  articulos: ["articulos", "items", "productos"],
};

const REQUERIDAS = ["local", "nro", "estado", "fecha", "venta", "ingreso"];

export interface PedidoPeYa {
  nro: string;
  local: string;
  idTienda: string;
  momento: Date;
  diaTurno: Date;
  diaSemana: string;
  hora: number;
  periodo: string;
  entregado: boolean;
  metodoEntrega: string;
  formaPago: string;
  /** Total parcial: lo que compró el cliente a precio de carta. */
  venta: number;
  /** Tarifa mínima, resarcimientos y customer fee (ingresos extra, casi siempre 0). */
  otrosIngresos: number;
  /** Descuentos y vales que paga el local (decisión comercial propia). */
  descuentoPropio: number;
  /** Descuentos que paga PedidosYa (informativo: no afectan lo que cobra el local). */
  descuentoPeYa: number;
  comision: number;
  tarifaOnline: number;
  /** "Cargo impositivo": IVA (y percepciones) sobre las comisiones y tarifas. */
  impuestos: number;
  /** "Cargos": devoluciones al cliente por reclamos y penalidades por cancelación. */
  cargosReclamos: number;
  /** Descuentos fugaces y publicidad. */
  marketing: number;
  /** Tarifa por espera y otros cargos menores. */
  otrosCargos: number;
  /** "Descuento total" informado (para controlar que sea propio + PedidosYa); null si la columna no viene. */
  descuentoTotalInformado: number | null;
  /** Ingreso estimado tal cual lo informa PedidosYa. */
  ingreso: number;
  /** Venta + otros ingresos − todas las deducciones (para controlar el ingreso informado). */
  ingresoCalculado: number;
  efectivo: number;
  adeudado: number;
  pago: number;
  tieneReclamo: boolean;
  motivoReclamo: string;
  motivoCancelacion: string;
  responsableCancelacion: string;
  /** Minutos entre "Aceptado" y "Lista para retiro". */
  minutosPreparacion: number | null;
  /** Minutos entre el pedido y la entrega (o el retiro por el cliente). */
  minutosTotal: number | null;
  articulos: string;
  /** Entregado, pero sin pago, sin adeudado y sin efectivo: PedidosYa todavía no lo liquidó. */
  sinLiquidar: boolean;
  /** El ingreso informado coincide con venta − deducciones (±5 centavos). */
  liquidacionCierra: boolean;
}

export interface ItemVendido {
  local: string;
  producto: string;
  unidades: number;
  pedidos: number;
}

export interface AnalisisPedidosYa {
  pedidos: PedidoPeYa[];
  /** Solo los entregados (la venta real). */
  ventas: PedidoPeYa[];
  cancelados: PedidoPeYa[];
  items: ItemVendido[];
  locales: string[];
  controles: Control[];
  horaCorte: number;
  desde: Date;
  hasta: Date;
  avisos: string[];
  archivos: string[];
}

const texto = (v: Celda) => String(v ?? "").trim();

/**
 * Formas de pago normalizadas. El reporte trae "Pago online" y "Efectivo";
 * se unifican variantes ("Cash", "Online", "Tarjeta") para que las fórmulas
 * del Excel ("Caja por Día") puedan filtrar por texto exacto.
 */
export const FORMA_PAGO = { online: "Pago online", efectivo: "Efectivo", sinDato: "Sin dato" } as const;

function normalizarFormaPago(crudo: string, entregado: boolean, efectivoCobrado: number): string {
  const t = normalizarBasico(crudo);
  if (/efectivo|cash|contado/.test(t)) return FORMA_PAGO.efectivo;
  if (/online|en linea|tarjeta|card|credito|debito|mercado|vale|voucher|billetera|wallet/.test(t)) return FORMA_PAGO.online;
  if (t) return crudo;
  // Sin dato: si el local ya cobró efectivo, fue en efectivo.
  if (efectivoCobrado > 0) return FORMA_PAGO.efectivo;
  return entregado ? FORMA_PAGO.sinDato : "—";
}

function diaSemanaDe(f: Date): string {
  return DIAS_SEMANA[(f.getDay() + 6) % 7];
}

/** Minutos entre dos celdas de fecha-hora; null si falta alguna o el orden no tiene sentido. */
function minutosEntre(desde: Celda, hasta: Celda): number | null {
  const a = aFecha(desde);
  const b = aFecha(hasta);
  if (!a || !b) return null;
  const min = (b.getTime() - a.getTime()) / 60_000;
  return min >= 0 && min < 24 * 60 ? Math.round(min) : null;
}

/**
 * "1 Lomo c/guarnición [1 Puré, 1 al champignon], 2 Empanadas" →
 * [{ cantidad: 1, nombre: "Lomo c/guarnición" }, { cantidad: 2, nombre: "Empanadas" }].
 * Las opciones entre corchetes se descartan y solo se corta en las comas que
 * preceden a una cantidad, así "Coca-Cola 1,75l" o "Pizza, sin TACC" no se parten.
 */
export function parsearArticulos(t: string): { cantidad: number; nombre: string }[] {
  const sinOpciones = t.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  if (!sinOpciones) return [];
  return sinOpciones
    .split(/,\s*(?=\d+\s)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(\d+)\s+(.+)$/.exec(s);
      return m ? { cantidad: Number(m[1]), nombre: m[2].trim().replace(/[,.\s]+$/, "") } : { cantidad: 1, nombre: s };
    })
    .filter((i) => i.nombre.length > 0);
}

export async function analizarPedidosYa(archivos: File[], horaCorte = HORA_CORTE_DEFECTO): Promise<AnalisisPedidosYa> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  if (horaCorte < 0 || horaCorte > 23) throw new ErrorExtracto("La hora de corte tiene que estar entre 0 y 23.");
  const avisos: string[] = [];
  const filas: Record<string, Celda>[] = [];

  for (const archivo of archivos) {
    const hojas = await leerPlanilla(archivo);
    const hoja = hojas.find((h) => h.filas.length > 1) ?? hojas[0];
    const filaCab = detectarFilaCabecera(hoja.filas, (celdas) => COLUMNAS.nro.some((n) => celdas.includes(n)) && COLUMNAS.local.some((n) => celdas.includes(n)));
    if (filaCab < 0) {
      throw new ErrorExtracto(
        `"${archivo.name}" no parece el reporte de pedidos de PedidosYa (no encontré las columnas "Nombre del local" y "Nro de pedido"). ` +
          "Descargalo desde el Portal Partner → Reportes → Pedidos → Descargar y subilo tal cual.",
      );
    }
    // Mapa clave interna → índice de columna, según los títulos de este archivo.
    const titulos = hoja.filas[filaCab].map((c) => normalizarBasico(c).replace(/^¿/, ""));
    const indice: Record<string, number> = {};
    for (const [clave, nombres] of Object.entries(COLUMNAS)) {
      const j = titulos.findIndex((t) => nombres.includes(t));
      if (j >= 0) indice[clave] = j;
    }
    const faltan = REQUERIDAS.filter((k) => !(k in indice));
    if (faltan.length) {
      throw new ErrorExtracto(`"${archivo.name}" no trae las columnas ${faltan.map((k) => `"${COLUMNAS[k][0]}"`).join(", ")}. ¿Es el reporte completo de Pedidos del Portal Partner?`);
    }
    for (const fila of hoja.filas.slice(filaCab + 1)) {
      if (fila.every((c) => c === null)) continue;
      const obj: Record<string, Celda> = {};
      for (const [clave, j] of Object.entries(indice)) obj[clave] = fila[j] ?? null;
      filas.push(obj);
    }
  }

  // Varios exports pueden solaparse (mismo local, períodos que se pisan): un pedido se cuenta una vez.
  const vistos = new Set<string>();
  const datos = filas.filter((f) => {
    const id = texto(f.nro);
    if (!id) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  if (filas.length - datos.length > 0) avisos.push(`Se descartaron ${filas.length - datos.length} pedidos duplicados entre archivos.`);

  let ilegibles = 0;
  const pedidos: PedidoPeYa[] = [];
  for (const f of datos) {
    const momento = aFecha(f.fecha);
    if (!momento) {
      ilegibles++;
      continue;
    }
    const estado = normalizarBasico(f.estado);
    const entregado = !/cancel|rechaz|reject/.test(estado);
    const diaTurno = diaDeTurno(momento, horaCorte);
    const venta = aNumero(f.venta);
    const otrosIngresos = aNumero(f.tarifaMinima) + aNumero(f.resarcimientos) + aNumero(f.customerFee);
    const descuentoPropio = aNumero(f.descuentoPropio) + aNumero(f.valePropio);
    const comision = aNumero(f.comision);
    const tarifaOnline = aNumero(f.tarifaOnline);
    const impuestos = aNumero(f.impuestos);
    const cargosReclamos = aNumero(f.cargos) + aNumero(f.cancelacionEvitable);
    const marketing = aNumero(f.fugaces) + aNumero(f.publicidad);
    const otrosCargos = aNumero(f.espera);
    const ingreso = aNumero(f.ingreso);
    const ingresoCalculado = round2(venta + otrosIngresos - descuentoPropio - comision - tarifaOnline - impuestos - cargosReclamos - marketing - otrosCargos);
    const efectivo = aNumero(f.efectivo);
    const adeudado = aNumero(f.adeudado);
    const pago = aNumero(f.pago);
    const sinLiquidar = entregado && pago === 0 && adeudado === 0 && efectivo === 0;
    const formaPago = normalizarFormaPago(texto(f.formaPago), entregado, efectivo);

    pedidos.push({
      nro: texto(f.nro),
      local: texto(f.local) || "Sin local",
      idTienda: texto(f.idTienda),
      momento,
      diaTurno,
      diaSemana: diaSemanaDe(diaTurno),
      hora: momento.getHours(),
      periodo: clavePeriodo(diaTurno),
      entregado,
      metodoEntrega: texto(f.metodoEntrega) || "Sin dato",
      formaPago,
      venta,
      otrosIngresos,
      descuentoPropio,
      descuentoPeYa: aNumero(f.descuentoPeYa) + aNumero(f.valePeYa),
      descuentoTotalInformado: f.descuentoTotal === null || f.descuentoTotal === undefined ? null : aNumero(f.descuentoTotal),
      comision,
      tarifaOnline,
      impuestos,
      cargosReclamos,
      marketing,
      otrosCargos,
      ingreso,
      ingresoCalculado,
      efectivo,
      adeudado,
      pago,
      tieneReclamo: /^(si|sí|yes|true)$/.test(normalizarBasico(f.tieneReclamo)) || !!texto(f.motivoReclamo),
      motivoReclamo: texto(f.motivoReclamo),
      motivoCancelacion: texto(f.motivoCancelacion).replace(/\s+/g, " "),
      responsableCancelacion: texto(f.responsableCancelacion).replace(/^responsable:\s*/i, "").replace(/\s+/g, " "),
      minutosPreparacion: minutosEntre(f.aceptado ?? f.fecha, f.listo),
      minutosTotal: minutosEntre(f.fecha, f.entregado),
      articulos: texto(f.articulos),
      sinLiquidar,
      // Un cancelado tiene todo en cero salvo la venta: la identidad no aplica.
      liquidacionCierra: !entregado || sinLiquidar || Math.abs(ingresoCalculado - ingreso) < 0.05,
    });
  }
  if (pedidos.length === 0) throw new ErrorExtracto("No se pudo leer ningún pedido con fecha válida en el archivo.");
  pedidos.sort((a, b) => a.momento.getTime() - b.momento.getTime());

  const ventas = pedidos.filter((p) => p.entregado);
  const cancelados = pedidos.filter((p) => !p.entregado);
  if (ventas.length === 0) throw new ErrorExtracto("El archivo no tiene ningún pedido entregado: no hay ventas para analizar.");

  /* ---------------- Avisos ---------------- */
  if (ilegibles) avisos.push(`${ilegibles} fila(s) con fecha ilegible se descartaron.`);
  const madrugada = ventas.filter((p) => p.hora < horaCorte);
  if (madrugada.length) {
    avisos.push(
      `Regla del turno (corte ${String(horaCorte).padStart(2, "0")}:00): ${madrugada.length} pedido(s) de la madrugada se imputaron al día anterior.`,
    );
  }
  const sinLiquidar = ventas.filter((p) => p.sinLiquidar);
  if (sinLiquidar.length) {
    avisos.push(
      `${sinLiquidar.length} pedido(s) entregados figuran sin liquidación (sin pago, sin deuda ni efectivo): PedidosYa todavía no los procesó o quedaron trabados. Están en la hoja "Revisar" para que los reclames.`,
    );
  }
  const noCierran = ventas.filter((p) => !p.liquidacionCierra);
  if (noCierran.length) {
    avisos.push(`${noCierran.length} pedido(s) cuyo "Ingreso estimado" no coincide con venta − deducciones (hoja "Revisar").`);
  }
  const conReclamo = ventas.filter((p) => p.tieneReclamo);
  if (conReclamo.length) {
    const cargos = conReclamo.reduce((s, p) => s + p.cargosReclamos, 0);
    avisos.push(
      `${conReclamo.length} pedido(s) con reclamo del cliente: PedidosYa descontó ${cargos.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} en devoluciones ("Cargos"). El detalle por motivo está en la hoja "Cancelados y Reclamos".`,
    );
  }
  const penalidades = cancelados.filter((p) => p.ingreso < 0);
  if (penalidades.length) {
    avisos.push(`${penalidades.length} cancelación(es) atribuidas al local tuvieron penalidad: se descuentan de la liquidación.`);
  }
  if (!pedidos.some((p) => p.articulos)) avisos.push("El archivo no trae la columna Artículos: no se puede armar el ranking de productos.");

  /* ---------------- Controles ---------------- */
  const liquidadas = ventas.filter((p) => !p.sinLiquidar);
  const sum = (arr: PedidoPeYa[], f: (p: PedidoPeYa) => number) => round2(arr.reduce((s, p) => s + f(p), 0));
  const ingresoCalc = sum(liquidadas, (p) => p.ingresoCalculado);
  const ingresoInf = sum(liquidadas, (p) => p.ingreso);
  const netoPago = sum(liquidadas, (p) => p.pago - p.adeudado);
  const netoIngreso = sum(liquidadas, (p) => p.ingreso - p.efectivo);
  const conDescTotal = pedidos.filter((p) => p.descuentoTotalInformado !== null);
  const descTotalInf = sum(conDescTotal, (p) => p.descuentoTotalInformado ?? 0);
  const descTotalCalc = sum(conDescTotal, (p) => p.descuentoPropio + p.descuentoPeYa);
  const controles: Control[] = [
    control("Lectura del archivo", "Pedidos leídos", pedidos.length, pedidos.length, true, "ent"),
    control("Lectura del archivo", "Fechas ilegibles", ilegibles, 0, ilegibles === 0, "ent"),
    control("Liquidación", "Ingreso estimado = venta − deducciones", ingresoCalc, ingresoInf, Math.abs(ingresoCalc - ingresoInf) < 1),
    control("Liquidación", "Pago − adeudado = ingreso − efectivo cobrado", netoPago, netoIngreso, Math.abs(netoPago - netoIngreso) < 1),
    ...(conDescTotal.length > 0
      ? [control("Liquidación", "Descuento total = financiado por el local + por PedidosYa", descTotalCalc, descTotalInf, Math.abs(descTotalCalc - descTotalInf) < 1)]
      : []),
    control("Liquidación", "Pedidos entregados sin liquidación informada", sinLiquidar.length, 0, sinLiquidar.length === 0, "ent"),
  ];

  /* ---------------- Productos ---------------- */
  const items = rankearProductos(ventas);

  const dias = ventas.map((p) => p.diaTurno.getTime());
  return {
    pedidos,
    ventas,
    cancelados,
    items,
    locales: [...new Set(pedidos.map((p) => p.local))].sort((a, b) => a.localeCompare(b, "es")),
    controles,
    horaCorte,
    desde: new Date(Math.min(...dias)),
    hasta: new Date(Math.max(...dias)),
    avisos,
    archivos: archivos.map((a) => a.name),
  };
}

/** Unidades vendidas por producto y local (a partir de la columna Artículos). */
export function rankearProductos(ventas: PedidoPeYa[]): ItemVendido[] {
  const mapa = new Map<string, ItemVendido>();
  for (const p of ventas) {
    if (!p.articulos) continue;
    const vistosEnPedido = new Set<string>();
    for (const it of parsearArticulos(p.articulos)) {
      const k = `${p.local}|${normalizarBasico(it.nombre)}`;
      const fila = mapa.get(k) ?? { local: p.local, producto: it.nombre, unidades: 0, pedidos: 0 };
      fila.unidades += it.cantidad;
      if (!vistosEnPedido.has(k)) {
        fila.pedidos++;
        vistosEnPedido.add(k);
      }
      mapa.set(k, fila);
    }
  }
  return [...mapa.values()].sort((a, b) => a.local.localeCompare(b.local, "es") || b.unidades - a.unidades || a.producto.localeCompare(b.producto, "es"));
}

/* ------------------------------------------------------------------ */
/* Agregaciones para la pantalla y el Excel                             */
/* ------------------------------------------------------------------ */

export interface ResumenLocal {
  local: string;
  pedidos: number;
  venta: number;
  descuentoPropio: number;
  comision: number;
  tarifaOnline: number;
  impuestos: number;
  cargosReclamos: number;
  marketing: number;
  otrosCargos: number;
  ingreso: number;
  efectivo: number;
  pago: number;
  adeudado: number;
  cancelados: number;
  ventaCancelada: number;
  reclamos: number;
  /** Mediana de minutos de preparación (null si no hay datos). */
  preparacionMediana: number | null;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(v.length / 2);
  return v.length % 2 ? v[mitad] : (v[mitad - 1] + v[mitad]) / 2;
}

export function porLocal(a: AnalisisPedidosYa): ResumenLocal[] {
  const mapa = new Map<string, ResumenLocal>();
  const base = (local: string): ResumenLocal => ({
    local,
    pedidos: 0,
    venta: 0,
    descuentoPropio: 0,
    comision: 0,
    tarifaOnline: 0,
    impuestos: 0,
    cargosReclamos: 0,
    marketing: 0,
    otrosCargos: 0,
    ingreso: 0,
    efectivo: 0,
    pago: 0,
    adeudado: 0,
    cancelados: 0,
    ventaCancelada: 0,
    reclamos: 0,
    preparacionMediana: null,
  });
  for (const p of a.pedidos) {
    const r = mapa.get(p.local) ?? base(p.local);
    if (p.entregado) {
      r.pedidos++;
      r.venta += p.venta;
      r.descuentoPropio += p.descuentoPropio;
      r.comision += p.comision;
      r.tarifaOnline += p.tarifaOnline;
      r.impuestos += p.impuestos;
      r.cargosReclamos += p.cargosReclamos;
      r.marketing += p.marketing;
      r.otrosCargos += p.otrosCargos;
      r.ingreso += p.ingreso;
      r.efectivo += p.efectivo;
      r.pago += p.pago;
      r.adeudado += p.adeudado;
      if (p.tieneReclamo) r.reclamos++;
    } else {
      r.cancelados++;
      r.ventaCancelada += p.venta;
      // Penalidades por cancelación atribuida al local: también se liquidan.
      r.ingreso += p.ingreso;
      r.pago += p.pago;
      r.adeudado += p.adeudado;
    }
    mapa.set(p.local, r);
  }
  for (const r of mapa.values()) {
    r.preparacionMediana = mediana(a.ventas.filter((p) => p.local === r.local && p.minutosPreparacion !== null).map((p) => p.minutosPreparacion as number));
  }
  return [...mapa.values()].sort((x, y) => y.venta - x.venta);
}

export function porDiaDeTurno(ventas: PedidoPeYa[]) {
  const mapa = new Map<number, { dia: Date; diaSemana: string; pedidos: number; venta: number; ingreso: number }>();
  for (const p of ventas) {
    const k = p.diaTurno.getTime();
    const f = mapa.get(k) ?? { dia: p.diaTurno, diaSemana: p.diaSemana, pedidos: 0, venta: 0, ingreso: 0 };
    f.pedidos++;
    f.venta += p.venta;
    f.ingreso += p.ingreso;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => a.dia.getTime() - b.dia.getTime());
}

export interface CajaDia {
  local: string;
  dia: Date;
  diaSemana: string;
  pedidosOnline: number;
  ventaOnline: number;
  pedidosEfectivo: number;
  ventaEfectivo: number;
  /** Lo que el cliente pagó en mano en el local (la plata que tiene que estar en la caja). */
  efectivoCobrado: number;
  /** Comisión y tarifas que el local le debe a PedidosYa por esos pedidos en efectivo. */
  adeudado: number;
  /** Pedidos entregados sin forma de pago informada (no entran ni en online ni en efectivo). */
  pedidosSinDato: number;
  pedidos: number;
  venta: number;
}

/**
 * Cobros online vs. en efectivo por local y día de turno, para auditar la caja
 * del local: los pedidos online los cobra PedidosYa y los liquida después; los
 * pedidos en efectivo los cobra el local en mano y le debe la comisión a
 * PedidosYa. Ordenado por local y fecha.
 */
export function cajaPorDia(ventas: PedidoPeYa[]): CajaDia[] {
  const mapa = new Map<string, CajaDia>();
  for (const p of ventas) {
    const k = `${p.local}|${p.diaTurno.getTime()}`;
    const f =
      mapa.get(k) ??
      ({
        local: p.local,
        dia: p.diaTurno,
        diaSemana: p.diaSemana,
        pedidosOnline: 0,
        ventaOnline: 0,
        pedidosEfectivo: 0,
        ventaEfectivo: 0,
        efectivoCobrado: 0,
        adeudado: 0,
        pedidosSinDato: 0,
        pedidos: 0,
        venta: 0,
      } satisfies CajaDia);
    if (p.formaPago === FORMA_PAGO.efectivo) {
      f.pedidosEfectivo++;
      f.ventaEfectivo += p.venta;
      f.adeudado += p.adeudado;
    } else if (p.formaPago === FORMA_PAGO.online) {
      f.pedidosOnline++;
      f.ventaOnline += p.venta;
    } else {
      f.pedidosSinDato++;
    }
    f.efectivoCobrado += p.efectivo;
    f.pedidos++;
    f.venta += p.venta;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => a.local.localeCompare(b.local) || a.dia.getTime() - b.dia.getTime());
}

export function promedioPorDiaSemana(ventas: PedidoPeYa[]): { dia: string; turnos: number; promedio: number; pedidosPromedio: number }[] {
  const porDia = porDiaDeTurno(ventas);
  return DIAS_SEMANA.map((dia) => {
    const turnos = porDia.filter((d) => d.diaSemana === dia);
    return {
      dia,
      turnos: turnos.length,
      promedio: turnos.length ? turnos.reduce((s, t) => s + t.venta, 0) / turnos.length : 0,
      pedidosPromedio: turnos.length ? turnos.reduce((s, t) => s + t.pedidos, 0) / turnos.length : 0,
    };
  }).filter((d) => d.turnos > 0);
}

export function porFormaDePago(ventas: PedidoPeYa[]) {
  const mapa = new Map<string, { clave: string; formaPago: string; metodoEntrega: string; pedidos: number; venta: number }>();
  for (const p of ventas) {
    const k = `${p.formaPago}|${p.metodoEntrega}`;
    const f = mapa.get(k) ?? { clave: k, formaPago: p.formaPago, metodoEntrega: p.metodoEntrega, pedidos: 0, venta: 0 };
    f.pedidos++;
    f.venta += p.venta;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => b.venta - a.venta);
}

export function resumenMensual(ventas: PedidoPeYa[]) {
  const mapa = new Map<string, { periodo: string; pedidos: number; venta: number; descontado: number; descuentoPropio: number; ingreso: number }>();
  for (const p of ventas) {
    const f = mapa.get(p.periodo) ?? { periodo: p.periodo, pedidos: 0, venta: 0, descontado: 0, descuentoPropio: 0, ingreso: 0 };
    f.pedidos++;
    f.venta += p.venta;
    f.descontado += descontadoPorPeYa(p);
    f.descuentoPropio += p.descuentoPropio;
    f.ingreso += p.ingreso;
    mapa.set(p.periodo, f);
  }
  return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Todo lo que se queda PedidosYa: comisión, tarifa online, impuestos, cargos y marketing. */
export function descontadoPorPeYa(p: PedidoPeYa): number {
  return p.comision + p.tarifaOnline + p.impuestos + p.cargosReclamos + p.marketing + p.otrosCargos;
}

/** Motivos de cancelación y de reclamo, con cantidad y plata en juego. */
export function porMotivo(a: AnalisisPedidosYa): { tipo: string; motivo: string; cantidad: number; monto: number }[] {
  const mapa = new Map<string, { tipo: string; motivo: string; cantidad: number; monto: number }>();
  for (const p of a.cancelados) {
    const motivo = [p.motivoCancelacion, p.responsableCancelacion && `responsable: ${p.responsableCancelacion}`].filter(Boolean).join(" · ") || "Sin motivo informado";
    const k = `C|${motivo}`;
    const f = mapa.get(k) ?? { tipo: "Cancelación", motivo, cantidad: 0, monto: 0 };
    f.cantidad++;
    f.monto += p.venta;
    mapa.set(k, f);
  }
  for (const p of a.ventas.filter((v) => v.tieneReclamo)) {
    const motivo = p.motivoReclamo || "Sin motivo informado";
    const k = `R|${motivo}`;
    const f = mapa.get(k) ?? { tipo: "Reclamo", motivo, cantidad: 0, monto: 0 };
    f.cantidad++;
    f.monto += p.cargosReclamos;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((x, y) => x.tipo.localeCompare(y.tipo) || y.cantidad - x.cantidad);
}

export function medianaPreparacion(ventas: PedidoPeYa[]): number | null {
  return mediana(ventas.filter((p) => p.minutosPreparacion !== null).map((p) => p.minutosPreparacion as number));
}

export function medianaEntrega(ventas: PedidoPeYa[]): number | null {
  return mediana(ventas.filter((p) => p.minutosTotal !== null).map((p) => p.minutosTotal as number));
}

