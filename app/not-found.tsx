import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="container mx-auto flex flex-col items-center px-4 py-24 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" aria-hidden="true" />
      </div>
      <h1 className="font-heading text-3xl font-bold tracking-tight">Página no encontrada</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        La dirección que escribiste no existe o la herramienta cambió de lugar.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button nativeButton={false} render={<Link href="/" />}>
          Volver al inicio
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/administracion" />}>
          Ver herramientas de administración
        </Button>
      </div>
    </section>
  );
}
