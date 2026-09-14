import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Crop,
  FileImage,
  FileStack,
  HandCoins,
  ImageOff,
  Images,
  Landmark,
  Minimize2,
  Repeat,
  RotateCw,
  Scaling,
  Scissors,
  Smartphone,
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
        "Tocá “Descargar movimientos”. Si te ofrece varios formatos, elegí “Cash Management Formato Excel”. Ese archivo es el que subís acá.",
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
          "Por el código numérico que Santander le asigna a cada tipo de movimiento (más confiable que el texto, que cambia de redacción) y, para códigos nuevos, por palabras clave. Lo que no reconoce queda en “Otros”, resaltado en amarillo, para que lo revises.",
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
    h1: "Análisis de movimientos bancarios de BBVA: subí tu Excel y recibí el informe completo",
    subtitulo:
      "Subís el Excel de movimientos que te da BBVA y te devolvemos, en segundos, el análisis que un administrador arma a mano cada mes: cuánto entró y cuánto salió por concepto y por categoría (cobros, sueldos, impuestos, comisiones, proveedores) y la evolución día por día. Además unifica las distintas redacciones del banco para que “MANT. CTA.” y “MANTENIMIENTO DE CUENTA” cuenten como lo mismo. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de movimientos BBVA: del Excel del banco al informe completo",
    descripcionSeo:
      "Subí los movimientos de BBVA en Excel y recibí un análisis completo: ingresos y egresos por concepto y categoría, evolución diaria y conceptos unificados. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el Excel de movimientos de BBVA y recibí el análisis por concepto, categoría y día.",
    keywords: [
      "movimientos bbva excel",
      "analizar movimientos bbva",
      "bbva exportar movimientos a excel",
      "resumen de cuenta bbva por concepto",
      "agrupar movimientos bancarios por concepto",
      "bbva net cash movimientos historicos",
      "extracto bbva a excel",
    ],
    icono: Landmark,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    guiaDescarga: {
      titulo: "Cómo obtener el archivo de movimientos en BBVA",
      pasos: [
        "Ingresá al home banking de BBVA con tu usuario.",
        "Entrá a Cuentas (en el menú vertical de la derecha) → “Saldos y Movimientos”.",
        "Seleccioná la empresa y la cuenta que querés analizar.",
        "Filtrá las fechas que querés ver (el filtro está en el medio de la pantalla, a la derecha).",
        "Tocá “Descargar”. Ese archivo es el que subís acá, tal cual se descarga, sin modificarlo.",
      ],
      nota: "Si el archivo se descarga como .xls pero al abrirlo parece una tabla web, no pasa nada: la herramienta lo reconoce igual.",
    },
    pasos: [
      "Arrastrá el Excel de movimientos al recuadro (podés sumar varios períodos a la vez).",
      "Tocá “Analizar movimientos”: en segundos ves entradas, salidas, el resumen por categoría y qué redacciones del banco se unificaron.",
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
          "Por palabras clave sobre el concepto ya normalizado: sueldos, impuesto al cheque, retenciones de IIBB, IVA y percepciones, mantenimiento, comisiones, préstamos, cobros con tarjeta, depósitos, cheques, dólares, transferencias recibidas y enviadas, pago de servicios. Lo que no reconoce queda en “Otros”, resaltado, para que lo revises.",
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
    h1: "Análisis de movimientos bancarios de Comafi: subí tu Excel y recibí el informe completo",
    subtitulo:
      "Subís el Excel de movimientos de cuenta que te da Comafi y te devolvemos, en segundos, el análisis que un administrador arma a mano cada mes: cuánto entró y cuánto salió por concepto y por categoría (cobros, sueldos, impuestos, comisiones, proveedores), separado por moneda, y la evolución día por día. Sin subir tus datos a ningún servidor.",
    tituloSeo: "Análisis de movimientos Comafi: del Excel del banco al informe completo",
    descripcionSeo:
      "Subí los movimientos de cuenta de Comafi en Excel y recibí un análisis completo: ingresos y egresos por concepto y categoría, por moneda y por día. Gratis y sin subir tus datos.",
    descripcionCorta: "Subí el Excel de movimientos de Comafi y recibí el análisis por concepto, categoría, moneda y día.",
    keywords: [
      "movimientos comafi excel",
      "analizar movimientos comafi",
      "comafi exportar movimientos a excel",
      "resumen de cuenta comafi por concepto",
      "comafi empresas movimientos de cuenta",
      "extracto comafi a excel",
    ],
    icono: Landmark,
    categoria: "administracion",
    estado: "activa",
    formatosEntrada: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
    guiaDescarga: {
      titulo: "Cómo obtener el archivo de movimientos en Comafi",
      pasos: [
        "Ingresá al home banking de Comafi con tu usuario.",
        "Entrá a Cuentas y, en la cuenta que querés analizar, abrí la pestaña “Movimientos”.",
        "Completá el filtro: en “Selección” dejá “Movimientos”, elegí las fechas Desde y Hasta, y tocá “Buscar”.",
        "Debajo aparece la tabla “Últimos Movimientos” (ID Operación, Fecha, Fecha de carga, Descripción, Importe). A la derecha del encabezado de esa tabla hay un botón redondo con una flecha hacia abajo apuntando a una bandeja: es el de descarga.",
        "Tocá ese botón y guardá el archivo. Si no se descarga al instante, buscalo en la pestaña “Archivos Descargados” de la misma pantalla. Ese archivo es el que subís acá.",
      ],
      nota: "La herramienta reconoce las columnas por su nombre (Fecha, ID Operación, Descripción, Importe y, si vienen, Moneda y Saldo), así que no importa el orden ni si hay filas de título arriba.",
    },
    pasos: [
      "Arrastrá el Excel de movimientos al recuadro (podés sumar varios períodos a la vez).",
      "Tocá “Analizar movimientos”: en segundos ves entradas, salidas, el resumen por categoría y, si el archivo trae saldo, el control de la cadena de saldos.",
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
          "Por palabras clave sobre la descripción del banco: sueldos, impuestos y retenciones, comisiones y gastos bancarios, cobros con tarjeta, depósitos, transferencias recibidas y enviadas, pago de servicios y cheques. Lo que no reconoce queda en “Otros”, resaltado, para que lo revises.",
      },
      {
        pregunta: "¿Puedo analizar varios meses juntos?",
        respuesta:
          "Sí. Subí un archivo por período y se analizan como un solo conjunto: los resúmenes abarcan todo el rango y la matriz Concepto x Día muestra cada fecha.",
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
      "Elegí la hora de corte del turno: con 06:00, un cobro de las 02:30 del sábado cuenta para el viernes.",
      "Tocá “Analizar cobros”: en segundos ves el bruto, lo que descuenta Mercado Pago, el ticket promedio, el mejor turno, el promedio por día de la semana y los medios de pago.",
      "Descargá el Excel completo: Cobros por Día, Cobros por Hora, Resumen Mensual, Medios de Pago, Tarifas e Impuestos, No Concretadas y Detalle, con fórmulas que se recalculan si corregís algo.",
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
        pregunta: "¿Qué cuenta como venta?",
        respuesta:
          "Los cobros aprobados por QR, link de pago, Point o suscripciones. Las cargas de saldo, transferencias enviadas y retiros no se cuentan como ventas. Los rechazados y cancelados se listan aparte, con el motivo, como alerta operativa.",
      },
      {
        pregunta: "¿Mi reporte se sube a algún servidor?",
        respuesta:
          "No. El archivo se lee y se procesa dentro de tu navegador, y el Excel se genera ahí mismo. Podés comprobarlo desconectando internet después de cargar la página: la herramienta sigue funcionando.",
      },
    ],
    scriptPython: "python/MP_analizador_cobros.py",
    cargar: () => import("@/components/tools/cobros-mercado-pago/CobrosMercadoPagoTool"),
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
