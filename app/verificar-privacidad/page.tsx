import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Code2, Lock, Network, WifiOff } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { HOSTS_EXTERNOS } from "@/lib/csp";
import { JsonLd } from "@/components/core/JsonLd";

const TITULO = "Cómo comprobar que tus archivos no salen de tu dispositivo";
const DESCRIPCION =
  "Cuatro formas de verificar vos mismo, sin confiar en nuestra palabra, que los extractos, fotos y documentos que usás en el sitio se procesan en tu navegador y no se envían a ningún servidor.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/verificar-privacidad" },
  openGraph: { type: "article", url: "/verificar-privacidad", title: TITULO, description: DESCRIPCION, siteName: siteConfig.nombre },
};

const metodos = [
  {
    id: "sin-conexion",
    icono: WifiOff,
    titulo: "1. Apagá internet y seguí trabajando",
    tiempo: "1 minuto · sirve en celular y computadora",
    pasos: [
      "Abrí la herramienta que quieras probar y usala una vez con cualquier archivo (así el navegador termina de descargar el programa de esa herramienta).",
      "Desconectá el Wi-Fi o activá el modo avión. No cierres la pestaña.",
      "Volvé a subir un archivo y procesalo. Va a funcionar exactamente igual y vas a poder descargar el resultado.",
    ],
    cierre:
      "Si el archivo tuviera que viajar a un servidor, sin conexión no habría resultado. Es la prueba más simple y la más contundente. (En “Quitar fondo”, el modelo de inteligencia artificial se descarga la primera vez; después también funciona sin conexión.)",
  },
  {
    id: "pestana-red",
    icono: Network,
    titulo: "2. Mirá lo que el navegador envía",
    tiempo: "2 minutos · en computadora",
    pasos: [
      "Abrí la herramienta y presioná F12 (o clic derecho → Inspeccionar). Se abre el panel de desarrollador.",
      "Entrá a la pestaña “Red” (“Network” en inglés) y dejala abierta.",
      "Subí tu archivo y procesalo. Cada línea que aparece es algo que el navegador pidió o envió.",
      "Fijate en la columna “Método”: verás solo GET (el navegador PIDE archivos del sitio: programas, íconos). No aparece ningún POST ni PUT (que sería ENVIAR algo) con el nombre o el tamaño de tu archivo.",
    ],
    cierre:
      "Un archivo de varios megas que se subiera aparecería ahí, sí o sí, con su tamaño. No está, porque nunca sale de tu computadora.",
  },
  {
    id: "csp",
    icono: Lock,
    titulo: "3. El candado del propio navegador",
    tiempo: "1 minuto · en computadora",
    pasos: [
      "En la misma pestaña “Red”, hacé clic en la primera línea (el documento de la página) y abrí “Encabezados” (“Headers”).",
      "Buscá en la respuesta la línea Content-Security-Policy.",
      "Vas a ver connect-src 'self' blob: data:. Significa que el navegador solo permite que esta página se conecte con nuestro propio dominio ('self', un sitio estático que no tiene dónde recibir archivos) y con objetos en la memoria de la propia pestaña (blob: y data:, que usan las herramientas para trabajar). Cualquier intento del código de enviar datos a otro servidor es bloqueado por el navegador antes de salir.",
    ],
    cierre: `Hay solo dos excepciones, declaradas a la vista: la herramienta “Quitar fondo” puede DESCARGAR su modelo de inteligencia artificial desde ${HOSTS_EXTERNOS.CDN_MODELO_IA.replace("https://", "")} (descarga, no envío), y la página de contacto puede enviar el formulario al servicio de correo. Ninguna herramienta de administración tiene excepciones.`,
  },
  {
    id: "codigo",
    icono: Code2,
    titulo: "4. Leé el código (o pedile a alguien que lo lea)",
    tiempo: "para quien sabe programar",
    pasos: [
      "Todo el código del sitio es público, con licencia de software libre.",
      "La lógica de cada herramienta está en components/tools/<herramienta>/logic.ts; los analizadores de bancos, en lib/extractos/.",
      "Buscá “fetch(” o “XMLHttpRequest” en ese código: no hay ninguna llamada de red propia. Lo único que se descarga son las librerías (leer Excel, generar Excel, decodificar imágenes) y el modelo de IA.",
    ],
    cierre: "Lo que se publica en el sitio es exactamente lo que está en el repositorio: cada cambio queda registrado con fecha.",
  },
];

