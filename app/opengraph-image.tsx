import { siteConfig } from "@/lib/site-config";
import { generarImagenOg, tamanoOg } from "@/lib/og-image";

export const alt = `${siteConfig.nombre} — ${siteConfig.eslogan}`;
export const size = tamanoOg;
export const contentType = "image/png";

export default function Image() {
  return generarImagenOg({
    titulo: siteConfig.eslogan,
    subtitulo: "Subí los movimientos de tu banco, Mercado Pago o PedidosYa y recibí el análisis en Excel. Nada se sube a ningún servidor.",
  });
}
