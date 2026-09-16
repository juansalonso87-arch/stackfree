import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { siteConfig } from "@/lib/site-config";
import { adsConfig, adsenseHabilitado } from "@/lib/ads-config";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadata por defecto de TODO el sitio. Cada página puede sobreescribir
 * partes (título, descripción); lo que no toque se hereda de acá.
 * `metadataBase` convierte las rutas relativas (/herramientas/x) en URLs
 * absolutas para Open Graph, canonical y sitemap.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.nombre} — ${siteConfig.eslogan}`,
    template: `%s | ${siteConfig.nombre}`,
  },
  description: siteConfig.descripcion,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.nombre,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: siteConfig.localeOpenGraph,
    siteName: siteConfig.nombre,
    title: `${siteConfig.nombre} — ${siteConfig.eslogan}`,
    description: siteConfig.descripcion,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.nombre} — ${siteConfig.eslogan}`,
    description: siteConfig.descripcion,
  },
  robots: { index: true, follow: true },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || siteConfig.googleSiteVerification,
  },
  // Meta etiqueta con la que AdSense verifica que el sitio es del dueño (segundo método, además del script).
  ...(adsenseHabilitado() ? { other: { "google-adsense-account": adsConfig.cliente } } : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={siteConfig.idioma}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Script de AdSense escrito tal cual en el <head>: el rastreador de AdSense no
          ejecuta JavaScript, así que necesita ver la etiqueta en el HTML (con next/script
          quedaba solo como preload + datos de hidratación y la verificación fallaba).
        */}
        {adsenseHabilitado() && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsConfig.cliente}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />

        {/* Analytics sin cookies (no requiere banner de consentimiento). */}
        <Analytics />

      </body>
    </html>
  );
}
