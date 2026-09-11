import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { nombresCategoria, rutaHerramienta, type Herramienta } from "@/lib/tools-registry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Tarjeta de una herramienta en la grilla del homepage.
 * Es un componente de servidor: no tiene interactividad propia, solo un link.
 */
export function ToolCard({ herramienta }: { herramienta: Herramienta }) {
  const Icono = herramienta.icono;
  const proximamente = herramienta.estado === "proximamente";

  return (
    <Link
      href={rutaHerramienta(herramienta.slug)}
      className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`${herramienta.nombre}${proximamente ? " (próximamente)" : ""}`}
    >
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:ring-primary/40 group-hover:shadow-md">
        <CardHeader>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icono className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <Badge variant="outline">{nombresCategoria[herramienta.categoria]}</Badge>
              {proximamente && <Badge variant="secondary">Próximamente</Badge>}
            </div>
          </div>
          <CardTitle className="text-lg">{herramienta.nombre}</CardTitle>
          <CardDescription>{herramienta.descripcionCorta}</CardDescription>
        </CardHeader>
        <CardContent className="mt-auto">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {proximamente ? "Ver detalles" : "Usar herramienta"}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
