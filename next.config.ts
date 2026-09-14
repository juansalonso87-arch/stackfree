import type { NextConfig } from "next";
import { cabecerasCsp } from "./lib/csp";

const nextConfig: NextConfig = {
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
