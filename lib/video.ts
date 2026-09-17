import type { VideoHerramienta } from "@/lib/tools-registry";
import { siteConfig } from "@/lib/site-config";

/** Página del video en YouTube (para el enlace "Ver en YouTube"). */
export function urlVideoYouTube(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

/**
 * Reproductor incrustado. Se usa el dominio "sin cookies" de YouTube: no
 * guarda cookies de seguimiento hasta que la persona interactúa con el video.
 * Este host está permitido en `frame-src` (lib/csp.ts).
 */
export function urlEmbedYouTube(youtubeId: string, autoplay = false): string {
  const parametros = new URLSearchParams({ rel: "0", hl: "es" });
  if (autoplay) parametros.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${parametros}`;
}

/** "PT5M44S" → "5:44" (o "1:02:05" si hay horas). */
export function duracionLegible(iso: string): string {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return "";
  const [, h = "0", min = "0", s = "0"] = m;
  const dos = (n: string) => n.padStart(2, "0");
  return Number(h) > 0 ? `${h}:${dos(min)}:${dos(s)}` : `${Number(min)}:${dos(s)}`;
}

/** Datos estructurados para que Google muestre el video en los resultados. */
export function jsonLdVideo(video: VideoHerramienta) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.titulo,
    description: video.descripcion,
    thumbnailUrl: [`${siteConfig.url}${video.miniatura}`],
    uploadDate: video.publicado,
    duration: video.duracion,
    contentUrl: urlVideoYouTube(video.youtubeId),
    embedUrl: urlEmbedYouTube(video.youtubeId),
    inLanguage: siteConfig.idioma,
    publisher: { "@type": "Organization", name: siteConfig.nombre, url: siteConfig.url },
  };
}
