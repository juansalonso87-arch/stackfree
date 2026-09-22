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
   * Si no hay anuncios reales, ¿mostrar el recuadro placeholder? Por defecto
   * sí, también en el sitio publicado: reserva el lugar de los anuncios (así
   * la página no "salta" cuando lleguen) y deja claro dónde va a haber
   * publicidad. Se puede apagar con NEXT_PUBLIC_ADS_PLACEHOLDER=false (se
   * usó para grabar los videos del canal; NEXT_PUBLIC_* se hornea en el build,
   * así que hay que redeployar). Este código corre en el navegador: Next solo
   * le pasa NODE_ENV y las variables NEXT_PUBLIC_*.
   */
  mostrarPlaceholder: process.env.NEXT_PUBLIC_ADS_PLACEHOLDER !== "false",
};

/** Hay AdSense configurado cuando existe el ID de cliente. */
export function adsenseHabilitado(): boolean {
  return adsConfig.cliente.length > 0;
}

/** Clave en localStorage del modo grabación (solo en el navegador del dueño). */
const CLAVE_GRABACION = "planillar:grabando";

/**
 * Modo grabación: oculta los espacios de publicidad para filmar los videos del
 * canal sin tener que redeployar ni grabar en localhost (así en pantalla se lee
 * el dominio real). Se enciende con `?grabando=1` en cualquier página y se apaga
 * con `?grabando=0`; queda guardado en ese navegador hasta que se apague.
 */
let cacheGrabacion: boolean | null = null;

export function modoGrabacion(): boolean {
  if (typeof window === "undefined") return false;
  // Se resuelve una sola vez por carga: así el valor es estable para React.
  if (cacheGrabacion !== null) return cacheGrabacion;
  try {
    const pedido = new URLSearchParams(window.location.search).get("grabando");
    if (pedido !== null) {
      if (pedido === "0" || pedido === "false") window.localStorage.removeItem(CLAVE_GRABACION);
      else window.localStorage.setItem(CLAVE_GRABACION, "1");
    }
    cacheGrabacion = window.localStorage.getItem(CLAVE_GRABACION) === "1";
  } catch {
    // Navegación privada con el almacenamiento bloqueado: sin modo grabación.
    cacheGrabacion = false;
  }
  return cacheGrabacion;
}
