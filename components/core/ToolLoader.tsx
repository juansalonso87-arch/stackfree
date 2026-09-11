"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { herramientas } from "@/lib/tools-registry";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function EsqueletoHerramienta() {
  return (
    <Card aria-busy="true" aria-label="Cargando herramienta">
      <CardContent className="space-y-3">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </CardContent>
    </Card>
  );
}

/**
 * Mapa slug → componente "perezoso".
 *
 * `dynamic()` con `ssr: false` hace dos cosas importantes:
 *   1. Cada herramienta viaja en su propio archivo JS, que solo se descarga
 *      cuando alguien entra a esa página (code-splitting).
 *   2. El componente nunca se ejecuta en el servidor, así las librerías que
 *      usan APIs del navegador (canvas, WebAssembly) no rompen el build.
 *
 * Se construye una sola vez al cargar el módulo, leyendo el registry, por
 * eso agregar una herramienta nueva no requiere tocar este archivo.
 */
const componentesPorSlug: Record<string, ComponentType> = Object.fromEntries(
  herramientas.map((h) => [
    h.slug,
    dynamic(h.cargar, { ssr: false, loading: EsqueletoHerramienta }),
  ]),
);

export function ToolLoader({ slug }: { slug: string }) {
  const Herramienta = componentesPorSlug[slug];
  if (!Herramienta) return null;
  return <Herramienta />;
}
