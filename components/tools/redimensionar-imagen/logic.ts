/**
 * Lógica de "Redimensionar imagen": cambia el tamaño en píxeles con Canvas.
 * Mantiene el formato original (PNG sigue PNG, JPG sigue JPG) y la
 * proporción salvo que el usuario la desbloquee.
 */

import { ErrorImagen, crearCanvas, contexto2d, decodificarImagen, exportarCanvas } from "@/lib/imagen";
export { formatearBytes } from "@/lib/imagen";

export const MAX_ARCHIVOS = 50;
export const FORMATOS_ENTRADA = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"];

export type ModoRedimension = "porcentaje" | "pixeles";

export interface OpcionesRedimension {
  modo: ModoRedimension;
  /** Modo porcentaje: 1-200. */
  porcentaje: number;
  /** Modo píxeles: lado máximo del "cuadro" en el que encajar (o exacto si no se mantiene proporción). */
  ancho: number;
  alto: number;
  mantenerProporcion: boolean;
  /** No agrandar imágenes más chicas que el destino. */
  soloReducir: boolean;
}

export const PRESETS: { etiqueta: string; ancho: number; alto: number }[] = [
  { etiqueta: "HD 1280×720", ancho: 1280, alto: 720 },
  { etiqueta: "Full HD 1920×1080", ancho: 1920, alto: 1080 },
  { etiqueta: "Instagram 1080×1080", ancho: 1080, alto: 1080 },
  { etiqueta: "Historia 1080×1920", ancho: 1080, alto: 1920 },
];

export interface ResultadoRedimension {
  original: File;
  blob: Blob;
  nombre: string;
  ancho: number;
  alto: number;
  nota?: string;
}

export class ErrorRedimension extends Error {
  constructor(
    public archivo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorRedimension";
  }
}

/** Calcula el tamaño final según las opciones. */
export function calcularDestino(
  anchoOriginal: number,
  altoOriginal: number,
  o: OpcionesRedimension,
): { ancho: number; alto: number } {
  if (o.modo === "porcentaje") {
    const f = Math.max(1, Math.min(200, o.porcentaje)) / 100;
    return { ancho: Math.max(1, Math.round(anchoOriginal * f)), alto: Math.max(1, Math.round(altoOriginal * f)) };
  }
  let ancho = Math.max(1, Math.round(o.ancho));
  let alto = Math.max(1, Math.round(o.alto));
  if (o.mantenerProporcion) {
    const escala = Math.min(ancho / anchoOriginal, alto / altoOriginal);
    ancho = Math.max(1, Math.round(anchoOriginal * escala));
    alto = Math.max(1, Math.round(altoOriginal * escala));
  }
  if (o.soloReducir && ancho >= anchoOriginal && alto >= altoOriginal) {
    return { ancho: anchoOriginal, alto: altoOriginal };
  }
  return { ancho, alto };
}

function formatoSalida(tipo: string): { mime: string; ext: string; calidad: number } {
  if (tipo === "image/png") return { mime: "image/png", ext: "png", calidad: 1 };
  if (tipo === "image/webp") return { mime: "image/webp", ext: "webp", calidad: 0.92 };
  return { mime: "image/jpeg", ext: "jpg", calidad: 0.92 };
}

export async function redimensionarImagen(
  archivo: File,
  opciones: OpcionesRedimension,
): Promise<ResultadoRedimension> {
  try {
    const salida = formatoSalida(archivo.type);
    const original = await decodificarImagen(archivo, Infinity, {
      fondo: salida.mime === "image/jpeg" ? "#ffffff" : undefined,
    });
    const destino = calcularDestino(original.ancho, original.alto, opciones);

    if (destino.ancho === original.ancho && destino.alto === original.alto) {
      return {
        original: archivo,
        blob: archivo,
        nombre: archivo.name,
        ancho: original.ancho,
        alto: original.alto,
        nota: "ya tenía ese tamaño, se mantiene el original",
      };
    }

    const canvas = crearCanvas(destino.ancho, destino.alto);
    const ctx = contexto2d(canvas);
    // Mejor calidad al achicar (suavizado bicúbico donde el navegador lo soporte).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(original.canvas, 0, 0, destino.ancho, destino.alto);
    const blob = await exportarCanvas(canvas, salida.mime, salida.calidad);

    const base = archivo.name.replace(/\.[^.]+$/, "") || "imagen";
    return {
      original: archivo,
      blob,
      nombre: `${base}-${destino.ancho}x${destino.alto}.${salida.ext}`,
      ancho: destino.ancho,
      alto: destino.alto,
    };
  } catch (e) {
    if (e instanceof ErrorImagen) throw new ErrorRedimension(archivo.name, e.message);
    console.error("[redimensionar-imagen]", e);
    throw new ErrorRedimension(
      archivo.name,
      /memory|allocation|RangeError/i.test(String(e))
        ? "La imagen es demasiado grande para la memoria de tu dispositivo."
        : "No se pudo redimensionar esta imagen.",
    );
  }
}
