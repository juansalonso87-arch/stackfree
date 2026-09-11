import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
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
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          {siteConfig.nombre}
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
          <Link
            href="/#herramientas"
            className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Herramientas
          </Link>
          <span className="hidden items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Sin subir archivos
          </span>
        </nav>
      </div>
    </header>
  );
}
