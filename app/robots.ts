import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

/** Genera /robots.txt: permitimos indexar todo y señalamos el sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
