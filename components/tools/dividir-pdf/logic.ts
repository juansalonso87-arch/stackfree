/**
 * Lógica de "Dividir PDF" (pdf-lib, MIT). Dos modos:
 *  - "todas":  cada página del PDF pasa a ser un PDF aparte (se entregan en ZIP).
 *  - "rango":  el usuario escribe qué páginas quiere ("1-3, 5, 8-10") y se
 *              genera un único PDF con esas páginas, en ese orden.
 */

import { crearZip } from "@/lib/zip";
export { formatearBytes } from "@/lib/imagen";

export const MAX_MB = 100;

export type ModoDivision = "todas" | "rango";

export class ErrorDividir extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDividir";
  }
}

function errorAmigable(e: unknown): ErrorDividir {
  if (e instanceof ErrorDividir) return e;
  const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (/encrypt|password/i.test(texto)) {
    return new ErrorDividir("Este PDF está protegido con contraseña. Quítale la protección y vuelve a intentarlo.");
  }
  if (/memory|allocation|RangeError/i.test(texto)) {
    return new ErrorDividir("Este PDF es demasiado grande para la memoria de tu dispositivo.");
  }
  console.warn("[dividir-pdf]", e);
  return new ErrorDividir("No se pudo leer el archivo. Puede estar dañado o no ser un PDF válido.");
}

export async function contarPaginas(archivo: File): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  try {
    const doc = await PDFDocument.load(await archivo.arrayBuffer(), { updateMetadata: false });
    return doc.getPageCount();
  } catch (e) {
    throw errorAmigable(e);
  }
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
  if (partes.length === 0) throw new ErrorDividir("Escribe qué páginas quieres, por ejemplo: 1-3, 5");

  for (const parte of partes) {
    const m = parte.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new ErrorDividir(`No entiendo "${parte}". Usa números y rangos, por ejemplo: 1-3, 5`);
    let desde = Number(m[1]);
    let hasta = m[2] ? Number(m[2]) : desde;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (desde < 1 || hasta > totalPaginas) {
      throw new ErrorDividir(`El PDF tiene ${totalPaginas} páginas: "${parte}" está fuera de rango.`);
    }
    for (let p = desde; p <= hasta; p++) indices.push(p - 1);
  }
  return indices;
}

export interface ResultadoDivision {
  blob: Blob;
  nombre: string;
  /** Cantidad de archivos generados (1 en modo rango, N en modo todas). */
  archivos: number;
  paginas: number;
}

function baseDe(nombre: string): string {
  return nombre.replace(/\.pdf$/i, "").slice(0, 80) || "documento";
}

export async function dividirPdf(
  archivo: File,
  modo: ModoDivision,
  rango: string,
  onProgreso?: (hechos: number, total: number) => void,
): Promise<ResultadoDivision> {
  const { PDFDocument } = await import("pdf-lib");
  let origen: Awaited<ReturnType<typeof PDFDocument.load>>;
  try {
    origen = await PDFDocument.load(await archivo.arrayBuffer(), { updateMetadata: false });
  } catch (e) {
    throw errorAmigable(e);
  }
  const total = origen.getPageCount();
  const base = baseDe(archivo.name);

  if (modo === "rango") {
    const indices = interpretarRango(rango, total);
    const destino = await PDFDocument.create();
    const paginas = await destino.copyPages(origen, indices);
    paginas.forEach((p) => destino.addPage(p));
    destino.setProducer("StackFree");
    const bytes = await destino.save();
    onProgreso?.(1, 1);
    return {
      blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      nombre: `${base}-paginas-${rango.replace(/[^\d,-]+/g, "").replace(/,/g, "_") || "seleccion"}.pdf`,
      archivos: 1,
      paginas: indices.length,
    };
  }

  // Modo "todas": un PDF por página, empaquetados en ZIP.
  const entradas = [];
  const digitos = String(total).length;
  for (let i = 0; i < total; i++) {
    onProgreso?.(i, total);
    const destino = await PDFDocument.create();
    const [pagina] = await destino.copyPages(origen, [i]);
    destino.addPage(pagina);
    destino.setProducer("StackFree");
    const bytes = await destino.save();
    entradas.push({
      nombre: `${base}-pagina-${String(i + 1).padStart(digitos, "0")}.pdf`,
      blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
    });
  }
  onProgreso?.(total, total);
  return {
    blob: await crearZip(entradas),
    nombre: `${base}-paginas.zip`,
    archivos: total,
    paginas: total,
  };
}
