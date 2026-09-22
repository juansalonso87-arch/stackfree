/**
 * Lector del "estado de cuenta" de PedidosYa (Portal Partner → Finanzas →
 * elegir la semana → Descargar estado de cuenta). Es la liquidación: dice qué
 * te va a depositar PedidosYa por esa semana y por qué.
 *
 * El archivo se descarga con extensión .xls pero por dentro es un .xlsx, y
 * trae hasta tres hojas (la de reintegros solo aparece si hubo):
 *   - "Lista de Pedidos": una fila por pedido liquidado, con TODAS las
 *     sucursales juntas. Trae la venta bruta, los descuentos que puso el local,
 *     los que puso PedidosYa y te cobra, la venta neta, la comisión, el cargo
 *     por pedidos con Plus y lo que el local cobró en efectivo.
 *   - "Cargos por reclamos": lo que PedidosYa devolvió a clientes y te descuenta.
 *   - "Reintegros": pedidos rechazados por los que te compensa (la comida ya
 *     estaba hecha). Esos pedidos NO están en la lista de pedidos.
 *
 * Lo que este archivo NO trae (y sí está en el reporte de pedidos): la tarifa
 * de pago online y el IVA sobre las comisiones. Por eso el "a cobrar" que se
 * deduce del estado de cuenta solo es más alto que el depósito real.
 */

import { ErrorExtracto, type Control } from "./tipos";
import { aFecha, aNumero, normalizarBasico, round2 } from "./texto";
import { leerPlanilla, type Celda, type Hoja } from "./planilla";
import { control } from "./excel";

const HOJA_PEDIDOS = ["lista de pedidos", "listado de pedidos", "pedidos"];
const HOJA_RECLAMOS = ["cargos por reclamos", "cargos por reclamo", "reclamos"];
const HOJA_REINTEGROS = ["reintegros", "reintegro"];

/** Columnas por nombre normalizado; varias redacciones por si PedidosYa las cambia. */
const COL_PEDIDOS: Record<string, string[]> = {
  nro: ["numero de pedido", "nro de pedido", "order id"],
  sucursal: ["sucursal", "nombre del local", "local"],
  fecha: ["fecha de pedido", "fecha del pedido", "fecha"],
  bruto: ["monto bruto de la venta", "monto bruto"],
  descuentoComercialPeya: ["descuento comercial neto otorgado x peya", "descuento comercial neto otorgado por peya"],
  descuentoLocal: ["descuento otorgado por el local", "descuento del local"],
  cupon: ["cupon otorgado por el local", "cupon del local"],
  descuentoPeyaNeto: ["descuento neto otorgado peya a usuarios", "descuento neto otorgado pedidosya a usuarios"],
  descuentoRetiro: ["descuento neto comercial retiro en local"],
  descuentoComodin: ["descuento por comodin pago por el local"],
  envioLocal: ["envio a cargo del local"],
  neta: ["monto de venta neta ($)", "monto de venta neta", "venta neta"],
  descuentoPeyaACobrar: ["descuentos pedidosya a cobrar", "descuento pedidosya a cobrar"],
  comisionable: ["monto comisionable servicios pedidosya", "monto comisionable"],
  porcentaje: ["servicio ventas pedidosya (%)", "servicio ventas pedidoya (%)", "% servicios pedidosya"],
  comision: ["servicio ventas pedidoya ($)", "servicio ventas pedidosya ($)", "servicios pedidosya"],
  cobradoLocal: ["monto venta + envio cobrado por el local", "monto cobrado por el local"],
  plus: ["cargo por pedidos con plus", "cargo por pedido con plus"],
  descuentoTarifaServicio: ["descuento tarifa de servicio al cliente"],
  comodin: ["pedido con comodin"],
  esPlus: ["plus"],
  metodoPago: ["metodo de pago", "forma de pago"],
  cobradoPor: ["cobrado por"],
  metodoEntrega: ["metodo de entrega"],
};

