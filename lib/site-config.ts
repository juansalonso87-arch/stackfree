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
  eslogan: "Herramientas gratis que funcionan en tu navegador",
  /** Descripción por defecto para buscadores y redes sociales. */
  descripcion:
    "Herramientas online gratuitas para editar imágenes y archivos sin subir nada a ningún servidor. Todo se procesa en tu navegador: rápido, privado y sin límites.",
  /** URL pública del sitio, sin barra final. */
  url: resolverUrlBase(),
  /** Email de contacto que aparece en las páginas legales. EDITAR. */
  emailContacto: "contacto@tudominio.com",
  /** Idioma principal del sitio (atributo lang del <html> y Open Graph). */
  idioma: "es",
  localeOpenGraph: "es_ES",
  /** Palabras clave generales del sitio (las de cada herramienta van en el registry). */
  keywords: [
    "herramientas online gratis",
    "editar imagenes online",
    "herramientas sin registro",
    "procesamiento en el navegador",
  ],
} as const;
