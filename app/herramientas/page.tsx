import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { categorias, herramientasPorCategoria, rutaHerramienta } from "@/lib/tools-registry";
import { AdSlot } from "@/components/core/AdSlot";
import { JsonLd } from "@/components/core/JsonLd";
import { NotaPrivacidad } from "@/components/core/NotaPrivacidad";

/**
 * Índice completo de herramientas: TODAS las páginas, incluidas las variantes.
 *
 * Existe por una razón concreta (2026-09-25): en Search Console, 10 de las 42
 * páginas figuraban como "Descubierta: actualmente sin indexar", y eran
 * exactamente las 10 con 3 enlaces internos o menos —todas variantes—, mientras
 * que sus hermanas con 6 enlaces sí estaban indexadas. Desde una página nueva
 * sin autoridad, Google no gasta rastreo en lo que el propio sitio casi no
 * enlaza. Esta página le da a cada variante un enlace desde un lugar que se
 * visita seguido, y de paso el menú "Herramientas" deja de apuntar a un ancla
 * del inicio para apuntar a una página de verdad.
 *
 * Al sumar una herramienta o una variante al registry aparecen acá solas.
 */

const TITULO = "Todas las herramientas gratis de Planillar";
const DESCRIPCION =
  "El listado completo: análisis de extractos bancarios, Mercado Pago y PedidosYa, más herramientas de imágenes y PDF. Todas gratis, sin registro y sin subir tus archivos a ningún servidor.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  keywords: [
    "herramientas online gratis",
    "herramientas gratis sin registro",
    "convertir archivos en el navegador",
    "extractos bancarios a excel",
    "herramientas pdf gratis",
    "herramientas de imagen gratis",
  ],
  alternates: { canonical: "/herramientas" },
  openGraph: {
    type: "website",
    url: "/herramientas",
    title: TITULO,
    description: DESCRIPCION,
    siteName: siteConfig.nombre,
    locale: siteConfig.localeOpenGraph,
  },
};

export default function PaginaHerramientas() {
  const grupos = categorias
    .map((c) => ({ ...c, lista: herramientasPorCategoria(c.id).filter((h) => h.estado === "activa") }))
    .filter((g) => g.lista.length > 0);

  const total = grupos.reduce((s, g) => s + g.lista.length, 0);
  const variantes = grupos.reduce((s, g) => s + g.lista.reduce((t, h) => t + (h.variantes?.length ?? 0), 0), 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITULO,
    description: DESCRIPCION,
    url: `${siteConfig.url}/herramientas`,
    inLanguage: siteConfig.idioma,
    hasPart: grupos.flatMap((g) =>
      g.lista.map((h) => ({
        "@type": "WebApplication",
        name: h.nombre,
        url: `${siteConfig.url}${rutaHerramienta(h.slug)}`,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      })),
    ),
  };

  const jsonLdMigas = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Herramientas", item: `${siteConfig.url}/herramientas` },
    ],
  };

  return (
    <article className="container mx-auto px-4 py-8">
      <JsonLd data={jsonLd} />
      <JsonLd data={jsonLdMigas} />

      <nav aria-label="Migas de pan" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Inicio
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">
          Herramientas
        </span>
      </nav>

      <header className="max-w-3xl">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Todas las herramientas
        </h1>
        <p className="mt-3 text-lg text-muted-foreground text-pretty">
          {total} herramientas gratuitas, sin registro y sin límite de uso. Todas procesan los archivos dentro de tu
          navegador: no se suben a ningún servidor.
        </p>
      </header>

      <div className="my-6">
        <AdSlot posicion="top-banner" />
      </div>

      <div className="space-y-10">
        {grupos.map((g) => (
          <section key={g.id} aria-labelledby={`cat-${g.id}`}>
            <div className="mb-4 max-w-3xl">
              <h2 id={`cat-${g.id}`} className="font-heading text-2xl font-bold tracking-tight">
                {g.id === "administracion" ? (
                  <Link href="/administracion" className="hover:underline">
                    {g.nombre}
                  </Link>
                ) : (
                  g.nombre
                )}
              </h2>
              <p className="mt-1 text-muted-foreground text-pretty">{g.descripcion}</p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.lista.map((h) => {
                const Icono = h.icono;
                return (
                  <li key={h.slug} className="rounded-xl border p-4">
                    <Link
                      href={rutaHerramienta(h.slug)}
                      className="flex items-start gap-3 font-medium hover:underline"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icono className="size-4" aria-hidden="true" />
                      </span>
                      <span>{h.nombre}</span>
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground text-pretty">{h.descripcionCorta}</p>
                    {h.variantes && h.variantes.length > 0 && (
                      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {h.variantes.map((v) => (
                          <Link
                            key={v.slug}
                            href={rutaHerramienta(v.slug)}
                            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {v.etiqueta}
                          </Link>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="my-8">
        <AdSlot posicion="in-content" />
      </div>

      <section className="max-w-3xl">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Lo mismo para todas</h2>
        <p className="mt-3 text-muted-foreground text-pretty">
          Son {total} herramientas y {variantes} páginas más con las variantes de formato de cada una. Ninguna pide que
          te registres, ninguna pone marca de agua y ninguna tiene límite de uso. Y en todas, el archivo se abre y se
          procesa dentro de tu navegador: podés desconectar internet y seguir trabajando.
        </p>
        <NotaPrivacidad
          className="mt-4"
          texto="Todo se procesa en tu navegador: tus archivos no se suben a ningún servidor."
        />
      </section>
    </article>
  );
}
