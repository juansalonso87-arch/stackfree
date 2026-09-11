/**
 * Lógica de "Comprimir imagen".
 *
 * - JPG y WEBP: se vuelven a codificar con menor calidad (Canvas nativo).
 * - PNG: es un formato sin pérdida, así que "bajar la calidad" no existe.
 *   Se reduce la cantidad de colores (cuantización) con UPNG.js (MIT):
 *   256 colores bien elegidos suelen ser indistinguibles en capturas,
 *   logos e ilustraciones, y reducen el peso un 60-80%.
 * - Otros formatos (GIF, BMP, AVIF): se convierten a JPG o WEBP comprimido.
 *
 * Si el archivo comprimido no es más chico que el original, se devuelve el
 * original tal cual: nunca entregamos algo peor.
 */

import { ErrorImagen, contexto2d, decodificarImagen, exportarCanvas } from "@/lib/imagen";
export { formatearBytes } from "@/lib/imagen";

export const MAX_ARCHIVOS = 50;
export const FORMATOS_ENTRADA = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"];

export type NivelCompresion = "suave" | "equilibrado" | "maximo";

export const NIVELES: { valor: NivelCompresion; etiqueta: string; descripcion: string }[] = [
  { valor: "suave", etiqueta: "Alta calidad", descripcion: "Reduce poco, no se nota nada" },
  { valor: "equilibrado", etiqueta: "Equilibrado", descripcion: "El mejor punto medio para la mayoría" },
  { valor: "maximo", etiqueta: "Máxima compresión", descripcion: "El archivo más chico posible" },
];

/** Calidad JPG/WEBP y cantidad de colores PNG por nivel. */
const PARAMETROS: Record<NivelCompresion, { calidad: number; coloresPng: number }> = {
  suave: { calidad: 0.85, coloresPng: 256 },
  equilibrado: { calidad: 0.75, coloresPng: 128 },
  maximo: { calidad: 0.6, coloresPng: 64 },
};

export interface OpcionesCompresion {
  nivel: NivelCompresion;
  /** Si se define, las imágenes más grandes se achican a este lado máximo. */
  ladoMaximo?: number;
}

export interface ResultadoCompresion {
  original: File;
  blob: Blob;
  nombre: string;
  ancho: number;
  alto: number;
  nota?: string;
}

export class ErrorCompresion extends Error {
  constructor(
    public archivo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorCompresion";
  }
}

function reemplazarExtension(nombre: string, ext: string): string {
  const base = nombre.replace(/\.[^.]+$/, "") || "imagen";
  return `${base}-comprimida.${ext}`;
}

/** Cuantiza el PNG a `colores` colores con UPNG.js. */
async function comprimirPng(
  canvas: Parameters<typeof contexto2d>[0],
  ancho: number,
  alto: number,
  colores: number,
): Promise<Blob> {
  const UPNG = (await import("upng-js")).default;
  const datos = contexto2d(canvas).getImageData(0, 0, ancho, alto).data;
  const png = UPNG.encode([datos.buffer as ArrayBuffer], ancho, alto, colores);
  return new Blob([png], { type: "image/png" });
}

export async function comprimirImagen(
  archivo: File,
  opciones: OpcionesCompresion,
): Promise<ResultadoCompresion> {
  const { calidad, coloresPng } = PARAMETROS[opciones.nivel];
  try {
    const esPng = archivo.type === "image/png";
    const esWebp = archivo.type === "image/webp";
    const imagen = await decodificarImagen(archivo, opciones.ladoMaximo ?? Infinity, {
      // Al pasar a JPG (sin transparencia), fondo blanco.
      fondo: esPng || esWebp ? undefined : "#ffffff",
    });

    let blob: Blob;
    let extension: string;
    if (esPng) {
      blob = await comprimirPng(imagen.canvas, imagen.ancho, imagen.alto, coloresPng);
      extension = "png";
    } else if (esWebp) {
      blob = await exportarCanvas(imagen.canvas, "image/webp", calidad);
      extension = "webp";
    } else {
      blob = await exportarCanvas(imagen.canvas, "image/jpeg", calidad);
      extension = "jpg";
    }

    // Si no ganamos nada (y no se redimensionó), devolvemos el original.
    const sinMejora = blob.size >= archivo.size && !imagen.redimensionada;
    if (sinMejora) {
      return {
        original: archivo,
        blob: archivo,
        nombre: archivo.name,
        ancho: imagen.ancho,
        alto: imagen.alto,
        nota: "ya estaba optimizada, se mantiene el original",
      };
    }

    return {
      original: archivo,
      blob,
      nombre: reemplazarExtension(archivo.name, extension),
      ancho: imagen.ancho,
      alto: imagen.alto,
    };
  } catch (e) {
    if (e instanceof ErrorImagen) throw new ErrorCompresion(archivo.name, e.message);
    console.error("[comprimir-imagen]", e);
    throw new ErrorCompresion(
      archivo.name,
      /memory|allocation|RangeError/i.test(String(e))
        ? "La imagen es demasiado grande para la memoria de tu dispositivo."
        : "No se pudo comprimir esta imagen.",
    );
  }
}
