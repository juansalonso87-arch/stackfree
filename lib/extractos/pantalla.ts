/**
 * Arma lo que se muestra en pantalla (indicadores, tablas, avisos) a partir
 * de un análisis, para no repetirlo en cada herramienta de banco.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import { CATEGORIA_DEFECTO, type AnalisisExtracto } from "./tipos";
import { formatearEntero, formatearFecha, formatearPesos, resumirPor } from "./texto";

export function nombreSalida(archivos: File[], sufijo: string): string {
  const base = archivos[0].name.replace(/\.[^.]+$/, "").slice(0, 60) || "movimientos";
  return `${base}${sufijo}.xlsx`;
}

export function resultadoDesdeAnalisis(
  a: AnalisisExtracto,
  o: { titulo: string; nombreExcel: string; generarExcel: () => Promise<Blob>; kpisExtra?: ResultadoAnalisis["kpis"] },
): ResultadoAnalisis {
  const debitos = a.movimientos.reduce((s, m) => s + m.debito, 0);
  const creditos = a.movimientos.reduce((s, m) => s + m.credito, 0);
  const porCategoria = resumirPor(a.movimientos, (m) => m.categoria);
  const conceptos = new Set(a.movimientos.map((m) => m.concepto)).size;
  const kpis: ResultadoAnalisis["kpis"] = [];
  if (a.saldoInicial !== undefined) kpis.push({ etiqueta: "Saldo inicial", valor: formatearPesos(a.saldoInicial) });
  kpis.push({ etiqueta: "Créditos (entradas)", valor: formatearPesos(creditos), tono: "positivo" });
  kpis.push({ etiqueta: "Débitos (salidas)", valor: formatearPesos(debitos), tono: "negativo" });
  if (a.saldoFinal !== undefined) kpis.push({ etiqueta: "Saldo final", valor: formatearPesos(a.saldoFinal) });
  else kpis.push({ etiqueta: "Neto del período", valor: formatearPesos(creditos - debitos), tono: creditos - debitos >= 0 ? "positivo" : "negativo" });
  kpis.push(...(o.kpisExtra ?? []));

  return {
    titulo: o.titulo,
    subtitulo: `${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)} · ${formatearEntero(a.movimientos.length)} movimientos · ${conceptos} conceptos · ${a.archivos.length > 1 ? `${a.archivos.length} archivos` : a.archivos[0]}`,
    kpis,
    controles: a.controles,
    avisos: a.avisos,
    tablas: [
      {
        titulo: "Resumen por categoría",
        columnas: ["Categoría", "Mov.", "Débitos", "Créditos", "Neto"],
        numericas: [1, 2, 3, 4],
        filas: porCategoria.map((f) => [f.clave, formatearEntero(f.movimientos), formatearPesos(f.debitos), formatearPesos(f.creditos), formatearPesos(f.neto)]),
        resaltar: (fila) => fila[0] === CATEGORIA_DEFECTO,
      },
    ],
    nombreExcel: o.nombreExcel,
    generarExcel: o.generarExcel,
  };
}
