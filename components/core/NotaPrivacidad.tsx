import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nota al pie de cada herramienta: qué pasó con el archivo y el enlace a la
 * página que explica cómo comprobarlo uno mismo. Está en un solo lugar para que
 * todas las herramientas digan lo mismo y siempre ofrezcan la comprobación.
 */
export function NotaPrivacidad({ texto, className }: { texto: string; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>
        {texto}{" "}
        <Link href="/verificar-privacidad" className="underline underline-offset-2 hover:text-foreground">
          Cómo comprobarlo
        </Link>
      </span>
    </p>
  );
}
