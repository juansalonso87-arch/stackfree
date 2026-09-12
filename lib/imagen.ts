/**
 * Utilidades de imagen compartidas por varias herramientas.
 * Todo con APIs nativas del navegador (createImageBitmap + Canvas):
 * sin librerías, sin subir nada.
 */

export type CanvasGenerico = OffscreenCanvas | HTMLCanvasElement;
export type ContextoGenerico = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export class ErrorImagen extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorImagen";
  }
}

export function crearCanvas(ancho: number, alto: number): CanvasGenerico {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(ancho, alto);
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

export function contexto2d(canvas: CanvasGenerico): ContextoGenerico {
  const ctx = canvas.getContext("2d") as ContextoGenerico | null;
  if (!ctx) throw new ErrorImagen("Tu navegador no es compatible (sin soporte de Canvas).");
  return ctx;
}

export interface ImagenDecodificada {
  canvas: CanvasGenerico;
  ancho: number;
  alto: number;
  /** Tamaño real de la imagen (ya con la orientación EXIF aplicada). */
  anchoOriginal: number;
  altoOriginal: number;
  /** true si se achicó por superar `ladoMaximo`. */
  redimensionada: boolean;
}

/**
 * Decodifica cualquier formato que el navegador entienda, aplica la
 * orientación EXIF (fotos de celular giradas) y, si hace falta, achica la
 * imagen para que ningún lado supere `ladoMaximo`. Devuelve un canvas listo
 * para exportar en otro formato o leer sus píxeles.
 */
export async function decodificarImagen(
  origen: Blob,
  ladoMaximo = Infinity,
  opciones: { fondo?: string } = {},
): Promise<ImagenDecodificada> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(origen, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorImagen(
      "No se pudo leer la imagen. Puede estar dañada o ser un formato que tu navegador no abre.",
    );
  }
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = crearCanvas(ancho, alto);
    const ctx = contexto2d(canvas);
    if (opciones.fondo) {
      ctx.fillStyle = opciones.fondo;
      ctx.fillRect(0, 0, ancho, alto);
    }
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    return {
      canvas,
      ancho,
      alto,
      anchoOriginal: bitmap.width,
      altoOriginal: bitmap.height,
      redimensionada: escala < 1,
    };
  } finally {
    bitmap.close();
  }
}

/** Exporta un canvas a Blob en el formato pedido (calidad 0-1 para JPG/WEBP). */
export function exportarCanvas(canvas: CanvasGenerico, tipo: string, calidad = 0.92): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: tipo, quality: calidad });
  return new Promise((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new ErrorImagen("No se pudo generar la imagen."))),
      tipo,
      calidad,
    );
  });
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
