<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StackFree — notas del proyecto para agentes

Contexto que no se deduce del código. Leer junto con `README.md`.

## Qué es

Plataforma de herramientas online gratuitas (stackfree.vercel.app), monetizada con AdSense, con **procesamiento 100% en el navegador**: ningún archivo del usuario se sube a un servidor. **La carta de presentación es la sección Administración** (análisis de movimientos bancarios y de cobros de Mercado Pago → Excel con fórmulas); las herramientas de imágenes/PDF son el complemento. Dueño: Juan Alonso (alias "John Askew" en su PC y en línea; principiante en desarrollo web; explicarle las decisiones en lenguaje simple, en español rioplatense). Regla del dueño: **gasto $0 en desarrollo e infraestructura**; solo pagaría publicidad o dominio.

## Reglas de arquitectura (no romper)

1. **Una herramienta nueva = una entrada en `lib/tools-registry.ts` + una carpeta en `components/tools/<slug>/`** (`<Nombre>Tool.tsx` con `"use client"` + `logic.ts` sin React). No tocar layout, homepage ni core para agregar herramientas.
2. `logic.ts` nunca importa React ni sabe de la interfaz. Librerías pesadas se importan con `await import()` dentro de la función, nunca arriba del archivo.
3. Cada herramienta se carga con `dynamic(..., { ssr: false })` desde `components/core/ToolLoader.tsx` (code-splitting real; el homepage no descarga JS de herramientas).
4. Herramientas de "varias imágenes → varias imágenes" usan `components/core/LoteImagenes.tsx`; utilidades de imagen en `lib/imagen.ts`; ZIP en `lib/zip.ts`; PDF (carga con errores amigables, rangos "1-3, 5", nombres) en `lib/pdf.ts`.
5. **Variantes** (`variantes` en el registry) = páginas SEO extra que comparten componente y le pasan `opciones`. Solo para funciones realmente distintas (WEBP→JPG vs PNG→WEBP). Sinónimos ("unir/combinar/juntar pdf") van como keywords de una sola página: Google penaliza duplicados.
6. Herramientas en `estado: "proximamente"` llevan `noindex` y no entran al sitemap.
7. Textos para el usuario en español neutro (tuteo). Comentarios de código en español.
8. Anuncios: `<AdSlot posicion=... />` en 4 posiciones; placeholder hasta que existan las variables `NEXT_PUBLIC_ADSENSE_*`.
9. **Administración** (`categoria: "administracion"`): la lógica de cada banco vive en `lib/extractos/<banco>.ts` (lectura + controles + `generarExcel*`), sobre una base común: `tipos.ts`, `texto.ts` (números/fechas/categorías), `planilla.ts` (SheetJS: lee xls/xlsx/xml/html/csv), `excel.ts` (ExcelJS: hojas Detalle/Resumen/Pivot/Control/Diagnóstico con fórmulas SUMIFS), `pantalla.ts` (KPIs y tablas para la UI). La UI es `components/core/AnalizadorExtracto.tsx`; cada herramienta solo aporta `logic.ts` + un `<Nombre>Tool.tsx` de ~30 líneas. Los scripts Python originales están en `python/` y se enlazan con `scriptPython` en el registry. Para sumar un banco: nuevo `lib/extractos/<banco>.ts` + carpeta en `components/tools/` + entrada con `guiaDescarga` (cómo exportar desde el home banking).
10. **CSP** (`lib/csp.ts`, aplicada en `next.config.ts`): todo el sitio lleva `connect-src self blob: data:`; únicas excepciones por ruta: `/herramientas/quitar-fondo-imagen` (descarga el modelo desde staticimgly.com) y `/contacto` (api.web3forms.com). Al agregar una librería que hable con internet hay que declararla ahí, y la página `/verificar-privacidad` la explica al usuario. Los dominios de AdSense se agregan solos cuando existe `NEXT_PUBLIC_ADSENSE_CLIENT`.
11. **Contacto** (`/contacto`): formulario vía Web3Forms (clave pública en `NEXT_PUBLIC_WEB3FORMS_KEY`); sin clave cae a `mailto:`. Sin servidor propio: el sitio sigue siendo 100 % estático.

## Licencias

