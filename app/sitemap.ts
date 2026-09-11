import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";
import { herramientasActivas, rutaHerramienta } from "@/lib/tools-registry";

/**
 * Genera /sitemap.xml automáticamente. Google lo usa para descubrir páginas.
 * Solo incluye herramientas activas: las "próximamente" no deben indexarse.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();

  const paginasFijas: MetadataRoute.Sitemap = [
    { url: siteConfig.url, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
    { url: `${siteConfig.url}/legal/privacidad`, lastModified: ahora, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteConfig.url}/legal/terminos`, lastModified: ahora, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteConfig.url}/legal/cookies`, lastModified: ahora, changeFrequency: "yearly", priority: 0.2 },
  ];

  const paginasHerramientas: MetadataRoute.Sitemap = herramientasActivas().map((h) => ({
    url: `${siteConfig.url}${rutaHerramienta(h.slug)}`,
    lastModified: ahora,
    changeFrequency: "monthly",
    priority: 0.9,
  }));

  return [...paginasFijas, ...paginasHerramientas];
}
