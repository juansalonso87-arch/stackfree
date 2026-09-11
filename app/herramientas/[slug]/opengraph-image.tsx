import { obtenerPagina, todosLosSlugs } from "@/lib/tools-registry";
import { generarImagenOg, tamanoOg } from "@/lib/og-image";

export const size = tamanoOg;
export const contentType = "image/png";

export function generateStaticParams() {
  return todosLosSlugs().map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = obtenerPagina(slug);
  return generarImagenOg({
    titulo: p?.h1 ?? "Herramienta online gratis",
    subtitulo: p?.herramienta.descripcionCorta ?? "",
  });
}
