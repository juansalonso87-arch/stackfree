# Herramientas Online

Plataforma de herramientas web gratuitas con **procesamiento 100% en el navegador**: los archivos del usuario nunca se suben a un servidor. Se monetiza con Google AdSense y se aloja gratis en Vercel.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) + TypeScript
- Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com)
- Íconos: Lucide
- Analytics: Vercel Analytics (sin cookies)
- Hosting: Vercel (deploy automático desde GitHub)

## Cómo correrlo en tu máquina

Necesitás Node.js 20.9 o superior.

```bash
npm install
npm run dev
```

Abrí <http://localhost:3000>.

Otros comandos:

| Comando          | Qué hace                                             |
| ---------------- | ---------------------------------------------------- |
| `npm run build`  | Genera la versión de producción (lo que corre Vercel) |
| `npm run start`  | Sirve la versión de producción generada               |
| `npm run lint`   | Revisa errores de código                              |

## Estructura del proyecto

```
app/
  layout.tsx                  Header + footer + metadata global + analytics + script AdSense
  page.tsx                    Homepage: grilla de herramientas (lee el registry)
  herramientas/[slug]/        Página de cada herramienta (SEO, FAQ, anuncios, carga del módulo)
  legal/                      Privacidad, términos y cookies (contenido editable)
  sitemap.ts · robots.ts      Se generan solos desde el registry
  opengraph-image.tsx         Imagen para compartir en redes (también por herramienta)
components/
  core/                       Piezas compartidas por TODAS las herramientas
    FileDropzone.tsx          Arrastrar/soltar archivos con validación
    ProcessingCard.tsx        Estados idle / procesando / listo / error
    DownloadButton.tsx        Descarga de resultados generados en el navegador
    AdSlot.tsx                Espacio publicitario (placeholder hasta tener AdSense)
    ToolLoader.tsx            Carga cada herramienta en su propio paquete JS
    ToolCard.tsx · JsonLd.tsx
  layout/                     Header y Footer
  tools/<herramienta>/        Una carpeta por herramienta: <Nombre>Tool.tsx + logic.ts
  ui/                         Componentes de shadcn/ui
lib/
  tools-registry.ts           ★ ÚNICA lista de herramientas (metadata + SEO + FAQ)
  site-config.ts              Nombre del sitio, dominio, email de contacto
  ads-config.ts               IDs de AdSense (se leen de variables de entorno)
```

## Agregar una herramienta nueva

1. Creá `components/tools/<nombre>/` con `<Nombre>Tool.tsx` (interfaz, `"use client"`) y `logic.ts` (procesamiento puro, sin React).
2. Agregá una entrada al array `herramientas` en `lib/tools-registry.ts` (slug, textos SEO, pasos, FAQ y el `cargar: () => import(...)`).

Nada más. Homepage, página, sitemap, footer y SEO se actualizan solos.

Mientras la herramienta no esté lista, dejá `estado: "proximamente"`: se muestra con etiqueta, pero no se indexa ni entra al sitemap. Cuando funcione, cambiá a `"activa"`.

## Variables de entorno

Ver `.env.example`. Ninguna es obligatoria. Las de AdSense se completan cuando Google apruebe la cuenta.

## Deploy en Vercel

1. Subí el repositorio a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New Project** → importá el repo. Vercel detecta Next.js solo; no hay que configurar nada.
3. Cada `git push` a `main` genera un deploy nuevo automáticamente.
4. (Opcional) En el proyecto de Vercel → **Settings → Domains** agregá tu dominio, y en **Environment Variables** definí `NEXT_PUBLIC_SITE_URL=https://tu-dominio.com`.

## AdSense: checklist para la aprobación

- [ ] Dominio propio (los subdominios `*.vercel.app` suelen ser rechazados).
- [ ] Al menos una herramienta `activa` con contenido real.
- [ ] Páginas legales revisadas (editar email de contacto en `lib/site-config.ts` y `[PAÍS]` en términos).
- [ ] Algo de tráfico orgánico.
- [ ] Al aprobar: pegar el `ca-pub-...` y los IDs de slot en las variables de entorno de Vercel y redeployar.
- [ ] Activar en el panel de AdSense **Privacidad y mensajes → Mensaje de consentimiento (GDPR)** para visitantes de Europa. Se inyecta solo con el script; no hay que programar nada.
- [ ] Reemplazar `public/ads.txt` con la línea que te da AdSense.
