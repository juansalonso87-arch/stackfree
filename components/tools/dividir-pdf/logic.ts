/**
 * Lógica de "Dividir PDF" (pdf-lib, MIT). Dos modos:
 *  - "todas":  cada página del PDF pasa a ser un PDF aparte (se entregan en ZIP).
 *  - "rango":  el usuario escribe qué páginas quiere ("1-3, 5, 8-10") y se
 *              genera un único PDF con esas páginas, en ese orden.
 */

import { crearZip } from "@/lib/zip";
import { bytesAPdf, cargarPdf, contarPaginasPdf, interpretarRango, nombreBasePdf } from "@/lib/pdf";
export { formatearBytes } from "@/lib/imagen";
export { interpretarRango } from "@/lib/pdf";

export const MAX_MB = 100;

export type ModoDivision = "todas" | "rango";

export function contarPaginas(archivo: File): Promise<number> {
  return contarPaginasPdf(archivo, "dividir-pdf");
}

export interface ResultadoDivision {
  blob: Blob;
  nombre: string;
  /** Cantidad de archivos generados (1 en modo rango, N en modo todas). */
  archivos: number;
  paginas: number;
}

export async function dividirPdf(
  archivo: File,
  modo: ModoDivision,
  rango: string,
  onProgreso?: (hechos: number, total: number) => void,
): Promise<ResultadoDivision> {
  const { PDFDocument } = await import("pdf-lib");
  const origen = await cargarPdf(archivo, "dividir-pdf");
  const total = origen.getPageCount();
  const base = nombreBasePdf(archivo.name);

  if (modo === "rango") {
    const indices = interpretarRango(rango, total);
    const destino = await PDFDocument.create();
    const paginas = await destino.copyPages(origen, indices);
    paginas.forEach((p) => destino.addPage(p));
    destino.setProducer("StackFree");
    const bytes = await destino.save();
    onProgreso?.(1, 1);
    return {
      blob: bytesAPdf(bytes),
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
      blob: bytesAPdf(bytes),
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
