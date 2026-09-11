import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <Button className="mt-6" nativeButton={false} render={<Link href="/" />}>
        Volver al inicio
      </Button>
    </section>
  );
}
