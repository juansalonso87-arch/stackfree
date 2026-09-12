/**
 * Lógica de "Recortar imagen". Todo con Canvas nativo: se decodifica la
 * imagen a tamaño real, se copia solo el rectángulo elegido y se exporta.
 * En forma "círculo" se recorta un cuadrado y se aplica una máscara circular
 * (el resultado es PNG con fondo transparente).
 */

import { ErrorImagen, crearCanvas, contexto2d, decodificarImagen, exportarCanvas } from "@/lib/imagen";
export { formatearBytes } from "@/lib/imagen";

export const MAX_MB = 50;
export const FORMATOS_ENTRADA = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"];
/** Lado máximo de la vista previa del editor (la imagen real puede ser mucho mayor). */
export const LADO_PREVIA = 1600;

/** Rectángulo en píxeles de la imagen REAL (no de la vista previa). */
export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export type Forma = "rectangulo" | "circulo";

/** Formato de salida: "original" conserva el del archivo (GIF/BMP/AVIF pasan a PNG). */
export type FormatoSalida = "original" | "image/jpeg" | "image/png" | "image/webp";

export const FORMATOS_SALIDA: { valor: FormatoSalida; nombre: string }[] = [
  { valor: "original", nombre: "Igual al original" },
  { valor: "image/jpeg", nombre: "JPG" },
  { valor: "image/png", nombre: "PNG" },
  { valor: "image/webp", nombre: "WEBP" },
];

/** Proporciones fijas. `null` = libre. */
export const PROPORCIONES: { etiqueta: string; valor: number | null; ayuda?: string }[] = [
  { etiqueta: "Libre", valor: null },
  { etiqueta: "1:1", valor: 1, ayuda: "Cuadrado, perfil" },
  { etiqueta: "4:5", valor: 4 / 5, ayuda: "Instagram vertical" },
  { etiqueta: "3:2", valor: 3 / 2, ayuda: "Foto clásica" },
  { etiqueta: "4:3", valor: 4 / 3 },
  { etiqueta: "16:9", valor: 16 / 9, ayuda: "Pantalla, YouTube" },
  { etiqueta: "9:16", valor: 9 / 16, ayuda: "Historias, TikTok" },
];

export interface OpcionesRecorte {
  forma: Forma;
  formato: FormatoSalida;
}

export interface ResultadoRecorte {
  blob: Blob;
  nombre: string;
  ancho: number;
  alto: number;
}

/* ------------------------------------------------------------------ */
/* Geometría del rectángulo (pura, para el editor y para los tests)     */
/* ------------------------------------------------------------------ */

/** Mantiene el rectángulo dentro de la imagen, con al menos 1 px de lado. */
export function acotar(r: Rect, anchoImg: number, altoImg: number): Rect {
  const ancho = Math.max(1, Math.min(Math.round(r.ancho), anchoImg));
  const alto = Math.max(1, Math.min(Math.round(r.alto), altoImg));
  const x = Math.max(0, Math.min(Math.round(r.x), anchoImg - ancho));
  const y = Math.max(0, Math.min(Math.round(r.y), altoImg - alto));
  return { x, y, ancho, alto };
}

/** Rectángulo inicial: el más grande que entra con esa proporción, centrado (80 % en libre). */
export function rectInicial(anchoImg: number, altoImg: number, proporcion: number | null): Rect {
  let ancho: number;
  let alto: number;
  if (proporcion === null) {
    ancho = anchoImg * 0.8;
    alto = altoImg * 0.8;
  } else if (anchoImg / altoImg > proporcion) {
    alto = altoImg;
    ancho = alto * proporcion;
  } else {
    ancho = anchoImg;
    alto = ancho / proporcion;
  }
  return acotar({ x: (anchoImg - ancho) / 2, y: (altoImg - alto) / 2, ancho, alto }, anchoImg, altoImg);
}

/** Ajusta un rectángulo existente a una proporción nueva, conservando su centro y área aproximada. */
export function aplicarProporcion(r: Rect, proporcion: number | null, anchoImg: number, altoImg: number): Rect {
  if (proporcion === null) return r;
  const centroX = r.x + r.ancho / 2;
  const centroY = r.y + r.alto / 2;
  let ancho = Math.sqrt(r.ancho * r.alto * proporcion);
  let alto = ancho / proporcion;
  // Si no entra en la imagen, se achica manteniendo la proporción.
  const escala = Math.min(1, anchoImg / ancho, altoImg / alto);
  ancho *= escala;
  alto *= escala;
  return acotar({ x: centroX - ancho / 2, y: centroY - alto / 2, ancho, alto }, anchoImg, altoImg);
}

export type Manija = "n" | "s" | "e" | "o" | "ne" | "no" | "se" | "so";

/**
 * Redimensiona desde una manija arrastrando `dx, dy` píxeles (de imagen).
 * Con proporción fija, manda el eje dominante y el otro se deriva; la
 * esquina/borde opuesto queda quieto.
 */
