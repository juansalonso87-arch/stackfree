/**
 * Lógica de "HEIC a JPG" (fotos de iPhone).
 *
 * Chrome, Edge y Firefox no saben abrir HEIC. Se usa `heic-to` (LGPL-3.0,
 * envuelve libheif compilado a WebAssembly) que decodifica la foto en un
 * worker, en el navegador. Pesa ~0,7 MB comprimido y se descarga recién al
 * convertir la primera foto. Safari sí abre HEIC de forma nativa: en ese caso
 * se evita descargar la librería.
 */

import { ErrorImagen, crearCanvas, contexto2d, decodificarImagen, exportarCanvas } from "@/lib/imagen";
export { formatearBytes } from "@/lib/imagen";

export const MAX_ARCHIVOS = 50;
export const MAX_MB = 50;
/**
 * Además de HEIC/HEIF se aceptan JPG, PNG y WEBP: el iPhone suele convertir
 * la foto a JPG al elegirla desde Safari, y rechazarla confundiría al usuario.
 */
export const FORMATOS_ENTRADA = ["image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"];

/** ¿El archivo parece HEIC/HEIF por su tipo o su extensión? */
export function pareceHeic(archivo: File): boolean {
  return /hei[cf]/i.test(archivo.type) || /\.(heic|heif|hif)$/i.test(archivo.name);
}

export type FormatoSalida = "image/jpeg" | "image/png" | "image/webp";

export const FORMATOS_SALIDA: { mime: FormatoSalida; nombre: string; extension: string; conCalidad: boolean }[] = [
  { mime: "image/jpeg", nombre: "JPG", extension: "jpg", conCalidad: true },
  { mime: "image/png", nombre: "PNG", extension: "png", conCalidad: false },
  { mime: "image/webp", nombre: "WEBP", extension: "webp", conCalidad: true },
];

export interface OpcionesHeic {
  formato: FormatoSalida;
  /** 0-1. Solo aplica a JPG y WEBP. */
  calidad: number;
}

export interface ResultadoHeic {
  original: File;
  blob: Blob;
  nombre: string;
  ancho: number;
  alto: number;
  nota?: string;
}

export function nombreConvertido(nombreOriginal: string, formato: FormatoSalida): string {
  const base = nombreOriginal.replace(/\.[^.]+$/, "").slice(0, 100) || "foto";
  const ext = FORMATOS_SALIDA.find((f) => f.mime === formato)?.extension ?? "jpg";
  return `${base}.${ext}`;
}

/** Dibuja un bitmap en un canvas (con fondo blanco si el destino es JPG) y lo exporta. */
async function exportarBitmap(bitmap: ImageBitmap, opciones: OpcionesHeic): Promise<{ blob: Blob; ancho: number; alto: number }> {
  try {
    const canvas = crearCanvas(bitmap.width, bitmap.height);
    const ctx = contexto2d(canvas);
    if (opciones.formato === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const blob = await exportarCanvas(canvas, opciones.formato, opciones.calidad);
    return { blob, ancho: bitmap.width, alto: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** Convierte UNA foto HEIC/HEIF. Lanza ErrorImagen con mensaje amigable si falla. */
export async function convertirHeic(archivo: File, opciones: OpcionesHeic): Promise<ResultadoHeic> {
  const nombre = nombreConvertido(archivo.name, opciones.formato);

  // 1) Si el navegador abre HEIC solo (Safari), no hace falta la librería.
  try {
    const imagen = await decodificarImagen(archivo, Infinity, {
      fondo: opciones.formato === "image/jpeg" ? "#ffffff" : undefined,
    });
    const blob = await exportarCanvas(imagen.canvas, opciones.formato, opciones.calidad);
    return {
      original: archivo,
      blob,
      nombre,
      ancho: imagen.ancho,
      alto: imagen.alto,
      nota: pareceHeic(archivo) ? undefined : "tu dispositivo ya la había pasado a otro formato",
    };
  } catch {
    // Lo esperable en Chrome/Edge/Firefox con un HEIC real: seguimos con el decodificador.
  }

  // 2) Decodificador WebAssembly (libheif) en un worker.
  let heic: typeof import("heic-to/csp");
  try {
    // Build "csp": sin `new Function`, compatible con la Content-Security-Policy del sitio.
    heic = await import("heic-to/csp");
  } catch {
    throw new ErrorImagen("No se pudo descargar el decodificador de HEIC. Revisa tu conexión y vuelve a intentarlo.");
  }

  if (!(await heic.isHeic(archivo))) {
    throw new ErrorImagen("Este archivo no es una foto HEIC/HEIF válida (puede ser otro formato con la extensión cambiada).");
  }

  try {
    const bitmap = await heic.heicTo({ blob: archivo, type: "bitmap" });
    const { blob, ancho, alto } = await exportarBitmap(bitmap, opciones);
    return { original: archivo, blob, nombre, ancho, alto };
  } catch (e) {
    if (e instanceof ErrorImagen) throw e;
    console.warn("[heic-a-jpg]", archivo.name, e);
    throw new ErrorImagen(
      /memory|allocation|RangeError/i.test(String(e))
        ? "La foto es demasiado grande para la memoria de tu dispositivo."
        : "No se pudo decodificar esta foto. Puede estar dañada o usar una variante de HEIC no compatible.",
    );
  }
}