const COL_RECLAMOS: Record<string, string[]> = {
  nro: ["numero de pedido", "nro de pedido"],
  estado: ["estado del pedido", "estado"],
  sucursal: ["sucursal", "nombre del local"],
  fecha: ["fecha del pedido", "fecha de pedido"],
  hora: ["hora", "hora del pedido"],
  motivo: ["motivo"],
  comentarios: ["comentarios de los usuarios", "comentarios"],
  montoPedido: ["monto del pedido"],
  reintegroUsuario: ["reintegro al usuario por reclamo", "reintegro al usuario"],
  cargo: ["cargos por reclamos de los usuarios", "cargo por reclamo"],
};

const COL_REINTEGROS: Record<string, string[]> = {
  nro: ["numero de pedido", "nro de pedido"],
  estado: ["estado del pedido", "estado"],
  entregadoAlRepartidor: ["orden entregada al repartidor"],
  sucursal: ["sucursal", "nombre del local"],
  fecha: ["fecha del pedido", "fecha de pedido"],
  montoPedido: ["monto del pedido"],
  comision: ["servicios pedidosya"],
  porcentaje: ["% de reintegro"],
  bruto: ["monto bruto a reintegrar"],
  impuesto: ["impuesto sobre reintegro"],
  neto: ["monto neto a reintegrar"],
};

export interface PedidoEstadoCuenta {
  nro: string;
  sucursal: string;
  fecha: Date;
  /** Lo que compró el cliente antes de los descuentos (precio de carta). */
  bruto: number;
  /** Promos y cupones que financia el local. */
  descuentoLocal: number;
  /** Descuento que otorgó PedidosYa al usuario, neto de impuestos (informativo). */
  descuentoPeyaNeto: number;
  /** Ese mismo descuento, con IVA, que PedidosYa descuenta de la liquidación. */
  descuentoPeyaACobrar: number;
  /** Venta que PedidosYa toma como base de la liquidación. */
  neta: number;
  comisionable: number;
  /** Porcentaje de comisión (0,15 = 15 %). */
  porcentaje: number;
  comision: number;
  /** Lo que el local cobró en mano (pedidos pagados fuera de la app). */
  cobradoLocal: number;
  /** Lo que el local pone del envío gratis de los usuarios Plus. */
  cargoPlus: number;
  esPlus: boolean;
  metodoPago: string;
  cobradoPor: string;
  metodoEntrega: string;
  /** El cliente pagó en el local: esa plata ya la tiene el local. */
  fueraDeLaApp: boolean;
}

export interface ReclamoEstadoCuenta {
  nro: string;
  sucursal: string;
  fecha: Date | null;
  hora: string;
  motivo: string;
  montoPedido: number;
  reintegroUsuario: number;
  /** Negativo: lo que te descuentan. */
  cargo: number;
}

export interface ReintegroEstadoCuenta {
  nro: string;
  sucursal: string;
  fecha: Date | null;
  montoPedido: number;
  comision: number;
  porcentaje: number;
  impuesto: number;
  /** Positivo: lo que te compensan. */
  neto: number;
  entregadoAlRepartidor: boolean;
}

export interface EstadoCuenta {
  archivo: string;
  /** "03/08 al 09/08" (para las columnas del Excel y la pantalla). */
  etiqueta: string;
  desde: Date;
  hasta: Date;
  pedidos: PedidoEstadoCuenta[];
  reclamos: ReclamoEstadoCuenta[];
  reintegros: ReintegroEstadoCuenta[];
  sucursales: string[];
  controles: Control[];
  avisos: string[];
}

const texto = (v: Celda) => String(v ?? "").trim();
const si = (v: Celda) => /^(si|sí|yes|true)$/i.test(texto(v));

function nombreNormalizado(h: Hoja): string {
  return normalizarBasico(h.nombre);
}

function buscarHoja(hojas: Hoja[], nombres: string[]): Hoja | undefined {
  return hojas.find((h) => nombres.includes(nombreNormalizado(h)));
}

/**
 * Lee una hoja con títulos en la primera fila y devuelve las filas como
 * objetos con las claves internas. Devuelve [] si la hoja no está.
 */
