/**
 * Lógica de "Imagen a PDF".
 *
 * Cada imagen se decodifica con Canvas (esto corrige la orientación EXIF de
 * las fotos de celular y normaliza formatos raros como WEBP, que el PDF no
 * admite) y se incrusta en una página con pdf-lib (MIT). Todo en memoria,
 * en el navegador.
 */

import { siteConfig } from "@/lib/site-config";
import { ErrorImagen, decodificarImagen, exportarCanvas } from "@/lib/imagen";
export { formatearBytes } from "@/lib/imagen";

export const MAX_ARCHIVOS = 50;
export const FORMATOS_ENTRADA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
];

/**
 * Lado máximo en píxeles de cada imagen dentro del PDF. 3508 px es el alto
 * de una A4 a 300 dpi (calidad de imprenta): más que eso solo engorda el
 * archivo sin que se note.
 */
const LADO_MAXIMO = 3508;

export type TamanoPagina = "ajustar" | "a4" | "carta";
export type Orientacion = "auto" | "vertical" | "horizontal";
export type Margen = "ninguno" | "chico" | "normal";

export interface OpcionesPdf {
  tamano: TamanoPagina;
  orientacion: Orientacion;
  margen: Margen;
}

export const OPCIONES_POR_DEFECTO: OpcionesPdf = {
  tamano: "a4",
  orientacion: "auto",
  margen: "chico",
};

/** Puntos PDF (1 pt = 1/72 pulgada). */
const TAMANOS: Record<Exclude<TamanoPagina, "ajustar">, [number, number]> = {
  a4: [595.28, 841.89],
  carta: [612, 792],
};
const MARGENES: Record<Margen, number> = {
  ninguno: 0,
  chico: 28.35, // 10 mm
  normal: 56.7, // 20 mm
};
/** Píxel CSS → punto (96 px por pulgada, 72 pt por pulgada). */
const PX_A_PT = 72 / 96;

export class ErrorImagenPdf extends Error {
  constructor(
    public archivo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorImagenPdf";
  }
}

export interface ResultadoPdf {
  blob: Blob;
  paginas: number;
  nombre: string;
}

/** Prepara una imagen para incrustar: PNG si tiene/puede tener transparencia, JPG si es foto. */
async function prepararImagen(archivo: File) {
  const esFoto = archivo.type === "image/jpeg";
  const imagen = await decodificarImagen(archivo, LADO_MAXIMO, {
    fondo: esFoto ? undefined : "#ffffff",
  });
  const bytes = new Uint8Array(
    await (await exportarCanvas(imagen.canvas, esFoto ? "image/jpeg" : "image/png", 0.92)).arrayBuffer(),
  );
  return { bytes, esFoto, ancho: imagen.ancho, alto: imagen.alto };
}

export async function imagenesAPdf(
  archivos: File[],
  opciones: OpcionesPdf = OPCIONES_POR_DEFECTO,
  onProgreso?: (hechos: number, total: number, nombre: string) => void,
): Promise<ResultadoPdf> {
  if (archivos.length === 0) throw new Error("No hay imágenes.");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const margen = MARGENES[opciones.margen];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    onProgreso?.(i, archivos.length, archivo.name);
    try {
      const img = await prepararImagen(archivo);
      const incrustada = img.esFoto ? await pdf.embedJpg(img.bytes) : await pdf.embedPng(img.bytes);

      // Tamaño de página.
      let anchoPagina: number;
      let altoPagina: number;
      if (opciones.tamano === "ajustar") {
        anchoPagina = img.ancho * PX_A_PT + margen * 2;
        altoPagina = img.alto * PX_A_PT + margen * 2;
      } else {
        [anchoPagina, altoPagina] = TAMANOS[opciones.tamano];
        const apaisada =
          opciones.orientacion === "horizontal" ||
          (opciones.orientacion === "auto" && img.ancho > img.alto);
        if (apaisada) [anchoPagina, altoPagina] = [altoPagina, anchoPagina];
      }

      // Encajar la imagen dentro de los márgenes manteniendo proporción, centrada.
      const areaAncho = anchoPagina - margen * 2;
      const areaAlto = altoPagina - margen * 2;
      const escala = Math.min(areaAncho / img.ancho, areaAlto / img.alto);
      const anchoDibujo = img.ancho * escala;
      const altoDibujo = img.alto * escala;

      const pagina = pdf.addPage([anchoPagina, altoPagina]);
      pagina.drawImage(incrustada, {
        x: (anchoPagina - anchoDibujo) / 2,
        y: (altoPagina - altoDibujo) / 2,
        width: anchoDibujo,
        height: altoDibujo,
      });
    } catch (e) {
      if (e instanceof ErrorImagen) throw new ErrorImagenPdf(archivo.name, e.message);
      console.error("[imagen-a-pdf]", archivo.name, e);
      throw new ErrorImagenPdf(
        archivo.name,
        /memory|allocation|RangeError/i.test(String(e))
          ? "Esta imagen es demasiado grande para la memoria de tu dispositivo."
          : "No se pudo agregar esta imagen al PDF.",
      );
    }
  }

  onProgreso?.(archivos.length, archivos.length, "Guardando…");
  pdf.setProducer(siteConfig.nombre);
  pdf.setCreator(`${siteConfig.nombre} — imagen a PDF`);
  const bytes = await pdf.save();
  return {
    blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
    paginas: pdf.getPageCount(),
    nombre: nombreResultado(archivos),
  };
}

/** "dni-frente.jpg" → "dni-frente.pdf"; varias → "dni-frente-y-2-mas.pdf" */
export function nombreResultado(archivos: File[]): string {
  const base = archivos[0].name.replace(/\.[^.]+$/, "").slice(0, 80) || "imagenes";
  return archivos.length > 1 ? `${base}-y-${archivos.length - 1}-mas.pdf` : `${base}.pdf`;
}
