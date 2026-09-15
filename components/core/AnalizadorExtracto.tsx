"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, ShieldCheck, X, XCircle } from "lucide-react";
import { FileDropzone } from "@/components/core/FileDropzone";
import { ProcessingCard, type EstadoProceso } from "@/components/core/ProcessingCard";
import { PedidoDevolucion } from "@/components/core/PedidoDevolucion";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatearBytes } from "@/lib/imagen";
import type { Control } from "@/lib/extractos/tipos";

export interface Kpi {
  etiqueta: string;
  valor: string;
  tono?: "positivo" | "negativo" | "neutro";
}

export interface TablaResumen {
  titulo: string;
  columnas: string[];
  filas: (string | number)[][];
  /** Índices de columnas numéricas (alineadas a la derecha). */
  numericas: number[];
  /** Filas a resaltar (por ejemplo "Otros" sin categoría). */
  resaltar?: (fila: (string | number)[]) => boolean;
}

export interface ResultadoAnalisis {
  titulo: string;
  subtitulo?: string;
  kpis: Kpi[];
  tablas: TablaResumen[];
  controles?: Control[];
  avisos: string[];
  nombreExcel: string;
  /** Genera el Excel recién cuando el usuario lo pide (carga ExcelJS a demanda). */
  generarExcel: () => Promise<Blob>;
}

interface Props {
  accept: string[];
  maxSizeMB?: number;
  multiple?: boolean;
  maxArchivos?: number;
  tituloDropzone: string;
  descripcionDropzone?: string;
  /** Aviso sobre qué archivo exacto hay que descargar del banco. */
  instrucciones?: ReactNode;
  /** Panel de opciones (ej. hora de corte del turno). */
  opciones?: ReactNode;
  etiquetaAccion: string;
  analizar: (archivos: File[]) => Promise<ResultadoAnalisis>;
}

function claveDe(f: File) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

/**
 * Flujo genérico de los analizadores de administración: elegir el archivo
 * exportado del banco/plataforma, analizarlo en el navegador, ver el resumen
 * en pantalla (indicadores, controles, tabla) y descargar el Excel completo.
 */
