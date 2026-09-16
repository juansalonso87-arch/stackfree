/**
 * Lógica de "Unir PDF".
 *
 * Usa pdf-lib (MIT): lee cada PDF, copia todas sus páginas a un documento
 * nuevo y lo guarda. Todo en memoria, en el navegador. Ningún archivo se
 * envía a ningún lado.
 */

import { siteConfig } from "@/lib/site-config";

export const MAX_ARCHIVOS = 50;
export const MAX_MB_POR_ARCHIVO = 100;

export interface InfoPdf {
  paginas: number;
}

export class ErrorPdf extends Error {
  constructor(
    public archivo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorPdf";
  }
}

/** pdf-lib pesa ~300 KB: se importa recién cuando hace falta. */
function cargarPdfLib() {
  return import("pdf-lib");
}

function errorAmigable(archivo: File, e: unknown): ErrorPdf {
  const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (/encrypt|password/i.test(texto)) {
    return new ErrorPdf(
      archivo.name,
      "Este PDF está protegido con contraseña. Quítale la protección y vuelve a intentarlo.",
    );
  }
  if (/memory|allocation|RangeError/i.test(texto)) {
    return new ErrorPdf(archivo.name, "Este PDF es demasiado grande para la memoria de tu dispositivo.");
  }
  // Un archivo dañado es un problema del archivo, no del sitio: warn, no error.
  console.warn("[unir-pdf]", archivo.name, e);
  return new ErrorPdf(
    archivo.name,
    "No se pudo leer este archivo. Puede estar dañado o no ser un PDF válido.",
  );
}

/** Lee un PDF solo para saber cuántas páginas tiene (se muestra en la lista). */
export async function inspeccionarPdf(archivo: File): Promise<InfoPdf> {
  const { PDFDocument } = await cargarPdfLib();
  try {
    const doc = await PDFDocument.load(await archivo.arrayBuffer(), { updateMetadata: false });
    return { paginas: doc.getPageCount() };
  } catch (e) {
    throw errorAmigable(archivo, e);
  }
}

export interface ResultadoUnion {
  blob: Blob;
  paginas: number;
  nombre: string;
}

/**
 * Une los PDF en el orden recibido. Si alguno falla, se aborta con un error
 * que indica cuál (unir "a medias" sin avisar sería peor).
 */
export async function unirPdfs(
  archivos: File[],
  onProgreso?: (hechos: number, total: number, nombre: string) => void,
): Promise<ResultadoUnion> {
  if (archivos.length === 0) throw new Error("No hay archivos para unir.");
  const { PDFDocument } = await cargarPdfLib();
  const destino = await PDFDocument.create();

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    onProgreso?.(i, archivos.length, archivo.name);
    try {
      const origen = await PDFDocument.load(await archivo.arrayBuffer(), { updateMetadata: false });
      const paginas = await destino.copyPages(origen, origen.getPageIndices());
      for (const pagina of paginas) destino.addPage(pagina);
    } catch (e) {
      throw errorAmigable(archivo, e);
    }
  }

  onProgreso?.(archivos.length, archivos.length, "Guardando…");
  destino.setProducer(siteConfig.nombre);
  destino.setCreator(`${siteConfig.nombre} — unir PDF`);
  const bytes = await destino.save();
  return {
    blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
    paginas: destino.getPageCount(),
    nombre: nombreResultado(archivos[0].name),
  };
}

/** "contrato.pdf" → "contrato-unido.pdf" */
export function nombreResultado(primerNombre: string): string {
  const base = primerNombre.replace(/\.pdf$/i, "").slice(0, 80) || "documento";
  return `${base}-unido.pdf`;
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
