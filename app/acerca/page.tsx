import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Code2, HandCoins, Landmark, ShieldCheck } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { herramientasPorCategoria, rutaHerramienta } from "@/lib/tools-registry";
import { urlContacto } from "@/lib/contacto";
import { JsonLd } from "@/components/core/JsonLd";

const TITULO = `Acerca de ${siteConfig.nombre}`;
const DESCRIPCION =
  "Quién hace Planillar, por qué es gratis y cómo se mantiene: herramientas de administración para PyMEs y gastronomía que procesan todo en tu navegador, sin subir tus archivos.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/acerca" },
  openGraph: { type: "article", url: "/acerca", title: TITULO, description: DESCRIPCION, siteName: siteConfig.nombre },
};

export default function PaginaAcerca() {
  const administracion = herramientasPorCategoria("administracion");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: TITULO,
    description: DESCRIPCION,
    url: `${siteConfig.url}/acerca`,
    inLanguage: siteConfig.idioma,
    mainEntity: {
      "@type": "Organization",
      name: siteConfig.nombre,
      url: siteConfig.url,
      email: siteConfig.emailContacto,
      foundingLocation: "Buenos Aires, Argentina",
      sameAs: [siteConfig.redes.youtube, siteConfig.redes.tiktok],
    },
  };

  return (
    <article className="container mx-auto max-w-3xl px-4 py-8">
      <JsonLd data={jsonLd} />
      <nav aria-label="Migas de pan" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Inicio
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">
          Acerca de
        </span>
      </nav>

      <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">{TITULO}</h1>
      <p className="mt-3 text-lg text-muted-foreground text-pretty">
        {siteConfig.nombre} nació de una necesidad concreta: todos los meses, alguien en una PyME baja el Excel de
        movimientos del banco y arma a mano la misma planilla para entender a dónde fue la plata. Acá esa planilla se
        arma sola, en segundos, y sin que el extracto salga de tu computadora.
      </p>

      <section className="mt-10 space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
          <Landmark className="size-5 text-primary" aria-hidden="true" />
          Quién está detrás
        </h2>
        <p className="text-muted-foreground">
          El proyecto lo lleva adelante Juan Alonso, desde Buenos Aires, Argentina, con experiencia en la administración
          de locales gastronómicos. Los analizadores de bancos, Mercado Pago y PedidosYa empezaron como planillas y
          scripts de uso propio, probados durante meses con archivos reales de varios locales, y después se convirtieron
          en herramientas web para que cualquier administrador, dueño de comercio o estudio contable pueda usarlas sin
          instalar nada.
        </p>
        <p className="text-muted-foreground">
          Las categorías, los controles y las guías de exportación de cada banco se ajustan con la devolución de quienes
          las usan: si algo no cuadra con tu archivo,{" "}
          <Link href={urlContacto({ motivo: "error" })} className="underline underline-offset-2 hover:text-foreground">
            contanos
          </Link>{" "}
          y lo corregimos para todos.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          Cómo funciona la privacidad
        </h2>
        <p className="text-muted-foreground">
          Un extracto bancario es de lo más sensible que hay, así que la regla de diseño es una sola: <strong>tus archivos
          nunca se suben a ningún servidor</strong>. La lectura, la clasificación, los controles y la generación del Excel
          ocurren dentro de tu navegador. Nuestro servidor solo entrega la página; una política de seguridad (CSP) le
          prohíbe al navegador enviar datos a otros destinos, y el código es público para que cualquiera lo revise.{" "}
          <Link href="/verificar-privacidad" className="underline underline-offset-2 hover:text-foreground">
            Cómo comprobarlo vos mismo
          </Link>
          .
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
          <HandCoins className="size-5 text-primary" aria-hidden="true" />
          Por qué es gratis y cómo se mantiene
        </h2>
        <p className="text-muted-foreground">
          Todas las herramientas son gratuitas, sin registro y sin límite de uso. El sitio se financia con publicidad de
          Google AdSense, que aparece en espacios fijos y fuera del área de trabajo de cada herramienta. No vendemos
          datos (no los tenemos: tus archivos no llegan a nosotros) y la analítica de visitas que usamos no utiliza
          cookies. Los detalles están en la{" "}
          <Link href="/legal/privacidad" className="underline underline-offset-2 hover:text-foreground">
            política de privacidad
          </Link>{" "}
          y la{" "}
          <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-foreground">
            política de cookies
          </Link>
          .
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
          <Code2 className="size-5 text-primary" aria-hidden="true" />
          Código abierto
        </h2>
        <p className="text-muted-foreground">
          Todo el código está publicado bajo licencia {siteConfig.licencia}: podés leer exactamente qué hace cada
          herramienta con tu archivo, proponer mejoras o correr los analizadores en tu propia computadora.{" "}
          <a href={siteConfig.repoUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
            Ver el código en GitHub
          </a>
          .
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Qué podés hacer hoy</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {administracion.map((h) => (
            <li key={h.slug}>
              <Link href={rutaHerramienta(h.slug)} className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted">
                <span className="font-medium">{h.nombre}</span>
                <span className="mt-0.5 block text-muted-foreground">{h.descripcionCorta}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Además, herramientas gratuitas para imágenes y PDF (convertir, comprimir, unir, dividir, quitar fondo) con la
          misma regla: nada se sube a ningún servidor.{" "}
          <Link href="/#herramientas" className="underline underline-offset-2 hover:text-foreground">
            Ver todas
          </Link>
          .
        </p>
      </section>

      <section className="mt-10 rounded-xl border bg-muted/30 p-5">
        <h2 className="font-heading text-base font-semibold">Contacto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Para reportar un error, pedir un banco o una herramienta, o hacer una propuesta:{" "}
          <Link href="/contacto" className="underline underline-offset-2 hover:text-foreground">
            formulario de contacto
          </Link>{" "}
          o{" "}
          <a href={`mailto:${siteConfig.emailContacto}`} className="underline underline-offset-2 hover:text-foreground">
            {siteConfig.emailContacto}
          </a>
          .
        </p>
      </section>
    </article>
  );
}
