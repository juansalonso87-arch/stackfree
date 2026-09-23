/**
 * Content Security Policy (CSP): la "cerradura" que el propio navegador
 * aplica a esta página. Lo importante para el usuario es `connect-src`:
 * define a qué servidores puede enviar datos el código de la página. Con
 * `'self'` (solo nuestro dominio, que es estático y no recibe archivos) el
 * navegador rechaza cualquier intento de mandar un extracto o una foto a
 * otro lado, aunque el código lo quisiera.
 *
 * Se aplica desde `next.config.ts`. Cualquiera puede verla en las
 * herramientas de desarrollador → Red → cabeceras de la respuesta.
 */

/** Hosts que necesitan las herramientas: solo descargan programas/modelos, nunca reciben datos. */
const CDN_MODELO_IA = "https://staticimgly.com";
/** Servicio al que viaja el formulario de contacto (nombre, mail y mensaje; nunca un archivo). */
const FORMULARIO_CONTACTO = "https://api.web3forms.com";
/**
 * Reproductor de los videos tutoriales (dominio "sin cookies" de YouTube). Va en
 * `frame-src`, que solo dice qué sitios pueden abrirse dentro de un recuadro de
 * la página; no toca `connect-src`, así que la página sigue sin poder enviar
 * datos a nadie. El iframe se crea únicamente cuando el usuario toca reproducir
 * (components/core/VideoYouTube.tsx).
 */
const VIDEOS_YOUTUBE = "https://www.youtube-nocookie.com";

/** Dominios de Google AdSense (solo se agregan cuando AdSense está configurado). */
const ADSENSE = {
  script: [
    "https://pagead2.googlesyndication.com",
    "https://*.googlesyndication.com",
    "https://*.doubleclick.net",
    "https://www.googletagservices.com",
    "https://adservice.google.com",
    "https://*.google.com",
    "https://*.adtrafficquality.google",
    "https://fundingchoicesmessages.google.com",
  ],
  frame: ["https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://*.adtrafficquality.google", "https://fundingchoicesmessages.google.com"],
  img: ["https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://*.googleusercontent.com", "https://*.gstatic.com", "https://*.adtrafficquality.google"],
  connect: ["https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://*.adtrafficquality.google", "https://fundingchoicesmessages.google.com"],
};

function directiva(nombre: string, valores: string[]): string {
  return `${nombre} ${valores.join(" ")}`;
}

export interface OpcionesCsp {
  /** Hosts extra a los que la página puede conectarse (además de 'self'). */
  conexiones?: string[];
  /** Hosts extra desde los que se pueden descargar scripts. */
  scripts?: string[];
  /**
   * Permitir `eval`. Lo necesita el motor de IA de "quitar fondo"
   * (onnxruntime-web arma parte de su cargador de WebAssembly como texto). No
   * afecta la garantía de privacidad: connect-src sigue limitando a quién se
   * puede enviar datos.
   */
  eval?: boolean;
  adsense?: boolean;
  desarrollo?: boolean;
}

export function construirCsp(o: OpcionesCsp = {}): string {
  const ads = o.adsense ?? false;
  const directivas = [
    "default-src 'self'",
    directiva("script-src", [
      "'self'",
      // Next.js inserta scripts inline para hidratar la página; WebAssembly lo usan
      // los decodificadores (HEIC, PDF, IA). En desarrollo, el recargado en caliente usa eval.
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      // El motor de IA (onnxruntime-web) carga su cargador de WebAssembly desde un script en memoria.
      "blob:",
      // En desarrollo, Vercel Analytics carga su script de depuración desde su CDN.
      ...(o.desarrollo ? ["'unsafe-eval'", "https://va.vercel-scripts.com"] : []),
      ...(o.eval && !o.desarrollo ? ["'unsafe-eval'"] : []),
      ...(o.scripts ?? []),
      ...(ads ? ADSENSE.script : []),
    ]),
    "style-src 'self' 'unsafe-inline'",
    directiva("img-src", ["'self'", "data:", "blob:", ...(ads ? ADSENSE.img : [])]),
    "font-src 'self' data:",
    // Workers propios (pdf.js) y creados en memoria (heic-to, quitar fondo).
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    // LA CLAVE: a quién puede enviar datos la página. `blob:` y `data:` son objetos en la
    // memoria de la propia pestaña (los usa el motor de IA para leer su WebAssembly), no servidores.
    directiva("connect-src", ["'self'", "blob:", "data:", ...(o.conexiones ?? []), ...(ads ? ADSENSE.connect : [])]),
    directiva("frame-src", [VIDEOS_YOUTUBE, ...(ads ? ADSENSE.frame : [])]),
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directivas.join("; ");
}

/**
 * Cabeceras de seguridad. **Una sola CSP para todo el sitio.**
 *
 * Antes había una CSP por ruta, con las dos excepciones aplicadas solo en su
 * página. No funcionaba, y el 2026-09-23 se comprobó por qué: la CSP viaja en
 * la respuesta del **documento**, y Next.js (App Router) navega sin volver a
 * pedir el documento. Entrando por un link, la página sigue rigiéndose por la
 * CSP de la primera página que se abrió, así que:
 *
 * - "Quitar fondo" no podía descargar su modelo (el navegador bloqueaba el
 *   pedido; en Safari eso se ve como "TypeError: Load failed"), y
 * - **el formulario de contacto no podía enviarse**, que es peor: nadie podía
 *   reportarnos nada. Las dos cosas solo andaban escribiendo la dirección a
 *   mano o recargando, que es lo que hacíamos al probar.
 *
 * Cualquier excepción por ruta tiene el mismo problema, así que **no volver a
 * dividir por ruta**: lo que necesite un destino nuevo va en esta lista única.
 * El costo es que los dos destinos quedan permitidos en todas las páginas; se
 * asume a conciencia y está explicado con nombre y apellido en
 * /verificar-privacidad. La garantía de fondo no cambia: la lista es corta,
 * pública y verificable, y ninguno de esos destinos recibe archivos.
 */
export function cabecerasCsp(o: { adsense: boolean; desarrollo: boolean }) {
  const comunes = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  const csp = {
    key: "Content-Security-Policy",
    value: construirCsp({
      ...o,
      conexiones: [CDN_MODELO_IA, FORMULARIO_CONTACTO],
      // Lo necesita el motor de IA de "quitar fondo" (onnxruntime-web arma su
      // cargador de WebAssembly como texto). Va en todo el sitio por lo mismo
      // que las conexiones. Suma poco riesgo: script-src ya lleva
      // 'unsafe-inline' en todas las páginas por los scripts de Next y AdSense.
      eval: true,
    }),
  };
  return [{ source: "/:path*", headers: [...comunes, csp] }];
}

export const HOSTS_EXTERNOS = { CDN_MODELO_IA, FORMULARIO_CONTACTO, VIDEOS_YOUTUBE };
