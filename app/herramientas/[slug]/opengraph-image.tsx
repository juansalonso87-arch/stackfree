import { herramientas, obtenerHerramienta } from "@/lib/tools-registry";
import { generarImagenOg, tamanoOg } from "@/lib/og-image";

export const size = tamanoOg;
export const contentType = "image/png";

export function generateStaticParams() {
  return herramientas.map((h) => ({ slug: h.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = obtenerHerramienta(slug);
  return generarImagenOg({
    titulo: h?.h1 ?? "Herramienta online gratis",
    subtitulo: h?.descripcionCorta ?? "",
  });
}
