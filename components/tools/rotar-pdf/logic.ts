/**
 * Lógica de "Rotar PDF" (pdf-lib, MIT).
 * Cambia el atributo de rotación de cada página (el mismo que usan los
 * visores de PDF): no se re-dibuja nada, así que no se pierde calidad y el
 * archivo casi no cambia de tamaño.
 */

import { bytesAPdf, cargarPdf, contarPaginasPdf, interpretarRango, nombreBasePdf } from "@/lib/pdf";
export { formatearBytes } from "@/lib/imagen";
export { interpretarRango, textoPaginas } from "@/lib/pdf";

export const MAX_MB = 100;

/** Grados en sentido horario. 270 = 90° a la izquierda. */
export type Angulo = 90 | 180 | 270;

export const ANGULOS: { valor: Angulo; nombre: string; descripcion: string }[] = [
  { valor: 90, nombre: "90° a la derecha", descripcion: "Sentido horario" },
  { valor: 270, nombre: "90° a la izquierda", descripcion: "Sentido antihorario" },
  { valor: 180, nombre: "180°", descripcion: "Boca abajo" },
];

export type AlcanceRotacion = "todas" | "rango";

export function contarPaginas(archivo: File): Promise<number> {
  return contarPaginasPdf(archivo, "rotar-pdf");
}

export interface ResultadoRotacion {
  blob: Blob;
  nombre: string;
  /** Páginas que se rotaron. */
  rotadas: number;
  /** Páginas totales del documento. */
  total: number;
}

export async function rotarPdf(
  archivo: File,
  angulo: Angulo,
  alcance: AlcanceRotacion,
  rango: string,
): Promise<ResultadoRotacion> {
  const { degrees } = await import("pdf-lib");
  const doc = await cargarPdf(archivo, "rotar-pdf");
  const total = doc.getPageCount();
  const indices = alcance === "todas" ? doc.getPageIndices() : interpretarRango(rango, total);

  for (const i of indices) {
    const pagina = doc.getPage(i);
    // Se suma a la rotación que la página ya tenía (puede venir girada de origen).
    const actual = pagina.getRotation().angle;
    pagina.setRotation(degrees((((actual + angulo) % 360) + 360) % 360));
  }

  doc.setProducer("StackFree");
  const bytes = await doc.save();
  return {
    blob: bytesAPdf(bytes),
    nombre: `${nombreBasePdf(archivo.name)}-rotado.pdf`,
    rotadas: new Set(indices).size,
    total,
  };
}
