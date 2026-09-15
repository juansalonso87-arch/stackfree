"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { slugDesdeRuta, urlContacto, type MotivoContacto } from "@/lib/contacto";

interface Props {
  /**
   * Resumen técnico (sin importes ni datos personales) que llega ya escrito
   * al formulario, así el usuario solo agrega qué le pareció raro.
   */
  contexto?: string;
  motivo?: MotivoContacto;
  /** Slug de la herramienta; si no se pasa, se deduce de la URL actual. */
  slug?: string;
  /**
   * - `tarjeta`: caja destacada con título, texto y botón (resultados).
   * - `linea`: una sola frase con enlace (estado de error, pies de página).
   */
  variante?: "tarjeta" | "linea";
  titulo?: string;
  texto?: string;
  etiquetaBoton?: string;
  className?: string;
}

/**
 * Invitación a contar qué salió mal o qué se vio raro. Mientras los
 * analizadores se afinan con archivos reales, cada devolución vale más que
 * cualquier prueba nuestra: por eso se muestra en el resultado, en los
 * errores y al pie de las herramientas de administración.
 */
export function PedidoDevolucion({
  contexto,
  motivo = "error",
  slug,
  variante = "tarjeta",
  titulo = "¿Algo no cuadra o te pareció raro?",
  texto = "Estamos afinando esta herramienta con archivos reales. Si un movimiento quedó mal clasificado, un control no cerró o el archivo no se leyó, contanos en dos líneas: lo corregimos para todos.",
  etiquetaBoton = "Contar qué pasó",
  className,
}: Props) {
  const ruta = usePathname();
  const href = urlContacto({ motivo, herramienta: slug ?? slugDesdeRuta(ruta), contexto });

  if (variante === "linea") {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {texto}{" "}
        <Link href={href} className="font-medium text-foreground underline underline-offset-2">
          {etiquetaBoton}
        </Link>
      </p>
    );
  }

  return (
    <aside
      aria-label="Enviar una devolución"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
        <MessageSquareWarning className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{texto}</p>
      </div>
      <Button nativeButton={false} render={<Link href={href} />} className="shrink-0 self-start sm:self-center">
        <MessageSquareWarning data-icon="inline-start" />
        {etiquetaBoton}
      </Button>
    </aside>
  );
}
