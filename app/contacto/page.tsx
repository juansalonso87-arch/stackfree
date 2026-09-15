import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { herramientas } from "@/lib/tools-registry";
import { FormularioContacto } from "@/components/core/FormularioContacto";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Contacto: reportá un error o pedí un banco",
  description: `Escribinos para reportar un error, pedir un banco o una herramienta nueva, o hacer una sugerencia. Leemos todos los mensajes.`,
  alternates: { canonical: "/contacto" },
};

/** Se muestra un instante mientras el formulario lee los parámetros de la URL. */
function EsqueletoFormulario() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando formulario">
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}

export default function PaginaContacto() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-8">
      <nav aria-label="Migas de pan" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Inicio
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">
          Contacto
        </span>
      </nav>

      <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        Contanos qué viste: nos ayuda a mejorar
      </h1>
      <p className="mt-3 text-lg text-muted-foreground text-pretty">
        Los analizadores se afinan con archivos reales, y cada banco cambia sus exportaciones sin avisar. Si algo no se
        leyó, un movimiento quedó mal clasificado, un control no cerró o simplemente te pareció raro, escribinos: con dos
        líneas alcanza. Leemos y respondemos todos los mensajes.
      </p>

      <div className="mt-8 rounded-xl border p-5 sm:p-6">
        {/* El formulario lee ?motivo=&herramienta=&contexto= de la URL, por eso va dentro de Suspense (página estática). */}
        <Suspense fallback={<EsqueletoFormulario />}>
          <FormularioContacto
            claveFormulario={siteConfig.claveFormularioContacto}
            emailContacto={siteConfig.emailContacto}
            herramientas={herramientas.map((h) => ({ slug: h.slug, nombre: h.nombre }))}
          />
        </Suspense>
      </div>

      <section className="mt-10 space-y-3 text-sm text-muted-foreground">
        <h2 className="font-heading text-base font-semibold text-foreground">Para reportar un error, lo que más ayuda</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Qué herramienta usaste y desde qué banco o plataforma bajaste el archivo (y desde qué menú).</li>
          <li>Qué mensaje te mostró la página, o qué salió distinto de lo esperado.</li>
          <li>Con qué navegador y dispositivo (por ejemplo, Chrome en Windows, Safari en iPhone).</li>
          <li>
            Si podés, un archivo de ejemplo <strong>sin datos reales</strong> (podés dejar tres o cuatro filas y cambiar los
            importes). Nunca nos mandes un extracto real.
          </li>
        </ul>
        <p>
          Si llegaste desde una herramienta, el mensaje ya trae un resumen técnico del análisis (cantidades y controles,
          sin importes): no hace falta que lo completes vos.
        </p>
      </section>
    </article>
  );
}
