/**
 * Lectura genérica de planillas con SheetJS (Apache-2.0). Los home banking
 * entregan "Excel" que en realidad puede ser: Excel viejo (.xls binario),
 * Excel moderno (.xlsx), XML de Excel 2003 (Mercado Pago), una tabla HTML o
 * un CSV. SheetJS detecta el formato por el contenido, no por la extensión.
 *
 * Todo ocurre en memoria, en el navegador: el archivo nunca se sube.
 */

import { ErrorExtracto } from "./tipos";
import { normalizarBasico } from "./texto";

export type Celda = string | number | boolean | Date | null;

export interface Hoja {
  nombre: string;
  /** Matriz de celdas; las vacías son `null`. */
  filas: Celda[][];
}

/** Lee todas las hojas del archivo. Lanza ErrorExtracto si no se puede abrir. */
export async function leerPlanilla(archivo: File): Promise<Hoja[]> {
  // SheetJS pesa ~1 MB: se importa recién cuando hace falta.
  const XLSX = await import("xlsx");
  let libro: import("xlsx").WorkBook;
  try {
    libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: true, raw: true });
  } catch (e) {
    console.warn("[planilla]", archivo.name, e);
    throw new ErrorExtracto(
      `No se pudo abrir "${archivo.name}". Verificá que sea el archivo exportado por el banco (Excel, CSV o XML), sin modificar.`,
    );
  }
  const hojas: Hoja[] = [];
  for (const nombre of libro.SheetNames) {
    const ws = libro.Sheets[nombre];
    if (!ws) continue;
    const filas = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    hojas.push({ nombre, filas: filas.map((f) => f.map(limpiarCelda)) });
  }
  if (hojas.length === 0 || hojas.every((h) => h.filas.length === 0)) {
    throw new ErrorExtracto(`"${archivo.name}" está vacío o no tiene ninguna hoja con datos.`);
  }
  return hojas;
}

function limpiarCelda(v: unknown): Celda {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/** ¿El archivo empieza con estos bytes? (para distinguir texto de Excel real). */
export async function arranqueDe(archivo: File, n = 8): Promise<Uint8Array> {
  return new Uint8Array(await archivo.slice(0, n).arrayBuffer());
}

export function esExcelReal(arranque: Uint8Array): boolean {
  const ole = [0xd0, 0xcf, 0x11, 0xe0];
  const zip = [0x50, 0x4b, 0x03, 0x04];
  return ole.every((b, i) => arranque[i] === b) || zip.every((b, i) => arranque[i] === b);
}

/**
 * Busca la fila de títulos: la primera cuyas celdas (normalizadas) cumplen
 * el predicado. Los exports suelen traer varias filas de encabezado arriba.
 */
export function detectarFilaCabecera(
  filas: Celda[][],
  predicado: (celdas: string[]) => boolean,
  maxFilas = 30,
): number {
  for (let i = 0; i < Math.min(maxFilas, filas.length); i++) {
    const celdas = filas[i].filter((c) => c !== null).map((c) => normalizarBasico(c));
    if (celdas.length > 0 && predicado(celdas)) return i;
  }
  return -1;
}

/** Lee texto plano con la codificación que usan los bancos (latin-1) o UTF-8. */
export async function leerTexto(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  // Si es UTF-8 válido, se respeta; si no, se asume latin-1 (Windows).
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
