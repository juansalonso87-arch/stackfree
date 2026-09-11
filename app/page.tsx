import Link from "next/link";
import { ArrowDown, Infinity as InfinityIcon, ShieldCheck, Zap } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { herramientas } from "@/lib/tools-registry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdSlot } from "@/components/core/AdSlot";
import { ToolCard } from "@/components/core/ToolCard";
import { JsonLd } from "@/components/core/JsonLd";

const beneficios = [
  {
    icono: ShieldCheck,
    titulo: "Privacidad total",
    texto:
      "Tus archivos nunca salen de tu dispositivo. Todo el procesamiento ocurre dentro de tu navegador, no en nuestros servidores.",
  },
  {
    icono: InfinityIcon,
    titulo: "Gratis y sin límites",
    texto:
      "Sin registro, sin marcas de agua, sin límite diario. Usa las herramientas todas las veces que necesites.",
  },
  {
    icono: Zap,
    titulo: "Rápido",
    texto:
      "Como no hay que subir ni descargar archivos de un servidor, el resultado aparece en segundos, incluso con conexiones lentas.",
  },
];

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.nombre,
    url: siteConfig.url,
    description: siteConfig.descripcion,
    inLanguage: siteConfig.idioma,
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero */}
      <section className="container mx-auto px-4 pt-14 pb-10 text-center sm:pt-20">
        <Badge variant="secondary" className="mb-4 h-auto py-1">
          100% gratis · Sin registro · Sin subir archivos
        </Badge>
        <h1 className="mx-auto max-w-3xl font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Herramientas online gratis que funcionan en tu navegador
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
          Quita el fondo de tus fotos, une PDFs y convierte formatos sin subir nada a ningún
          servidor. Tus archivos nunca salen de tu computadora o celular.
        </p>
        <div className="mt-6 flex justify-center">
          <Button size="lg" nativeButton={false} render={<Link href="#herramientas" />}>
            Ver herramientas
            <ArrowDown data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <div className="container mx-auto px-4">
        <AdSlot posicion="top-banner" />
      </div>

      {/* Grilla de herramientas: se genera sola desde lib/tools-registry.ts */}
      <section id="herramientas" className="container mx-auto scroll-mt-20 px-4 py-12">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Todas las herramientas</h2>
        <p className="mt-1 text-muted-foreground">
          Elige una herramienta. Vamos agregando nuevas todas las semanas.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {herramientas.map((h) => (
            <ToolCard key={h.slug} herramienta={h} />
          ))}
        </div>
      </section>

      {/* Beneficios */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            ¿Por qué procesamos todo en tu navegador?
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {beneficios.map((b) => (
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
          </div>
        </div>
      </section>

      {/* Explicación breve (contenido real = ayuda a SEO y a la aprobación de AdSense) */}
      <section className="container mx-auto max-w-3xl px-4 py-12">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">¿Cómo funciona?</h2>
        <div className="mt-4 space-y-3 text-muted-foreground">
          <p>
            La mayoría de las herramientas online suben tu archivo a un servidor, lo procesan allá y te
            devuelven el resultado. Eso significa que una copia de tu foto o documento queda, aunque sea
            por un rato, en una computadora ajena.
          </p>
          <p>
            Acá es distinto: cuando abres una herramienta, tu navegador descarga el programa necesario
            (por ejemplo, un modelo de inteligencia artificial) y lo ejecuta localmente usando
            tecnologías modernas como WebAssembly. El archivo se lee, se transforma y se descarga
            directamente desde tu dispositivo. Una vez cargada la herramienta, no se envía ningún dato
            a internet para procesar tu archivo.
          </p>
          <p>
            El sitio se mantiene con publicidad, lo que nos permite ofrecer todo gratis, sin registro
            y sin marcas de agua.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4">
        <AdSlot posicion="bottom-banner" />
      </div>
    </>
  );
}
