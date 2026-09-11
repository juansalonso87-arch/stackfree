import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { ImageOff, Repeat } from "lucide-react";

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
 *
 * VARIANTES (SEO programático): una herramienta puede tener varias páginas
 * con su propia URL, título y texto ("convertir webp a jpg", "convertir png
 * a jpg"...) que comparten el mismo componente. Cada variante le pasa al
 * componente un objeto `opciones` con valores preconfigurados.
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

/** Valores simples que una variante le pasa al componente (deben ser serializables). */
export type OpcionesVariante = Record<string, string | number | boolean>;

/** Props que recibe el componente de cualquier herramienta. */
export interface PropsHerramienta {
  opciones?: OpcionesVariante;
}

export interface VarianteHerramienta {
  /** Slug propio: /herramientas/<slug>. */
  slug: string;
  h1: string;
  subtitulo: string;
  tituloSeo: string;
  descripcionSeo: string;
  keywords: string[];
  /** Si no se define, se usa la FAQ de la herramienta principal. */
  faq?: PreguntaFrecuente[];
  /** Texto corto para enlazar esta variante desde sus "hermanas". */
  etiqueta: string;
  opciones: OpcionesVariante;
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
  /** Páginas SEO adicionales que reutilizan este componente. */
  variantes?: VarianteHerramienta[];
  /**
   * Carga "a pedido" del componente de la herramienta.
   * Se usa `import()` dinámico para que el JS de cada herramienta viaje en
   * un paquete separado y NO se descargue en el homepage ni en otras páginas.
   */
  cargar: () => Promise<{ default: ComponentType<PropsHerramienta> }>;
}

/* ------------------------------------------------------------------ */
/* Variantes de "Convertir imagen": una página por par de formatos.     */
/* ------------------------------------------------------------------ */

const FORMATOS_IMAGEN = {
  png: { nombre: "PNG", mime: "image/png", rasgo: "conserva la transparencia y no pierde calidad" },
  jpg: { nombre: "JPG", mime: "image/jpeg", rasgo: "pesa poco y lo acepta cualquier sitio o programa" },
  webp: { nombre: "WEBP", mime: "image/webp", rasgo: "pesa hasta un 30% menos que JPG con la misma calidad" },
} as const;

type ClaveFormato = keyof typeof FORMATOS_IMAGEN;

const PARES_CONVERSION: [ClaveFormato, ClaveFormato][] = [
  ["webp", "jpg"],
  ["webp", "png"],
  ["png", "jpg"],
  ["jpg", "png"],
  ["jpg", "webp"],
  ["png", "webp"],
];

function varianteConversion(de: ClaveFormato, a: ClaveFormato): VarianteHerramienta {
  const DE = FORMATOS_IMAGEN[de].nombre;
  const A = FORMATOS_IMAGEN[a].nombre;
  return {
    slug: `convertir-${de}-a-${a}`,
    etiqueta: `${DE} a ${A}`,
    h1: `Convertir ${DE} a ${A} gratis online`,
    subtitulo: `Pasa tus imágenes de ${DE} a ${A} en segundos, sin instalar programas y sin subir nada a internet. Puedes convertir varias a la vez.`,
    tituloSeo: `Convertir ${DE} a ${A} gratis online, sin subir archivos`,
    descripcionSeo: `Convierte imágenes ${DE} a ${A} gratis y sin límites. Varias a la vez, sin registro y sin subir tus fotos: todo ocurre en tu navegador.`,
    keywords: [
      `convertir ${de} a ${a}`,
      `${de} a ${a} online gratis`,
      `pasar ${de} a ${a}`,
      `cambiar formato ${de} a ${a}`,
      `convertidor ${de} a ${a}`,
    ],
    faq: [
      {
        pregunta: `¿Por qué convertir ${DE} a ${A}?`,
        respuesta: `${A} ${FORMATOS_IMAGEN[a].rasgo}. ${DE} ${FORMATOS_IMAGEN[de].rasgo}, pero no siempre es el formato que necesitas para subir a una web, un formulario o un programa.`,
      },
      {
        pregunta: "¿Se pierde calidad al convertir?",
        respuesta:
          a === "png"
            ? "No. PNG es un formato sin pérdida: la imagen convertida es idéntica píxel a píxel a la original."
            : `${A} comprime la imagen. Con la calidad por defecto (90%) la diferencia es imperceptible a simple vista; puedes ajustarla antes de convertir.`,
      },
      {
        pregunta: "¿Puedo convertir varias imágenes a la vez?",
        respuesta:
          "Sí. Arrastra todas las que quieras (hasta 50) y descárgalas una por una o todas juntas en un archivo ZIP.",
      },
      {
        pregunta: "¿Mis imágenes se suben a algún servidor?",
        respuesta:
          "No. La conversión la hace tu propio navegador. Tus archivos no salen de tu dispositivo en ningún momento.",
      },
    ],
    opciones: { formatoSalida: FORMATOS_IMAGEN[a].mime, formatoEntrada: FORMATOS_IMAGEN[de].mime },
  };
}

/* ------------------------------------------------------------------ */
/* Lista de herramientas                                                */
/* ------------------------------------------------------------------ */

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
    estado: "activa",
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
          "La primera vez el navegador descarga el modelo de inteligencia artificial (entre 40 y 80 MB según tu dispositivo). Las siguientes veces ya queda guardado en el navegador y el proceso tarda solo unos segundos.",
      },
    ],
    cargar: () => import("@/components/tools/quitar-fondo/QuitarFondoTool"),
  },
  {
    slug: "convertir-imagen",
    nombre: "Convertir formato de imagen",
    h1: "Convertir imágenes a PNG, JPG o WEBP gratis online",
    subtitulo:
      "Cambia el formato de tus imágenes en segundos: PNG, JPG y WEBP en cualquier dirección. Varias a la vez, sin registro y sin subir nada a internet.",
    tituloSeo: "Convertir imagen a PNG, JPG o WEBP gratis online",
    descripcionSeo:
      "Convertidor de imágenes gratis: PNG a JPG, WEBP a JPG, JPG a PNG y más. Varias imágenes a la vez, sin límites y sin subir tus archivos.",
    descripcionCorta:
      "Cambia imágenes entre PNG, JPG y WEBP, varias a la vez, con control de calidad.",
    keywords: [
      "convertir imagen online gratis",
      "convertidor de imagenes",
      "cambiar formato de imagen",
      "convertir png a jpg",
      "convertir webp a jpg",
      "convertir jpg a png",
      "convertir imagen a webp",
    ],
    icono: Repeat,
    categoria: "conversion",
    estado: "activa",
    formatosEntrada: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"],
    pasos: [
      "Arrastra una o varias imágenes (PNG, JPG, WEBP, GIF, BMP o AVIF) al recuadro.",
      "Elige el formato de salida y, si es JPG o WEBP, la calidad que quieres.",
      "Toca “Convertir”. Tu navegador hace el trabajo al instante.",
      "Descarga cada imagen o todas juntas en un ZIP.",
    ],
    faq: [
      {
        pregunta: "¿Qué formatos puedo convertir?",
        respuesta:
          "Puedes subir PNG, JPG, WEBP, GIF, BMP y AVIF, y convertirlos a PNG, JPG o WEBP. Los GIF animados se convierten usando su primer cuadro.",
      },
      {
        pregunta: "¿Se pierde calidad al convertir?",
        respuesta:
          "A PNG no se pierde nada. A JPG o WEBP la imagen se comprime: con la calidad por defecto (90%) la diferencia es imperceptible, y puedes ajustarla antes de convertir.",
      },
      {
        pregunta: "¿Qué pasa con la transparencia al pasar a JPG?",
        respuesta:
          "JPG no admite transparencia, así que las zonas transparentes se rellenan de blanco. Si necesitas conservarla, elige PNG o WEBP.",
      },
      {
        pregunta: "¿Mis imágenes se suben a algún servidor?",
        respuesta:
          "No. La conversión la hace tu propio navegador. Tus archivos no salen de tu dispositivo en ningún momento.",
      },
    ],
    variantes: PARES_CONVERSION.map(([de, a]) => varianteConversion(de, a)),
    cargar: () => import("@/components/tools/convertir-imagen/ConvertirImagenTool"),
  },
];

