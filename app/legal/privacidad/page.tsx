import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

/*
 * CONTENIDO GENÉRICO EDITABLE.
 * Revisá los textos entre corchetes [ ] y adaptalos a tu caso. Si operás
 * desde un país concreto, conviene que un profesional revise este texto.
 */

const ULTIMA_ACTUALIZACION = "11 de septiembre de 2026";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${siteConfig.nombre} trata tus datos: no subimos tus archivos, usamos analítica sin cookies y publicidad de Google AdSense.`,
  alternates: { canonical: "/legal/privacidad" },
};

export default function PaginaPrivacidad() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p>
        <em>Última actualización: {ULTIMA_ACTUALIZACION}</em>
      </p>

      <p>
        En <strong>{siteConfig.nombre}</strong> ({siteConfig.url}) nos tomamos la privacidad en serio.
        Esta política explica qué información recopilamos, cómo la usamos y qué opciones tienes.
      </p>

      <h2>1. Tus archivos nunca se suben</h2>
      <p>
        Todas las herramientas de este sitio procesan los archivos <strong>directamente en tu
        navegador</strong>. Cuando usas una herramienta, tu imagen o documento no se envía a nuestros
        servidores ni a ningún tercero: se lee, se transforma y se descarga desde tu propio
        dispositivo. No almacenamos, vemos ni tenemos acceso a los archivos que procesas.
      </p>
      <p>
        Algunas herramientas necesitan descargar componentes (por ejemplo, un modelo de inteligencia
        artificial) desde una red de distribución de contenidos. Esa descarga no incluye ningún dato
        tuyo ni de tus archivos.
      </p>

      <h2>2. Información que recopilamos</h2>
      <h3>2.1 Analítica de uso</h3>
      <p>
        Usamos Vercel Analytics para conocer qué páginas se visitan y desde qué tipo de dispositivo.
        Esta herramienta <strong>no utiliza cookies</strong> ni identifica a personas individuales;
        los datos se agregan de forma anónima.
      </p>
      <h3>2.2 Publicidad</h3>
      <p>
        El sitio se financia con publicidad de <strong>Google AdSense</strong>. Google y sus socios
        pueden usar cookies e identificadores similares para mostrar anuncios basados en tus visitas
        a este y otros sitios. Consulta nuestra{" "}
        <Link href="/legal/cookies">política de cookies</Link> y la{" "}
        <a href="https://policies.google.com/technologies/ads?hl=es" target="_blank" rel="noopener noreferrer">
          política de publicidad de Google
        </a>{" "}
        para más detalles.
      </p>
      <p>
        Puedes desactivar la publicidad personalizada desde la{" "}
        <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">
          configuración de anuncios de Google
        </a>{" "}
        o en{" "}
        <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
          aboutads.info
        </a>
        .
      </p>
      <h3>2.3 Datos de contacto</h3>
      <p>
        Si nos escribes por email, conservaremos tu mensaje y dirección solo para responderte.
      </p>

      <h2>3. Base legal y finalidad</h2>
      <p>
        Tratamos la información de analítica y publicidad con la finalidad de mantener el sitio
        gratuito y mejorarlo. La base legal es nuestro interés legítimo y, cuando corresponde según
        tu país (por ejemplo, en la Unión Europea), tu consentimiento.
      </p>

      <h2>4. Terceros</h2>
      <p>Los únicos terceros que pueden recibir datos técnicos de tu visita son:</p>
      <ul>
        <li>
          <strong>Vercel</strong> (alojamiento y analítica) —{" "}
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
            política de privacidad
          </a>
        </li>
        <li>
          <strong>Google AdSense</strong> (publicidad) —{" "}
          <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noopener noreferrer">
            política de privacidad
          </a>
        </li>
      </ul>

      <h2>5. Tus derechos</h2>
      <p>
        Según la legislación aplicable, puedes tener derecho a acceder, rectificar o eliminar tus
        datos personales, así como a oponerte a su tratamiento. Como no recopilamos datos personales
        identificables a través de las herramientas, en la práctica esto aplica solo a los mensajes
        que nos envíes. Para ejercer estos derechos, escríbenos a{" "}
        <a href={`mailto:${siteConfig.emailContacto}`}>{siteConfig.emailContacto}</a>.
      </p>

      <h2>6. Menores</h2>
      <p>
        El sitio no está dirigido a menores de 13 años y no recopilamos a sabiendas información de
        menores.
      </p>

      <h2>7. Cambios en esta política</h2>
      <p>
        Podemos actualizar esta política. Publicaremos la versión vigente en esta misma página con
        la fecha de última actualización.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Para cualquier consulta sobre privacidad:{" "}
        <a href={`mailto:${siteConfig.emailContacto}`}>{siteConfig.emailContacto}</a>.
      </p>
    </>
  );
}
