import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { ImageOff } from "lucide-react";

/**
 * REGISTRY DE HERRAMIENTAS
 * ------------------------
 * Este es el ÚNICO lugar donde se declara qué herramientas existen.
 *
 * Para agregar una herramienta nueva:
 *   1. Crear la carpeta `components/tools/<nombre>/` con:
 *        - `<Nombre>Tool.tsx`  → la interfaz (componente de cliente)
 *        - `logic.ts`          → la lógica de procesamiento, aislada
 *   2. Agregar una entrada al array `herramientas` de abajo.
 *
 * Con eso alcanza: el homepage, la página de la herramienta, el sitemap,
 * el footer y el SEO se generan solos leyendo este archivo.
 */

export type CategoriaHerramienta = "imagen" | "pdf" | "conversion";

/**
 * - `activa`: se muestra, se indexa en Google y aparece en el sitemap.
 * - `proximamente`: se muestra en el homepage con una etiqueta, pero la página
 *   lleva `noindex` y no entra al sitemap (Google no indexa páginas vacías).
 */
export type EstadoHerramienta = "activa" | "proximamente";

export interface PreguntaFrecuente {
  pregunta: string;
  respuesta: string;
}

export interface Herramienta {
  /** Parte final de la URL: /herramientas/<slug>. Solo minúsculas y guiones. */
  slug: string;
  /** Nombre corto para tarjetas y menús. */
  nombre: string;
  /** Título que ve el usuario en la página (H1). Debe incluir la keyword principal. */
  h1: string;
  /** Texto de apoyo debajo del H1. */
  subtitulo: string;
  /** <title> de la pestaña y de Google (ideal: 50-60 caracteres). */
  tituloSeo: string;
  /** Meta description (ideal: 120-155 caracteres). */
  descripcionSeo: string;
  /** Descripción de una línea para la tarjeta del homepage. */
  descripcionCorta: string;
  /** Keywords long-tail en español que queremos posicionar. */
  keywords: string[];
  icono: LucideIcon;
  categoria: CategoriaHerramienta;
  estado: EstadoHerramienta;
  /** Tipos MIME que acepta la herramienta (se muestran al usuario). */
  formatosEntrada: string[];
  /** Pasos de uso, en orden. Se muestran como lista numerada. */
  pasos: string[];
  /** 3-4 preguntas. Se muestran en la página y se envían a Google como FAQPage. */
  faq: PreguntaFrecuente[];
  /**
   * Carga "a pedido" del componente de la herramienta.
   * Se usa `import()` dinámico para que el JS de cada herramienta viaje en
   * un paquete separado y NO se descargue en el homepage ni en otras páginas.
   */
  cargar: () => Promise<{ default: ComponentType }>;
}

export const herramientas: Herramienta[] = [
  {
    slug: "quitar-fondo-imagen",
    nombre: "Quitar fondo de imagen",
    h1: "Quitar fondo de imagen gratis online",
    subtitulo:
      "Elimina el fondo de cualquier foto en segundos o ponle un fondo blanco. Sin marca de agua, sin registro y sin subir tu imagen a ningún servidor.",
    tituloSeo: "Quitar fondo de imagen gratis online, sin marca de agua",
    descripcionSeo:
      "Quita el fondo de una foto gratis y sin marca de agua. También puedes poner fondo blanco. Procesamiento 100% en tu navegador: tus imágenes nunca se suben.",
    descripcionCorta:
      "Elimina el fondo de una foto o ponle fondo blanco, con inteligencia artificial y sin subir nada.",
    keywords: [
      "quitar fondo de imagen gratis online",
      "quitar fondo de imagen",
      "eliminar fondo de foto sin marca de agua",
      "poner fondo blanco a una foto gratis",
      "fondo blanco foto online",
      "quitar fondo png",
      "borrar fondo de imagen",
    ],
    icono: ImageOff,
    categoria: "imagen",
    estado: "proximamente",
    formatosEntrada: ["image/png", "image/jpeg", "image/webp"],
    pasos: [
      "Sube tu imagen (PNG, JPG o WEBP) arrastrándola o tocando el recuadro.",
      "Espera unos segundos mientras la inteligencia artificial detecta el fondo. Todo ocurre en tu navegador.",
      "Elige entre fondo transparente (PNG) o fondo blanco (JPG).",
      "Descarga el resultado. Listo, sin marcas de agua ni límites.",
    ],
    faq: [
      {
        pregunta: "¿Es realmente gratis y sin marca de agua?",
        respuesta:
          "Sí. La herramienta es 100% gratuita, no agrega marcas de agua y no tiene límite de usos. El sitio se financia con publicidad.",
      },
      {
        pregunta: "¿Mis fotos se suben a algún servidor?",
        respuesta:
          "No. El procesamiento se hace completamente en tu navegador con inteligencia artificial que corre en tu dispositivo. Tu imagen nunca sale de tu computadora o celular.",
      },
      {
        pregunta: "¿Qué formatos de imagen puedo usar?",
        respuesta:
          "Puedes subir imágenes PNG, JPG/JPEG y WEBP. El resultado se descarga como PNG con fondo transparente o como JPG con fondo blanco.",
      },
      {
        pregunta: "¿Por qué tarda un poco la primera vez?",
        respuesta:
          "La primera vez el navegador descarga el modelo de inteligencia artificial (unos 40 MB). Las siguientes veces ya queda guardado y el proceso es mucho más rápido.",
      },
    ],
    cargar: () => import("@/components/tools/quitar-fondo/QuitarFondoTool"),
  },
];

/* ------------------------------------------------------------------ */
/* Helpers: funciones chicas para consultar el registry desde el resto */
/* del código sin repetir lógica.                                       */
/* ------------------------------------------------------------------ */

export function obtenerHerramienta(slug: string): Herramienta | undefined {
  return herramientas.find((h) => h.slug === slug);
}

export function herramientasActivas(): Herramienta[] {
  return herramientas.filter((h) => h.estado === "activa");
}

export function rutaHerramienta(slug: string): string {
  return `/herramientas/${slug}`;
}

export const nombresCategoria: Record<CategoriaHerramienta, string> = {
  imagen: "Imágenes",
  pdf: "PDF",
  conversion: "Conversión",
};