/* ------------------------------------------------------------------ */
/* Helpers: funciones chicas para consultar el registry desde el resto */
/* del código sin repetir lógica.                                       */
/* ------------------------------------------------------------------ */

export function obtenerHerramienta(slug: string): Herramienta | undefined {
  return herramientas.find((h) => h.slug === slug);
}

/**
 * Resuelve cualquier slug (de herramienta o de variante) a la página que hay
 * que mostrar, con los textos ya combinados.
 */
export interface PaginaHerramienta {
  herramienta: Herramienta;
  variante?: VarianteHerramienta;
  slug: string;
  h1: string;
  subtitulo: string;
  tituloSeo: string;
  descripcionSeo: string;
  keywords: string[];
  faq: PreguntaFrecuente[];
  opciones?: OpcionesVariante;
}

export function obtenerPagina(slug: string): PaginaHerramienta | undefined {
  for (const herramienta of herramientas) {
    if (herramienta.slug === slug) {
      return {
        herramienta,
        slug,
        h1: herramienta.h1,
        subtitulo: herramienta.subtitulo,
        tituloSeo: herramienta.tituloSeo,
        descripcionSeo: herramienta.descripcionSeo,
        keywords: herramienta.keywords,
        faq: herramienta.faq,
      };
    }
    const variante = herramienta.variantes?.find((v) => v.slug === slug);
    if (variante) {
      return {
        herramienta,
        variante,
        slug,
        h1: variante.h1,
        subtitulo: variante.subtitulo,
        tituloSeo: variante.tituloSeo,
        descripcionSeo: variante.descripcionSeo,
        keywords: variante.keywords,
        faq: variante.faq ?? herramienta.faq,
        opciones: variante.opciones,
      };
    }
  }
  return undefined;
}

/** Todos los slugs que deben existir como página (herramientas + variantes). */
export function todosLosSlugs(): string[] {
  return herramientas.flatMap((h) => [h.slug, ...(h.variantes ?? []).map((v) => v.slug)]);
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
