import Link from "next/link";
import { ArrowRight, CheckCircle2, Infinity as InfinityIcon, ShieldCheck, Zap } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { urlContacto } from "@/lib/contacto";
import { categorias, herramientasPorCategoria } from "@/lib/tools-registry";
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
      "Tus archivos nunca salen de tu dispositivo. Todo el procesamiento ocurre dentro de tu navegador, no en nuestros servidores. Y podés comprobarlo.",
  },
  {
    icono: InfinityIcon,
    titulo: "Gratis y sin límites",
    texto:
      "Sin registro, sin marcas de agua, sin límite diario. Usá las herramientas todas las veces que necesites.",
  },
  {
    icono: Zap,
    titulo: "Rápido",
    texto:
      "Como no hay que subir ni descargar archivos de un servidor, el resultado aparece en segundos, incluso con conexiones lentas.",
  },
];

const queMira = [
  "Cuánto entró y cuánto salió, por concepto y por categoría",
  "Sueldos, impuestos, retenciones y comisiones bancarias, separados",
  "Cobros con tarjeta, transferencias y plataformas de delivery",
  "Evolución día por día y controles de que no falta ningún movimiento",
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
  const administracion = herramientasPorCategoria("administracion");
  const otrasCategorias = categorias.filter((c) => c.id !== "administracion");

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero: la carta de presentación es Administración */}
      <section className="container mx-auto px-4 pt-14 pb-10 sm:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div>
            <Badge variant="secondary" className="mb-4 h-auto py-1">
              Gratis · Sin registro · Tus datos no salen de tu computadora
            </Badge>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Subí los movimientos de tu banco y recibí el análisis que todo administrador necesita
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
              Exportás el archivo de movimientos desde tu home banking o Mercado Pago, lo subís acá y en segundos tenés
              el informe que se arma a mano cada mes: ingresos y egresos por concepto y categoría, evolución diaria y
              controles. Todo se procesa en tu navegador: el archivo nunca llega a nuestros servidores.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/administracion" />}>
                Analizar mis movimientos
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href="#herramientas" />}>
                Herramientas de imágenes y PDF
              </Button>
            </div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-6">
            <p className="text-sm font-semibold">Lo que el informe te muestra</p>
            <ul className="mt-3 space-y-2.5">
              {queMira.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Un Excel con fórmulas listo para vos o para tu contador. Bancos disponibles hoy:{" "}
              {administracion.map((h) => h.nombre.replace(/^Análisis de movimientos /, "")).join(", ")}.
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4">
        <AdSlot posicion="top-banner" />
      </div>

      {/* Administración: la sección principal */}
      <section id="administracion" className="container mx-auto scroll-mt-20 px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Análisis de movimientos bancarios</h2>
            <p className="mt-1 text-muted-foreground">Elegí tu banco o plataforma. Cada herramienta te explica qué archivo descargar.</p>
          </div>
          {/* Dos destinos distintos: la portada de la sección y la página de privacidad. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium">
            <Link href="/administracion" className="text-primary hover:underline">
              Cómo funciona cada herramienta →
            </Link>
            <Link href="/verificar-privacidad" className="text-primary hover:underline">
              Cómo comprobar la privacidad →
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {administracion.map((h) => (
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

      {/* Beneficios */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">¿Por qué procesamos todo en tu navegador?</h2>
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
          <p className="mt-6 text-sm text-muted-foreground">
            <Link href="/verificar-privacidad" className="font-medium text-primary hover:underline">
              Cómo comprobar vos mismo que tus archivos no salen de tu dispositivo →
            </Link>
          </p>
        </div>
      </section>

      {/* Resto de herramientas, por categoría */}
      <section id="herramientas" className="container mx-auto scroll-mt-20 px-4 py-12">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Herramientas de imágenes, PDF y conversión</h2>
        <p className="mt-1 text-muted-foreground">Las mismas reglas: gratis, sin registro y sin subir tus archivos.</p>
        <div className="mt-8 space-y-10">
          {otrasCategorias.map((c) => {
            const lista = herramientasPorCategoria(c.id);
            if (lista.length === 0) return null;
            return (
              <div key={c.id} id={c.id} className="scroll-mt-20">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-heading text-xl font-semibold tracking-tight">{c.nombre}</h3>
                  <p className="text-sm text-muted-foreground">{c.descripcion}</p>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {lista.map((h) => (
                    <ToolCard key={h.slug} herramienta={h} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Explicación breve (contenido real = ayuda a SEO y a la aprobación de AdSense) */}
      <section className="container mx-auto max-w-3xl px-4 py-12">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">¿Cómo funciona?</h2>
        <div className="mt-4 space-y-3 text-muted-foreground">
          <p>
            La mayoría de las herramientas online suben tu archivo a un servidor, lo procesan allá y te devuelven el
            resultado. Eso significa que una copia de tu extracto, tu foto o tu documento queda, aunque sea por un rato,
            en una computadora ajena.
          </p>
          <p>
            Acá es distinto: cuando abrís una herramienta, tu navegador descarga el programa necesario y lo ejecuta
            localmente. El archivo se lee, se analiza y el resultado se genera directamente en tu dispositivo. Una vez
            cargada la página, no se envía ningún dato a internet para procesarlo; incluso podés apagar el Wi-Fi y
            seguir trabajando.
          </p>
          <p>El sitio se mantiene con publicidad, lo que nos permite ofrecer todo gratis, sin registro y sin marcas de agua.</p>
        </div>
      </section>

      <div className="container mx-auto px-4">
        <AdSlot posicion="bottom-banner" />
      </div>
    </>
  );
}
