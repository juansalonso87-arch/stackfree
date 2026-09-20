/**
 * Lectura del texto de un PDF "digital" (generado por el sistema del banco,
 * no escaneado) con pdf.js, agrupado en líneas con la posición horizontal
 * de cada fragmento. Sobre estas líneas trabajan los lectores de resúmenes
 * en PDF de cada banco (`<banco>.ts`), que reconocen las columnas por la
 * posición de los títulos ("Fecha", "Débitos", "Créditos", "Saldo"…).
 *
 * pdf.js solo lee el texto que el PDF ya trae: no hay OCR. Un resumen
 * escaneado (una foto) devuelve cero líneas y se informa como tal.
 */

import { ErrorExtracto } from "./tipos";

/** Un fragmento de texto tal como lo entrega pdf.js. */
export interface FragmentoPdf {
  /** Borde izquierdo, en puntos desde el margen izquierdo de la página. */
  x: number;
  /** Borde derecho (x + ancho): sirve para las columnas de importes, alineadas a la derecha. */
  derecha: number;
  texto: string;
}

/** Una línea visual: fragmentos con la misma altura, ordenados de izquierda a derecha. */
export interface LineaPdf {
  pagina: number;
  /** Distancia desde el borde superior de la página. */
  y: number;
  fragmentos: FragmentoPdf[];
  /** Todo el texto de la línea unido por un espacio. */
  texto: string;
}

export interface TextoPdf {
  paginas: number;
  lineas: LineaPdf[];
  /** Productor declarado en los metadatos (ayuda a reconocer el banco). */
  productor: string;
  /** Título declarado en los metadatos (Comafi: "RESCTA - Sobre único banco Comafi"). */
  titulo: string;
}

const MAGIA_PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** ¿El archivo empieza como un PDF? (mira los bytes, no la extensión ni el tipo MIME). */
export async function esPdf(archivo: File): Promise<boolean> {
  const arranque = new Uint8Array(await archivo.slice(0, 4).arrayBuffer());
  return MAGIA_PDF.every((b, i) => arranque[i] === b);
}

/** Carga pdf.js e indica dónde está su worker (lo empaqueta el bundler; en Node usa el worker interno). */
async function cargarPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

/** Dos fragmentos están en la misma línea si su altura difiere menos que esto (puntos). */
const TOLERANCIA_LINEA = 2;

/**
 * Lee todas las páginas y devuelve las líneas en orden de lectura
 * (página, de arriba hacia abajo). Los fragmentos vacíos se descartan.
 */
export async function leerTextoPdf(archivo: File): Promise<TextoPdf> {
  const pdfjs = await cargarPdfJs();
  const data = new Uint8Array(await archivo.arrayBuffer());
  const tarea = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await tarea.promise;
  } catch (e) {
    const nombre = e instanceof Error ? e.name : "";
    console.warn("[pdf-texto]", e);
    if (nombre === "PasswordException") {
      throw new ErrorExtracto(`"${archivo.name}" está protegido con contraseña. Quitale la protección y volvé a intentarlo.`);
    }
    throw new ErrorExtracto(`No pude abrir "${archivo.name}" como PDF. Puede estar dañado o no ser un PDF válido.`);
  }

  const lineas: LineaPdf[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const alto = pagina.getViewport({ scale: 1 }).height;
      const contenido = await pagina.getTextContent();
      const abiertas: { y: number; fragmentos: FragmentoPdf[] }[] = [];
      for (const item of contenido.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const x = item.transform[4];
        const y = alto - item.transform[5];
        const fragmento: FragmentoPdf = { x, derecha: x + item.width, texto: item.str.trim() };
        let linea = abiertas.find((l) => Math.abs(l.y - y) <= TOLERANCIA_LINEA);
        if (!linea) {
          linea = { y, fragmentos: [] };
          abiertas.push(linea);
        }
        linea.fragmentos.push(fragmento);
      }
      abiertas.sort((a, b) => a.y - b.y);
      for (const l of abiertas) {
        l.fragmentos.sort((a, b) => a.x - b.x);
        lineas.push({ pagina: p, y: l.y, fragmentos: l.fragmentos, texto: l.fragmentos.map((f) => f.texto).join(" ") });
      }
    }
    let info: { Producer?: string; Creator?: string; Title?: string } = {};
    try {
      info = ((await doc.getMetadata()).info ?? {}) as typeof info;
    } catch {
      // Sin metadatos no pasa nada: solo ayudan a reconocer el banco.
    }
    return { paginas: doc.numPages, lineas, productor: `${info.Producer ?? ""} ${info.Creator ?? ""}`.trim(), titulo: info.Title ?? "" };
  } finally {
    await tarea.destroy().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Ayudas para los lectores de cada banco                               */
/* ------------------------------------------------------------------ */

/**
 * "1.234.567,89" → 1234567.89; "376.015,84-" y "-376.015,84" → negativo.
 * Tolera que falte un punto de miles ("2241.921,80": así imprime Comafi los
 * importes de más de un millón en sus tablas auxiliares). Devuelve null si no
 * es un importe.
 */
export function importePdf(texto: string): number | null {
  const t = texto.replace(/\s|\$/g, "");
  const m = t.match(/^(-)?(\d+(?:\.\d{3})*)(,\d{2})(-)?$/);
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, "") + m[3].replace(",", "."));
  return m[1] || m[4] ? -n : n;
}

/** ¿El texto es un importe con centavos ("1.234,56", "8,78", "376.015,84-")? */
export function esImporte(texto: string): boolean {
  return importePdf(texto) !== null;
}

/** "03/08/26" o "03/08/2026" → Date local a medianoche; null si no es fecha. */
export function fechaPdf(texto: string): Date | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const f = new Date(anio, mes - 1, dia);
  return f.getDate() === dia ? f : null;
}

/**
 * Asigna un fragmento numérico a la columna cuyo borde derecho está más cerca
 * del suyo (las columnas de importes se alinean a la derecha). Devuelve el
 * índice de la columna o -1 si queda lejos de todas.
 */
export function columnaPorDerecha(fragmento: FragmentoPdf, bordesDerechos: number[], tolerancia = 30): number {
  let mejor = -1;
  let distancia = Infinity;
  bordesDerechos.forEach((borde, i) => {
    const d = Math.abs(fragmento.derecha - borde);
    if (d < distancia) {
      distancia = d;
      mejor = i;
    }
  });
  return distancia <= tolerancia ? mejor : -1;
}