function filasDe(hoja: Hoja | undefined, columnas: Record<string, string[]>, requeridas: string[], archivo: string): Record<string, Celda>[] {
  if (!hoja || hoja.filas.length < 2) return [];
  const titulos = hoja.filas[0].map((c) => normalizarBasico(c));
  const indice: Record<string, number> = {};
  for (const [clave, nombres] of Object.entries(columnas)) {
    const j = titulos.findIndex((t) => nombres.includes(t));
    if (j >= 0) indice[clave] = j;
  }
  const faltan = requeridas.filter((k) => !(k in indice));
  if (faltan.length) {
    throw new ErrorExtracto(
      `La hoja "${hoja.nombre}" de "${archivo}" no trae las columnas ${faltan.map((k) => `"${columnas[k][0]}"`).join(", ")}. ` +
        "Descargá el estado de cuenta desde el Portal Partner → Finanzas y subilo tal cual, sin abrirlo ni modificarlo.",
    );
  }
  const filas: Record<string, Celda>[] = [];
  for (const fila of hoja.filas.slice(1)) {
    if (fila.every((c) => c === null)) continue;
    const obj: Record<string, Celda> = {};
    for (const [clave, j] of Object.entries(indice)) obj[clave] = fila[j] ?? null;
    if (!texto(obj.nro)) continue;
    filas.push(obj);
  }
  return filas;
}

/** ¿Estas hojas son un estado de cuenta de PedidosYa? (para reconocer el archivo solo). */
export function esEstadoDeCuentaPeYa(hojas: Hoja[]): boolean {
  const hoja = buscarHoja(hojas, HOJA_PEDIDOS);
  if (!hoja || hoja.filas.length === 0) return false;
  const titulos = hoja.filas[0].map((c) => normalizarBasico(c));
  return COL_PEDIDOS.bruto.some((n) => titulos.includes(n)) && COL_PEDIDOS.nro.some((n) => titulos.includes(n));
}

const dd = (f: Date) => `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}`;

export async function leerEstadoDeCuenta(archivo: File, hojasPrecargadas?: Hoja[]): Promise<EstadoCuenta> {
  const hojas = hojasPrecargadas ?? (await leerPlanilla(archivo));
  const hojaPedidos = buscarHoja(hojas, HOJA_PEDIDOS);
  if (!hojaPedidos) {
    throw new ErrorExtracto(
      `"${archivo.name}" no parece el estado de cuenta de PedidosYa (no encontré la hoja "Lista de Pedidos"). ` +
        "Se descarga desde el Portal Partner → Finanzas → elegís la semana → Descargar estado de cuenta (el Excel, no el PDF).",
    );
  }
  const avisos: string[] = [];
  const crudos = filasDe(hojaPedidos, COL_PEDIDOS, ["nro", "fecha", "bruto", "neta", "comision"], archivo.name);
  if (crudos.length === 0) throw new ErrorExtracto(`El estado de cuenta "${archivo.name}" no tiene pedidos liquidados.`);

  let sinFecha = 0;
  const pedidos: PedidoEstadoCuenta[] = [];
  for (const f of crudos) {
    const fecha = aFecha(f.fecha);
    if (!fecha) {
      sinFecha++;
      continue;
    }
    const metodoPago = texto(f.metodoPago);
    const cobradoPor = texto(f.cobradoPor);
    pedidos.push({
      nro: texto(f.nro),
      sucursal: texto(f.sucursal) || "Sin sucursal",
      fecha,
      bruto: aNumero(f.bruto),
      // Solo el descuento del local y el cupón bajan la venta neta. "Descuento neto
      // comercial Retiro en local" y "Descuento por Comodín" son informativos: en los
      // estados de cuenta reales la identidad cierra sin ellos (y si algún día dejaran
      // de serlo, el control de venta neta lo marca).
      descuentoLocal: aNumero(f.descuentoLocal) + aNumero(f.cupon),
      descuentoPeyaNeto: aNumero(f.descuentoPeyaNeto) + aNumero(f.descuentoComercialPeya),
      descuentoPeyaACobrar: aNumero(f.descuentoPeyaACobrar),
      neta: aNumero(f.neta),
      comisionable: aNumero(f.comisionable),
      porcentaje: aNumero(f.porcentaje) / 100,
      comision: aNumero(f.comision),
      cobradoLocal: aNumero(f.cobradoLocal),
      cargoPlus: aNumero(f.plus),
      esPlus: si(f.esPlus),
      metodoPago: metodoPago || "Sin dato",
      cobradoPor: cobradoPor || "Sin dato",
      metodoEntrega: texto(f.metodoEntrega) || "Sin dato",
      fueraDeLaApp: /fuera de la aplicacion|efectivo|local/i.test(normalizarBasico(metodoPago)) || /local/i.test(normalizarBasico(cobradoPor)),
    });
  }
  if (sinFecha) avisos.push(`${sinFecha} pedido(s) del estado de cuenta "${archivo.name}" no tenían fecha legible y quedaron afuera.`);

  const reclamos: ReclamoEstadoCuenta[] = filasDe(buscarHoja(hojas, HOJA_RECLAMOS), COL_RECLAMOS, ["nro", "cargo"], archivo.name).map((f) => ({
    nro: texto(f.nro),
    sucursal: texto(f.sucursal) || "Sin sucursal",
    fecha: aFecha(f.fecha),
    hora: texto(f.hora),
    motivo: texto(f.motivo) || "Sin motivo",
    montoPedido: aNumero(f.montoPedido),
    reintegroUsuario: aNumero(f.reintegroUsuario),
    cargo: -Math.abs(aNumero(f.cargo)),
  }));

  const reintegros: ReintegroEstadoCuenta[] = filasDe(buscarHoja(hojas, HOJA_REINTEGROS), COL_REINTEGROS, ["nro", "neto"], archivo.name).map((f) => ({
    nro: texto(f.nro),
    sucursal: texto(f.sucursal) || "Sin sucursal",
    fecha: aFecha(f.fecha),
    montoPedido: aNumero(f.montoPedido),
    comision: aNumero(f.comision),
    porcentaje: aNumero(f.porcentaje) / 100,
    impuesto: aNumero(f.impuesto),
    neto: Math.abs(aNumero(f.neto)),
    entregadoAlRepartidor: si(f.entregadoAlRepartidor),
  }));

  const fechas = pedidos.map((p) => p.fecha.getTime());
  const desde = new Date(Math.min(...fechas));
  const hasta = new Date(Math.max(...fechas));
  const sucursales = [...new Set(pedidos.map((p) => p.sucursal))].sort();

  return {
    archivo: archivo.name,
    etiqueta: `${dd(desde)} al ${dd(hasta)}`,
    desde,
    hasta,
    pedidos,
    reclamos,
    reintegros,
    sucursales,
    controles: controlesDeEstado(pedidos),
    avisos,
  };
}

