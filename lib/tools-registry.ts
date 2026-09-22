import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Crop,
  FileImage,
  FileStack,
  GitCompareArrows,
  HandCoins,
  ImageOff,
  Images,
  Landmark,
  Minimize2,
  ReceiptText,
  Repeat,
  RotateCw,
  Scaling,
  Scissors,
  Smartphone,
  UtensilsCrossed,
} from "lucide-react";

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

export type CategoriaHerramienta = "imagen" | "pdf" | "conversion" | "administracion";

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

/**
 * Video tutorial en YouTube. La página muestra una imagen propia (en /public)
 * con un botón de reproducir y el reproductor de YouTube se carga solo cuando
 * el usuario lo toca: mientras no lo hace, la página no le pide nada a Google.
 */
export interface VideoHerramienta {
  /** ID del video (lo que sigue a `watch?v=` en la URL de YouTube). */
  youtubeId: string;
  titulo: string;
  /** Un párrafo: qué muestra el video. Se ve en la página y va a Google como VideoObject. */
  descripcion: string;
  /** Duración en formato ISO 8601 (por ejemplo "PT5M44S"). */
  duracion: string;
  /** Fecha de publicación (aaaa-mm-dd). */
  publicado: string;
  /** Ruta de la imagen de vista previa dentro de /public (1280×720). */
  miniatura: string;
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
  /** Título de la sección de pasos (por defecto "Cómo <nombre> paso a paso"). */
  tituloPasos?: string;
  /**
   * Guía para obtener el archivo de entrada (por ejemplo, cómo exportar los
   * movimientos desde el home banking). Se muestra como sección propia.
   */
  guiaDescarga?: { titulo: string; pasos: string[]; nota?: string };
  /** 3-4 preguntas. Se muestran en la página y se envían a Google como FAQPage. */
  faq: PreguntaFrecuente[];
  /** Páginas SEO adicionales que reutilizan este componente. */
  variantes?: VarianteHerramienta[];
  /**
   * Ruta (dentro del repo) del script Python equivalente, para quien prefiera
   * correrlo en su PC. Se muestra como enlace en la página de la herramienta.
   */
  scriptPython?: string;
  /** Video tutorial (se muestra debajo de la herramienta y en la portada de su categoría). */
  video?: VideoHerramienta;
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
/* Variantes de "Imagen a PDF": una página por formato de entrada.      */
/* ------------------------------------------------------------------ */

function varianteImagenAPdf(clave: "jpg" | "png"): VarianteHerramienta {
  const F = FORMATOS_IMAGEN[clave].nombre;
  const ejemplo = clave === "jpg" ? "fotos del celular, escaneos y documentos" : "capturas de pantalla, gráficos y diseños";
  return {
    slug: `${clave}-a-pdf`,
    etiqueta: `${F} a PDF`,
    h1: `Convertir ${F} a PDF gratis online`,
    subtitulo: `Convierte una o varias imágenes ${F} en un solo PDF, en el orden que quieras. Sin registro, sin marca de agua y sin subir tus archivos a ningún servidor.`,
    tituloSeo: `Convertir ${F} a PDF gratis online, sin subir archivos`,
    descripcionSeo: `Pasa tus ${F} a PDF gratis: una o varias imágenes en un solo documento, con tamaño A4 o Carta. Todo en tu navegador, sin subir nada.`,
    keywords: [
      `${clave} a pdf`,
      `convertir ${clave} a pdf`,
      `pasar ${clave} a pdf`,
      `${clave} a pdf gratis online`,
      `de ${clave} a pdf sin marca de agua`,
      `varias imagenes ${clave} a un pdf`,
    ],
    faq: [
      {
        pregunta: `¿Puedo juntar varias ${F} en un solo PDF?`,
        respuesta: `Sí. Arrastra todas las imágenes (hasta 50), ordénalas con las flechas y se crea un único PDF con una imagen por página. Ideal para ${ejemplo}.`,
      },
      {
        pregunta: "¿Qué tamaño de página tendrá el PDF?",
        respuesta:
          "Puedes elegir A4, Carta o que cada página tenga el tamaño exacto de la imagen. La orientación (vertical u horizontal) se detecta sola según la imagen, y puedes ajustar los márgenes.",
      },
      {
        pregunta: "¿Se pierde calidad?",
        respuesta:
          "No se nota. Las imágenes se incrustan con calidad alta (equivalente a 300 dpi en A4, calidad de imprenta). Las fotos muy grandes se ajustan a ese tamaño para que el PDF no pese de más.",
      },
      {
        pregunta: "¿Mis fotos o documentos se suben a algún servidor?",
        respuesta:
          "No. El PDF se genera dentro de tu navegador. Tus DNI, comprobantes o fotos personales nunca salen de tu dispositivo.",
      },
    ],
    opciones: { formatoEntrada: FORMATOS_IMAGEN[clave].mime, formatoNombre: F },
  };
}

/* ------------------------------------------------------------------ */
/* Variantes de "Comprimir imagen": una página por formato.             */
/* ------------------------------------------------------------------ */

function varianteComprimir(clave: "jpg" | "png" | "webp"): VarianteHerramienta {
  const F = FORMATOS_IMAGEN[clave].nombre;
  const como =
    clave === "png"
      ? "reduciendo la cantidad de colores de forma inteligente (ideal para capturas, logos e ilustraciones)"
      : "ajustando la calidad de compresión sin que se note a simple vista";
  return {
    slug: `comprimir-${clave}`,
    etiqueta: `Comprimir ${F}`,
    h1: `Comprimir ${F} gratis online`,
    subtitulo: `Reduce el peso de tus imágenes ${F} hasta un 80% sin perder calidad visible. Varias a la vez, sin registro y sin subir nada a internet.`,
    tituloSeo: `Comprimir ${F} online gratis, sin perder calidad`,
    descripcionSeo: `Comprime imágenes ${F} gratis y reduce su peso hasta un 80%. Varias a la vez, sin límites, sin marca de agua y sin subir tus archivos a ningún servidor.`,
    keywords: [
      `comprimir ${clave}`,
      `comprimir ${clave} online`,
      `reducir peso ${clave}`,
      `reducir tamaño ${clave} sin perder calidad`,
      `comprimir imagen ${clave} gratis`,
      `optimizar ${clave}`,
    ],
    faq: [
      {
        pregunta: `¿Cómo se comprime un ${F} sin perder calidad?`,
        respuesta: `La herramienta reduce el peso ${como}. Con el nivel “Equilibrado” la diferencia es imperceptible; si necesitas el archivo más chico posible, elige “Máxima compresión”.`,
      },
      {
        pregunta: "¿Cuánto se reduce el peso?",
        respuesta:
          "Depende de la imagen: fotos y capturas sin optimizar suelen bajar entre un 50% y un 80%. Si la imagen ya estaba optimizada, te lo avisamos y conservamos el original.",
      },
      {
        pregunta: "¿Cambia el tamaño en píxeles?",
        respuesta:
          "No, salvo que actives “Reducir también la resolución”, que achica las imágenes grandes a 2000 px. Eso multiplica el ahorro y es ideal para web, WhatsApp o email.",
      },
      {
        pregunta: "¿Mis imágenes se suben a algún servidor?",
        respuesta: "No. La compresión la hace tu navegador. Tus fotos no salen de tu dispositivo en ningún momento.",
      },
    ],
    opciones: { formatoEntrada: FORMATOS_IMAGEN[clave].mime, formatoNombre: F },
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
  {
    slug: "unir-pdf",
    nombre: "Unir PDF",
    h1: "Unir PDF gratis online",
    subtitulo:
      "Combina varios archivos PDF en uno solo, en el orden que quieras. Sin límite de archivos, sin marca de agua y sin subir tus documentos a ningún servidor.",
    tituloSeo: "Unir PDF gratis online: combinar varios PDF en uno",
    descripcionSeo:
      "Une, combina o junta varios PDF en un solo archivo, gratis y sin límites. Reordena las páginas como quieras. Tus documentos nunca salen de tu navegador.",
    descripcionCorta: "Combina varios PDF en uno solo, en el orden que elijas, sin subir tus documentos.",
    keywords: [
      "unir pdf",
      "unir pdf gratis online",
      "combinar pdf",
      "juntar pdf",
      "fusionar pdf",
      "unir varios pdf en uno",
      "unir pdf sin marca de agua",
    ],
    icono: FileStack,
    categoria: "pdf",
    estado: "activa",
    formatosEntrada: ["application/pdf"],
    pasos: [
      "Arrastra dos o más archivos PDF al recuadro (o tócalo para elegirlos).",
      "Ordénalos con las flechas: el orden de la lista será el orden del documento final.",
      "Toca “Unir PDF”. Tu navegador junta todas las páginas en un solo archivo.",
      "Descarga el PDF unido. Sin marcas de agua ni límites.",
    ],
    faq: [
      {
        pregunta: "¿Cuántos PDF puedo unir a la vez?",
        respuesta:
          "Hasta 50 archivos por vez, de hasta 100 MB cada uno. Como todo se procesa en tu dispositivo, el único límite real es la memoria de tu computadora o celular.",
      },
      {
        pregunta: "¿Mis documentos se suben a algún servidor?",
        respuesta:
          "No. La unión la hace tu propio navegador. Tus contratos, facturas o apuntes nunca salen de tu dispositivo, lo que hace a esta herramienta ideal para documentos confidenciales.",
      },
      {
        pregunta: "¿Se pierde calidad o se modifican los PDF?",
        respuesta:
          "No. Las páginas se copian tal cual, con su texto, imágenes y calidad originales. Solo se crea un archivo nuevo que las contiene a todas.",
      },
      {
        pregunta: "¿Puedo unir PDF protegidos con contraseña?",
        respuesta:
          "No por ahora. Si un PDF tiene contraseña, la herramienta te lo indica en la lista para que le quites la protección antes de unirlo.",
      },
    ],
    cargar: () => import("@/components/tools/unir-pdf/UnirPdfTool"),
  },
  {
    slug: "imagen-a-pdf",
    nombre: "Imagen a PDF",
    h1: "Convertir imagen a PDF gratis online",
    subtitulo:
      "Pasa tus fotos, capturas o escaneos (JPG, PNG, WEBP) a un PDF en segundos. Una o varias imágenes en un solo documento, sin registro y sin subir nada a internet.",
    tituloSeo: "Convertir imagen a PDF gratis online (JPG, PNG, WEBP)",
    descripcionSeo:
      "Convierte fotos e imágenes JPG, PNG o WEBP a PDF gratis. Varias imágenes en un solo PDF, tamaño A4 o Carta, sin marca de agua y sin subir tus archivos.",
    descripcionCorta: "Convierte fotos y capturas en un PDF (una o varias en un solo documento).",
    keywords: [
      "convertir imagen a pdf",
      "imagen a pdf gratis online",
      "pasar foto a pdf",
      "fotos a pdf",
      "jpg a pdf",
      "png a pdf",
      "varias imagenes a un pdf",
    ],
    icono: FileImage,
    categoria: "pdf",
    estado: "activa",
    formatosEntrada: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"],
    pasos: [
      "Arrastra una o varias imágenes al recuadro (JPG, PNG, WEBP, GIF, BMP o AVIF).",
      "Ordénalas con las flechas si son varias: cada imagen será una página.",
      "Elige tamaño de página (A4, Carta o igual a la imagen), orientación y márgenes.",
      "Toca “Crear PDF” y descarga el documento. Sin marcas de agua ni límites.",
    ],
    faq: [
      {
        pregunta: "¿Puedo juntar varias fotos en un solo PDF?",
        respuesta:
          "Sí. Arrastra todas las imágenes (hasta 50), ordénalas con las flechas y se crea un único PDF con una imagen por página. Ideal para enviar documentos escaneados con el celular.",
      },
      {
        pregunta: "¿Qué tamaño de página tendrá el PDF?",
        respuesta:
          "Puedes elegir A4, Carta o que cada página tenga el tamaño exacto de la imagen. La orientación se detecta sola según cada imagen, y puedes ajustar los márgenes.",
      },
      {
        pregunta: "¿Las fotos del celular salen giradas?",
        respuesta:
          "No. La herramienta lee la orientación guardada en la foto y la corrige automáticamente, así el PDF se ve igual que en la galería de tu teléfono.",
      },
      {
        pregunta: "¿Mis fotos o documentos se suben a algún servidor?",
        respuesta:
          "No. El PDF se genera dentro de tu navegador. Tus DNI, comprobantes o fotos personales nunca salen de tu dispositivo.",
      },
    ],
    variantes: [varianteImagenAPdf("jpg"), varianteImagenAPdf("png")],
    cargar: () => import("@/components/tools/imagen-a-pdf/ImagenAPdfTool"),
  },
  {
    slug: "comprimir-imagen",
    nombre: "Comprimir imagen",
    h1: "Comprimir imágenes online gratis sin perder calidad",
    subtitulo:
      "Reduce el peso de tus fotos JPG, PNG y WEBP hasta un 80% para enviarlas más rápido o subirlas a tu web. Varias a la vez, sin registro y sin subir nada a internet.",
    tituloSeo: "Comprimir imagen online gratis (JPG, PNG, WEBP)",
    descripcionSeo:
      "Comprime imágenes JPG, PNG y WEBP gratis: menos peso, misma calidad visible. Varias a la vez, sin límites y sin subir tus fotos a ningún servidor.",
    descripcionCorta: "Reduce el peso de fotos e imágenes hasta un 80% sin que se note.",
    keywords: [
      "comprimir imagen",
      "comprimir imagen online gratis",
      "reducir peso de imagen",
      "reducir tamaño de imagen sin perder calidad",
      "comprimir foto",
      "comprimir jpg",
      "comprimir png",
    ],
    icono: Minimize2,
    categoria: "imagen",
    estado: "activa",
    formatosEntrada: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"],
    pasos: [
      "Arrastra una o varias imágenes al recuadro.",
      "Elige el nivel: Alta calidad, Equilibrado o Máxima compresión. Opcionalmente, reduce también la resolución.",
      "Toca “Comprimir”. Verás el peso antes y después de cada imagen.",
      "Descarga cada imagen o todas juntas en un ZIP.",
    ],
    faq: [
      {
        pregunta: "¿De verdad no se pierde calidad?",
        respuesta:
          "Se pierde muy poca, de forma imperceptible a simple vista. Los formatos JPG y WEBP guardan información que el ojo no distingue; en PNG se reduce la cantidad de colores de forma inteligente. Siempre puedes comparar el antes y el después.",
      },
      {
        pregunta: "¿Cuánto se reduce el peso?",
        respuesta:
          "Depende de la imagen: fotos y capturas sin optimizar suelen bajar entre un 50% y un 80%. Si una imagen ya estaba optimizada, te lo avisamos y conservamos el original.",
      },
      {
        pregunta: "¿Cambia el tamaño en píxeles?",
        respuesta:
          "No, salvo que actives “Reducir también la resolución”, que achica las imágenes de más de 2000 px. Eso multiplica el ahorro y es ideal para web, WhatsApp o email.",
      },
      {
        pregunta: "¿Mis imágenes se suben a algún servidor?",
        respuesta: "No. La compresión la hace tu navegador. Tus fotos no salen de tu dispositivo en ningún momento.",
      },
    ],
    variantes: [varianteComprimir("jpg"), varianteComprimir("png"), varianteComprimir("webp")],
    cargar: () => import("@/components/tools/comprimir-imagen/ComprimirImagenTool"),
  },
  {
    slug: "redimensionar-imagen",
    nombre: "Redimensionar imagen",
    h1: "Redimensionar imagen online gratis",
    subtitulo:
      "Cambia el tamaño de tus imágenes en píxeles o por porcentaje, con medidas listas para redes sociales. Varias a la vez, sin registro y sin subir nada a internet.",
    tituloSeo: "Redimensionar imagen online gratis: cambiar tamaño en píxeles",
    descripcionSeo:
      "Cambia el tamaño de una imagen en píxeles o porcentaje, gratis y sin perder proporción. Medidas para Instagram, HD y Full HD. Todo en tu navegador.",
    descripcionCorta: "Cambia el tamaño en píxeles o porcentaje, con medidas para redes sociales.",
    keywords: [
      "redimensionar imagen",
      "cambiar tamaño de imagen",
      "cambiar tamaño de imagen online",
      "reducir tamaño de imagen en pixeles",
      "agrandar imagen online",
      "cambiar tamaño de foto para instagram",
      "redimensionar imagen sin perder calidad",
    ],
    icono: Scaling,
    categoria: "imagen",
    estado: "activa",
    formatosEntrada: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"],
    pasos: [
      "Arrastra una o varias imágenes al recuadro. Verás el tamaño actual de cada una.",
      "Elige el tamaño nuevo en píxeles (o usa un preset como Full HD o Instagram) o un porcentaje.",
      "Deja marcado “Mantener proporción” para que no se deformen.",
      "Toca “Redimensionar” y descarga las imágenes, una por una o en ZIP.",
    ],
    faq: [
      {
        pregunta: "¿Se deforma la imagen?",
        respuesta:
          "No si dejas activado “Mantener proporción”: la imagen se ajusta dentro del ancho y alto que indiques conservando su forma. Si lo desactivas, se estira exactamente a esas medidas.",
      },
      {
        pregunta: "¿Puedo agrandar una imagen?",
        respuesta:
          "Sí, pero agrandar siempre pierde nitidez porque hay que inventar píxeles que no existen. Por defecto la herramienta no agranda imágenes más chicas que el tamaño pedido; puedes desactivar esa protección.",
      },
      {
        pregunta: "¿Qué medidas uso para redes sociales?",
        respuesta:
          "Instagram: 1080×1080 (cuadrado) o 1080×1920 (historias). Full HD para fondos y videos: 1920×1080. Tienes esos presets listos con un clic.",
      },
      {
        pregunta: "¿Mis imágenes se suben a algún servidor?",
        respuesta: "No. El cambio de tamaño lo hace tu navegador. Tus fotos no salen de tu dispositivo en ningún momento.",
      },
    ],
    cargar: () => import("@/components/tools/redimensionar-imagen/RedimensionarImagenTool"),
  },
  {
    slug: "dividir-pdf",
    nombre: "Dividir PDF",
    h1: "Dividir PDF gratis online: separar o extraer páginas",
    subtitulo:
      "Separa un PDF en páginas individuales o extrae solo las que necesitas (por ejemplo, 1-3 y 7). Sin registro, sin marca de agua y sin subir tu documento a ningún servidor.",
    tituloSeo: "Dividir PDF gratis online: separar y extraer páginas",
    descripcionSeo:
      "Divide un PDF en páginas sueltas o extrae las páginas que quieras en un nuevo PDF. Gratis, sin límites y sin subir tus documentos: todo en tu navegador.",
    descripcionCorta: "Separa un PDF en páginas o extrae solo las que necesitas.",
    keywords: [
      "dividir pdf",
      "separar pdf",
      "separar paginas de un pdf",
      "extraer paginas de un pdf",
      "dividir pdf en paginas",
      "cortar pdf",
      "dividir pdf gratis online",
    ],
    icono: Scissors,
    categoria: "pdf",
    estado: "activa",
    formatosEntrada: ["application/pdf"],
    pasos: [
      "Arrastra tu PDF al recuadro. Verás cuántas páginas tiene.",
      "Elige “Separar todas las páginas” (cada una en un PDF) o “Extraer algunas páginas”.",
      "Si extraes, escribe las páginas: por ejemplo 1-3, 5, 8-10.",
      "Toca el botón y descarga el resultado: un PDF, o un ZIP con todas las páginas.",
    ],
    faq: [
      {
        pregunta: "¿Cómo extraigo solo algunas páginas de un PDF?",
        respuesta:
          "Elige “Extraer algunas páginas” y escribe cuáles quieres, separadas por comas y con guion para rangos: 1-3, 5, 8-10. Se crea un PDF nuevo solo con esas páginas, en ese orden.",
      },
      {
        pregunta: "¿Qué recibo al separar todas las páginas?",
        respuesta:
          "Un archivo ZIP con un PDF por página, numerados en orden (documento-pagina-01.pdf, -02.pdf…). Tu PDF original no se modifica.",
      },
      {
        pregunta: "¿Se pierde calidad?",
        respuesta: "No. Las páginas se copian tal cual, con su texto, imágenes y calidad originales.",
      },
      {
        pregunta: "¿Mis documentos se suben a algún servidor?",
        respuesta:
          "No. Todo ocurre en tu navegador. Contratos, facturas o apuntes nunca salen de tu dispositivo.",
      },
    ],
    variantes: [
      {
        slug: "extraer-paginas-pdf",
        etiqueta: "Extraer páginas",
        h1: "Extraer páginas de un PDF gratis online",
        subtitulo:
          "Elige las páginas que necesitas de un PDF (por ejemplo, 2-4 y 9) y descárgalas como un PDF nuevo. Sin registro y sin subir tu documento a ningún servidor.",
        tituloSeo: "Extraer páginas de un PDF gratis online",
        descripcionSeo:
          "Extrae una o varias páginas de un PDF y guárdalas como un PDF nuevo, gratis y sin límites. Todo en tu navegador, sin subir tus documentos.",
        keywords: [
          "extraer paginas de un pdf",
          "extraer paginas pdf online",
          "sacar paginas de un pdf",
          "guardar una pagina de un pdf",
          "seleccionar paginas de un pdf",
        ],
        opciones: { modo: "rango" },
      },
    ],
    cargar: () => import("@/components/tools/dividir-pdf/DividirPdfTool"),
  },
  {
    slug: "rotar-pdf",
    nombre: "Rotar PDF",
    h1: "Rotar PDF gratis online: girar páginas y guardar",
    subtitulo:
      "Gira un PDF 90° o 180°, todas las páginas o solo algunas, y descárgalo ya rotado para siempre. Sin registro, sin marca de agua y sin subir tu documento a ningún servidor.",
    tituloSeo: "Rotar PDF gratis online: girar páginas y guardar",
    descripcionSeo:
      "Rota o gira las páginas de un PDF (90° a la derecha, a la izquierda o 180°) y guárdalo rotado de forma permanente. Gratis, sin límites y sin subir tus documentos.",
    descripcionCorta: "Gira las páginas de un PDF y guárdalo rotado de forma permanente.",
    keywords: [
      "rotar pdf",
      "girar pdf",
      "rotar pdf online gratis",
      "girar paginas de un pdf",
      "rotar pdf y guardar",
      "rotar una pagina de un pdf",
      "pdf al reves como girarlo",
    ],
    icono: RotateCw,
    categoria: "pdf",
    estado: "activa",
    formatosEntrada: ["application/pdf"],
    pasos: [
      "Arrastra tu PDF al recuadro. Verás cuántas páginas tiene.",
      "Elige cuánto girar: 90° a la derecha, 90° a la izquierda o 180°.",
      "Decide si rotar todas las páginas o solo algunas (por ejemplo, 2 y 5-7).",
      "Toca “Rotar PDF” y descarga el documento ya girado.",
    ],
    faq: [
      {
        pregunta: "¿La rotación queda guardada de forma permanente?",
        respuesta:
          "Sí. A diferencia de girar la vista en un visor (que se pierde al cerrarlo), aquí la rotación se escribe dentro del PDF: se verá girado en cualquier programa, celular o al imprimirlo.",
      },
      {
        pregunta: "¿Puedo rotar solo una página?",
        respuesta:
          "Sí. Elige “Solo algunas” y escribe el número de página. También puedes indicar varias separadas por comas o rangos con guion: 2, 5-7.",
      },
      {
        pregunta: "¿Se pierde calidad?",
        respuesta:
          "No. No se re-dibuja nada: solo se cambia la orientación de la página. El texto sigue siendo texto, las imágenes conservan su calidad y el archivo pesa prácticamente lo mismo.",
      },
      {
        pregunta: "¿Mis documentos se suben a algún servidor?",
        respuesta:
          "No. Todo ocurre en tu navegador. Contratos, escaneos o apuntes nunca salen de tu dispositivo.",
      },
    ],
    cargar: () => import("@/components/tools/rotar-pdf/RotarPdfTool"),
  },
  {
    slug: "recortar-imagen",
    nombre: "Recortar imagen",
    h1: "Recortar imagen gratis online",
    subtitulo:
      "Recorta una foto o imagen a la medida que necesitas: libre, cuadrada, 16:9, para Instagram o en círculo. Sin registro y sin subir tus fotos a ningún servidor.",
    tituloSeo: "Recortar imagen gratis online: fotos, JPG y PNG",
    descripcionSeo:
      "Recorta imágenes y fotos online gratis: arrastra el recuadro, elige la proporción (1:1, 4:5, 16:9…) o un círculo y descarga. Todo en tu navegador, sin subir nada.",
    descripcionCorta: "Corta una foto a la medida o proporción que necesitas, o en círculo.",
    keywords: [
      "recortar imagen",
      "recortar foto",
      "recortar imagen online gratis",
      "cortar imagen",
      "recortar png",
      "recortar jpg",
      "recortar foto para instagram",
    ],
    icono: Crop,
    categoria: "imagen",
    estado: "activa",
    formatosEntrada: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"],
    pasos: [
      "Arrastra tu imagen al recuadro (o tócalo para elegirla).",
      "Mueve el recuadro y ajústalo desde los bordes. Si quieres, fija una proporción (1:1, 16:9…) o elige círculo.",
      "Toca “Recortar imagen” y revisa el resultado.",
      "Descárgala. Si no te convence, vuelve a ajustar el recorte sin cargar la imagen de nuevo.",
    ],
    faq: [
      {
        pregunta: "¿Se pierde calidad al recortar?",
        respuesta:
          "No. El recorte se hace sobre la imagen a tamaño real, píxel por píxel. Solo se descarta lo que queda fuera del recuadro; lo que conservas tiene exactamente la calidad original.",
      },
      {
        pregunta: "¿Puedo recortar con una proporción exacta?",
        respuesta:
          "Sí. Elige 1:1 (cuadrada), 4:5 (Instagram), 3:2, 4:3, 16:9 o 9:16 (historias) y el recuadro mantiene esa proporción mientras lo ajustas. Con “Libre” recortas a mano.",
      },
      {
        pregunta: "¿Cómo recorto una foto en círculo?",
        respuesta:
          "Elige la forma “Círculo”. El resultado se guarda como PNG con el exterior transparente, listo para usar como foto de perfil o logo.",
      },
      {
        pregunta: "¿Mis fotos se suben a algún servidor?",
        respuesta:
          "No. El recorte lo hace tu propio navegador. Tus fotos no salen de tu dispositivo en ningún momento.",
      },
    ],
    variantes: [
      {
        slug: "recortar-imagen-circular",
        etiqueta: "En círculo",
        h1: "Recortar imagen en círculo gratis online",
        subtitulo:
          "Convierte cualquier foto en una imagen circular con fondo transparente, ideal para fotos de perfil, avatares y logos. Sin registro y sin subir tus fotos a ningún servidor.",
        tituloSeo: "Recortar imagen en círculo gratis online (PNG transparente)",
        descripcionSeo:
          "Recorta una foto en forma de círculo y descárgala como PNG con fondo transparente. Perfecto para fotos de perfil y avatares. Gratis y sin subir nada.",
        keywords: [
          "recortar imagen en circulo",
          "recortar foto circular",
          "imagen circular png",
          "hacer foto redonda",
          "recortar imagen redonda online",
          "foto de perfil circular",
        ],
        faq: [
          {
            pregunta: "¿El fondo fuera del círculo queda transparente?",
            respuesta:
              "Sí. El resultado es un PNG: todo lo que queda fuera del círculo es transparente, así la imagen se ve redonda sobre cualquier fondo.",
          },
          {
            pregunta: "¿Puedo elegir qué parte de la foto queda dentro del círculo?",
            respuesta:
              "Sí. Mueve el círculo con el mouse o el dedo y agrándalo o achícalo desde los bordes hasta encuadrar lo que quieras.",
          },
          {
            pregunta: "¿Sirve para foto de perfil de WhatsApp, Instagram o LinkedIn?",
            respuesta:
              "Sí. Esas apps ya muestran la foto en círculo, pero recortarla antes te permite elegir exactamente el encuadre. También sirve para avatares, firmas de email o logos redondos.",
          },
          {
            pregunta: "¿Mis fotos se suben a algún servidor?",
            respuesta: "No. Todo ocurre en tu navegador. Tu foto no sale de tu dispositivo en ningún momento.",
          },
        ],
        opciones: { forma: "circulo" },
      },
    ],
    cargar: () => import("@/components/tools/recortar-imagen/RecortarImagenTool"),
  },
  {
    slug: "pdf-a-imagen",
    nombre: "PDF a imagen",
    h1: "Convertir PDF a imagen gratis online (JPG o PNG)",
    subtitulo:
      "Convierte cada página de un PDF en una imagen JPG o PNG, con la calidad que elijas. Todas las páginas o solo algunas. Sin registro y sin subir tu documento a ningún servidor.",
    tituloSeo: "Convertir PDF a imagen gratis online: PDF a JPG o PNG",
    descripcionSeo:
      "Pasa un PDF a imágenes JPG o PNG, una por página, en calidad normal o de imprenta. Gratis, sin límites y sin subir tus documentos: todo en tu navegador.",
    descripcionCorta: "Convierte las páginas de un PDF en imágenes JPG o PNG.",
    keywords: [
      "pdf a imagen",
      "convertir pdf a imagen",
      "pdf a imagen online gratis",
      "pasar pdf a imagen",
      "convertir pagina de pdf a imagen",
      "extraer imagen de pdf",
      "pdf a foto",
    ],
    icono: Images,
    categoria: "conversion",
    estado: "activa",
    formatosEntrada: ["application/pdf"],
    pasos: [
      "Arrastra tu PDF al recuadro. Verás cuántas páginas tiene.",
      "Elige JPG (más liviano) o PNG (sin pérdida) y la calidad: pantalla, buena o imprenta.",
      "Decide si convertir todas las páginas o solo algunas (por ejemplo, 1-3 y 7).",
      "Toca “Convertir” y descarga las imágenes una por una o todas juntas en un ZIP.",
    ],
    faq: [
      {
        pregunta: "¿JPG o PNG: cuál me conviene?",
        respuesta:
          "JPG pesa mucho menos y es ideal para compartir por WhatsApp, mail o redes. PNG no pierde calidad y deja el texto más nítido: elígelo si vas a imprimir, editar o necesitas máxima fidelidad.",
      },
      {
        pregunta: "¿Qué calidad elijo?",
        respuesta:
          "“Buena (150 ppp)” alcanza para casi todo: se lee perfecto en pantalla y pesa poco. “Imprenta (300 ppp)” da el doble de resolución para imprimir o ampliar. “Pantalla (72 ppp)” es la más liviana, para vistas previas o pegar en un chat.",
      },
      {
        pregunta: "¿Puedo convertir solo una página?",
        respuesta:
          "Sí. Elige “Solo algunas” y escribe el número de página. También puedes indicar varias separadas por comas o rangos con guion: 1-3, 7.",
      },
      {
        pregunta: "¿Mis documentos se suben a algún servidor?",
        respuesta:
          "No. El PDF se dibuja en tu propio navegador con la misma tecnología que usa Firefox para mostrar PDF. Tus documentos nunca salen de tu dispositivo.",
      },
    ],
    variantes: [
      {
        slug: "pdf-a-jpg",
        etiqueta: "PDF a JPG",
        h1: "Convertir PDF a JPG gratis online",
        subtitulo:
          "Convierte las páginas de un PDF en imágenes JPG livianas, listas para compartir por WhatsApp, mail o redes. Sin registro y sin subir tu documento a ningún servidor.",
        tituloSeo: "Convertir PDF a JPG gratis online, sin subir archivos",
        descripcionSeo:
          "Pasa un PDF a JPG gratis: una imagen por página, con la calidad que elijas. Todas las páginas o solo algunas. Sin límites y sin subir tus documentos.",
        keywords: ["pdf a jpg", "convertir pdf a jpg", "pdf a jpg online gratis", "pasar pdf a jpg", "pdf a jpeg", "transformar pdf a jpg"],
        opciones: { formato: "image/jpeg" },
      },
      {
        slug: "pdf-a-png",
        etiqueta: "PDF a PNG",
        h1: "Convertir PDF a PNG gratis online",
        subtitulo:
          "Convierte las páginas de un PDF en imágenes PNG sin pérdida de calidad, ideales para texto nítido, presentaciones y edición. Sin registro y sin subir tu documento a ningún servidor.",
        tituloSeo: "Convertir PDF a PNG gratis online, sin subir archivos",
        descripcionSeo:
          "Pasa un PDF a PNG gratis y sin pérdida de calidad: una imagen por página, en resolución de pantalla o de imprenta. Todo en tu navegador, sin subir nada.",
        keywords: ["pdf a png", "convertir pdf a png", "pdf a png online gratis", "pasar pdf a png", "pdf a png alta calidad", "transformar pdf a png"],
        opciones: { formato: "image/png" },
      },
    ],
    cargar: () => import("@/components/tools/pdf-a-imagen/PdfAImagenTool"),
  },
  {
    slug: "heic-a-jpg",
    nombre: "HEIC a JPG",
    h1: "Convertir HEIC a JPG gratis online",
    subtitulo:
      "Convierte las fotos HEIC de tu iPhone a JPG para abrirlas en cualquier PC, Android o sitio web. Varias a la vez, sin registro y sin subir tus fotos a ningún servidor.",
    tituloSeo: "Convertir HEIC a JPG gratis online, sin subir tus fotos",
    descripcionSeo:
      "Pasa fotos HEIC (iPhone) a JPG gratis y sin límites. Varias a la vez, con la calidad que elijas. Todo se procesa en tu navegador: tus fotos no se suben a ningún lado.",
    descripcionCorta: "Pasa las fotos HEIC del iPhone a JPG, PNG o WEBP.",
    keywords: [
      "heic a jpg",
      "convertir heic a jpg",
      "heic a jpg online gratis",
      "pasar heic a jpg",
      "abrir heic en windows",
      "convertir fotos de iphone a jpg",
      "heic a jpeg",
    ],
    icono: Smartphone,
    categoria: "conversion",
    estado: "activa",
    formatosEntrada: ["image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"],
    pasos: [
      "Arrastra tus fotos HEIC al recuadro (o tócalo para elegirlas, hasta 50 a la vez).",
      "Elige JPG (o PNG / WEBP) y, si quieres, ajusta la calidad.",
      "Toca “Convertir”. La primera vez se descarga el decodificador (menos de 1 MB).",
      "Descarga las fotos una por una o todas juntas en un ZIP.",
    ],
    faq: [
      {
        pregunta: "¿Qué es un archivo HEIC y por qué no puedo abrirlo?",
        respuesta:
          "HEIC es el formato con el que el iPhone guarda las fotos desde iOS 11: ocupa la mitad que JPG con la misma calidad. El problema es que Windows, muchos Android y la mayoría de los sitios web no lo aceptan. Convertirlo a JPG resuelve eso.",
      },
      {
        pregunta: "¿Se pierde calidad al convertir HEIC a JPG?",
        respuesta:
          "Con la calidad por defecto (90%) la diferencia es imperceptible. Si necesitas fidelidad total, elige PNG: no comprime con pérdida, aunque el archivo pesa bastante más.",
      },
      {
        pregunta: "¿Puedo evitar que el iPhone guarde en HEIC?",
        respuesta:
          "Sí: en Ajustes → Cámara → Formatos, elige “Más compatible” y las fotos nuevas se guardarán en JPG. Esta herramienta sirve para las que ya tienes en HEIC.",
      },
      {
        pregunta: "¿Mis fotos se suben a algún servidor?",
        respuesta:
          "No. La conversión ocurre en tu navegador: se descarga un pequeño decodificador y tus fotos nunca salen de tu dispositivo. Ideal para fotos personales.",
      },
    ],
    variantes: [
      {
        slug: "heic-a-png",
        etiqueta: "HEIC a PNG",
        h1: "Convertir HEIC a PNG gratis online",
        subtitulo:
          "Convierte fotos HEIC de iPhone a PNG sin pérdida de calidad, listas para editar o subir donde no aceptan HEIC. Varias a la vez, sin registro y sin subir tus fotos.",
        tituloSeo: "Convertir HEIC a PNG gratis online, sin subir tus fotos",
        descripcionSeo:
          "Pasa fotos HEIC (iPhone) a PNG gratis y sin pérdida de calidad. Varias a la vez, sin registro. Todo en tu navegador: tus fotos no se suben a ningún lado.",
        keywords: ["heic a png", "convertir heic a png", "heic a png online gratis", "pasar heic a png", "heic a png sin perder calidad"],
        opciones: { formatoSalida: "image/png" },
      },
    ],
    cargar: () => import("@/components/tools/heic-a-jpg/HeicAJpgTool"),
  },

  /* ---------------------------------------------------------------- */
  /* Administración: extractos bancarios y cobros → informe Excel.     */
  /* ---------------------------------------------------------------- */
  {
    slug: "extracto-santander",
    nombre: "Análisis de movimientos Santander",
    h1: "Análisis de movimientos bancarios de Santander: subí tu archivo y recibí el informe completo",
    subtitulo:
      "Subís el archivo de movimientos que te da Santander Office Banking y te devolvemos, en segundos, el análisis que un administrador arma a mano cada mes: cuánto entró y cuánto salió por concepto y por categoría (cobros, sueldos, impuestos, comisiones, proveedores), la evolución día por día y los controles de que no falta ningún movimiento. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de movimientos Santander: del extracto al informe Excel",
    descripcionSeo:
      "Subí los movimientos de Santander Office Banking y recibí un análisis completo: ingresos y egresos por concepto y categoría, evolución diaria y controles, en un Excel con fórmulas. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el archivo de movimientos de Santander y recibí el análisis por concepto, categoría y día, con controles.",
    keywords: [
      "extracto santander excel",
      "analizar extracto bancario santander",
      "santander office banking exportar movimientos",
      "resumen de cuenta santander a excel",
      "agrupar movimientos bancarios por concepto",
      "conciliar extracto santander",
      "cash management formato excel santander",
    ],
    icono: Landmark,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.ms-excel", "text/plain"],
    guiaDescarga: {
      titulo: "Cómo obtener el archivo de movimientos en Santander",
      pasos: [
        "Ingresá a Santander Office Banking con tu usuario de empresa.",
        "Abrí el Menú y entrá a Cuentas (en el menú vertical de la derecha).",
        "Sobre la cuenta que querés analizar, tocá “Ver saldos y movimientos”.",
        "Elegí el rango de fechas que querés ver (por ejemplo, el mes completo).",
        "Tocá “Descargar movimientos”. Ese archivo (el banco lo llama “Cash Management Formato Excel”) es el que subís acá.",
        "Guardalo tal cual se descarga: no lo abras ni lo vuelvas a guardar con Excel, porque le cambia el formato y pierde la línea de totales del banco.",
      ],
      nota: "Aunque termine en .xls, el archivo es texto separado por tabulaciones con una línea final de totales: es justamente lo que permite verificar cada movimiento contra lo que declara el banco.",
    },
    pasos: [
      "Arrastrá el archivo de movimientos al recuadro (podés sumar varios meses a la vez).",
      "Tocá “Analizar movimientos”: en segundos ves saldos, entradas, salidas, el resumen por categoría y los controles.",
      "Revisá en pantalla lo importante: qué categoría concentra los egresos, cuánto se fue en impuestos y comisiones, si algún movimiento quedó sin clasificar.",
      "Descargá el Excel completo: Resumen por Concepto, Resumen por Categoría, Concepto x Día, Control y Detalle, con fórmulas que se recalculan si corregís algo.",
    ],
    faq: [
      {
        pregunta: "¿Qué controles hace sobre el extracto?",
        respuesta:
          "Compara la cantidad y la suma de débitos y créditos contra los totales que el propio banco escribe al final del archivo, verifica la cadena de saldos movimiento por movimiento (saldo anterior + importe = saldo), comprueba que saldo inicial + movimientos = saldo final y revisa que cada código del banco corresponda a un solo concepto. Si algo no cierra, lo marca en rojo.",
      },
      {
        pregunta: "¿Cómo se clasifican los movimientos?",
        respuesta:
          "Por el código numérico que Santander le asigna a cada tipo de movimiento (más confiable que el texto, que cambia de redacción) y, para códigos nuevos, por palabras clave. Cuando el código no alcanza, mira quién paga o a quién se paga: una “Transferencia recibida” de First Data o Cabal es un cobro con tarjeta, un “Pago a proveedores” que viene de Delivery Hero es un cobro de PedidosYa, un “Pago de servicios” a ARBA o AFIP es un pago de impuestos y un débito automático de Zurich es un seguro. Las categorías son las mismas para todos los bancos (cobros con tarjeta, cobros de plataformas, transferencias recibidas y enviadas, pagos a proveedores, sueldos, impuesto al cheque, retenciones de IIBB, IVA, pagos de impuestos, comisiones, seguros, servicios, cheques, efectivo…). Lo que no reconoce queda en “Otros”, resaltado en amarillo, para que lo revises.",
      },
      {
        pregunta: "El archivo termina en .xls, ¿por qué dice que no es un Excel?",
        respuesta:
          "El reporte “Cash Management Formato Excel” es en realidad un archivo de texto separado por tabulaciones, aunque el banco lo nombre .xls. Si lo abrís con Excel y lo volvés a guardar, se convierte en un Excel “de verdad” y pierde la línea de totales: descargalo de nuevo y subilo sin abrirlo.",
      },
      {
        pregunta: "¿Mi extracto se sube a algún servidor?",
        respuesta:
          "No. El archivo se lee y se procesa dentro de tu navegador; el Excel se genera también ahí. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando. El código es público y auditable.",
      },
    ],
    tituloPasos: "Cómo usar el análisis paso a paso",
    scriptPython: "python/Santander_analizador_extracto.py",
    cargar: () => import("@/components/tools/extracto-santander/ExtractoSantanderTool"),
  },
  {
    slug: "extracto-bbva",
    nombre: "Análisis de movimientos BBVA",
    h1: "Análisis de movimientos bancarios de BBVA: subí el Excel o el resumen en PDF y recibí el informe completo",
    subtitulo:
      "Subís el Excel de movimientos que te da BBVA (o el resumen de cuenta mensual en PDF) y te devolvemos, en segundos, el análisis que un administrador arma a mano cada mes: cuánto entró y cuánto salió por concepto y por categoría (cobros, sueldos, impuestos, comisiones, proveedores) y la evolución día por día. Además unifica las distintas redacciones del banco para que “MANT. CTA.” y “MANTENIMIENTO DE CUENTA” cuenten como lo mismo. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de movimientos BBVA: del Excel o el PDF del banco al informe completo",
    descripcionSeo:
      "Subí los movimientos de BBVA en Excel o el resumen de cuenta en PDF y recibí un análisis completo: ingresos y egresos por concepto y categoría, evolución diaria y conceptos unificados. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el Excel de movimientos o el resumen en PDF de BBVA y recibí el análisis por concepto, categoría y día.",
    keywords: [
      "movimientos bbva excel",
      "analizar movimientos bbva",
      "bbva exportar movimientos a excel",
      "resumen de cuenta bbva por concepto",
      "agrupar movimientos bancarios por concepto",
      "bbva net cash movimientos historicos",
      "extracto bbva a excel",
      "resumen de cuenta bbva pdf",
      "resumen bbva pdf a excel",
    ],
    icono: Landmark,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf"],
    guiaDescarga: {
      titulo: "Cómo obtener el archivo de movimientos en BBVA (Excel o PDF)",
      pasos: [
        "Ingresá al home banking de BBVA con tu usuario.",
        "Entrá a Cuentas (en el menú vertical de la derecha) → “Saldos y Movimientos”.",
        "Seleccioná la empresa y la cuenta que querés analizar.",
        "Filtrá las fechas que querés ver (el filtro está en el medio de la pantalla, a la derecha).",
        "Tocá “Descargar”. Ese archivo es el que subís acá, tal cual se descarga, sin modificarlo.",
      ],
      nota: "Si el archivo se descarga como .xls pero al abrirlo parece una tabla web, no pasa nada: la herramienta lo reconoce igual. También podés subir el resumen de cuenta mensual en PDF (el que BBVA te envía por mail o descargás desde “Resúmenes” del home banking): se lee igual y además trae el saldo después de cada movimiento y quién cobró cada débito automático.",
    },
    pasos: [
      "Arrastrá el Excel de movimientos o el resumen en PDF al recuadro (podés sumar varios períodos a la vez).",
      "Tocá “Analizar movimientos”: en segundos ves entradas, salidas, el resumen por categoría, qué redacciones del banco se unificaron y, si subiste el PDF, el control de la cadena de saldos.",
      "Revisá en pantalla lo importante: qué categoría concentra los egresos, cuánto se fue en impuestos y comisiones, si algo quedó sin clasificar.",
      "Descargá el Excel completo: Resumen por Concepto, Resumen por Categoría, Concepto x Día, Diagnóstico de Conceptos y Detalle, con fórmulas que se recalculan si corregís algo.",
    ],
    tituloPasos: "Cómo usar el análisis paso a paso",
    faq: [
      {
        pregunta: "¿Qué significa que “unifica las redacciones del banco”?",
        respuesta:
          "BBVA escribe el mismo tipo de movimiento de muchas formas: con abreviaturas, con el número de comprobante pegado, con o sin acentos. La herramienta traduce las abreviaturas, quita los números que no aportan y agrupa los textos equivalentes, así el resumen tiene un renglón por concepto real. La hoja “Diagnóstico Conceptos” te muestra exactamente qué textos originales se agruparon en cada uno.",
      },
      {
        pregunta: "¿Cómo se clasifican los movimientos en categorías?",
        respuesta:
          "Primero por el código de operación que BBVA pone en cada movimiento del Excel (la columna “Codigo”, que es la misma para todas las cuentas: 213 y 215 son cobros con tarjeta, 362 pagos a proveedores, 388 retenciones de IIBB, 589 y 609 el impuesto al cheque…) y, si el código no está en la tabla, por palabras clave sobre el concepto. El resumen en PDF no trae ese código, pero escribe el concepto más completo (“CUPONES ARGEN./MASTERCARD” en vez de “CUPON. ARGEN”) y las palabras clave alcanzan: con un mes real dio exactamente las mismas categorías que el Excel. Las categorías son las que mira un administrador: cobros con tarjeta, cobros de plataformas (PedidosYa, Rappi, Mercado Pago), transferencias recibidas y enviadas, pagos a proveedores, sueldos, impuesto al cheque, retenciones y percepciones de IIBB, IVA y percepciones, pagos a AFIP/ARCA (incluidos los planes de pago), comisiones, mantenimiento, intereses y préstamos, seguros, prepagas y salud, servicios y débitos automáticos, pago de tarjeta de crédito, compras con tarjeta de débito, depósitos y extracciones de efectivo, cheques, embargos. Lo que no reconoce queda en “Otros”, resaltado, para que lo revises.",
      },
      {
        pregunta: "¿Una transferencia recibida y una enviada pueden tener el mismo concepto?",
        respuesta:
          "Sí, BBVA usa el mismo texto (“TRF IN COEL”, “TRANSFERENCI”) para los dos sentidos. La herramienta mira si el movimiento es crédito o débito y lo manda a “Transferencias recibidas” o “Transferencias enviadas”; lo mismo con el efectivo (depósito o extracción) y los cheques (depositado o pagado). En el Resumen por Concepto esos casos aparecen en dos renglones, uno por sentido, así los totales cierran con el Resumen por Categoría.",
      },
      {
        pregunta: "¿Conviene subir el Excel o el resumen en PDF?",
        respuesta:
          "Los dos dan el mismo resultado: se validó con un mes real y coincidieron movimiento por movimiento, al centavo. El Excel te deja elegir el rango de fechas que quieras. El resumen en PDF es un mes cerrado, pero trae el saldo después de cada movimiento (el Excel de BBVA no lo trae), así la herramienta controla toda la cadena de saldos, y sus tablas finales dicen quién cobró cada débito automático y a quién fue cada transferencia, que pasan al detalle. Tiene que ser el PDF que genera el banco: un resumen escaneado o fotografiado no se puede leer. Una diferencia para tener en cuenta: el PDF fecha cada movimiento por su fecha valor y el Excel por la fecha de asiento, así que el impuesto al cheque semanal puede figurar el viernes en uno y el lunes en el otro.",
      },
      {
        pregunta: "¿Sirve para otros bancos con columnas de Crédito y Débito?",
        respuesta:
          "En general sí: la herramienta busca las columnas por su nombre (Fecha, Concepto/Descripción, Crédito/Haber, Débito/Debe). Si tu banco no está en la lista y el archivo se lee bien, contanos para sumarlo con su propia guía.",
      },
      {
        pregunta: "¿Mis movimientos se suben a algún servidor?",
        respuesta:
          "No. El archivo se lee y se procesa dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    scriptPython: "python/BBVA_movimientos.py",
    cargar: () => import("@/components/tools/extracto-bbva/ExtractoBbvaTool"),
  },
  {
    slug: "extracto-comafi",
    nombre: "Análisis de movimientos Comafi",
    h1: "Análisis de movimientos bancarios de Comafi: subí el Excel o el resumen en PDF y recibí el informe completo",
    subtitulo:
      "Subís el Excel de movimientos de cuenta que te da Comafi (o el resumen de cuenta mensual en PDF) y te devolvemos, en segundos, el análisis que un administrador arma a mano cada mes: cuánto entró y cuánto salió por concepto y por categoría (cobros, sueldos, impuestos, comisiones, proveedores), separado por moneda, y la evolución día por día. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de movimientos Comafi: del Excel o el PDF del banco al informe completo",
    descripcionSeo:
      "Subí los movimientos de cuenta de Comafi en Excel o el resumen de cuenta en PDF y recibí un análisis completo: ingresos y egresos por concepto y categoría, por moneda y por día. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el Excel de movimientos o el resumen en PDF de Comafi y recibí el análisis por concepto, categoría, moneda y día.",
    keywords: [
      "movimientos comafi excel",
      "analizar movimientos comafi",
      "comafi exportar movimientos a excel",
      "resumen de cuenta comafi por concepto",
      "comafi empresas movimientos de cuenta",
      "extracto comafi a excel",
      "resumen de cuenta comafi pdf",
      "resumen comafi pdf a excel",
    ],
    icono: Landmark,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/pdf"],
    guiaDescarga: {
      titulo: "Cómo obtener el archivo de movimientos en Comafi (Excel o PDF)",
      pasos: [
        "Ingresá al home banking de Comafi con tu usuario.",
        "Entrá a Cuentas y, en la cuenta que querés analizar, abrí la pestaña “Movimientos”.",
        "Completá el filtro: en “Selección” dejá “Movimientos”, elegí las fechas Desde y Hasta, y tocá “Buscar”.",
        "Debajo aparece la tabla “Últimos Movimientos” (ID Operación, Fecha, Fecha de carga, Descripción, Importe). A la derecha del encabezado de esa tabla hay un botón redondo con una flecha hacia abajo apuntando a una bandeja: es el de descarga.",
        "Tocá ese botón y guardá el archivo. Si no se descarga al instante, buscalo en la pestaña “Archivos Descargados” de la misma pantalla. Ese archivo es el que subís acá.",
      ],
      nota: "La herramienta reconoce las columnas por su nombre (Fecha, ID Operación, Descripción, Importe y, si vienen, Moneda y Saldo), así que no importa el orden ni si hay filas de título arriba. También podés subir el resumen de cuenta mensual en PDF (el que Comafi te envía por mail o descargás desde “Resúmenes”): se lee igual y además dice a qué empresa fue cada pago de servicios y el CUIT de cada transferencia.",
    },
    pasos: [
      "Arrastrá el Excel de movimientos o el resumen en PDF al recuadro (podés sumar varios períodos a la vez).",
      "Tocá “Analizar movimientos”: en segundos ves entradas, salidas, el resumen por categoría y, si el archivo trae saldo, el control de la cadena de saldos (con el PDF, además, se verifica cada saldo impreso por el banco).",
      "Revisá en pantalla lo importante: qué categoría concentra los egresos, cuánto se fue en impuestos y comisiones, si algo quedó sin clasificar.",
      "Descargá el Excel completo: Resumen por Concepto, Resumen por Categoría, Concepto x Día y Detalle, con fórmulas que se recalculan si corregís algo.",
    ],
    tituloPasos: "Cómo usar el análisis paso a paso",
    faq: [
      {
        pregunta: "¿Qué pasa si tengo movimientos en pesos y en dólares?",
        respuesta:
          "Se respetan por separado: cada renglón del resumen indica la moneda y los totales no se mezclan. Si el archivo no trae la columna de moneda, se asume que todo es en pesos.",
      },
      {
        pregunta: "¿Cómo se clasifican los movimientos?",
        respuesta:
          "Por palabras clave sobre la descripción del banco (“Impuesto a los débitos”, “Imp. IB s/Acred. Bcarias.”, “Créditos a comercios Master Card”, “Transf inmed sueldos”…) y, cuando la descripción no alcanza, por lo que dicen las columnas “Descripción Ampliada”: una “Transferencia recibida - Datanet” que viene de Delivery Hero es un cobro de PedidosYa, una “Transferencia terceros recibida - Coelsa” de Cabal es un cobro con tarjeta. Las categorías son las mismas que para los otros bancos (cobros con tarjeta, cobros de plataformas, transferencias recibidas, enviadas y entre cuentas propias, sueldos, impuesto al cheque, retenciones de IIBB, IVA, comisiones, mantenimiento, servicios…). Lo que no reconoce queda en “Otros”, resaltado, para que lo revises.",
      },
      {
        pregunta: "¿Conviene subir el Excel o el resumen en PDF?",
        respuesta:
          "Los dos dan el mismo resultado: se validó con un mes real y coincidieron los 930 movimientos, al centavo. El Excel te deja elegir el rango de fechas. El resumen en PDF es un mes cerrado, pero trae tablas que el Excel no tiene: “Pago de servicios efectuados” (qué empresa cobró cada pago electrónico: en un caso real, dos “Pago electrónico de servicios” resultaron ser pagos a AFIP y pasaron a la categoría correcta) y “Transferencias enviadas y recibidas” con el CUIT y el nombre de la contraparte, que pasan al detalle de cada movimiento. Tiene que ser el PDF que genera el banco: un resumen escaneado o fotografiado no se puede leer.",
      },
      {
        pregunta: "¿Puedo analizar varios meses juntos?",
        respuesta:
          "Sí. Subí un archivo por período y se analizan como un solo conjunto: los resúmenes abarcan todo el rango, la matriz Concepto x Día muestra cada fecha y la cadena de saldos se controla de corrido entre un mes y el siguiente (si falta algún movimiento entre archivos, el control lo marca).",
      },
      {
        pregunta: "¿Mis movimientos se suben a algún servidor?",
        respuesta:
          "No. El archivo se lee y se procesa dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    scriptPython: "python/Comafi_movimientos.py",
    cargar: () => import("@/components/tools/extracto-comafi/ExtractoComafiTool"),
  },
  {
    slug: "cobros-mercado-pago",
    nombre: "Análisis de cobros Mercado Pago",
    h1: "Análisis de cobros de Mercado Pago: subí el reporte y recibí las ventas por turno, hora y medio de pago",
    subtitulo:
      "Subís el reporte de cobros que te da Mercado Pago y te devolvemos, en segundos, lo que un dueño de negocio necesita mirar: cuánto cobraste por día de turno (los cobros de la madrugada cuentan para el día anterior, como en gastronomía), qué horas y días de la semana rinden más, cuánto se lleva Mercado Pago entre comisiones y retenciones, qué medios de pago usan tus clientes y qué cobros se rechazaron. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de cobros Mercado Pago: ventas por turno, hora y comisiones",
    descripcionSeo:
      "Subí el reporte de cobros de Mercado Pago y recibí el análisis: ventas por día de turno y por hora, comisiones y retenciones, medios de pago y rechazos, en un Excel con fórmulas. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el reporte de cobros de Mercado Pago y recibí las ventas por turno, hora, medio de pago y lo que descuenta MP.",
    keywords: [
      "reporte de cobros mercado pago excel",
      "analisis de ventas mercado pago",
      "cuanto cobra mercado pago de comision",
      "ventas por hora mercado pago",
      "mercado pago reporte de cobros descargar",
      "conciliacion mercado pago",
      "retenciones mercado pago iibb",
      "cobrar por transferencia mercado pago",
      "transferencias recibidas mercado pago reporte",
    ],
    icono: HandCoins,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
    guiaDescarga: {
      titulo: "Cómo obtener el reporte de cobros en Mercado Pago",
      pasos: [
        "Ingresá a Mercado Pago desde la computadora con tu cuenta de vendedor.",
        "Entrá a Reportes → Cobros → “Detalle de Cobros”.",
        "Seleccioná el período que querés analizar y pedí la descarga.",
        "Mercado Pago tarda un rato en generar el archivo: esperá a que aparezca como listo y descargalo. Ese archivo es el que subís acá, tal cual, sin abrirlo ni modificarlo.",
      ],
      nota: "El reporte tiene que incluir la fecha con hora (columna “Fecha de compra (date_created)”): sin la hora no se puede aplicar el corte de turno y cada cobro queda en su día calendario.",
    },
    pasos: [
      "Arrastrá el reporte de cobros al recuadro (podés sumar varios meses; si se solapan, cada operación se cuenta una sola vez).",
      "Elegí la hora de corte del turno (con 06:00, un cobro de las 02:30 del sábado cuenta para el viernes) y dejá marcada la opción de contar las transferencias recibidas como cobros si tus clientes te pagan por alias o CVU.",
      "Tocá “Analizar cobros”: en segundos ves el bruto, lo que descuenta Mercado Pago (incluida la retención sobre las transferencias), el ticket promedio, el mejor turno, el promedio por día de la semana, cómo cobraste (QR, Point, link, alias), con qué pagaron tus clientes y cuánta plata queda pendiente de liberar.",
      "Descargá el Excel completo: Cobros por Día, Cobros por Hora, Resumen Mensual, Canales de Cobro, Medios de Pago, Por Local (si hay más de uno), Tarifas e Impuestos, No Concretadas y Detalle (con fecha de liberación), con fórmulas que se recalculan si corregís algo.",
    ],
    tituloPasos: "Cómo usar el análisis paso a paso",
    faq: [
      {
        pregunta: "¿Qué es el “día de turno” y por qué importa?",
        respuesta:
          "En bares, restaurantes y delivery, un cobro de las 2 de la mañana pertenece a la noche anterior, no al día siguiente. Si agrupás por fecha calendario, el viernes queda “corto” y el sábado “inflado”. La herramienta imputa los cobros anteriores a la hora de corte (06:00 por defecto, configurable) al turno del día anterior.",
      },
      {
        pregunta: "¿Qué son las “retenciones no discriminadas”?",
        respuesta:
          "El reporte trae el bruto, la comisión de Mercado Pago y el neto acreditado. La diferencia que queda (bruto − comisión − otras tarifas − neto) suele corresponder a retenciones y percepciones (por ejemplo, IIBB) que Mercado Pago aplica como agente de recaudación pero no desglosa. Se muestran como estimación: conviene validarlas con tu contador.",
      },
      {
        pregunta: "Mis clientes me pagan por transferencia al alias en vez de QR. ¿Lo cuenta?",
        respuesta:
          "Sí, y es lo más común en Argentina. El detalle es que en el reporte esas ventas no aparecen como “pago” sino como ingreso de dinero a la cuenta (igual que cuando cargás saldo vos). Por eso la herramienta tiene la opción “Contar las transferencias recibidas como cobros”, activada por defecto: las suma como cobros con medio de pago “Transferencia recibida (alias / CVU)” y te muestra cuánto retiene Mercado Pago sobre ellas. Ojo con eso: no hay comisión, pero en los reportes reales vimos una retención de alrededor del 3 % (suele ser Ingresos Brutos), así que cobrar por transferencia tampoco es gratis. Si en tu caso esas transferencias son cargas de saldo tuyas, desmarcá la opción.",
      },
      {
        pregunta: "¿Qué diferencia hay entre “canal de cobro” y “medio de pago”?",
        respuesta:
          "El canal es cómo le cobraste vos: QR, Point (posnet de Mercado Pago), link de pago, tienda online o transferencia directa al alias. El medio de pago es con qué pagó el cliente: dinero en cuenta, tarjeta de crédito o débito, o transferencia desde la app de su banco. Se cruzan: un cliente puede escanear tu QR y pagarlo desde su banco (canal QR, medio “transferencia desde app bancaria”, con la comisión del QR) o transferirte directo al alias (canal y medio “transferencia al alias”, sin comisión pero con retención). Las comisiones que muestra cada cuadro te dicen cuánto te cuesta cada combinación.",
      },
      {
        pregunta: "¿Qué es “pendiente de liberar”?",
        respuesta:
          "Mercado Pago no libera toda la plata al instante: en los reportes reales, los cobros con tarjeta de crédito se liberan a los 10 días y los de débito a los 2; el dinero en cuenta y las transferencias, en el momento. La herramienta lee la fecha de liberación de cada cobro y te dice cuánto de lo cobrado en el período todavía no estaba disponible al último día del reporte, y cuántos días tarda cada medio de pago. Útil para saber con qué plata contás realmente.",
      },
      {
        pregunta: "¿Qué cuenta como venta?",
        respuesta:
          "Los cobros aprobados por QR, link de pago, Point o suscripciones, y las transferencias recibidas si dejás activada esa opción. Las cargas de saldo con tarjeta o efectivo, las transferencias enviadas y los retiros no se cuentan como ventas. Los rechazados, cancelados, devueltos (reembolso total), con contracargo o pendientes se listan aparte, con el motivo, como alerta operativa. Si un cobro tuvo una devolución parcial, figura completo en el bruto y lo devuelto aparece en la columna “Devuelto”. Y si subís reportes de varios locales, aparece un cuadro “Por Local”.",
      },
      {
        pregunta: "¿Mi reporte se sube a algún servidor?",
        respuesta:
          "No. El archivo se lee y se procesa dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    scriptPython: "python/MP_analizador_cobros.py",
    video: {
      youtubeId: "GHO2HI3ERg0",
      titulo: "¿Cuánto te cobra Mercado Pago de verdad? Comisión, retenciones y cuándo te liberan la plata",
      descripcion:
        "En 5 minutos analizamos el reporte de cobros de un restaurante (datos de ejemplo): cómo descargarlo, cuánto se lleva Mercado Pago entre comisión y retenciones, qué pasa con las transferencias al alias, cuánto entra por QR, Point y link, cuándo se libera la plata y qué trae el Excel.",
      duracion: "PT5M44S",
      publicado: "2026-09-16",
      miniatura: "/videos/cobros-mercado-pago.jpg",
    },
    cargar: () => import("@/components/tools/cobros-mercado-pago/CobrosMercadoPagoTool"),
  },
  {
    slug: "ventas-pedidosya",
    nombre: "Análisis de ventas PedidosYa",
    h1: "Análisis de ventas de PedidosYa: subí el reporte de pedidos y recibí las ventas por local, día y producto",
    subtitulo:
      "Subís el reporte de pedidos del Portal Partner de PedidosYa (puede traer varios locales) y te devolvemos, en segundos, lo que un dueño de gastronomía necesita mirar: cuánto vendió cada local, cuánto se lleva PedidosYa entre comisión, tarifa de pago online, impuestos y cargos por reclamos, cuánto te queda neto y cuánto tenés a cobrar, qué días y horas rinden más, qué productos se venden más en cada local, cuánto tardás en preparar y qué pedidos se cancelaron o tuvieron reclamos. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de ventas PedidosYa: reporte de pedidos a Excel por local y producto",
    descripcionSeo:
      "Subí el reporte de pedidos de PedidosYa (Portal Partner) y recibí ventas por local, día y hora, comisiones y cargos, neto a cobrar, productos más vendidos, cancelaciones y reclamos en un Excel con fórmulas. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el reporte de pedidos de PedidosYa y recibí las ventas por local, día, hora y producto, y lo que descuenta PedidosYa.",
    keywords: [
      "reporte de pedidos pedidosya excel",
      "analisis de ventas pedidosya",
      "cuanto cobra pedidosya de comision",
      "portal partner pedidosya reportes",
      "liquidacion pedidosya",
      "ventas por local pedidosya",
      "productos mas vendidos pedidosya",
      "reclamos pedidosya cargos",
    ],
    icono: UtensilsCrossed,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
    guiaDescarga: {
      titulo: "Cómo obtener el reporte de pedidos en el Portal Partner de PedidosYa",
      pasos: [
        "Ingresá al Portal Partner de PedidosYa con tu usuario de local.",
        "Entrá a Reportes → Pedidos.",
        "Filtrá los locales que querés analizar (podés elegir varios a la vez) y el período de tiempo.",
        "Tocá “Descargar” y exportá en .xls. Ese archivo es el que subís acá, tal cual se descarga, sin abrirlo ni modificarlo.",
      ],
      nota: "Si el reporte incluye varios locales, el análisis los separa solo: vas a ver un cuadro por local y una matriz local × día. Podés subir varios reportes juntos (por ejemplo, un mes por archivo): si se pisan, cada pedido se cuenta una sola vez.",
    },
    pasos: [
      "Arrastrá el reporte de pedidos al recuadro (podés sumar varios períodos o varios locales).",
      "Elegí la hora de corte del turno: con 06:00, un pedido de las 00:30 del sábado cuenta para el viernes.",
      "Tocá “Analizar ventas”: en segundos ves la venta, lo que se lleva PedidosYa, el neto para el local, lo que tenés a cobrar, el ticket promedio, los productos más vendidos y los reclamos.",
      "Descargá el Excel completo: Resumen por Local, Ventas por Día, Local × Día, Caja por Día (cobros online vs. en efectivo, para controlar la caja), Ventas por Hora, Día de la Semana, Deducciones, Productos, Cancelados y Reclamos, Revisar, Control y Detalle, con fórmulas que se recalculan si corregís algo.",
    ],
    tituloPasos: "Cómo usar el análisis paso a paso",
    faq: [
      {
        pregunta: "¿Qué diferencia hay entre venta, neto y a cobrar?",
        respuesta:
          "La venta es lo que compró el cliente a precio de carta (columna “Total parcial”). El neto para el local es el “Ingreso estimado” que informa PedidosYa: la venta menos los descuentos que financiás vos, la comisión, la tarifa de pago online, los impuestos sobre esas comisiones, los cargos por reclamos y el marketing. Y lo que tenés a cobrar es el neto menos lo que ya cobraste en efectivo: en los pedidos en efectivo el cliente te pagó a vos, así que le adeudás a PedidosYa las comisiones y eso se compensa con los pagos.",
      },
      {
        pregunta: "¿Cómo controlo la caja del local con los pedidos en efectivo?",
        respuesta:
          "Con la hoja “Caja por Día” del Excel (y el cuadro del mismo nombre en pantalla). Por cada local y día de turno separa los pedidos pagados online (los cobra PedidosYa y te los liquida después) de los pagados en efectivo (los cobrás vos en mano), y te dice cuánto efectivo entró al local ese turno según PedidosYa (columna “Monto en efectivo ya cobrado por el local”): ese es el número que tiene que coincidir con la caja. Al lado ves lo que le adeudás a PedidosYa por esos pedidos (comisiones y tarifas), que después se compensa con los pagos. Como usa fórmulas sobre el Detalle, si corregís o filtrás un pedido se recalcula.",
      },
      {
        pregunta: "¿Qué son los “Cargos”?",
        respuesta:
          "Casi siempre son reclamos: el cliente se quejó (producto faltante, incorrecto, calidad, orden equivocada), PedidosYa le devolvió parte o todo el pedido y te lo descuenta a vos. También aparecen como penalidad cuando una cancelación se atribuye al local (por ejemplo, “local cerrado”). La hoja “Cancelados y Reclamos” los lista por motivo y pedido por pedido, con el número, para que puedas reclamar.",
      },
      {
        pregunta: "¿Qué es la hoja “Revisar”?",
        respuesta:
          "Ahí van los pedidos entregados cuya liquidación no cierra: los que figuran sin pago, sin deuda ni efectivo (PedidosYa todavía no los procesó o quedaron trabados) y los que tienen un ingreso estimado que no coincide con venta − deducciones. Son pocos, pero es plata: conviene consultarlos en el Portal Partner con el número de pedido.",
      },
      {
        pregunta: "¿Cómo se arma el ranking de productos?",
        respuesta:
          "A partir de la columna “Artículos” del reporte, que trae cada pedido como “2 Empanadas, 1 Pizza mozzarella [1 grande]”. Se cuentan las unidades de cada producto por local; las opciones entre corchetes (guarniciones, gustos, tamaños) no se cuentan como producto aparte. Si el mismo producto está escrito distinto en dos locales, aparece en cada uno con su redacción.",
      },
      {
        pregunta: "¿Mi reporte se sube a algún servidor?",
        respuesta:
          "No. El archivo se lee y se procesa dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    cargar: () => import("@/components/tools/ventas-pedidosya/VentasPedidosYaTool"),
  },
  {
    slug: "liquidacion-pedidosya",
    nombre: "Liquidación de PedidosYa",
    h1: "Liquidación de PedidosYa: controlá cuánto te van a depositar y por qué",
    subtitulo:
      "Subís el estado de cuenta semanal de PedidosYa (Finanzas) y el reporte de pedidos de cada local (Reportes → Pedidos), todos juntos en el mismo recuadro, y en segundos ves la cascada completa: venta bruta, tus promos, comisión, cargo por pedidos con Plus, tarifa de pago online, IVA, reclamos y reintegros, hasta el depósito que tiene que entrar al banco. Con la venta día a día para cruzar con la planilla del local y una hoja con lo que conviene reclamarle a PedidosYa. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Liquidación PedidosYa: estado de cuenta a Excel y control del depósito",
    descripcionSeo:
      "Subí el estado de cuenta y el reporte de pedidos de PedidosYa y controlá la liquidación: comisión, Plus, tarifa de pago online, IVA, reclamos y reintegros, venta día a día y depósito estimado. Gratis y en tu navegador.",
    descripcionCorta: "Cruzá el estado de cuenta y el reporte de pedidos de PedidosYa y controlá cuánto te deposita cada semana.",
    keywords: [
      "estado de cuenta pedidosya excel",
      "liquidacion pedidosya",
      "cuanto me deposita pedidosya",
      "pedidosya finanzas estado de cuenta",
      "descuentos pedidosya a cobrar",
      "cargo por pedidos con plus",
      "tarifa de pago online pedidosya",
      "reintegros pedidosya pedidos rechazados",
      "control de caja pedidosya efectivo",
    ],
    icono: ReceiptText,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
    guiaDescarga: {
      titulo: "Cómo descargar los dos archivos del Portal Partner de PedidosYa",
      pasos: [
        "Estado de cuenta (la liquidación): entrá al Portal Partner → Finanzas → elegí la semana que querés controlar → “Descargar estado de cuenta”. Se bajan dos archivos: subí acá el Excel (el PDF no hace falta). Ojo: se descarga con extensión .xls y trae todas tus sucursales juntas; subilo tal cual, sin abrirlo ni guardarlo de nuevo.",
        "Repetí ese paso por cada semana del período que quieras analizar: PedidosYa liquida de lunes a domingo, así que un mes son cuatro o cinco archivos.",
        "Reporte de pedidos (el detalle): entrá a Reportes → Pedidos, filtrá el período y el local, y tocá “Descargar”. Este reporte se baja por local: si tenés más de uno, repetí el paso para cada sucursal.",
        "Arrastrá todos los archivos juntos al recuadro de arriba (podés seleccionarlos de una en la carpeta Descargas). La herramienta reconoce sola cuál es cada uno.",
      ],
      nota: "Los archivos tienen que corresponderse en el período: el reporte de pedidos debe cubrir los mismos días que los estados de cuenta que subas, y de todos los locales que aparecen en ellos. Si falta la semana de un estado de cuenta, esos días se muestran igual pero sin el detalle de tus promos, el cargo por Plus ni los reintegros (aparecen como “s/d”); si falta el reporte de pedidos de un local, a esos pedidos no se les puede calcular la tarifa de pago online ni el IVA y el depósito estimado queda más alto que el real. En los dos casos la herramienta te avisa exactamente qué archivo falta.",
    },
    pasos: [
      "Arrastrá al recuadro los estados de cuenta y los reportes de pedidos que tengas (todos juntos, de varias semanas y varios locales).",
      "Opcional: si tu local anota la venta de PedidosYa día por día, pegá esa planilla en el recuadro de abajo (una línea por día, con la fecha y el importe). No hace falta que aclares qué anota —la venta total, solo lo cobrado por la app o solo el efectivo—: la herramienta prueba las tres formas, usa la que cierra con tus números y te dice cuál fue.",
      "Tocá “Analizar la liquidación”: se reconoce cada archivo, se cruza pedido por pedido y se controla que la venta y la comisión coincidan en los dos reportes.",
      "Mirá la cascada de la venta al depósito, la venta día a día para cruzar con la planilla del local y el cuadro “Para revisar”, con los pedidos que conviene reclamarle a PedidosYa.",
      "Descargá el Excel completo: Liquidación semana por semana, Día a día, Por sucursal, Revisar, Control y Detalle, con fórmulas que se recalculan si corregís o filtrás algo.",
    ],
    tituloPasos: "Cómo controlar tu liquidación paso a paso",
    faq: [
      {
        pregunta: "¿Por qué el depósito es menor que el “a cobrar” del estado de cuenta?",
        respuesta:
          "Porque el estado de cuenta no muestra dos costos: la tarifa de pago online (lo que cuesta cobrar con tarjeta, alrededor del 2,5 % al 3,4 % de lo que se pagó por la app) y el IVA del 21 % sobre las comisiones, las tarifas, el cargo por Plus y los reclamos. Los dos sí están en el reporte de pedidos. En los casos reales con los que se validó la herramienta, esa diferencia era de entre el 8 % y el 9 % del depósito: por eso conviene subir los dos archivos.",
      },
      {
        pregunta: "El local informa una venta distinta a la que muestra PedidosYa. ¿Cuál está bien?",
        respuesta:
          "Las dos, pero miden cosas distintas. La “venta bruta” es lo que compró el cliente a precio de carta; la “venta neta” es esa venta menos tus promos y menos los descuentos que PedidosYa te cobra, y es la base de la liquidación. Entre una y otra suele haber un 6 % a 8 % de diferencia. A eso se suman tres cosas que descalzan el día a día: los pedidos cancelados (que el local suele anotar y PedidosYa no cuenta como venta), las sucursales (el estado de cuenta las trae juntas y el reporte de pedidos va por local) y los reclamos, que se descuentan cuando se confirman y no el día del pedido. La tabla “Día a día” te muestra las tres cifras una al lado de la otra, y si pegás la planilla del local en el recuadro opcional, el análisis reconoce solo si esos números son la venta total, lo cobrado por la app o el efectivo, y te dice día por día qué explica la diferencia: en el caso real con el que se validó, 22 de 28 días cerraban al peso sumando los descuentos que PedidosYa cobra después (el local anota la venta como se la mostró la app) y 2 más por un pedido cancelado que había quedado anotado como venta.",
      },
      {
        pregunta: "¿Qué son los “Descuentos de PedidosYa a cobrar”?",
        respuesta:
          "Descuentos que PedidosYa le dio al cliente y después te descuenta de la liquidación, con IVA incluido (es el descuento neto multiplicado por 1,21). Conviene mirarlos uno por uno: en los archivos reales con los que se validó la herramienta, el reporte de pedidos informaba esos mismos importes como “descuento financiado por PedidosYa”, y hubo pedidos entregados en los que la venta neta quedó en cero y aun así se cobró la comisión completa. Todos salen listados en la hoja “Revisar” con su número de pedido, para reclamarlos.",
      },
      {
        pregunta: "¿Qué son los reintegros?",
        respuesta:
          "Pedidos rechazados por los que PedidosYa te compensa la mitad de lo que valía el pedido menos la comisión, porque la comida ya estaba hecha. Esos pedidos no figuran en la lista de pedidos liquidados (no son venta) y el reporte de pedidos tampoco los muestra: solo aparecen en la hoja “Reintegros” del estado de cuenta, así que sin ese archivo esa plata no se ve.",
      },
      {
        pregunta: "¿Cómo controlo la caja del local con los pedidos en efectivo?",
        respuesta:
          "Con la columna “Cobrado en efectivo” de la tabla día a día: son los pedidos que el cliente pagó fuera de la app, así que esa plata ya está en el local. Los dos reportes de PedidosYa informan ese importe y la herramienta controla que coincidan. Después, PedidosYa te descuenta del depósito la comisión de esos pedidos, y por eso el depósito no es la venta menos los costos a secas.",
      },
      {
        pregunta: "¿Mis archivos se suben a algún servidor?",
        respuesta:
          "No. Se leen y se cruzan dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    cargar: () => import("@/components/tools/liquidacion-pedidosya/LiquidacionPedidosYaTool"),
  },
  {
    slug: "conciliacion-fiserv-banco",
    nombre: "Conciliación Fiserv ↔ banco",
    h1: "Conciliación de liquidaciones Fiserv con el banco: comprobá que te acreditaron cada liquidación y cuánto te queda de cada venta con tarjeta",
    subtitulo:
      "Subís el reporte de liquidaciones diarias de Fiserv (ex Posnet / First Data) y el extracto de tu banco del mismo período, y en segundos ves qué liquidación llegó como crédito, cuál falta, cuál se demoró, y la cadena completa de una venta con tarjeta: arancel, IVA, retenciones de Fiserv y lo que después te retiene el banco. Funciona con Santander, BBVA y Comafi. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Conciliar liquidaciones Fiserv con el extracto del banco (Excel o PDF)",
    descripcionSeo:
      "Cruzá las liquidaciones diarias de Fiserv (Posnet) con los movimientos de Santander, BBVA o Comafi: qué se acreditó, qué falta, plazos y cuánto se lleva Fiserv y el banco de cada venta con tarjeta. Gratis, en tu navegador.",
    descripcionCorta: "Cruzá las liquidaciones de Fiserv con los créditos del banco: qué se acreditó, qué falta y cuánto te queda de cada venta con tarjeta.",
    keywords: [
      "conciliar liquidaciones fiserv",
      "liquidaciones diarias fiserv excel",
      "posnet liquidaciones banco",
      "first data liquidaciones conciliacion",
      "acreditacion a comercio fiserv",
      "cuanto cobra fiserv de arancel",
      "retenciones fiserv sirtac",
      "conciliacion tarjetas de credito banco",
      "cobros con tarjeta extracto bancario",
    ],
    icono: GitCompareArrows,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/pdf"],
    guiaDescarga: {
      titulo: "Cómo obtener los dos archivos",
      pasos: [
        "En el portal de comercios de Fiserv: entrá a Liquidaciones → “Liquidaciones Diarias”.",
        "Filtrá el rango de fechas que querés conciliar (por ejemplo, el mes completo) y, si tenés varios comercios, el CUIT.",
        "Descargá el Excel completo. Ese archivo (Trx_… .xlsx, con una fila por liquidación y tarjeta) es el que subís acá, tal cual.",
        "Del banco, bajá los movimientos del mismo período con la guía de la herramienta de tu banco (Santander, BBVA o Comafi): es exactamente el mismo archivo que usás para el análisis de movimientos. En BBVA y Comafi también sirve el resumen de cuenta en PDF.",
      ],
      nota: "Conviene que el extracto del banco cubra unos días más que el reporte de Fiserv: así las liquidaciones de los últimos días de pago encuentran su crédito.",
    },
    pasos: [
      "Arrastrá el extracto del banco al primer recuadro y el reporte de liquidaciones de Fiserv al segundo (del mismo período; podés sumar varios meses de cada uno).",
      "El banco se reconoce solo por el formato del archivo; si no lo detecta, elegilo en la lista.",
      "Tocá “Conciliar liquidaciones”: cada liquidación de Fiserv se busca en el banco por fecha de pago e importe neto. Ves cuántas se acreditaron, cuáles faltan, cuáles llegaron con demora, los créditos del banco que no están en la liquidación (cobros QR por CVU, otras procesadoras) y cuánto te queda de cada venta.",
      "Descargá el Excel: Resumen, Conciliación (una fila por liquidación con el crédito del banco al lado), Por Tarjeta, Por Día de Pago, Sin Conciliar, Control, Detalle Fiserv y Créditos del banco.",
    ],
    tituloPasos: "Cómo usar la conciliación paso a paso",
    faq: [
      {
        pregunta: "¿Cómo sabe qué crédito del banco corresponde a cada liquidación?",
        respuesta:
          "Por fecha de pago e importe neto, al centavo. Fiserv deposita cada liquidación (una por día y por tarjeta) como un crédito separado, y el banco lo registra el mismo día con ese importe exacto. Si el banco lo acredita uno o dos días después, también lo encuentra (hasta 3 días) y te lo marca como “fecha cercana”; si agrupa varias liquidaciones en un solo crédito, busca la combinación que suma. En los reportes reales con los que se validó (Santander, BBVA y Comafi), el 100 % cruzó el mismo día.",
      },
      {
        pregunta: "¿Por qué el banco dice “Master Card” si la venta fue con Visa?",
        respuesta:
          "Porque el banco solo sabe que la plata viene de Fiserv, no con qué tarjeta se vendió: en Comafi todos los créditos dicen “Creditos a comercios Master Card”, en Santander “Acreditacion a comercio fiserv” y en BBVA “CUPON. ARGEN” o “MAE-ACREDITA”. Al cruzarlos con el reporte de Fiserv, la conciliación te dice de qué tarjeta fue cada crédito, y el Excel te lo deja en la hoja “Créditos del banco”.",
      },
      {
        pregunta: "¿Qué son las liquidaciones con importe negativo o cero?",
        respuesta:
          "Son ajustes de Fiserv sin ventas: casi siempre las retenciones de IIBB o percepciones sobre los cobros QR (“COB FISERV QRPCT…”), que Fiserv acredita aparte por transferencia y por eso no aparecen en la liquidación diaria más que por sus retenciones. También pueden ser reintentos o cargos por operaciones internacionales. No generan crédito en el banco y se listan aparte con su detalle.",
      },
      {
        pregunta: "Hay créditos del banco que no están en Fiserv. ¿Está mal?",
        respuesta:
          "No necesariamente. La herramienta los separa por motivo: los cobros QR de Fiserv llegan como transferencias por CVU (“first data sur”) y no pasan por la liquidación diaria; los créditos de otras procesadoras o marcas que liquidan directo (Cabal, Naranja, American Express, Prisma) no son de Fiserv; y los que caen fuera de las fechas del reporte simplemente necesitan que bajes el reporte cubriendo esos días. Lo que queda como “sin liquidación en Fiserv” dentro del período sí merece que lo revises con Fiserv.",
      },
      {
        pregunta: "¿Cuánto me queda realmente de una venta con tarjeta?",
        respuesta:
          "El cuadro “Cuánto queda de cada venta” arma la cadena completa: ventas aceptadas (bruto), menos el arancel de Fiserv, el IVA sobre el arancel, la retención de IIBB (SIRTAC) y las percepciones, da el neto que deposita Fiserv. Después el banco descuenta el impuesto a los créditos (0,6 %) y, según la provincia, una retención de IIBB sobre las acreditaciones. Si tu banco debita esas retenciones por cada acreditación (Comafi), la herramienta las empareja y te muestra el importe final que queda en la cuenta; si las cobra agregadas por día (Santander, BBVA), te avisa que ese costo se suma al de Fiserv. En los casos reales, Fiserv se lleva alrededor del 3,2 % y el banco otro 3 %.",
      },
      {
        pregunta: "¿Mis archivos se suben a algún servidor?",
        respuesta:
          "No. Los dos archivos se leen y se cruzan dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    cargar: () => import("@/components/tools/conciliacion-fiserv/ConciliacionFiservTool"),
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
  administracion: "Administración",
};

/** Orden y descripción de las categorías para el homepage y el footer. */
export const categorias: { id: CategoriaHerramienta; nombre: string; descripcion: string }[] = [
  { id: "administracion", nombre: "Administración", descripcion: "Subí los movimientos de tu banco o de Mercado Pago y recibí el análisis completo." },
  { id: "imagen", nombre: "Imágenes", descripcion: "Editar y optimizar fotos e imágenes." },
  { id: "pdf", nombre: "PDF", descripcion: "Unir, dividir, rotar y transformar documentos." },
  { id: "conversion", nombre: "Conversión", descripcion: "Cambiar de un formato a otro." },
];

export function herramientasPorCategoria(id: CategoriaHerramienta): Herramienta[] {
  return herramientas.filter((h) => h.categoria === id);
}
