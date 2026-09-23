import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Code2, Construction, Download, Lock, PlayCircle, Sparkles } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { duracionLegible, jsonLdVideo } from "@/lib/video";
import {
  herramientas,
  nombresCategoria,
  obtenerPagina,
  rutaHerramienta,
  todosLosSlugs,
} from "@/lib/tools-registry";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdSlot } from "@/components/core/AdSlot";
import { ContadorUsos } from "@/components/core/ContadorUsos";
import { JsonLd } from "@/components/core/JsonLd";
import { PedidoDevolucion } from "@/components/core/PedidoDevolucion";
import { ToolCard } from "@/components/core/ToolCard";
import { ToolLoader } from "@/components/core/ToolLoader";
import { VideoYouTube } from "@/components/core/VideoYouTube";

type Props = { params: Promise<{ slug: string }> };

/**
 * Le decimos a Next qué páginas existen (herramientas + variantes) para que
 * las genere como HTML estático en el build (más rápido y mejor para SEO).
 * Cualquier slug que no esté en el registry devuelve 404 gracias a
 * `dynamicParams = false`.
 */
export function generateStaticParams() {
  return todosLosSlugs().map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = obtenerPagina(slug);
  if (!p) return {};

  const ruta = rutaHerramienta(p.slug);
  const indexable = p.herramienta.estado === "activa";

  return {
    title: p.tituloSeo,
    description: p.descripcionSeo,
    keywords: p.keywords,
    alternates: { canonical: ruta },
    // Las herramientas "próximamente" no se indexan: Google penaliza páginas sin contenido útil.
    robots: { index: indexable, follow: true },
    openGraph: {
      type: "website",
      url: ruta,
      title: p.tituloSeo,
      description: p.descripcionSeo,
      siteName: siteConfig.nombre,
      locale: siteConfig.localeOpenGraph,
    },
    twitter: {
      card: "summary_large_image",
      title: p.tituloSeo,
      description: p.descripcionSeo,
    },
  };
}

