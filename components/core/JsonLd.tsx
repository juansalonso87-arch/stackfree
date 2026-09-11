/**
 * Inserta datos estructurados (schema.org) para que Google entienda mejor la
 * página y pueda mostrar "rich snippets" (por ejemplo, las preguntas de la
 * FAQ directamente en los resultados de búsqueda).
 *
 * Se reemplaza "<" por su código unicode para que ningún contenido pueda
 * cerrar la etiqueta <script> por accidente (recomendación de Next.js).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