/**
 * Controles internos del estado de cuenta: que la liquidación cierre sola.
 * Se comparan sumas (no filas) para que el usuario vea el peso de la diferencia.
 */
function controlesDeEstado(pedidos: PedidoEstadoCuenta[]): Control[] {
  const suma = (f: (p: PedidoEstadoCuenta) => number) => round2(pedidos.reduce((s, p) => s + f(p), 0));
  const netaCalculada = suma((p) => p.bruto - p.descuentoLocal - p.descuentoPeyaACobrar);
  const netaDeclarada = suma((p) => p.neta);
  const comisionCalculada = suma((p) => round2(p.comisionable * p.porcentaje));
  const comisionDeclarada = suma((p) => p.comision);
  const comisionableCalculado = suma((p) => p.neta + p.descuentoPeyaACobrar);
  const comisionableDeclarado = suma((p) => p.comisionable);
  const efectivoCalculado = suma((p) => (p.fueraDeLaApp ? p.neta : 0));
  const efectivoDeclarado = suma((p) => p.cobradoLocal);
  const cerca = (a: number, b: number) => Math.abs(a - b) < 1;
  return [
    control("Estado de cuenta", "Venta neta = venta bruta − tus promos − descuentos de PedidosYa", netaCalculada, netaDeclarada, cerca(netaCalculada, netaDeclarada)),
    control("Estado de cuenta", "Monto comisionable = venta neta + descuentos de PedidosYa", comisionableCalculado, comisionableDeclarado, cerca(comisionableCalculado, comisionableDeclarado)),
    control("Estado de cuenta", "Comisión = monto comisionable × porcentaje de servicio", comisionCalculada, comisionDeclarada, cerca(comisionCalculada, comisionDeclarada)),
    control("Estado de cuenta", "Cobrado en el local = venta neta de los pedidos pagados fuera de la app", efectivoCalculado, efectivoDeclarado, cerca(efectivoCalculado, efectivoDeclarado)),
  ];
}
