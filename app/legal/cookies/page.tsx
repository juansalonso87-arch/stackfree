import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

/* CONTENIDO GENÉRICO EDITABLE. */

const ULTIMA_ACTUALIZACION = "11 de septiembre de 2026";

export const metadata: Metadata = {
  title: "Política de cookies",
  description: `Qué cookies usa ${siteConfig.nombre}, para qué sirven y cómo desactivarlas.`,
  alternates: { canonical: "/legal/cookies" },
};

export default function PaginaCookies() {
  return (
    <>
      <h1>Política de cookies</h1>
      <p>
        <em>Última actualización: {ULTIMA_ACTUALIZACION}</em>
      </p>

      <h2>¿Qué es una cookie?</h2>
      <p>
        Una cookie es un pequeño archivo de texto que un sitio web guarda en tu navegador. Sirve, por
        ejemplo, para recordar preferencias o para que las redes publicitarias midan y personalicen
        anuncios.
      </p>

      <h2>Cookies que usa este sitio</h2>
      <p>
        <strong>{siteConfig.nombre} no utiliza cookies propias.</strong> Nuestra analítica (Vercel
        Analytics) funciona sin cookies y sin identificar personas.
      </p>
      <p>
        Las únicas cookies que puedes recibir provienen de <strong>Google AdSense</strong>, el
        servicio que muestra los anuncios que mantienen el sitio gratuito:
      </p>
      <table>
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Finalidad</th>
            <th>Más información</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Google AdSense / DoubleClick</td>
            <td>Mostrar anuncios, limitar su frecuencia, medir su rendimiento y, si lo consientes, personalizarlos según tus intereses.</td>
            <td>
              <a href="https://policies.google.com/technologies/cookies?hl=es" target="_blank" rel="noopener noreferrer">
                Cómo usa Google las cookies
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Consentimiento</h2>
      <p>
        Si nos visitas desde el Espacio Económico Europeo, el Reino Unido o Suiza, verás un aviso
        para aceptar o rechazar las cookies publicitarias antes de que se carguen. Puedes cambiar tu
        elección en cualquier momento desde ese mismo aviso.
      </p>

      <h2>Cómo desactivar las cookies</h2>
      <ul>
        <li>
          Desde la{" "}
          <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">
            configuración de anuncios de Google
          </a>{" "}
          puedes desactivar la publicidad personalizada.
        </li>
        <li>
          Todos los navegadores permiten bloquear o borrar cookies desde su configuración
          (busca “cookies” en los ajustes de Chrome, Firefox, Safari o Edge).
        </li>
      </ul>
      <p>
        Bloquear las cookies no afecta el funcionamiento de las herramientas: siguen procesando tus
        archivos localmente en tu navegador.
      </p>

      <h2>Más información</h2>
      <p>
        Consulta nuestra <Link href="/legal/privacidad">política de privacidad</Link> o escríbenos a{" "}
        <a href={`mailto:${siteConfig.emailContacto}`}>{siteConfig.emailContacto}</a>.
      </p>
    </>
  );
}
