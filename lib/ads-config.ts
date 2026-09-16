/**
 * Configuración de Google AdSense.
 *
 * El ID de editor (ca-pub-…) quedó fijo acá: es público (va en el HTML de
 * cada página y en /ads.txt) y sirve para que AdSense verifique el sitio.
 * Sin IDs de bloque, <AdSlot /> muestra un recuadro "placeholder" en lugar
 * del anuncio: así el sitio se ve completo mientras Google revisa la cuenta.
 *
 * Cuando AdSense apruebe la cuenta:
 *   1. Crear un bloque de anuncio "display" por posición en el panel de
 *      AdSense y pegar cada ID de bloque (número) en la variable
 *      NEXT_PUBLIC_ADSENSE_SLOT_* de Vercel, o como valor por defecto acá.
 *   2. Redeployar. Nada más que cambiar en el código.
 *
 * Nota: las variables NEXT_PUBLIC_* se "hornean" en el build, por eso se
 * leen con `process.env.NEXT_PUBLIC_...` literal (no con una variable).
 */

export type PosicionAnuncio =
  | "top-banner"
  | "in-content"
  | "sidebar"
  | "bottom-banner";

export const adsConfig = {
  /** ID de editor de AdSense del dueño (cuenta creada el 2026-09-16). */
  cliente: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-6536653816995996",

  /** ID numérico del bloque de anuncio para cada posición. */
  slots: {
    "top-banner": process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP_BANNER ?? "",
    "in-content": process.env.NEXT_PUBLIC_ADSENSE_SLOT_IN_CONTENT ?? "",
    sidebar: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR ?? "",
    "bottom-banner": process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM_BANNER ?? "",
  } satisfies Record<PosicionAnuncio, string>,

  /**
   * Si no hay anuncios reales, ¿mostrar el recuadro placeholder? Solo en
   * desarrollo (sirve para ver el layout); en el sitio publicado quedan
   * invisibles hasta que existan los bloques de AdSense. Se usa NODE_ENV y no
   * VERCEL_ENV porque este código corre en el navegador y Next solo le pasa
   * NODE_ENV y las variables NEXT_PUBLIC_*. Se puede forzar con
   * NEXT_PUBLIC_ADS_PLACEHOLDER=true|false.
   */
  mostrarPlaceholder:
    process.env.NEXT_PUBLIC_ADS_PLACEHOLDER === "true" ||
    (process.env.NEXT_PUBLIC_ADS_PLACEHOLDER !== "false" && process.env.NODE_ENV !== "production"),
};

/** Hay AdSense configurado cuando existe el ID de cliente. */
export function adsenseHabilitado(): boolean {
  return adsConfig.cliente.length > 0;
}
