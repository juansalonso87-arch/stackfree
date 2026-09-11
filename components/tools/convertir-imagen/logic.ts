/**
 * Lógica de "Convertir formato de imagen".
 *
 * No usa ninguna librería de imágenes: el propio navegador decodifica
 * (createImageBitmap) y codifica (canvas.toBlob) los formatos. Es rápido,
 * pesa cero y funciona sin conexión una vez cargada la página.
 *
 * Solo el ZIP de "descargar todo" usa una librería (fflate, MIT, ~8 KB).
 */

import { ErrorImagen, decodificarImagen, exportarCanvas } from "@/lib/imagen";
import { crearZip as crearZipGenerico } from "@/lib/zip";
export { formatearBytes } from "@/lib/imagen";

export type FormatoSalida = "image/png" | "image/jpeg" | "image/webp";

export const FORMATOS_SALIDA: { mime: FormatoSalida; nombre: string; extension: string; conCalidad: boolean }[] = [
  { mime: "image/jpeg", nombre: "JPG", extension: "jpg", conCalidad: true },
  { mime: "image/png", nombre: "PNG", extension: "png", conCalidad: false },
  { mime: "image/webp", nombre: "WEBP", extension: "webp", conCalidad: true },
];

export const FORMATOS_ENTRADA = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
];

export const MAX_ARCHIVOS = 50;

export interface OpcionesConversion {
  formato: FormatoSalida;
  /** 0-1. Solo aplica a JPG y WEBP. */
  calidad: number;
}

export interface ResultadoConversion {
  original: File;
  blob: Blob;
  nombre: string;
  ancho: number;
  alto: number;
}

export class ErrorConversion extends Error {
  constructor(
    public archivo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorConversion";
  }
}

/* ------------------------------------------------------------------ */
/* Capacidades del navegador                                            */
/* ------------------------------------------------------------------ */

const soporteCodificacion = new Map<FormatoSalida, boolean>();

/**
 * ¿Puede este navegador GENERAR el formato? Si no puede, `toBlob` devuelve
 * silenciosamente un PNG, así que hay que comprobarlo antes (Safari viejo
 * no genera WEBP, por ejemplo).
 */
export function puedeCodificar(formato: FormatoSalida): boolean {
  if (typeof document === "undefined") return true;
  const cache = soporteCodificacion.get(formato);
  if (cache !== undefined) return cache;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const soporta = canvas.toDataURL(formato).startsWith(`data:${formato}`);
  soporteCodificacion.set(formato, soporta);
  return soporta;
}

/* ------------------------------------------------------------------ */
/* Conversión                                                           */
/* ------------------------------------------------------------------ */

function extensionDe(formato: FormatoSalida): string {
  return FORMATOS_SALIDA.find((f) => f.mime === formato)?.extension ?? "img";
}

export function nombreConvertido(nombreOriginal: string, formato: FormatoSalida): string {
  const base = nombreOriginal.replace(/\.[^.]+$/, "").slice(0, 100) || "imagen";
  return `${base}.${extensionDe(formato)}`;
}

/** Convierte UN archivo. Lanza ErrorConversion con mensaje amigable si falla. */
export async function convertirImagen(
  archivo: File,
  opciones: OpcionesConversion,
): Promise<ResultadoConversion> {
  if (!puedeCodificar(opciones.formato)) {
    throw new ErrorConversion(
      archivo.name,
      `Tu navegador no puede generar ${extensionDe(opciones.formato).toUpperCase()}. Prueba con Chrome, Edge o Firefox actualizados.`,
    );
  }

  try {
    // JPG no tiene transparencia: si no rellenamos, las zonas transparentes
    // quedan NEGRAS. Blanco es lo que espera casi todo el mundo.
    const fondo = opciones.formato === "image/jpeg" ? "#ffffff" : undefined;
    const imagen = await decodificarImagen(archivo, Infinity, { fondo });
    const blob = await exportarCanvas(imagen.canvas, opciones.formato, opciones.calidad);
    return {
      original: archivo,
      blob,
      nombre: nombreConvertido(archivo.name, opciones.formato),
      ancho: imagen.ancho,
      alto: imagen.alto,
    };
  } catch (e) {
    if (e instanceof ErrorImagen) throw new ErrorConversion(archivo.name, e.message);
    console.error("[convertir-imagen]", e);
    throw new ErrorConversion(
      archivo.name,
      /memory|allocation|RangeError/i.test(String(e))
        ? "La imagen es demasiado grande para la memoria de tu dispositivo."
        : "No se pudo convertir esta imagen.",
    );
  }
}

/** Empaqueta los resultados en un ZIP (ver lib/zip.ts). */
export function crearZip(resultados: ResultadoConversion[]): Promise<Blob> {
  return crearZipGenerico(resultados.map((r) => ({ nombre: r.nombre, blob: r.blob })));
}
