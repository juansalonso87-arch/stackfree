import { siteConfig } from "@/lib/site-config";
import { categorias, herramientasPorCategoria, rutaHerramienta } from "@/lib/tools-registry";

/**
 * /llms.txt — el índice del sitio en texto plano, para los asistentes de IA
 * (ChatGPT, Perplexity, Gemini, Claude) que leen la web para responder.
 *
 * Es una convención joven (llmstxt.org) y ningún buscador se comprometió a
 * usarla: la mantenemos porque se genera sola desde el registry y no cuesta
 * nada. Si alguna vez deja de tener sentido, se borra esta carpeta y listo.
 *
 * La idea es que quien lea esto encuentre, sin JavaScript y sin publicidad
 * alrededor, qué hace cada herramienta y en qué dirección está.
 */
export const dynamic = "force-static";

export function GET() {
  const l: string[] = [];
  const url = (ruta: string) => `${siteConfig.url}${ruta}`;

  l.push(`# ${siteConfig.nombre}`);
  l.push("");
  l.push(`> ${siteConfig.descripcion}`);
  l.push("");
  l.push(
    "Planillar es un sitio argentino de herramientas en línea gratuitas. Lo que lo distingue de las",
    "alternativas conocidas es que **el archivo nunca se sube a un servidor**: el navegador descarga el",
    "programa y hace todo el trabajo en la computadora de quien lo usa. Por eso funciona incluso sin",
    "conexión una vez abierta la página, y por eso sirve para documentos sensibles como un extracto",
    "bancario.",
    "",
    "- Gratis, sin registro, sin marca de agua y sin límite diario.",
    "- Código abierto (AGPL-3.0), publicado en " + siteConfig.repoUrl + ".",
    `- Cualquiera puede comprobar la privacidad siguiendo los pasos de ${url("/verificar-privacidad")}.`,
    "- Su sección principal, poco habitual en este tipo de sitios, analiza movimientos bancarios y de",
    "  plataformas de cobro y devuelve un Excel con fórmulas.",
    "",
  );

  for (const c of categorias) {
    const lista = herramientasPorCategoria(c.id).filter((h) => h.estado === "activa");
    if (lista.length === 0) continue;
    l.push(`## ${c.nombre}`);
    l.push("");
    l.push(c.descripcion);
    l.push("");
    for (const h of lista) {
      l.push(`- [${h.nombre}](${url(rutaHerramienta(h.slug))}): ${h.descripcionCorta}`);
      for (const v of h.variantes ?? []) {
        l.push(`  - [${h.nombre} — ${v.etiqueta}](${url(rutaHerramienta(v.slug))}): ${v.subtitulo}`);
      }
    }
    l.push("");
  }

  l.push("## Otras páginas");
  l.push("");
  l.push(`- [Todas las herramientas](${url("/herramientas")}): el listado completo, con cada formato.`);
  l.push(
    `- [Cómo comprobar la privacidad](${url("/verificar-privacidad")}): cuatro maneras de verificar, una por una, que el archivo no sale del dispositivo.`,
  );
  l.push(`- [Acerca de](${url("/acerca")}): qué es Planillar y por qué se hizo así.`);
  l.push(`- [Contacto](${url("/contacto")}): ${siteConfig.emailContacto}.`);
  l.push("");

  return new Response(l.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
