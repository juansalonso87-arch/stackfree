/**
 * Configuración global del sitio.
 *
 * Todo lo que es "de marca" (nombre, dominio, email de contacto) vive acá,
 * así cambiarlo es tocar un solo archivo. El resto del código importa
 * `siteConfig` en vez de repetir textos.
 */

/** Dominio propio del sitio (comprado el 2026-09-16 en Porkbun, conectado a Vercel). */
const DOMINIO = "planillar.com";

/** Dirección anterior (Vercel): sigue existiendo y redirige al dominio propio (ver next.config.ts). */
const URL_ANTERIOR = "https://stackfree.vercel.app";

function resolverUrlBase(): string {
  // 1) Sobrescritura manual, por si algún día hace falta.
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  // 2) Producción en Vercel: siempre el dominio propio (canonical, sitemap, Open Graph).
  if (process.env.VERCEL_ENV === "production") {
    return `https://${DOMINIO}`;
  }
  // 3) Previews de Vercel: el dominio de producción que informa Vercel.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  // 4) Desarrollo local.
  return "http://localhost:3000";
}

export const siteConfig = {
  /** Nombre visible del sitio (header, títulos, Open Graph). */
  nombre: "Planillar",
  /** Dominio propio, sin protocolo. */
  dominio: DOMINIO,
  /** Dirección vieja que redirige acá (útil para Search Console y para documentar). */
  urlAnterior: URL_ANTERIOR,
  /** Frase corta que acompaña al nombre en el <title> del homepage. */
  eslogan: "Análisis de movimientos bancarios y herramientas gratis, en tu navegador",
  /** Descripción por defecto para buscadores y redes sociales. */
  descripcion:
    "Subí los movimientos de tu banco o Mercado Pago y recibí el análisis por concepto, categoría y día en un Excel con fórmulas. Además, herramientas gratis para imágenes y PDF. Todo se procesa en tu navegador: nada se sube a ningún servidor.",
  /** URL pública del sitio, sin barra final. */
  url: resolverUrlBase(),
  /** Email de contacto (páginas legales, Acerca de, formulario). Es un reenvío gratis de Porkbun al Gmail del dueño. */
  emailContacto: "hola@planillar.com",
  /**
   * Clave de acceso de Web3Forms para el formulario de contacto. Es una clave
   * PÚBLICA (el servicio la diseñó para usarse desde el navegador): solo permite
   * enviar mensajes a la casilla registrada, no leer nada. Se puede reemplazar
   * con la variable NEXT_PUBLIC_WEB3FORMS_KEY sin tocar el código.
   */
  claveFormularioContacto: process.env.NEXT_PUBLIC_WEB3FORMS_KEY || "26807a29-3b13-4ff0-87aa-dda167c674e9",
  /**
   * Repositorio público del código. El sitio usa librerías AGPL, que exigen
   * ofrecer el código fuente a los usuarios: por eso hay un link en el footer.
   */
  repoUrl: "https://github.com/juansalonso87-arch/stackfree",
  licencia: "AGPL-3.0",
  /** Redes donde se publican los videos tutoriales y los shorts (footer, "Acerca de" y datos estructurados). */
  redes: {
    youtube: "https://www.youtube.com/@Planillar",
    tiktok: "https://www.tiktok.com/@planillar.com",
  },
  /**
   * Código de verificación de Google Search Console (propiedad vieja
   * https://stackfree.vercel.app/; la nueva, planillar.com, se verifica por un
   * registro TXT en el DNS y no necesita código acá). No es secreto: va en el
   * HTML público.
   */
  googleSiteVerification: "8cTv7V2y4YWfd9xlqKkGXqI-ApQvjVUGYhJVtYMqI_k",
  /** Idioma principal del sitio (atributo lang del <html> y Open Graph). */
  idioma: "es",
  localeOpenGraph: "es_ES",
  /** Palabras clave generales del sitio (las de cada herramienta van en el registry). */
  keywords: [
    "analisis de movimientos bancarios",
    "extracto bancario a excel",
    "herramientas administracion pymes",
    "herramientas online gratis",
    "editar imagenes online",
    "herramientas sin registro",
    "procesamiento en el navegador",
  ],
} as const;
