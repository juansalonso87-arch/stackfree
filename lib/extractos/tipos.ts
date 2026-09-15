/**
 * Tipos compartidos por los analizadores de administración (extractos
 * bancarios y cobros). Todo se procesa en el navegador: estos objetos viven
 * solo en memoria mientras el usuario tiene la página abierta.
 */

/** Un movimiento de cuenta ya limpio y clasificado. */
export interface Movimiento {
  fecha: Date | null;
  /** Concepto agrupable (normalizado si el banco lo requiere). */
  concepto: string;
  /** Texto tal cual lo informó el banco (si difiere del concepto). */
  conceptoOriginal?: string;
  detalle?: string;
  categoria: string;
  /** Siempre ≥ 0. */
  debito: number;
  /** Siempre ≥ 0. */
  credito: number;
  /** crédito − débito, con signo. */
  importe: number;
  saldo?: number | null;
  comprobante?: string;
  /** Código numérico del banco (Santander). */
  codigo?: string;
  moneda?: string;
  sucursal?: string;
  /** Cuenta de origen (cuando se analizan varias cuentas juntas). */
  cuenta?: string;
}

/** Una verificación: lo calculado contra lo que declara el banco o se espera. */
export interface Control {
  grupo: string;
  control: string;
  calculado: number;
  declarado: number;
  ok: boolean;
  formato: "num" | "ent";
}

/** Fila del resumen por categoría o por concepto (para la pantalla). */
export interface FilaResumen {
  clave: string;
  movimientos: number;
  debitos: number;
  creditos: number;
  neto: number;
}

/** Un concepto normalizado y los textos crudos que se unificaron en él (BBVA). */
export interface DiagnosticoConcepto {
  concepto: string;
  categoria: string;
  variantes: number;
  movimientos: number;
  credito: number;
  debito: number;
  neto: number;
  textosOriginales: string;
  ejemploDetalle: string;
}

export type Banco = "santander" | "bbva" | "comafi";

export interface AnalisisExtracto {
  banco: Banco;
  movimientos: Movimiento[];
  desde: Date | null;
  hasta: Date | null;
  cuenta?: string;
  cuit?: string;
  saldoInicial?: number;
  saldoFinal?: number;
  controles: Control[];
  diagnostico?: DiagnosticoConcepto[];
  /** Avisos no fatales para mostrar al usuario ("3 filas con fecha ilegible"…). */
  avisos: string[];
  /** Nombres de los archivos de origen. */
  archivos: string[];
}

export const CATEGORIA_DEFECTO = "Otros";

/**
 * Vocabulario ÚNICO de categorías para todos los bancos, con los nombres
 * que usa un administrador. Cada analizador mapea sus códigos/textos a
 * estas claves, así los informes de distintos bancos se pueden comparar.
 */
export const CATEGORIA = {
  sueldos: "Sueldos",
  impCheque: "Impuesto débitos/créditos",
  iibb: "Retenciones y percepciones IIBB",
  iva: "IVA y percepciones",
  impuestos: "Pagos de impuestos (AFIP, ARBA)",
  otrosImp: "Otros impuestos",
  mantenimiento: "Mantenimiento de cuenta",
  comisiones: "Comisiones",
  comisionesTarjeta: "Comisiones de tarjeta",
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
  propias: "Transferencias entre cuentas propias",
  depositos: "Depósitos en efectivo",
  extracciones: "Extracciones de efectivo",
  chequesDep: "Cheques depositados",
  chequesPag: "Cheques pagados",
} as const;

/**
 * Categorías "neutras": el nombre final depende del sentido del movimiento
 * (crédito → primera, débito → segunda). Ver `resolverSentido`.
 */
export const CATEGORIAS_NEUTRAS: Record<string, [string, string]> = {
  transferencia: [CATEGORIA.transfRecibidas, CATEGORIA.transfEnviadas],
  efectivo: [CATEGORIA.depositos, CATEGORIA.extracciones],
  cheque: [CATEGORIA.chequesDep, CATEGORIA.chequesPag],
};

/** Nombre final de una categoría base según el sentido del movimiento. */
export function resolverSentido(base: string, esCredito: boolean): string {
  const neutra = CATEGORIAS_NEUTRAS[base];
  return neutra ? (esCredito ? neutra[0] : neutra[1]) : base;
}

/** Quién paga o cobra, según el detalle: plataforma de ventas, procesadora de tarjetas, o nadie reconocible. */
export const PLATAFORMAS = ["DELIVERY HERO", "PEDIDOSYA", "PEDIDOS YA", "RAPPI", "MERCADO PAGO", "MERCADOPAGO", "MERCADO LIBRE", "MERCADOLIBRE", "MODO", "UALA", "GLOVO"];
export const PROCESADORAS_TARJETA = ["FIRST DATA", "FISERV", "PRISMA", "PAYWAY", "POSNET", "CABAL", "AMERICAN EXPRESS", "AMEX", "NARANJA", "ARGENCARD", "MASTERCARD", "VISA", "GETNET", "LAPOS", "CLOVER"];
export const ASEGURADORAS = ["ZURICH", "SANCOR", "GALENO", "OSDE", "SWISS MEDICAL", "PREPAGA", "SEGURO", "LA CAJA", "ALLIANZ", "MAPFRE", "FEDERACION PATRONAL", "PROVINCIA SEG", "SAN CRISTOBAL", "ORBIS", "RIVADAVIA", "MEDIFE", "OMINT"];
export const ORGANISMOS_IMPOSITIVOS = ["AFIP", "ARCA", "ARBA", "AGIP", "RENTAS", "ATM ", "DGR", "API SANTA FE", "MUNICIPALIDAD", "TASA MUNICIPAL"];

/** Error con mensaje pensado para el usuario (no técnico). */
export class ErrorExtracto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorExtracto";
  }
}