export default async function PaginaHerramienta({ params }: Props) {
  const { slug } = await params;
  const p = obtenerPagina(slug);
  if (!p) notFound();

  const h = p.herramienta;
  const urlAbsoluta = `${siteConfig.url}${rutaHerramienta(p.slug)}`;
  const otras = [...herramientas]
    .filter((o) => o.slug !== h.slug)
    .sort((a, b) => Number(b.categoria === h.categoria) - Number(a.categoria === h.categoria))
    .slice(0, 3);
  // Enlaces entre páginas "hermanas" (la principal + sus variantes), sin la actual.
  const hermanas = h.variantes
    ? [
        { slug: h.slug, etiqueta: "Todos los formatos" },
        ...h.variantes.map((v) => ({ slug: v.slug, etiqueta: v.etiqueta })),
      ].filter((x) => x.slug !== p.slug)
    : [];

  // Datos estructurados: FAQ (rich snippets), migas de pan y ficha de la app.
  const jsonLdFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: p.faq.map((f) => ({
      "@type": "Question",
      name: f.pregunta,
      acceptedAnswer: { "@type": "Answer", text: f.respuesta },
    })),
  };
  // La sección de las migas: Administración tiene portada propia; el resto vuelve al listado del inicio.
  const seccion =
    h.categoria === "administracion"
      ? { nombre: nombresCategoria.administracion, ruta: "/administracion" }
      : { nombre: "Herramientas", ruta: "/#herramientas" };
  const jsonLdMigas = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: seccion.nombre, item: `${siteConfig.url}${seccion.ruta}` },
      ...(p.variante
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: h.nombre,
              item: `${siteConfig.url}${rutaHerramienta(h.slug)}`,
            },
            { "@type": "ListItem", position: 4, name: p.variante.etiqueta, item: urlAbsoluta },
          ]
        : [{ "@type": "ListItem", position: 3, name: h.nombre, item: urlAbsoluta }]),
    ],
  };
  const jsonLdApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: p.h1,
    url: urlAbsoluta,
    description: p.descripcionSeo,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requiere un navegador moderno con JavaScript",
    inLanguage: siteConfig.idioma,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <article className="container mx-auto px-4 py-8">
      <JsonLd data={jsonLdFaq} />
      <JsonLd data={jsonLdMigas} />
      <JsonLd data={jsonLdApp} />
      {h.video && <JsonLd data={jsonLdVideo(h.video)} />}

      {/* Migas de pan */}
      <nav aria-label="Migas de pan" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Inicio
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <Link href={seccion.ruta} className="hover:text-foreground hover:underline">
          {seccion.nombre}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        {p.variante ? (
          <>
            <Link href={rutaHerramienta(h.slug)} className="hover:text-foreground hover:underline">
              {h.nombre}
            </Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span className="text-foreground" aria-current="page">
              {p.variante.etiqueta}
            </span>
          </>
        ) : (
          <span className="text-foreground" aria-current="page">
            {h.nombre}
          </span>
        )}
      </nav>

      {/* Encabezado SEO */}
      <header className="max-w-3xl">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="outline">{nombresCategoria[h.categoria]}</Badge>
          {/* La insignia es el enlace a la explicación: es donde el usuario duda. */}
          <Link href="/verificar-privacidad" title="Cómo comprobar que tu archivo no sale de tu dispositivo">
            <Badge variant="secondary" className="transition-colors hover:bg-secondary/70">
              <Lock data-icon="inline-start" />
              Sin subir archivos
            </Badge>
          </Link>
          <Badge variant="secondary">
            <Sparkles data-icon="inline-start" />
            Gratis y sin marca de agua
          </Badge>
          {/* Cuántas veces se usó. No aparece hasta que el número sea grande. */}
          <Suspense fallback={null}>
            <ContadorUsos slug={h.slug} />
          </Suspense>
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {p.h1}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground text-pretty">{p.subtitulo}</p>
      </header>

      <div className="my-6">
        <AdSlot posicion="top-banner" />
      </div>

      {/* Dos columnas en desktop: contenido + anuncio lateral pegajoso */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-10">
          {h.estado === "proximamente" && (
            <Alert>
              <Construction />
              <AlertTitle>Estamos terminando esta herramienta</AlertTitle>
              <AlertDescription>
                Ya puedes probar la interfaz, pero el procesamiento estará disponible muy pronto.
              </AlertDescription>
            </Alert>
          )}

          {/* La herramienta en sí: se carga en un paquete JS separado (ver ToolLoader) */}
          <section aria-label={h.nombre} className="space-y-3">
            <ToolLoader slug={h.slug} opciones={p.opciones} />
            {/* Administración: los bancos cambian sus exportaciones sin avisar; pedimos devolución desde el primer momento. */}
            {h.categoria === "administracion" && (
              <PedidoDevolucion
                variante="linea"
                slug={h.slug}
                texto="Esta herramienta se afina con archivos reales de cada banco y plataforma. Si tu archivo no se lee, algo queda mal clasificado o un número no cuadra, contanos qué pasó: lo corregimos para todos."
                etiquetaBoton="Reportar algo raro"
                className="px-1"
              />
            )}
          </section>

          {/* Video tutorial: el reproductor de YouTube se carga solo al tocar reproducir (ver VideoYouTube). */}
          {h.video && (
            <section id="video" className="scroll-mt-20" aria-labelledby="video-titulo">
              <h2 id="video-titulo" className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
                <PlayCircle className="size-5 text-primary" aria-hidden="true" />
                Mirá cómo funciona
                <span className="text-base font-normal text-muted-foreground">· {duracionLegible(h.video.duracion)}</span>
              </h2>
              <p className="mt-2 text-muted-foreground">{h.video.descripcion}</p>
              <VideoYouTube video={h.video} className="mt-4" />
            </section>
          )}

          {hermanas.length > 0 && (
            <nav aria-label="Otras conversiones" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">También:</span>
              {hermanas.map((x) => (
                <Link
                  key={x.slug}
                  href={rutaHerramienta(x.slug)}
                  className="rounded-full border px-3 py-1 transition-colors hover:bg-muted"
                >
                  {x.etiqueta}
                </Link>
              ))}
            </nav>
          )}

          <AdSlot posicion="in-content" />

          {h.guiaDescarga && (
            <section id="guia-descarga" className="scroll-mt-20 rounded-xl border bg-muted/30 p-5">
              <h2 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
                <Download className="size-5 text-primary" aria-hidden="true" />
                {h.guiaDescarga.titulo}
              </h2>
              <ol className="mt-4 space-y-3">
                {h.guiaDescarga.pasos.map((paso, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold">
                      {i + 1}
                    </span>
                    <p className="pt-0.5 text-muted-foreground">{paso}</p>
                  </li>
                ))}
              </ol>
              {h.guiaDescarga.nota && <p className="mt-4 text-sm text-muted-foreground">{h.guiaDescarga.nota}</p>}
            </section>
          )}

          <section>
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              {h.tituloPasos ??
                `Cómo ${p.variante ? `convertir ${p.variante.etiqueta.toLowerCase()}` : h.nombre.toLowerCase()} paso a paso`}
            </h2>
            <ol className="mt-4 space-y-3">
              {h.pasos.map((paso, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-muted-foreground">{paso}</p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold tracking-tight">Preguntas frecuentes</h2>
            <Accordion className="mt-2" defaultValue={["faq-0"]}>
              {p.faq.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-base">{f.pregunta}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.respuesta}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          {h.scriptPython && (
            <section className="rounded-lg border bg-muted/30 p-4">
              <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
                <Code2 className="size-4 text-primary" aria-hidden="true" />
                ¿Preferís correrlo en tu computadora?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta herramienta nació como un script de Python, publicado con el resto del código: podés leerlo,
                descargarlo y ejecutarlo sin conexión. La versión web suma las mejoras que vamos incorporando con archivos
                reales (más categorías, más redacciones del banco).{" "}
                <a
                  href={`${siteConfig.repoUrl}/blob/main/${h.scriptPython}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Ver el script en GitHub
                </a>
                .
              </p>
            </section>
          )}

          {otras.length > 0 && (
            <section>
              <h2 className="font-heading text-xl font-semibold tracking-tight">Otras herramientas</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {otras.map((o) => (
                  <ToolCard key={o.slug} herramienta={o} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="hidden lg:block" aria-label="Publicidad">
          <div className="sticky top-20">
            <AdSlot posicion="sidebar" />
          </div>
        </aside>
      </div>

      <div className="mt-10">
        <AdSlot posicion="bottom-banner" />
      </div>
    </article>
  );
}
