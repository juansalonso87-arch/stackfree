/**
 * Lógica de procesamiento de "Quitar fondo de imagen".
 *
 * Regla: este archivo NO sabe nada de React ni de la interfaz. Recibe un
 * archivo, devuelve un resultado. Así se puede probar y cambiar la librería
 * de IA sin tocar la pantalla.
 *
 * FASE 2: acá se integra `@imgly/background-removal` (WebAssembly en el
 * navegador) y la composición sobre fondo blanco con Canvas.
 */

export type ModoFondo = "transparente" | "blanco";

export interface OpcionesQuitarFondo {
  modo: ModoFondo;
  /** Callback para informar avance a la interfaz (0-100 y un texto opcional). */
  onProgreso?: (porcentaje: number, mensaje?: string) => void;
}

export interface ResultadoQuitarFondo {
  archivo: Blob;
  nombreSugerido: string;
}

export async function quitarFondo(
  archivo: File,
  opciones: OpcionesQuitarFondo,
): Promise<ResultadoQuitarFondo> {
  opciones.onProgreso?.(0, `Preparando ${archivo.name}…`);
  throw new Error("Esta herramienta estará disponible muy pronto.");
}
