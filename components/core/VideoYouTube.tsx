"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { VideoHerramienta } from "@/lib/tools-registry";
import { urlEmbedYouTube, urlVideoYouTube } from "@/lib/video";
import { cn } from "@/lib/utils";

interface VideoYouTubeProps {
  video: VideoHerramienta;
  className?: string;
}

/**
 * Video de YouTube "perezoso": hasta que la persona toca reproducir, lo único
 * que se ve es una imagen nuestra (servida desde este dominio) con un botón.
 * Recién ahí se crea el iframe de YouTube. Así la página no hace ninguna
 * conexión a Google mientras alguien analiza su archivo, y además carga más
 * rápido (el reproductor de YouTube pesa más que toda nuestra página).
 */
export function VideoYouTube({ video, className }: VideoYouTubeProps) {
  const [reproduciendo, setReproduciendo] = useState(false);

  return (
    <figure className={cn("space-y-2", className)}>
      <div className="relative aspect-video overflow-hidden rounded-xl border bg-black">
        {reproduciendo ? (
          <iframe
            src={urlEmbedYouTube(video.youtubeId, true)}
            title={video.titulo}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setReproduciendo(true)}
            aria-label={`Reproducir el video: ${video.titulo}`}
            className="group absolute inset-0 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <img
              src={video.miniatura}
              alt=""
              width={1280}
              height={720}
              loading="lazy"
              className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110 sm:size-20">
              <Play className="ml-1 size-7 fill-current sm:size-8" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span>El reproductor de YouTube se carga solo cuando tocás reproducir.</span>
        <a
          href={urlVideoYouTube(video.youtubeId)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Ver en YouTube
        </a>
      </figcaption>
    </figure>
  );
}
