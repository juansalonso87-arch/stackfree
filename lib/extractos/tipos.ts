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

/** Error con mensaje pensado para el usuario (no técnico). */
export class ErrorExtracto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorExtracto";
  }
}
