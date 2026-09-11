import { siteConfig } from "@/lib/site-config";
import { generarImagenOg, tamanoOg } from "@/lib/og-image";

export const alt = `${siteConfig.nombre} — ${siteConfig.eslogan}`;
export const size = tamanoOg;
export const contentType = "image/png";

export default function Image() {
  return generarImagenOg({
    titulo: siteConfig.eslogan,
    subtitulo: "Edita imágenes y archivos sin subir nada a ningún servidor.",
  });
}