El sitio es **AGPL-3.0** (repo público) porque `@imgly/background-removal` (quitar fondo) es AGPL. Todo lo demás es MIT (pdf-lib, fflate, upng-js, pako, shadcn, exceljs), Apache-2.0 (pdfjs-dist, SheetJS `xlsx` 0.20 instalado desde cdn.sheetjs.com) o LGPL-3.0 (`heic-to`, libheif en WebAssembly; compatible con AGPL). El footer enlaza al código fuente (requisito AGPL). Si algún día se quiere cerrar el código, reemplazar esa librería en `components/tools/quitar-fondo/logic.ts`.

## Deploy y servicios

- GitHub: `juansalonso87-arch/stackfree`, rama `main`. Vercel (plan Hobby) redeploya en cada push; no hay pasos manuales.
- `siteConfig.url` se resuelve solo desde `VERCEL_PROJECT_PRODUCTION_URL`; con dominio propio, definir `NEXT_PUBLIC_SITE_URL` en Vercel.
- Google Search Console: propiedad `https://stackfree.vercel.app/` verificada por meta tag (`siteConfig.googleSiteVerification`); sitemap enviado el 2026-09-11. Si cambia el dominio, verificar de nuevo.
- Modelo de IA de quitar fondo: se descarga del CDN de IMG.LY (no consume ancho de banda de Vercel).

## Cosas conocidas

- `@imgly/background-removal` 1.7.0 declara aceptar `ImageData` pero solo funciona con `Blob` (por eso `logic.ts` re-exporta desde canvas).
- `next/dynamic` con `ssr:false` solo funciona en componentes de cliente (por eso existe `ToolLoader`).
- `Button` de shadcn (Base UI): para usarlo como link, `render={<Link />}` + `nativeButton={false}`.
- `heic-to`: se importa la build `heic-to/csp` (sin `new Function`, compatible con la CSP). Safari abre HEIC nativo, por eso `logic.ts` prueba primero `createImageBitmap`.
- ExcelJS guarda fechas en UTC: usar `fechaExcel()` (lib/extractos/excel.ts) para que una medianoche argentina no quede como 03:00. Las hojas se crean en el orden en que deben verse; `planificarDetalle()` calcula las columnas del Detalle antes de escribirlo para que las fórmulas de los resúmenes apunten bien.
- SheetJS lee el XML de Excel 2003 de Mercado Pago respetando `ss:Index` (celdas vacías), y los .xls binarios/HTML de BBVA. Windows y algunos celulares informan tipo MIME vacío o genérico: `FileDropzone` deduce por extensión.
- BBVA **recorta el concepto a ~12 caracteres** ("TRANSFERENCI", "PAGO SERVICI", "CUPON. ARGEN", "LEY NRO 25.4"). Por eso el clasificador de `bbva.ts` compara palabra por palabra tolerando recortes (`coincide()`), usa vocabulario real del banco (cupones Argencard/Cabal, MAE-ACREDITA, DNET, BTOB, OG-DEBITO DI) y mira el Detalle para plataformas (DELIVERY HERO). Validado el 2026-09-14 con un archivo real del dueño: 263 → 0 en "Otros". Santander/Comafi/MP siguen validados solo con archivos sintéticos.
- pdf.js (`pdfjs-dist` 6.x): el worker se referencia con `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` y Turbopack lo publica en `/_next/static/media/` (sin copiar nada a `public/`). Renderizar con `intent: "print"`: el modo "display" usa `requestAnimationFrame` y se congela si la pestaña queda en segundo plano.

## Pendientes (fuera del código)

- Dominio propio antes de postular a AdSense (Google rechaza `*.vercel.app`).
- Ideas siguientes: más bancos (Galicia, Nación, Macro, Provincia, Brubank/Ualá), conciliación banco↔MP, comprimir PDF (difícil 100 % en navegador), firmar PDF, marca de agua, QR.
- Las guías de exportación (`guiaDescarga`) las confirmó el dueño el 2026-09-14 con los menús reales de cada home banking. Falta validar con archivos reales que el "Descargar movimientos" de Santander entregue el formato "Cash Management" que espera el lector.
- Contacto activo con Web3Forms (plan Free, 250 mensajes/mes) desde el 2026-09-14; la clave pública está en `siteConfig.claveFormularioContacto` (se puede pisar con `NEXT_PUBLIC_WEB3FORMS_KEY`). Panel: app.web3forms.com con juan.s.alonso87@gmail.com.
- Nuevo nombre + dominio propio (el actual "StackFree" es provisorio; cambiarlo es `siteConfig.nombre` + README/AGENTS).