export function AnalizadorExtracto({
  accept,
  maxSizeMB = 25,
  multiple = false,
  maxArchivos = 12,
  tituloDropzone,
  descripcionDropzone,
  instrucciones,
  opciones,
  etiquetaAccion,
  analizar,
}: Props) {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [estado, setEstado] = useState<EstadoProceso>("idle");
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string>();

  const agregar = (nuevos: File[]) =>
    setArchivos((previos) => {
      if (!multiple) return nuevos.slice(0, 1);
      const claves = new Set(previos.map(claveDe));
      return [...previos, ...nuevos.filter((n) => !claves.has(claveDe(n)))].slice(0, maxArchivos);
    });

  const reiniciar = () => {
    setArchivos([]);
    setResultado(null);
    setError(undefined);
    setErrorExcel(undefined);
    setEstado("idle");
  };

  const ejecutar = async () => {
    if (archivos.length === 0) return;
    setEstado("procesando");
    setError(undefined);
    try {
      setResultado(await analizar(archivos));
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
      setEstado("error");
    }
  };

  const descargarExcel = async () => {
    if (!resultado) return;
    setGenerando(true);
    setErrorExcel(undefined);
    try {
      const blob = await resultado.generarExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resultado.nombreExcel;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error("[analizador] excel", e);
      setErrorExcel(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setGenerando(false);
    }
  };

  const controlesFallidos = resultado?.controles?.filter((c) => !c.ok).length ?? 0;

  return (
    <ProcessingCard
      estado={estado}
      mensajeProgreso="Analizando en tu navegador…"
      mensajeError={error}
      onReintentar={ejecutar}
      onReiniciar={reiniciar}
    >
      {estado === "idle" && (
        <div className="space-y-4">
          {instrucciones && archivos.length === 0 && <div className="text-sm">{instrucciones}</div>}

          {archivos.length === 0 ? (
            <FileDropzone
              accept={accept}
              maxSizeMB={maxSizeMB}
              multiple={multiple}
              onFiles={agregar}
              titulo={tituloDropzone}
              descripcion={descripcionDropzone ?? (multiple ? "o toca para seleccionarlos (varios meses juntos)" : "o toca para seleccionarlo")}
            />
          ) : (
            <>
              <ul className="divide-y rounded-lg border" aria-label="Archivos seleccionados">
                {archivos.map((a, i) => (
                  <li key={claveDe(a)} className="flex items-center gap-3 p-3 text-sm">
                    <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{formatearBytes(a.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setArchivos((p) => p.filter((_, k) => k !== i))}
                      aria-label={`Quitar ${a.name}`}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>

              {multiple && archivos.length < maxArchivos && (
                <FileDropzone
                  accept={accept}
                  maxSizeMB={maxSizeMB}
                  multiple
                  onFiles={agregar}
                  titulo="Agregar otro período"
                  descripcion="Arrastra o toca para sumar más archivos"
                  className="[&>div]:min-h-24 [&>div]:py-3"
                />
              )}

              {opciones}

              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={ejecutar}>
                  <FileSpreadsheet data-icon="inline-start" />
                  {etiquetaAccion}
                </Button>
                <Button size="lg" variant="outline" onClick={reiniciar}>
                  Cambiar archivo
                </Button>
              </div>
            </>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              El archivo se analiza en tu navegador y no se envía a ningún servidor.{" "}
              <Link href="/verificar-privacidad" className="underline underline-offset-2 hover:text-foreground">
                Cómo comprobarlo
              </Link>
            </span>
          </p>
        </div>
      )}

      {estado === "listo" && resultado && (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-lg font-semibold">{resultado.titulo}</h2>
            {resultado.subtitulo && <p className="text-sm text-muted-foreground">{resultado.subtitulo}</p>}
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {resultado.kpis.map((k) => (
              <div key={k.etiqueta} className="rounded-lg border bg-muted/30 p-3">
                <dt className="text-xs text-muted-foreground">{k.etiqueta}</dt>
                <dd
                  className={cn(
                    "mt-1 text-base font-semibold tabular-nums",
                    k.tono === "positivo" && "text-emerald-700",
                    k.tono === "negativo" && "text-red-700",
                  )}
                >
                  {k.valor}
                </dd>
              </div>
            ))}
          </dl>

          {resultado.avisos.length > 0 && (
            <Alert>
              <AlertCircle />
              <AlertTitle>Para tener en cuenta</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {resultado.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={descargarExcel} disabled={generando}>
              {generando ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
              {generando ? "Generando Excel…" : "Descargar Excel completo"}
            </Button>
            <Button size="lg" variant="outline" onClick={reiniciar}>
              Analizar otro archivo
            </Button>
          </div>
          {errorExcel && <p className="text-sm text-destructive">{errorExcel}</p>}

          {/* Pedido de devolución: mientras validamos con archivos reales, cada aviso del usuario corrige el analizador para todos. */}
          <PedidoDevolucion
            contexto={contextoDevolucion(resultado)}
            titulo={
              controlesFallidos > 0
                ? "Un control no cerró: ¿nos ayudás a entender por qué?"
                : "¿Algo no cuadra con tu extracto o te pareció raro?"
            }
          />

          {resultado.controles && resultado.controles.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                Controles
                {controlesFallidos === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" /> Todo cerró
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    <XCircle className="size-3.5" aria-hidden="true" /> {controlesFallidos} a revisar
                  </span>
                )}
              </h3>
              <ul className="mt-2 divide-y rounded-lg border text-sm">
                {resultado.controles.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    {c.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground">{c.grupo} · </span>
                      {c.control}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatearControl(c.calculado, c.formato)}
                      {!c.ok && <span className="text-red-700"> ≠ {formatearControl(c.declarado, c.formato)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {resultado.tablas.map((t) => (
            <section key={t.titulo}>
              <h3 className="text-sm font-semibold">{t.titulo}</h3>
              <div className="mt-2 overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      {t.columnas.map((c, j) => (
                        <th key={c} className={cn("px-3 py-2 font-medium", t.numericas.includes(j) ? "text-right" : "text-left")}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {t.filas.map((fila, i) => (
                      <tr key={i} className={cn(t.resaltar?.(fila) && "bg-amber-50")}>
                        {fila.map((v, j) => (
                          <td key={j} className={cn("px-3 py-1.5", t.numericas.includes(j) ? "text-right tabular-nums" : "text-left")}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Procesado en tu navegador. Tu extracto no se subió a ningún servidor.
          </p>
        </div>
      )}
    </ProcessingCard>
  );
}

function formatearControl(n: number, formato: Control["formato"]): string {
  return formato === "ent"
    ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/**
 * Resumen técnico que viaja ya escrito al formulario de contacto. Solo
 * cantidades, nombres de controles y avisos: nunca importes, saldos ni el
 * nombre del archivo (que suele llevar el nombre de la empresa).
 */
function contextoDevolucion(r: ResultadoAnalisis): string {
  const sinImportes = (t: string) => t.replace(/\$\s?[\d.,]+/g, "$…");
  const lineas = [`Herramienta: ${r.titulo}`];
  // El subtítulo termina con el nombre del archivo: se descarta ese último tramo.
  if (r.subtitulo) lineas.push(`Análisis: ${r.subtitulo.split(" · ").slice(0, -1).join(" · ")}`);

  const fallidos = r.controles?.filter((c) => !c.ok) ?? [];
  if (fallidos.length) lineas.push(`Controles que NO cerraron: ${fallidos.map((c) => `${c.grupo} / ${c.control}`).join("; ")}`);
  else if (r.controles?.length) lineas.push(`Controles: los ${r.controles.length} cerraron bien`);

  for (const t of r.tablas) {
    for (const fila of t.resaltar ? t.filas.filter(t.resaltar) : []) {
      lineas.push(`${t.titulo}: fila "${fila[0]}" con ${fila[1]} ${String(t.columnas[1] ?? "").toLowerCase()}`);
    }
  }
  if (r.avisos.length) lineas.push(`Avisos: ${r.avisos.map(sinImportes).join(" | ")}`);
  return lineas.join("\n");
}
