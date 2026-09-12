/**
 * Utilidades de PDF compartidas por varias herramientas (pdf-lib, MIT).
 * Carga con errores amigables, conteo de páginas, interpretación de rangos
 * ("1-3, 5, 8-10") y nombres de archivo de salida.
 */

import type { PDFDocument } from "pdf-lib";

export class ErrorPdf extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorPdf";
  }
}

/** Traduce los errores técnicos de pdf-lib a un mensaje para el usuario. */
export function errorPdfAmigable(e: unknown, etiqueta = "pdf"): ErrorPdf {
  if (e instanceof ErrorPdf) return e;
  const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (/encrypt|password/i.test(texto)) {
    return new ErrorPdf("Este PDF está protegido con contraseña. Quítale la protección y vuelve a intentarlo.");
  }
  if (/memory|allocation|RangeError/i.test(texto)) {
    return new ErrorPdf("Este PDF es demasiado grande para la memoria de tu dispositivo.");
  }
  // Un archivo dañado es un problema del archivo, no del sitio: warn, no error.
  console.warn(`[${etiqueta}]`, e);
  return new ErrorPdf("No se pudo leer el archivo. Puede estar dañado o no ser un PDF válido.");
}

/** Abre un PDF con pdf-lib (se importa recién acá: pesa ~300 KB). */
export async function cargarPdf(archivo: File, etiqueta?: string): Promise<PDFDocument> {
  const { PDFDocument } = await import("pdf-lib");
  try {
    return await PDFDocument.load(await archivo.arrayBuffer(), { updateMetadata: false });
  } catch (e) {
    throw errorPdfAmigable(e, etiqueta);
  }
}

export async function contarPaginasPdf(archivo: File, etiqueta?: string): Promise<number> {
  return (await cargarPdf(archivo, etiqueta)).getPageCount();
}

/**
 * Convierte "1-3, 5, 8-10" en [0, 1, 2, 4, 7, 8, 9] (índices desde cero).
 * Acepta espacios, comas o punto y coma; tolera rangos invertidos ("5-3").
 */
export function interpretarRango(texto: string, totalPaginas: number): number[] {
  const indices: number[] = [];
  const partes = texto
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) throw new ErrorPdf("Escribe qué páginas quieres, por ejemplo: 1-3, 5");

  for (const parte of partes) {
    const m = parte.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new ErrorPdf(`No entiendo "${parte}". Usa números y rangos, por ejemplo: 1-3, 5`);
    let desde = Number(m[1]);
    let hasta = m[2] ? Number(m[2]) : desde;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (desde < 1 || hasta > totalPaginas) {
      throw new ErrorPdf(`El PDF tiene ${totalPaginas} páginas: "${parte}" está fuera de rango.`);
    }
    for (let p = desde; p <= hasta; p++) indices.push(p - 1);
  }
  return indices;
}

/** "contrato.pdf" → "contrato" (acotado, con respaldo si queda vacío). */
export function nombreBasePdf(nombre: string): string {
  return nombre.replace(/\.pdf$/i, "").slice(0, 80) || "documento";
}

/** Envuelve los bytes que devuelve `doc.save()` en un Blob descargable. */
export function bytesAPdf(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** Texto "3 páginas" / "1 página". */
export function textoPaginas(n: number): string {
  return `${n} ${n === 1 ? "página" : "páginas"}`;
}
