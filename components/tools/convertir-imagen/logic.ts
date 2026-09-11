/**
 * Lógica de "Convertir formato de imagen".
 *
 * No usa ninguna librería de imágenes: el propio navegador decodifica
 * (createImageBitmap) y codifica (canvas.toBlob) los formatos. Es rápido,
 * pesa cero y funciona sin conexión una vez cargada la página.
 *
 * Solo el ZIP de "descargar todo" usa una librería (fflate, MIT, ~8 KB).
 */

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

function exportar(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  formato: FormatoSalida,
  calidad: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: formato, quality: calidad });
  return new Promise((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error("toBlob devolvió null"))),
      formato,
      calidad,
    );
  });
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

  let bitmap: ImageBitmap;
  try {
    // 'from-image' aplica la orientación EXIF (fotos de celular giradas).
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorConversion(
      archivo.name,
      "No se pudo leer la imagen. Puede estar dañada o ser un formato que tu navegador no abre.",
    );
  }

  try {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new ErrorConversion(archivo.name, "Tu navegador no es compatible (sin Canvas).");

    // JPG no tiene transparencia: si no rellenamos, las zonas transparentes
    // quedan NEGRAS. Blanco es lo que espera casi todo el mundo.
    if (opciones.formato === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    ctx.drawImage(bitmap, 0, 0);

    const blob = await exportar(canvas, opciones.formato, opciones.calidad);
    return {
      original: archivo,
      blob,
      nombre: nombreConvertido(archivo.name, opciones.formato),
      ancho: bitmap.width,
      alto: bitmap.height,
    };
  } catch (e) {
    if (e instanceof ErrorConversion) throw e;
    console.error("[convertir-imagen]", e);
    throw new ErrorConversion(
      archivo.name,
      /memory|allocation|RangeError/i.test(String(e))
        ? "La imagen es demasiado grande para la memoria de tu dispositivo."
        : "No se pudo convertir esta imagen.",
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Convierte varios archivos en serie (uno a la vez evita quedarse sin
 * memoria con lotes grandes) e informa el avance.
 */
export async function convertirVarias(
  archivos: File[],
  opciones: OpcionesConversion,
  onProgreso?: (hechos: number, total: number, nombre: string) => void,
): Promise<{ resultados: ResultadoConversion[]; errores: ErrorConversion[] }> {
  const resultados: ResultadoConversion[] = [];
  const errores: ErrorConversion[] = [];
  for (let i = 0; i < archivos.length; i++) {
    onProgreso?.(i, archivos.length, archivos[i].name);
    try {
      resultados.push(await convertirImagen(archivos[i], opciones));
    } catch (e) {
      errores.push(
        e instanceof ErrorConversion ? e : new ErrorConversion(archivos[i].name, "No se pudo convertir."),
      );
    }
  }
  onProgreso?.(archivos.length, archivos.length, "");
  return { resultados, errores };
}

/* ------------------------------------------------------------------ */
/* ZIP                                                                  */
/* ------------------------------------------------------------------ */

/** Empaqueta los resultados en un ZIP sin comprimir (las imágenes ya vienen comprimidas). */
export async function crearZip(resultados: ResultadoConversion[]): Promise<Blob> {
  const { zip } = await import("fflate");
  const entradas: Record<string, [Uint8Array, { level: 0 }]> = {};
  const usados = new Set<string>();
  for (const r of resultados) {
    // Evita nombres repetidos dentro del ZIP (foto.jpg, foto (2).jpg...).
    let nombre = r.nombre;
    let n = 2;
    while (usados.has(nombre)) {
      nombre = r.nombre.replace(/(\.[^.]+)$/, ` (${n++})$1`);
    }
    usados.add(nombre);
    entradas[nombre] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }];
  }
  const datos = await new Promise<Uint8Array>((resolver, rechazar) => {
    zip(entradas, (err, out) => (err ? rechazar(err) : resolver(out)));
  });
  return new Blob([datos as BlobPart], { type: "application/zip" });
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
