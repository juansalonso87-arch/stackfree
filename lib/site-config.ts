/**
 * Configuración global del sitio.
 *
 * Todo lo que es "de marca" (nombre, dominio, email de contacto) vive acá,
 * así cambiarlo es tocar un solo archivo. El resto del código importa
 * `siteConfig` en vez de repetir textos.
 */

function resolverUrlBase(): string {
  // 1) Dominio propio configurado a mano (producción con dominio custom).
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  // 2) Vercel expone automáticamente el dominio de producción del proyecto.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  // 3) Desarrollo local.
  return "http://localhost:3000";
}

export const siteConfig = {
  /** Nombre visible del sitio (header, títulos, Open Graph). */
  nombre: "StackFree",
  /** Frase corta que acompaña al nombre en el <title> del homepage. */
  eslogan: "Análisis de movimientos bancarios y herramientas gratis, en tu navegador",
  /** Descripción por defecto para buscadores y redes sociales. */
  descripcion:
    "Subí los movimientos de tu banco o Mercado Pago y recibí el análisis por concepto, categoría y día en un Excel con fórmulas. Además, herramientas gratis para imágenes y PDF. Todo se procesa en tu navegador: nada se sube a ningún servidor.",
  /** URL pública del sitio, sin barra final. */
  url: resolverUrlBase(),
  /** Email de contacto que aparece en las páginas legales. */
  emailContacto: "juan.s.alonso87@gmail.com",
  /**
   * Clave de acceso de Web3Forms para el formulario de contacto. Es una clave
   * PÚBLICA (el servicio la diseñó para usarse desde el navegador): solo permite
   * enviar mensajes a la casilla registrada, no leer nada. Se puede reemplazar
   * con la variable NEXT_PUBLIC_WEB3FORMS_KEY sin tocar el código.
   */
  claveFormularioContacto: process.env.NEXT_PUBLIC_WEB3FORMS_KEY || "",
  /**
   * Repositorio público del código. El sitio usa librerías AGPL, que exigen
   * ofrecer el código fuente a los usuarios: por eso hay un link en el footer.
   */
  repoUrl: "https://github.com/juansalonso87-arch/stackfree",
  licencia: "AGPL-3.0",
  /**
   * Código de verificación de Google Search Console (propiedad
   * https://stackfree.vercel.app/). No es secreto: va en el HTML público.
   * Si se cambia de dominio hay que verificar de nuevo y actualizar esto.
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
