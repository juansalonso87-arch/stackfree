"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Crop, ImageIcon, Maximize2 } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { DownloadButton } from "@/components/core/DownloadButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { decodificarImagen, exportarCanvas } from "@/lib/imagen";
import type { PropsHerramienta } from "@/lib/tools-registry";
import { NotaPrivacidad } from "@/components/core/NotaPrivacidad";
import {
  FORMATOS_ENTRADA,
  FORMATOS_SALIDA,
  LADO_PREVIA,
  MAX_MB,
  PROPORCIONES,
  acotar,
  aplicarProporcion,
  formatearBytes,
  recortarImagen,
  rectInicial,
  redimensionarDesde,
  type Forma,
  type FormatoSalida,
  type Manija,
  type Rect,
  type ResultadoRecorte,
} from "./logic";

interface Previa {
  url: string;
  /** Tamaño real de la imagen (el recuadro se mide en estos píxeles). */
  ancho: number;
  alto: number;
}

const FONDO_AJEDREZ =
  "bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]";

const MANIJAS: { id: Manija; clase: string; cursor: string }[] = [
  { id: "no", clase: "-top-2.5 -left-2.5", cursor: "cursor-nwse-resize" },
  { id: "n", clase: "-top-2.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
  { id: "ne", clase: "-top-2.5 -right-2.5", cursor: "cursor-nesw-resize" },
  { id: "e", clase: "top-1/2 -right-2.5 -translate-y-1/2", cursor: "cursor-ew-resize" },
  { id: "se", clase: "-bottom-2.5 -right-2.5", cursor: "cursor-nwse-resize" },
  { id: "s", clase: "-bottom-2.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
  { id: "so", clase: "-bottom-2.5 -left-2.5", cursor: "cursor-nesw-resize" },
  { id: "o", clase: "top-1/2 -left-2.5 -translate-y-1/2", cursor: "cursor-ew-resize" },
];

/**
 * Editor visual: la imagen (vista previa liviana) con un recuadro que se
 * mueve arrastrándolo y se redimensiona desde 8 manijas. Funciona con mouse,
 * dedo (Pointer Events) y teclado (flechas). El recuadro se guarda en píxeles
 * de la imagen REAL; acá solo se escala para dibujarlo.
 */
function EditorRecorte({
  previa,
  rect,
  onRect,
  proporcion,
  forma,
}: {
  previa: Previa;
  rect: Rect;
  onRect: (r: Rect) => void;
  proporcion: number | null;
  forma: Forma;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  const arrastre = useRef<{ manija: Manija | "mover"; x0: number; y0: number; rect0: Rect } | null>(null);

  // Mide la imagen dibujada (cambia con el ancho de pantalla).
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const medir = () => setMedida({ ancho: img.clientWidth, alto: img.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(img);
    return () => ro.disconnect();
  }, [previa.url]);

  const escala = medida.ancho > 0 ? medida.ancho / previa.ancho : 0;

  const alPresionar = (e: PointerEvent<HTMLElement>, manija: Manija | "mover") => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { manija, x0: e.clientX, y0: e.clientY, rect0: rect };
  };

  const mover = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current;
    if (!a || escala === 0) return;
    const dx = (e.clientX - a.x0) / escala;
    const dy = (e.clientY - a.y0) / escala;
    if (a.manija === "mover") {
      onRect(acotar({ ...a.rect0, x: a.rect0.x + dx, y: a.rect0.y + dy }, previa.ancho, previa.alto));
    } else {
      onRect(redimensionarDesde(a.rect0, a.manija, dx, dy, proporcion, previa.ancho, previa.alto));
    }
  };

  const terminar = (e: PointerEvent<HTMLElement>) => {
    if (arrastre.current) e.currentTarget.releasePointerCapture(e.pointerId);
    arrastre.current = null;
  };

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0],
      ArrowRight: [paso, 0],
      ArrowUp: [0, -paso],
      ArrowDown: [0, paso],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onRect(acotar({ ...rect, x: rect.x + d[0], y: rect.y + d[1] }, previa.ancho, previa.alto));
  };

  return (
    <div className="flex justify-center">
      <div className={cn("relative inline-block max-w-full overflow-hidden rounded-lg", FONDO_AJEDREZ)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={previa.url}
          alt="Imagen a recortar"
          draggable={false}
          className="block max-h-[65vh] w-auto max-w-full select-none"
        />
        {escala > 0 && (
          <div
            role="group"
            aria-label={`Área de recorte: ${rect.ancho} por ${rect.alto} píxeles. Usa las flechas para moverla.`}
            tabIndex={0}
            onKeyDown={teclado}
            onPointerDown={(e) => alPresionar(e, "mover")}
            onPointerMove={mover}
            onPointerUp={terminar}
            onPointerCancel={terminar}
            className={cn(
              "absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] outline-none focus-visible:border-primary",
              forma === "circulo" && "rounded-full",
            )}
            style={{
              left: rect.x * escala,
              top: rect.y * escala,
              width: rect.ancho * escala,
              height: rect.alto * escala,
            }}
          >
            {forma === "rectangulo" && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <span className="absolute top-0 bottom-0 left-1/3 w-px bg-white/50" />
                <span className="absolute top-0 bottom-0 left-2/3 w-px bg-white/50" />
                <span className="absolute top-1/3 right-0 left-0 h-px bg-white/50" />
                <span className="absolute top-2/3 right-0 left-0 h-px bg-white/50" />
              </div>
            )}
            {MANIJAS.map((m) => (
              <div
                key={m.id}
                aria-hidden="true"
                onPointerDown={(e) => alPresionar(e, m.id)}
                onPointerMove={mover}
                onPointerUp={terminar}
                onPointerCancel={terminar}
                className={cn("absolute flex size-5 touch-none items-center justify-center", m.clase, m.cursor)}
              >
                <span className="block size-3 rounded-full border border-primary bg-white shadow" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Interfaz de "Recortar imagen". `opciones.forma` (variante "recortar imagen
 * circular") arranca en modo círculo.
 */
export default function RecortarImagenTool({ opciones }: PropsHerramienta) {
  const formaInicial: Forma = opciones?.forma === "circulo" ? "circulo" : "rectangulo";
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [errorLectura, setErrorLectura] = useState<string>();
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, ancho: 1, alto: 1 });
  const [forma, setForma] = useState<Forma>(formaInicial);
  const [proporcion, setProporcion] = useState<number | null>(formaInicial === "circulo" ? 1 : null);
  const [formato, setFormato] = useState<FormatoSalida>("original");
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoRecorte | null>(null);

  // Genera una vista previa liviana (≤ 1600 px) apenas se elige el archivo.
  useEffect(() => {
    if (!archivo) return;
    let cancelado = false;
    let url: string | undefined;
    (async () => {
      try {
        const img = await decodificarImagen(archivo, LADO_PREVIA);
        const blob = await exportarCanvas(img.canvas, archivo.type === "image/png" ? "image/png" : "image/jpeg", 0.85);
        if (cancelado) return;
        url = URL.createObjectURL(blob);
        setPrevia({ url, ancho: img.anchoOriginal, alto: img.altoOriginal });
        setRect(rectInicial(img.anchoOriginal, img.altoOriginal, formaInicial === "circulo" ? 1 : null));
      } catch (e) {
        if (!cancelado) setErrorLectura(e instanceof Error ? e.message : "No se pudo leer la imagen.");
      }
    })();
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [archivo, formaInicial]);

  // URL temporal del resultado, liberada al cambiar.
  const urlResultado = useMemo(() => (resultado ? URL.createObjectURL(resultado.blob) : undefined), [resultado]);
  useEffect(() => () => {
    if (urlResultado) URL.revokeObjectURL(urlResultado);
  }, [urlResultado]);

  const reiniciar = () => {
    setArchivo(null);
    setPrevia(null);
    setErrorLectura(undefined);
    setResultado(null);
    setError(undefined);
    setEstado("idle");
  };

  const elegirProporcion = useCallback(
    (p: number | null) => {
      setProporcion(p);
      if (previa) setRect((r) => aplicarProporcion(r, p, previa.ancho, previa.alto));
    },
    [previa],
  );

  const elegirForma = (f: Forma) => {
    setForma(f);
    if (f === "circulo") elegirProporcion(1);
  };

  const todaLaImagen = () => {
    if (!previa) return;
    setRect(
      proporcion === null
        ? { x: 0, y: 0, ancho: previa.ancho, alto: previa.alto }
        : rectInicial(previa.ancho, previa.alto, proporcion),
    );
  };

  const ejecutar = async () => {
    if (!archivo || !previa) return;
    setEstado("procesando");
    setError(undefined);
    try {
      setResultado(await recortarImagen(archivo, rect, { forma, formato }));
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  return (
    <ProcessingCard
      estado={estado}
      mensajeProgreso="Recortando…"
      mensajeError={error}
      onReintentar={ejecutar}
      onReiniciar={reiniciar}
    >
      {estado === "idle" && !archivo && (
        <FileDropzone
          accept={FORMATOS_ENTRADA}
          maxSizeMB={MAX_MB}
          onFiles={(a) => setArchivo(a[0])}
          titulo="Arrastra tu imagen aquí"
          descripcion="o toca para seleccionarla"
        />
      )}

      {estado === "idle" && archivo && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <ImageIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{archivo.name}</p>
              <p className={errorLectura ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errorLectura ??
                  (previa
                    ? `${previa.ancho} × ${previa.alto} px · ${formatearBytes(archivo.size)}`
                    : `Leyendo… · ${formatearBytes(archivo.size)}`)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>
              Cambiar
            </Button>
          </div>

          {previa && (
            <>
              <EditorRecorte previa={previa} rect={rect} onRect={setRect} proporcion={proporcion} forma={forma} />

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Recorte: </span>
                  <span className="font-medium tabular-nums">
                    {rect.ancho} × {rect.alto} px
                  </span>
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={todaLaImagen}>
                  <Maximize2 data-icon="inline-start" />
                  {proporcion === null ? "Toda la imagen" : "Lo más grande posible"}
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Forma</legend>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={forma === "rectangulo" ? "default" : "outline"}
                      onClick={() => elegirForma("rectangulo")}
                      aria-pressed={forma === "rectangulo"}
                    >
                      Rectángulo
                    </Button>
                    <Button
                      type="button"
                      variant={forma === "circulo" ? "default" : "outline"}
                      onClick={() => elegirForma("circulo")}
                      aria-pressed={forma === "circulo"}
                    >
                      Círculo
                    </Button>
                  </div>
                  {forma === "circulo" && (
                    <p className="text-xs text-muted-foreground">
                      El resultado es un PNG con el exterior del círculo transparente.
                    </p>
                  )}
                </fieldset>

                {forma === "rectangulo" ? (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Proporción</legend>
                    <div className="flex flex-wrap gap-2">
                      {PROPORCIONES.map((p) => (
                        <Button
                          key={p.etiqueta}
                          type="button"
                          size="sm"
                          variant={proporcion === p.valor ? "default" : "outline"}
                          onClick={() => elegirProporcion(p.valor)}
                          aria-pressed={proporcion === p.valor}
                          title={p.ayuda}
                        >
                          {p.etiqueta}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <div />
                )}

                {forma === "rectangulo" && (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Guardar como</legend>
                    <div className="flex flex-wrap gap-2">
                      {FORMATOS_SALIDA.map((f) => (
                        <Button
                          key={f.valor}
                          type="button"
                          size="sm"
                          variant={formato === f.valor ? "default" : "outline"}
                          onClick={() => setFormato(f.valor)}
                          aria-pressed={formato === f.valor}
                        >
                          {f.nombre}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={ejecutar}>
                  <Crop data-icon="inline-start" />
                  Recortar imagen
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {estado === "listo" && resultado && (
        <div className="space-y-4">
          <div className={cn("flex justify-center rounded-lg border p-2", FONDO_AJEDREZ)}>
            {urlResultado && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urlResultado} alt="Imagen recortada" className="max-h-[55vh] w-auto max-w-full" />
            )}
          </div>
          <p className="text-sm">
            <span className="font-medium">{resultado.nombre}</span>
            <span className="text-muted-foreground">
              {" "}
              · {resultado.ancho} × {resultado.alto} px · {formatearBytes(resultado.blob.size)}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <DownloadButton archivo={resultado.blob} nombreArchivo={resultado.nombre} label="Descargar imagen" />
            <Button size="lg" variant="outline" onClick={() => { setResultado(null); setEstado("idle"); }}>
              Ajustar el recorte
            </Button>
            <Button size="lg" variant="ghost" onClick={reiniciar}>
              Otra imagen
            </Button>
          </div>
          <NotaPrivacidad texto="Procesado en tu navegador. Tu imagen no se subió a ningún servidor." />
        </div>
      )}
    </ProcessingCard>
  );
}
