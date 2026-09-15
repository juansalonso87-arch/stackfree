import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Code2, FileSpreadsheet, Lock, ShieldCheck, WifiOff } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { urlContacto } from "@/lib/contacto";
import { herramientasPorCategoria } from "@/lib/tools-registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdSlot } from "@/components/core/AdSlot";
import { JsonLd } from "@/components/core/JsonLd";
import { ToolCard } from "@/components/core/ToolCard";

const TITULO = "Herramientas de administración para PyMEs: extractos bancarios a Excel";
const DESCRIPCION =
  "Convertí el extracto de tu banco o el reporte de cobros de Mercado Pago en un informe Excel con resúmenes por concepto, categoría y día. Gratis y sin subir tus datos: todo se procesa en tu navegador.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  keywords: [
    "analizar extracto bancario",
    "extracto bancario a excel",
    "herramientas administracion pymes gratis",
    "resumen de movimientos bancarios por concepto",
    "conciliacion bancaria excel",
    "analisis de cobros mercado pago",
  ],
  alternates: { canonical: "/administracion" },
  openGraph: {
    type: "website",
    url: "/administracion",
    title: TITULO,
    description: DESCRIPCION,
    siteName: siteConfig.nombre,
    locale: siteConfig.localeOpenGraph,
  },
};

const faq = [
  {
    pregunta: "¿Es seguro subir mi extracto bancario a una página web?",
    respuesta:
      "Acá no lo subís. El archivo se abre y se procesa dentro de tu navegador, en tu computadora, y el Excel se genera ahí mismo. Nuestro servidor solo te entrega la página; nunca recibe el extracto. Además, la página tiene una política de seguridad (CSP) por la que el propio navegador bloquea cualquier envío de datos a otros servidores, y el código es público. En la página “Cómo comprobarlo” te mostramos tres formas de verificarlo vos mismo.",
  },
  {
    pregunta: "¿Qué obtengo?",
    respuesta:
      "Un Excel con varias hojas: Resumen por Concepto (un renglón por tipo de movimiento), Resumen por Categoría (sueldos, impuestos, comisiones, cobros con tarjeta, transferencias…), la matriz Concepto x Día, controles de integridad cuando el banco los permite y el Detalle movimiento por movimiento. Los resúmenes usan fórmulas: si corregís algo en el Detalle, los totales se recalculan solos.",
  },
  {
    pregunta: "¿Para quién es?",
    respuesta:
      "Para dueños y administrativos de PyMEs, comercios y gastronomía, estudios contables y cualquiera que necesite entender rápido a dónde va la plata de una cuenta sin armar la planilla a mano cada mes.",
  },
  {
    pregunta: "Mi banco no está. ¿Lo van a agregar?",
    respuesta:
      "Sí, vamos sumando bancos y plataformas. Escribinos desde la página de contacto contándonos qué banco usás y qué formato de exportación te da; con eso podemos armar el analizador.",
  },
  {
    pregunta: "¿Tiene costo?",
    respuesta: "No. Todas las herramientas son gratuitas, sin registro y sin límite de uso. El sitio se mantiene con publicidad.",
  },
];

export default function PaginaAdministracion() {
  const lista = herramientasPorCategoria("administracion");
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: TITULO,
      description: DESCRIPCION,
      url: `${siteConfig.url}/administracion`,
      inLanguage: siteConfig.idioma,
      hasPart: lista.map((h) => ({
        "@type": "WebApplication",
        name: h.nombre,
        url: `${siteConfig.url}/herramientas/${h.slug}`,
        applicationCategory: "BusinessApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: siteConfig.url },
        { "@type": "ListItem", position: 2, name: "Administración", item: `${siteConfig.url}/administracion` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.pregunta,
        acceptedAnswer: { "@type": "Answer", text: f.respuesta },
      })),
    },
  ];

  return (
    <article className="container mx-auto px-4 py-8">
      {jsonLd.map((d, i) => (
        <JsonLd key={i} data={d} />
      ))}

      <nav aria-label="Migas de pan" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Inicio
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">
          Administración
        </span>
      </nav>

      <header className="max-w-3xl">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="outline">Administración</Badge>
          <Badge variant="secondary">
            <Lock data-icon="inline-start" />
            Tus datos no salen de tu PC
          </Badge>
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Del extracto bancario al informe Excel, sin subir tus datos
        </h1>
        <p className="mt-3 text-lg text-muted-foreground text-pretty">
          Exportá los movimientos desde tu home banking o Mercado Pago, subilos acá y en segundos tenés los
          movimientos agrupados por concepto y categoría, la matriz por día y controles de integridad. Todo se
          procesa en tu navegador: el extracto nunca llega a nuestros servidores.
        </p>
      </header>

      <div className="my-6">
        <AdSlot posicion="top-banner" />
      </div>

      <section aria-labelledby="herramientas-admin">
        <h2 id="herramientas-admin" className="font-heading text-xl font-semibold tracking-tight">
          Herramientas disponibles
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((h) => (
            <ToolCard key={h.slug} herramienta={h} />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          ¿Tu banco no está?{" "}
          <Link href={urlContacto({ motivo: "banco" })} className="underline underline-offset-2 hover:text-foreground">
            Contanos cuál usás
          </Link>{" "}
          y lo sumamos.
        </p>
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-3">
        {[
          {
            icono: FileSpreadsheet,
            titulo: "1. Exportá desde tu banco",
            texto: "Cada herramienta te indica exactamente qué reporte descargar y desde qué menú del home banking.",
          },
          {
            icono: ShieldCheck,
            titulo: "2. Se analiza en tu navegador",
            texto: "Lectura, clasificación y controles ocurren en tu computadora. No hay carga a ningún servidor.",
          },
          {
            icono: FileSpreadsheet,
            titulo: "3. Descargá el Excel",
            texto: "Resúmenes con fórmulas, matriz por día, controles y detalle. Listo para tu contador o para vos.",
          },
        ].map((b) => (
          <div key={b.titulo} className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <b.icono className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-medium">{b.titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b.texto}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-12 rounded-xl border bg-muted/30 p-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Por qué podés confiar tus extractos</h2>
        <p className="mt-2 text-muted-foreground">
          Un extracto bancario es de lo más sensible que hay. Por eso no alcanza con que lo digamos: te damos tres formas
          de comprobarlo.
        </p>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          <li className="flex gap-3">
            <WifiOff className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Funciona sin internet</p>
              <p className="text-sm text-muted-foreground">
                Abrí la herramienta, desconectá el Wi-Fi y analizá el archivo igual. Si no hubiera nada que enviar… no hay
                nada que enviar.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <Lock className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Bloqueo del propio navegador</p>
              <p className="text-sm text-muted-foreground">
                La página declara una política de seguridad (CSP) que le prohíbe al navegador enviar datos a cualquier
                otro servidor. Se puede ver en las herramientas de desarrollador.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <Code2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Código abierto</p>
              <p className="text-sm text-muted-foreground">
                Todo el código es público. Cualquiera puede leer exactamente qué hace cada herramienta con tu archivo.
              </p>
            </div>
          </li>
        </ul>
        <div className="mt-5">
          <Button variant="outline" nativeButton={false} render={<Link href="/verificar-privacidad" />}>
            Ver cómo comprobarlo paso a paso
          </Button>
        </div>
      </section>

      <AdSlot posicion="in-content" />

      <section className="mt-12 max-w-3xl">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <Accordion className="mt-2" defaultValue={["faq-0"]}>
          {faq.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-base">{f.pregunta}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.respuesta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <div className="mt-10">
        <AdSlot posicion="bottom-banner" />
      </div>
    </article>
  );
}
