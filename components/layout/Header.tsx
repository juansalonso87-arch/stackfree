import Link from "next/link";
import { MessageSquareWarning, Sheet, ShieldCheck } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md font-heading text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sheet className="size-4" aria-hidden="true" />
          </span>
          {siteConfig.nombre}
        </Link>

        {/* En celular el ancho es justo: "Herramientas" aparece desde tablet (queda en la home y el footer) y contacto es solo ícono. */}
        <nav aria-label="Principal" className="flex items-center gap-0.5 text-sm sm:gap-1">
          <Link
            href="/administracion"
            className="rounded-md px-2 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
          >
            Administración
          </Link>
          <Link
            href="/herramientas"
            className="hidden rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-block"
          >
            Herramientas
          </Link>
          {/* Contacto siempre a la vista: mientras validamos con archivos reales, cada reporte cuenta. */}
          <Link
            href="/contacto"
            title="Reportar algo raro o escribirnos"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-1.5 font-medium text-amber-900 transition-colors hover:bg-amber-100 sm:px-2.5"
          >
            <MessageSquareWarning className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Reportar algo raro</span>
          </Link>
          {/* La promesa del sitio lleva a la página que explica cómo comprobarla. */}
          <Link
            href="/verificar-privacidad"
            title="Cómo comprobar que tus archivos no salen de tu dispositivo"
            className="hidden items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
          >
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Sin subir archivos
          </Link>
        </nav>
      </div>
    </header>
  );
}
