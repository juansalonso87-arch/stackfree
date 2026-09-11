/**
 * Configuración de Google AdSense.
 *
 * Mientras la cuenta no esté aprobada, dejá las variables vacías en `.env`:
 * el componente <AdSlot /> mostrará un recuadro "placeholder" en lugar del
 * anuncio, así se puede deployar y ver el sitio completo antes de tiempo.
 *
 * Cuando AdSense apruebe la cuenta:
 *   1. Copiar el ID de cliente (empieza con "ca-pub-") en NEXT_PUBLIC_ADSENSE_CLIENT.
 *   2. Crear un bloque de anuncio por posición en el panel de AdSense y pegar
 *      cada ID de slot (número) en su variable.
 *   3. Redeployar. Nada más que cambiar en el código.
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
  /** ID de editor de AdSense. Ej: "ca-pub-1234567890123456". */
  cliente: process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "",

  /** ID numérico del bloque de anuncio para cada posición. */
  slots: {
    "top-banner": process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP_BANNER ?? "",
    "in-content": process.env.NEXT_PUBLIC_ADSENSE_SLOT_IN_CONTENT ?? "",
    sidebar: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR ?? "",
    "bottom-banner": process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM_BANNER ?? "",
  } satisfies Record<PosicionAnuncio, string>,

  /**
   * Si no hay anuncios reales, ¿mostrar el recuadro placeholder?
   * Poné NEXT_PUBLIC_ADS_PLACEHOLDER=false para ocultarlos del todo.
   */
  mostrarPlaceholder: process.env.NEXT_PUBLIC_ADS_PLACEHOLDER !== "false",
};

/** Hay AdSense configurado cuando existe el ID de cliente. */
export function adsenseHabilitado(): boolean {
  return adsConfig.cliente.length > 0;
}