const faq = [
  {
    pregunta: "¿Y qué sí registran?",
    respuesta:
      "Estadísticas de visitas sin cookies (qué páginas se visitan, desde qué país, qué navegador), a través de Vercel Analytics, y los anuncios de Google AdSense. Nada de eso incluye el contenido, el nombre ni el tamaño de tus archivos. Los detalles están en la política de privacidad.",
  },
  {
    pregunta: "¿Por qué no hacen como los demás y suben el archivo a un servidor?",
    respuesta:
      "Porque no hace falta. Los navegadores modernos pueden leer un Excel, dibujar un PDF o correr un modelo de inteligencia artificial por sí mismos. Procesar en tu dispositivo es más rápido, no nos obliga a guardar datos ajenos y nos permite ofrecer todo gratis, sin límites ni registro.",
  },
  {
    pregunta: "¿Puedo confiar en esto para extractos bancarios de mi empresa?",
    respuesta:
      "La respuesta honesta es: no confíes, comprobalo. Los cuatro métodos de arriba están pensados para eso. Y si tu empresa tiene una política estricta, el método 1 (sin conexión) cumple con cualquier auditoría: el archivo se procesa con la red apagada.",
  },
];

export default function PaginaVerificarPrivacidad() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: TITULO,
      description: DESCRIPCION,
      step: metodos.map((m) => ({
        "@type": "HowToStep",
        name: m.titulo,
        itemListElement: m.pasos.map((p) => ({ "@type": "HowToDirection", text: p })),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.pregunta, acceptedAnswer: { "@type": "Answer", text: f.respuesta } })),
    },
  ];

  return (
    <article className="container mx-auto max-w-3xl px-4 py-8">
      {jsonLd.map((d, i) => (
        <JsonLd key={i} data={d} />
      ))}
      <nav aria-label="Migas de pan" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Inicio
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">
          Cómo comprobar la privacidad
        </span>
      </nav>

      <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">{TITULO}</h1>
      <p className="mt-3 text-lg text-muted-foreground text-pretty">
        Decir “no subimos tus archivos” es fácil. Por eso preferimos que lo compruebes vos, en un minuto y sin saber
        de programación. Cualquiera de estos métodos alcanza; los cuatro juntos, no dejan lugar a dudas.
      </p>

      <div className="mt-10 space-y-8">
        {metodos.map((m) => (
          <section key={m.id} id={m.id} className="scroll-mt-20 rounded-xl border p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <m.icono className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-semibold tracking-tight">{m.titulo}</h2>
                <p className="text-sm text-muted-foreground">{m.tiempo}</p>
              </div>
            </div>
            <ol className="mt-4 space-y-3">
              {m.pasos.map((paso, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="min-w-0 pt-0.5 text-muted-foreground [overflow-wrap:anywhere]">{paso}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm">{m.cierre}</p>
          </section>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <dl className="mt-4 space-y-5">
          {faq.map((f) => (
            <div key={f.pregunta}>
              <dt className="font-medium">{f.pregunta}</dt>
              <dd className="mt-1 text-muted-foreground">{f.respuesta}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        Código fuente:{" "}
        <a href={siteConfig.repoUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {siteConfig.repoUrl.replace("https://", "")}
        </a>{" "}
        · Política de privacidad:{" "}
        <Link href="/legal/privacidad" className="underline underline-offset-2 hover:text-foreground">
          ver
        </Link>
        {" "}· ¿Encontraste algo raro?{" "}
        <Link href="/contacto" className="underline underline-offset-2 hover:text-foreground">
          Contanos
        </Link>
        .
      </p>
    </article>
  );
}
