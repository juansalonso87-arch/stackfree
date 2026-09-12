<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StackFree — notas del proyecto para agentes

Contexto que no se deduce del código. Leer junto con `README.md`.

## Qué es

Plataforma de herramientas online gratuitas (stackfree.vercel.app), monetizada con AdSense, con **procesamiento 100% en el navegador**: ningún archivo del usuario se sube a un servidor. Dueño: Juan Alonso (alias "John Askew" en su PC y en línea; principiante en desarrollo web; explicarle las decisiones en lenguaje simple, en español rioplatense). Regla del dueño: **gasto $0 en desarrollo e infraestructura**; solo pagaría publicidad o dominio.

## Reglas de arquitectura (no romper)

1. **Una herramienta nueva = una entrada en `lib/tools-registry.ts` + una carpeta en `components/tools/<slug>/`** (`<Nombre>Tool.tsx` con `"use client"` + `logic.ts` sin React). No tocar layout, homepage ni core para agregar herramientas.
2. `logic.ts` nunca importa React ni sabe de la interfaz. Librerías pesadas se importan con `await import()` dentro de la función, nunca arriba del archivo.
3. Cada herramienta se carga con `dynamic(..., { ssr: false })` desde `components/core/ToolLoader.tsx` (code-splitting real; el homepage no descarga JS de herramientas).
4. Herramientas de "varias imágenes → varias imágenes" usan `components/core/LoteImagenes.tsx`; utilidades de imagen en `lib/imagen.ts`; ZIP en `lib/zip.ts`.
5. **Variantes** (`variantes` en el registry) = páginas SEO extra que comparten componente y le pasan `opciones`. Solo para funciones realmente distintas (WEBP→JPG vs PNG→WEBP). Sinónimos ("unir/combinar/juntar pdf") van como keywords de una sola página: Google penaliza duplicados.
6. Herramientas en `estado: "proximamente"` llevan `noindex` y no entran al sitemap.
7. Textos para el usuario en español neutro (tuteo). Comentarios de código en español.
8. Anuncios: `<AdSlot posicion=... />` en 4 posiciones; placeholder hasta que existan las variables `NEXT_PUBLIC_ADSENSE_*`.

## Licencias

El sitio es **AGPL-3.0** (repo público) porque `@imgly/background-removal` (quitar fondo) es AGPL. Todo lo demás es MIT (pdf-lib, fflate, upng-js, pako, shadcn). El footer enlaza al código fuente (requisito AGPL). Si algún día se quiere cerrar el código, reemplazar esa librería en `components/tools/quitar-fondo/logic.ts`.

## Deploy y servicios

- GitHub: `juansalonso87-arch/stackfree`, rama `main`. Vercel (plan Hobby) redeploya en cada push; no hay pasos manuales.
- `siteConfig.url` se resuelve solo desde `VERCEL_PROJECT_PRODUCTION_URL`; con dominio propio, definir `NEXT_PUBLIC_SITE_URL` en Vercel.
- Google Search Console: propiedad `https://stackfree.vercel.app/` verificada por meta tag (`siteConfig.googleSiteVerification`); sitemap enviado el 2026-09-11. Si cambia el dominio, verificar de nuevo.
- Modelo de IA de quitar fondo: se descarga del CDN de IMG.LY (no consume ancho de banda de Vercel).

## Cosas conocidas

- `@imgly/background-removal` 1.7.0 declara aceptar `ImageData` pero solo funciona con `Blob` (por eso `logic.ts` re-exporta desde canvas).
- `next/dynamic` con `ssr:false` solo funciona en componentes de cliente (por eso existe `ToolLoader`).
- `Button` de shadcn (Base UI): para usarlo como link, `render={<Link />}` + `nativeButton={false}`.

## Pendientes (fuera del código)

- Dominio propio antes de postular a AdSense (Google rechaza `*.vercel.app`).
- Ideas siguientes por volumen de búsqueda: PDF a imagen (requiere pdf.js), rotar PDF, recortar imagen, HEIC a JPG (requiere decodificador).
