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
/** Servicio del formulario de contacto (solo en /contacto). */
const FORMULARIO_CONTACTO = "https://api.web3forms.com";

/** Dominios de Google AdSense (solo se agregan cuando AdSense está configurado). */
const ADSENSE = {
  script: [
    "https://pagead2.googlesyndication.com",
    "https://*.googlesyndication.com",
    "https://*.doubleclick.net",
    "https://www.googletagservices.com",
    "https://adservice.google.com",
    "https://*.google.com",
    "https://fundingchoicesmessages.google.com",
  ],
  frame: ["https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://fundingchoicesmessages.google.com"],
  img: ["https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://*.googleusercontent.com", "https://*.gstatic.com"],
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
    directiva("frame-src", ads ? ADSENSE.frame : ["'none'"]),
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directivas.join("; ");
}

/**
 * Cabeceras por ruta. El sitio entero lleva `connect-src 'self'`; las dos
 * excepciones son explícitas y mínimas: el modelo de IA de "quitar fondo"
 * (se DESCARGA, no se sube nada) y el servicio del formulario de contacto.
 */
export function cabecerasCsp(o: { adsense: boolean; desarrollo: boolean }) {
  const comunes = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  const csp = (extra: OpcionesCsp) => ({ key: "Content-Security-Policy", value: construirCsp({ ...o, ...extra }) });
  return [
    {
      // Quitar fondo: descarga el modelo de IA desde el CDN de IMG.LY.
      source: "/herramientas/quitar-fondo-imagen",
      headers: [...comunes, csp({ conexiones: [CDN_MODELO_IA] })],
    },
    {
      // Contacto: envía el formulario al servicio de correo.
      source: "/contacto",
      headers: [...comunes, csp({ conexiones: [FORMULARIO_CONTACTO] })],
    },
    {
      // Todo lo demás (incluidas todas las herramientas de administración).
      source: "/((?!herramientas/quitar-fondo-imagen$|contacto$).*)",
      headers: [...comunes, csp({})],
    },
  ];
}

export const HOSTS_EXTERNOS = { CDN_MODELO_IA, FORMULARIO_CONTACTO };
