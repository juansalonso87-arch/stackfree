import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

/*
 * CONTENIDO GENÉRICO EDITABLE.
 * Completá [PAÍS] con tu jurisdicción y revisá el resto según tu caso.
 */

const ULTIMA_ACTUALIZACION = "11 de septiembre de 2026";
const JURISDICCION = "[PAÍS]";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: `Condiciones de uso de ${siteConfig.nombre}: herramientas gratuitas ofrecidas "tal cual", responsabilidad del usuario y propiedad intelectual.`,
  alternates: { canonical: "/legal/terminos" },
};

export default function PaginaTerminos() {
  return (
    <>
      <h1>Términos de uso</h1>
      <p>
        <em>Última actualización: {ULTIMA_ACTUALIZACION}</em>
      </p>

      <p>
        Al usar <strong>{siteConfig.nombre}</strong> ({siteConfig.url}) aceptas estos términos. Si no
        estás de acuerdo, por favor no utilices el sitio.
      </p>

      <h2>1. El servicio</h2>
      <p>
        {siteConfig.nombre} ofrece herramientas online gratuitas para procesar archivos (por ejemplo,
        imágenes y documentos). El procesamiento se realiza en tu navegador; no subimos ni
        almacenamos tus archivos. El servicio se financia mediante publicidad.
      </p>

      <h2>2. Uso permitido</h2>
      <p>Te comprometes a usar las herramientas de forma legal y responsable. En particular, no puedes:</p>
      <ul>
        <li>Procesar contenido que infrinja derechos de terceros (propiedad intelectual, imagen, privacidad).</li>
        <li>Usar el sitio para fines ilegales, fraudulentos o dañinos.</li>
        <li>Intentar interferir con el funcionamiento del sitio, sus anuncios o su infraestructura.</li>
        <li>Copiar, revender o redistribuir el sitio o sus componentes sin autorización.</li>
      </ul>

      <h2>3. Tus archivos y resultados</h2>
      <p>
        Eres el único responsable de los archivos que procesas y de los resultados que generas. Como
        el procesamiento ocurre en tu dispositivo, conservas todos los derechos sobre tu contenido y
        no adquirimos ningún derecho sobre él.
      </p>

      <h2>4. Sin garantías</h2>
      <p>
        Las herramientas se ofrecen <strong>“tal cual”</strong> y <strong>“según disponibilidad”</strong>,
        sin garantías de ningún tipo. No garantizamos que los resultados sean exactos, que el servicio
        esté libre de errores o que funcione en todos los dispositivos y navegadores. Te recomendamos
        conservar siempre una copia de tus archivos originales.
      </p>

      <h2>5. Limitación de responsabilidad</h2>
      <p>
        En la máxima medida permitida por la ley, {siteConfig.nombre} no será responsable por daños
        directos, indirectos, incidentales o consecuentes derivados del uso o la imposibilidad de uso
        del sitio, incluida la pérdida de datos.
      </p>

      <h2>6. Propiedad intelectual</h2>
      <p>
        El diseño, los textos y el código del sitio son propiedad de {siteConfig.nombre} o de sus
        licenciantes. Algunas herramientas utilizan librerías de código abierto bajo sus respectivas
        licencias.
      </p>

      <h2>7. Publicidad y enlaces de terceros</h2>
      <p>
        El sitio muestra anuncios de terceros (Google AdSense). No controlamos ni respondemos por el
        contenido de esos anuncios ni de los sitios a los que enlazan. Consulta nuestra{" "}
        <Link href="/legal/privacidad">política de privacidad</Link>.
      </p>

      <h2>8. Cambios y disponibilidad</h2>
      <p>
        Podemos modificar, suspender o discontinuar cualquier herramienta o el sitio completo en
        cualquier momento, así como actualizar estos términos. La versión vigente será siempre la
        publicada en esta página.
      </p>

      <h2>9. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de {JURISDICCION}. Cualquier disputa se someterá a los
        tribunales competentes de esa jurisdicción.
      </p>

      <h2>10. Contacto</h2>
      <p>
        Preguntas sobre estos términos:{" "}
        <a href={`mailto:${siteConfig.emailContacto}`}>{siteConfig.emailContacto}</a>.
      </p>
    </>
  );
}