export function redimensionarDesde(
  origen: Rect,
  manija: Manija,
  dx: number,
  dy: number,
  proporcion: number | null,
  anchoImg: number,
  altoImg: number,
): Rect {
  const MIN = 8;
  const derecha = origen.x + origen.ancho;
  const abajo = origen.y + origen.alto;
  let x1 = origen.x;
  let y1 = origen.y;
  let x2 = derecha;
  let y2 = abajo;

  if (manija.includes("o")) x1 = Math.min(Math.max(0, origen.x + dx), derecha - MIN);
  if (manija.includes("e")) x2 = Math.max(Math.min(anchoImg, derecha + dx), origen.x + MIN);
  if (manija.includes("n")) y1 = Math.min(Math.max(0, origen.y + dy), abajo - MIN);
  if (manija.includes("s")) y2 = Math.max(Math.min(altoImg, abajo + dy), origen.y + MIN);

  if (proporcion !== null) {
    const horizontal = manija === "e" || manija === "o";
    const vertical = manija === "n" || manija === "s";
    let ancho = x2 - x1;
    let alto = y2 - y1;
    // En bordes manda ese eje; en esquinas, el que más se movió.
    if (horizontal || (!vertical && Math.abs(dx) >= Math.abs(dy))) alto = ancho / proporcion;
    else ancho = alto * proporcion;
    // Se recoloca respetando el lado que debe quedar fijo.
    if (manija.includes("o")) x1 = x2 - ancho;
    else x2 = x1 + ancho;
    if (manija.includes("n")) y1 = y2 - alto;
    else y2 = y1 + alto;
    // Si se salió de la imagen, se reduce manteniendo la proporción.
    const exceso = Math.max(
      x1 < 0 ? -x1 : 0,
      y1 < 0 ? -y1 : 0,
      x2 > anchoImg ? x2 - anchoImg : 0,
      y2 > altoImg ? y2 - altoImg : 0,
    );
    if (exceso > 0) {
      const factor = Math.max(0, 1 - exceso / Math.max(ancho, alto));
      const nuevoAncho = Math.max(MIN, ancho * factor);
      const nuevoAlto = nuevoAncho / proporcion;
      if (manija.includes("o")) x1 = x2 - nuevoAncho;
      else x2 = x1 + nuevoAncho;
      if (manija.includes("n")) y1 = y2 - nuevoAlto;
      else y2 = y1 + nuevoAlto;
    }
  }
  return acotar({ x: x1, y: y1, ancho: x2 - x1, alto: y2 - y1 }, anchoImg, altoImg);
}

/* ------------------------------------------------------------------ */
/* Recorte                                                              */
/* ------------------------------------------------------------------ */

function resolverFormato(original: string, pedido: FormatoSalida, forma: Forma): { mime: string; ext: string } {
  // El círculo necesita transparencia: siempre PNG.
  if (forma === "circulo") return { mime: "image/png", ext: "png" };
  const mime = pedido === "original" ? original : pedido;
  if (mime === "image/jpeg") return { mime, ext: "jpg" };
  if (mime === "image/webp") return { mime, ext: "webp" };
  return { mime: "image/png", ext: "png" };
}

export function nombreRecortado(nombreOriginal: string, ext: string): string {
  const base = nombreOriginal.replace(/\.[^.]+$/, "").slice(0, 100) || "imagen";
  return `${base}-recortada.${ext}`;
}

export async function recortarImagen(archivo: File, rect: Rect, opciones: OpcionesRecorte): Promise<ResultadoRecorte> {
  const salida = resolverFormato(archivo.type, opciones.formato, opciones.forma);
  try {
    // JPG no tiene transparencia: fondo blanco para las zonas transparentes del original.
    const fondo = salida.mime === "image/jpeg" ? "#ffffff" : undefined;
    const imagen = await decodificarImagen(archivo, Infinity, { fondo });
    const r = acotar(rect, imagen.ancho, imagen.alto);
    const canvas = crearCanvas(r.ancho, r.alto);
    const ctx = contexto2d(canvas);
    if (opciones.forma === "circulo") {
      ctx.beginPath();
      ctx.ellipse(r.ancho / 2, r.alto / 2, r.ancho / 2, r.alto / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(imagen.canvas, r.x, r.y, r.ancho, r.alto, 0, 0, r.ancho, r.alto);
    const blob = await exportarCanvas(canvas, salida.mime, 0.92);
    return { blob, nombre: nombreRecortado(archivo.name, salida.ext), ancho: r.ancho, alto: r.alto };
  } catch (e) {
    if (e instanceof ErrorImagen) throw e;
    console.error("[recortar-imagen]", e);
    throw new ErrorImagen(
      /memory|allocation|RangeError/i.test(String(e))
        ? "La imagen es demasiado grande para la memoria de tu dispositivo."
        : "No se pudo recortar esta imagen.",
    );
  }
}
