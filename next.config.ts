import type { NextConfig } from "next";
import { cabecerasCsp } from "./lib/csp";
import { siteConfig } from "./lib/site-config";

const nextConfig: NextConfig = {
  /**
   * La dirección vieja (stackfree.vercel.app) redirige de forma permanente al
   * dominio propio conservando la ruta: Google traslada lo indexado y los
   * links viejos siguen funcionando.
   */
  async redirects() {
    const hostAnterior = new URL(siteConfig.urlAnterior).host;
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: hostAnterior }],
        destination: `https://${siteConfig.dominio}/:path*`,
        permanent: true,
      },
    ];
  },

  /**
   * Cabeceras de seguridad. La Content-Security-Policy es la garantía
   * verificable de que la página no puede enviar archivos a otros servidores
   * (ver `lib/csp.ts` y la página /verificar-privacidad).
   */
  async headers() {
    return cabecerasCsp({
      adsense: (process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "").length > 0,
      desarrollo: process.env.NODE_ENV !== "production",
    });
  },
};

export default nextConfig;
