/**
 * Layout compartido por las páginas legales: centra el texto y aplica el
 * estilo "prose" (tipografía para textos largos) de Tailwind.
 */
export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <div className="prose prose-neutral max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-a:text-primary">
        {children}
      </div>
    </article>
  );
}
