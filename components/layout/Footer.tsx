import Link from "next/link";
import { siteConfig } from "@/lib/site-config";
import { herramientas, rutaHerramienta } from "@/lib/tools-registry";

const enlacesLegales = [
  { href: "/legal/privacidad", label: "Política de privacidad" },
  { href: "/legal/cookies", label: "Política de cookies" },
  { href: "/legal/terminos", label: "Términos de uso" },
];

export function Footer() {
  const anio = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="container mx-auto grid gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 lg:col-span-2">
          <p className="font-heading text-base font-semibold">{siteConfig.nombre}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Herramientas gratuitas que se ejecutan en tu navegador. Tus archivos nunca se
            suben a ningún servidor: la privacidad no es una opción, es cómo funcionamos.
          </p>
        </div>

        <nav aria-label="Herramientas" className="space-y-2">
          <p className="text-sm font-semibold">Herramientas</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {herramientas.map((h) => (
              <li key={h.slug}>
                <Link href={rutaHerramienta(h.slug)} className="hover:text-foreground hover:underline">
                  {h.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal" className="space-y-2">
          <p className="text-sm font-semibold">Legal</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {enlacesLegales.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="hover:text-foreground hover:underline">
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="container mx-auto px-4 py-4 text-xs text-muted-foreground">
          © {anio} {siteConfig.nombre}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
