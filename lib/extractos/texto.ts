/**
 * Utilidades de texto, números y fechas para los analizadores.
 * Equivalentes a las funciones `sin_acentos`, `a_numero`, etc. de los scripts
 * Python originales (carpeta `python/` del repo).
 */

import { CATEGORIA_DEFECTO, type FilaResumen, type Movimiento } from "./tipos";

export function sinAcentos(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/** minúsculas, sin acentos, sin espacios de más. */
export function normalizarBasico(texto: unknown): string {
  return sinAcentos(texto).toLowerCase().trim().replace(/\s+/g, " ");
}

/** '1.234,56', '$ 1234.56', '(1.234,56)', '-81.862.671,63' o número → number. */
export function aNumero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let t = String(valor).trim();
  if (!t) return 0;
  const entreParentesis = t.startsWith("(") && t.endsWith(")");
  t = t.replace(/^\(|\)$/g, "");
  const negativo = entreParentesis || /^-/.test(t.replace(/[^\d,.\-]/g, ""));
  t = t.replace(/[^\d,.]/g, "");
  if (t.includes(",") && t.includes(".")) {
    // formato argentino 1.234,56 (o 1,234.56 si el punto va último)
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

/** '+00021562956.08' / '-00000136305.75' (Santander) → number. */
export function aNumeroSantander(valor: unknown): number {
  const t = String(valor ?? "").trim();
  if (!t) return 0;
  const signo = t.startsWith("-") ? -1 : 1;
  const n = Number(t.replace(/^[+-]/, "").replace(/^0+(?=\d)/, ""));
  return Number.isFinite(n) ? signo * n : 0;
}

/**
 * Convierte lo que venga en una celda de fecha a Date (a las 00:00 local).
 * Acepta Date, número de serie de Excel, 'DD/MM/YYYY', 'YYYY-MM-DD',
 * 'YYYYMMDD' y variantes con hora.
 */
export function aFecha(valor: unknown): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === "number") {
    // Serie de Excel (días desde 1899-12-30), con fracción = hora.
    if (valor > 20000 && valor < 80000) {
      const ms = Math.round((valor - 25569) * 86400 * 1000);
      const d = new Date(ms);
      // El serie es "hora local sin zona": se reconstruye como local.
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    }
    return null;
  }
  const t = String(valor).trim();
  let m = t.match(/^(\d{4})(\d{2})(\d{2})$/); // 20240315
  if (m) return fecha(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/); // 15/03/2024 14:05
  if (m) {
    const anio = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return fecha(anio, +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/); // 2024-03-15T14:05:00
  if (m) return fecha(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return null;
}

function fecha(a: number, mes: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  const f = new Date(a, mes - 1, d, h, mi, s);
  return Number.isNaN(f.getTime()) ? null : f;
}

/** Fecha sin hora (00:00 local), para agrupar por día. */
export function soloDia(f: Date): Date {
  return new Date(f.getFullYear(), f.getMonth(), f.getDate());
}

export function claveDia(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

export function clavePeriodo(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`;
}

export function formatearFecha(f: Date | null | undefined): string {
  if (!f) return "";
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()}`;
}

const fmtPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const fmtNumero = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEntero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function formatearPesos(n: number): string {
  return fmtPesos.format(n);
}
export function formatearNumero(n: number): string {
  return fmtNumero.format(n);
}
export function formatearEntero(n: number): string {
  return fmtEntero.format(n);
}

/** Redondeo a 2 decimales sin sorpresas de coma flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Clasificación por palabras clave                                     */
/* ------------------------------------------------------------------ */

/** Reglas [categoría, palabras clave]: gana la PRIMERA que coincide. */
export type ReglasCategoria = [string, string[]][];

export function clasificarPorTexto(texto: string, reglas: ReglasCategoria, normalizar = normalizarBasico): string {
  const n = normalizar(texto);
  for (const [categoria, claves] of reglas) {
    if (claves.some((clave) => n.includes(normalizar(clave)))) return categoria;
  }
  return CATEGORIA_DEFECTO;
}

/* ------------------------------------------------------------------ */
/* Resúmenes para la pantalla                                           */
/* ------------------------------------------------------------------ */

export function resumirPor(movimientos: Movimiento[], clave: (m: Movimiento) => string): FilaResumen[] {
  const mapa = new Map<string, FilaResumen>();
  for (const m of movimientos) {
    const k = clave(m);
    const fila = mapa.get(k) ?? { clave: k, movimientos: 0, debitos: 0, creditos: 0, neto: 0 };
    fila.movimientos += 1;
    fila.debitos += m.debito;
    fila.creditos += m.credito;
    fila.neto += m.importe;
    mapa.set(k, fila);
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, debitos: round2(f.debitos), creditos: round2(f.creditos), neto: round2(f.neto) }))
    .sort((a, b) => b.neto - a.neto);
}

export function rangoFechas(movimientos: Movimiento[]): { desde: Date | null; hasta: Date | null } {
  let desde: Date | null = null;
  let hasta: Date | null = null;
  for (const m of movimientos) {
    if (!m.fecha) continue;
    if (!desde || m.fecha < desde) desde = m.fecha;
    if (!hasta || m.fecha > hasta) hasta = m.fecha;
  }
  return { desde, hasta };
}
