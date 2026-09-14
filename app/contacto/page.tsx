import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { herramientas } from "@/lib/tools-registry";
import { FormularioContacto } from "@/components/core/FormularioContacto";

export const metadata: Metadata = {
  title: "Contacto",
  description: `Escribinos para reportar un error, pedir un banco o una herramienta nueva, o hacer una sugerencia. Leemos todos los mensajes.`,
  alternates: { canonical: "/contacto" },
};

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

      <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">Contacto</h1>
      <p className="mt-3 text-lg text-muted-foreground text-pretty">
        ¿Una herramienta no leyó bien tu archivo? ¿Tu banco no está? ¿Se te ocurre algo que te ahorraría trabajo? Contanos:
        cada mensaje nos ayuda a mejorar las herramientas para todos.
      </p>

      <div className="mt-8 rounded-xl border p-5 sm:p-6">
        <FormularioContacto
          claveFormulario={process.env.NEXT_PUBLIC_WEB3FORMS_KEY}
          emailContacto={siteConfig.emailContacto}
          herramientas={herramientas.map((h) => h.nombre)}
        />
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
      </section>
    </article>
  );
}
