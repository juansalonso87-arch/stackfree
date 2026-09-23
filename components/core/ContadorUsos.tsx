"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { slugDesdeRuta } from "@/lib/contacto";
import {
  MINIMO_PARA_MOSTRAR,
  alRegistrarUso,
  formatearUsos,
  leerUsos,
} from "@/lib/contador";

/** Duración de la animación del número, en milisegundos. */
const ANIMACION = 900;

/** Suaviza el conteo: arranca rápido y frena al final. */
const suavizar = (t: number) => 1 - Math.pow(1 - t, 3);

interface Props {
  /** Slug de la herramienta; si no se pasa, se deduce de la URL actual. */
  slug?: string;
  className?: string;
}

/**
 * Insignia con la cantidad de veces que se usó la herramienta.
 *
 * Es prueba social honesta: el número sale de usos reales (un archivo
 * procesado de punta a punta) y, mientras sea chico, no se muestra nada —
 * ver `MINIMO_PARA_MOSTRAR` en lib/contador.ts. Si no hay contador
 * configurado en el servidor, tampoco se muestra: no hay número inventado ni
 * hueco en el diseño.
 */
export function ContadorUsos({ slug, className }: Props) {
  const pathname = usePathname();
  const parametros = useSearchParams();
  const herramienta = slug ?? slugDesdeRuta(pathname);
  // Para ver la insignia mientras el sitio es nuevo y el número todavía es chico.
  const forzar = parametros.get("contador") === "1";

  const [usos, setUsos] = useState<number | null>(null);
  const [mostrado, setMostrado] = useState(0);
  const [destacar, setDestacar] = useState(false);

  // Número real: se pide al cargar y se actualiza cuando alguien termina un uso.
  useEffect(() => {
    if (!herramienta) return;
    let vivo = true;
    leerUsos(herramienta).then((r) => {
      if (vivo && r.ok && typeof r.usos === "number") setUsos(r.usos);
    });
    const dejarDeEscuchar = alRegistrarUso((d) => {
      if (!vivo || d.slug !== herramienta) return;
      setUsos(d.usos);
      setDestacar(true);
      window.setTimeout(() => setDestacar(false), 1200);
    });
    return () => {
      vivo = false;
      dejarDeEscuchar();
    };
  }, [herramienta]);

  // El número sube contando, no aparece de golpe. Sin animación si el sistema
  // pide menos movimiento.
  const anterior = useRef(0);
  useEffect(() => {
    if (usos === null) return;
    const desde = anterior.current;
    anterior.current = usos;
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // En una pestaña que está en segundo plano requestAnimationFrame no corre:
    // ahí (y con "menos movimiento" activado) el número se muestra derecho.
    if (reducir || desde === usos || document.hidden) {
      setMostrado(usos);
      return;
    }
    let cuadro = 0;
    const arranque = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - arranque) / ANIMACION);
      setMostrado(Math.round(desde + (usos - desde) * suavizar(t)));
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    // Red de seguridad: si la animación queda a medio camino (la pestaña pasa a
    // segundo plano justo mientras cuenta), el número final igual llega.
    const red = window.setTimeout(() => setMostrado(usos), ANIMACION + 200);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(red);
    };
  }, [usos]);

  if (usos === null || (usos < MINIMO_PARA_MOSTRAR && !forzar)) return null;

  return (
    <Badge
      variant="secondary"
      title="Cada vez que alguien termina de procesar un archivo se suma uno. No guardamos nada del archivo."
      className={cn(
        "bg-emerald-500/10 text-emerald-700 transition-transform dark:bg-emerald-400/10 dark:text-emerald-300",
        destacar && "scale-110",
        className,
      )}
    >
      <Users data-icon="inline-start" aria-hidden="true" />
      <span className="tabular-nums">{formatearUsos(mostrado)}</span>
      <span>{usos === 1 ? "uso" : "usos"}</span>
    </Badge>
  );
}
