/**
 * Lógica de "PDF a imagen". Usa pdf.js (Mozilla, Apache-2.0): la misma
 * librería con la que Firefox muestra los PDF. Dibuja cada página en un
 * canvas a la resolución elegida y la exporta como JPG o PNG. Todo en el
 * navegador; el PDF nunca se sube.
 *
 * pdf.js pesa ~450 KB + un "worker" de ~1,2 MB que corre en un hilo aparte
 * (para que la página no se congele). Ambos se descargan recién al usar la
 * herramienta.
 */

import { crearZip } from "@/lib/zip";
import { ErrorPdf, interpretarRango, nombreBasePdf } from "@/lib/pdf";
export { formatearBytes } from "@/lib/imagen";
export { interpretarRango, textoPaginas } from "@/lib/pdf";

export const MAX_MB = 100;

export type FormatoImagen = "image/jpeg" | "image/png";

export const FORMATOS: { mime: FormatoImagen; nombre: string; ext: string; nota: string }[] = [
  { mime: "image/jpeg", nombre: "JPG", ext: "jpg", nota: "Pesa poco; ideal para fotos y para compartir." },
  { mime: "image/png", nombre: "PNG", ext: "png", nota: "Sin pérdida; ideal para texto nítido y capturas." },
];

/** Resolución en puntos por pulgada (un PDF "mide" 72 ppp a escala 1). */
export const RESOLUCIONES: { dpi: number; nombre: string; ayuda: string }[] = [
  { dpi: 72, nombre: "Pantalla (72 ppp)", ayuda: "Liviana, para ver en el celular o pegar en un chat." },
  { dpi: 150, nombre: "Buena (150 ppp)", ayuda: "Equilibrio entre nitidez y peso. Recomendada." },
  { dpi: 300, nombre: "Imprenta (300 ppp)", ayuda: "Máxima nitidez; archivos grandes." },
];

/** Tope de píxeles por imagen para no agotar la memoria del celular. */
const MAX_PIXELES = 30_000_000;

export type AlcancePaginas = "todas" | "rango";

export interface OpcionesPdfAImagen {
  formato: FormatoImagen;
  dpi: number;
  alcance: AlcancePaginas;
  rango: string;
}

export interface ImagenGenerada {
  pagina: number;
  blob: Blob;
  nombre: string;
  ancho: number;
  alto: number;
}

export interface ResultadoPdfAImagen {
  imagenes: ImagenGenerada[];
  /** ZIP con todas las imágenes (solo si hay más de una). */
  zip?: Blob;
  nombreZip: string;
  /** true si alguna página se generó a menor resolución por el tope de píxeles. */
  reducida: boolean;
}

/** Carga pdf.js y le indica dónde está su worker (lo empaqueta el bundler). */
async function cargarPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

function errorAmigable(e: unknown): ErrorPdf {
  if (e instanceof ErrorPdf) return e;
  const nombre = e instanceof Error ? e.name : "";
  if (nombre === "PasswordException") {
    return new ErrorPdf("Este PDF está protegido con contraseña. Quítale la protección y vuelve a intentarlo.");
  }
  if (nombre === "InvalidPDFException") {
    return new ErrorPdf("No se pudo leer el archivo. Puede estar dañado o no ser un PDF válido.");
  }
  if (/memory|allocation|RangeError/i.test(String(e))) {
    return new ErrorPdf("Este PDF es demasiado grande para la memoria de tu dispositivo.");
  }
  console.warn("[pdf-a-imagen]", e);
  return new ErrorPdf("No se pudo procesar el PDF. Puede estar dañado o usar funciones no compatibles.");
}

async function abrirPdf(archivo: File) {
  const pdfjs = await cargarPdfJs();
  try {
    const datos = new Uint8Array(await archivo.arrayBuffer());
    return await pdfjs.getDocument({ data: datos }).promise;
  } catch (e) {
    throw errorAmigable(e);
  }
}

export async function contarPaginas(archivo: File): Promise<number> {
  const doc = await abrirPdf(archivo);
  try {
    return doc.numPages;
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Exporta un canvas del DOM a Blob (pdf.js dibuja sobre canvas de DOM). */
function canvasABlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    canvas.toBlob((b) => (b ? resolver(b) : rechazar(new ErrorPdf("No se pudo generar la imagen."))), tipo, calidad);
  });
}

export async function pdfAImagenes(
  archivo: File,
  opciones: OpcionesPdfAImagen,
  onProgreso?: (hechas: number, total: number) => void,
): Promise<ResultadoPdfAImagen> {
  const doc = await abrirPdf(archivo);
  try {
    const total = doc.numPages;
    const indices =
      opciones.alcance === "todas" ? Array.from({ length: total }, (_, i) => i) : interpretarRango(opciones.rango, total);
    const info = FORMATOS.find((f) => f.mime === opciones.formato) ?? FORMATOS[0];
    const base = nombreBasePdf(archivo.name);
    const digitos = String(total).length;
    const imagenes: ImagenGenerada[] = [];
    let reducida = false;

    // Un solo canvas reutilizado para todas las páginas (menos memoria).
    const canvas = document.createElement("canvas");

    for (let k = 0; k < indices.length; k++) {
      onProgreso?.(k, indices.length);
      const numero = indices[k] + 1;
      let pagina;
      try {
        pagina = await doc.getPage(numero);
      } catch (e) {
        throw errorAmigable(e);
      }
      let escala = opciones.dpi / 72;
      const base1 = pagina.getViewport({ scale: 1 });
      if (base1.width * base1.height * escala * escala > MAX_PIXELES) {
        escala = Math.sqrt(MAX_PIXELES / (base1.width * base1.height));
        reducida = true;
      }
      const viewport = pagina.getViewport({ scale: escala });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      try {
        // Fondo blanco: las páginas "transparentes" quedarían negras en JPG.
        // intent "print": dibuja sin esperar requestAnimationFrame (que el
        // navegador pausa si la pestaña queda en segundo plano) e incluye
        // los valores de formularios, como al imprimir.
        await pagina.render({ canvas, viewport, background: "#ffffff", intent: "print" }).promise;
      } catch (e) {
        throw errorAmigable(e);
      } finally {
        pagina.cleanup();
      }
      const blob = await canvasABlob(canvas, info.mime, 0.92);
      imagenes.push({
        pagina: numero,
        blob,
        nombre: `${base}-pagina-${String(numero).padStart(digitos, "0")}.${info.ext}`,
        ancho: canvas.width,
        alto: canvas.height,
      });
    }
    onProgreso?.(indices.length, indices.length);
    canvas.width = canvas.height = 0;

    const zip = imagenes.length > 1 ? await crearZip(imagenes.map((i) => ({ nombre: i.nombre, blob: i.blob }))) : undefined;
    return { imagenes, zip, nombreZip: `${base}-${info.ext}.zip`, reducida };
  } finally {
    await doc.loadingTask.destroy();
  }
}
