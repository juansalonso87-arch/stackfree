/**
 * Lógica de "PDF del banco a Excel".
 *
 * Dos niveles, y el usuario elige con un casillero:
 *
 * - **Sin tildar**: la tabla tal cual está impresa, con los nombres de columna
 *   del propio resumen y sin clasificar nada (`lib/extractos/pdf-tabla.ts`).
 *   Funciona con cualquier banco cuya tabla se pueda reconocer, incluso los que
 *   no tienen analizador propio.
 * - **Tildado** (por defecto): si además reconocemos el banco, se usa su
 *   analizador completo, con categorías, resúmenes y controles. Si no lo
 *   reconocemos, cae solo al nivel 1 y se avisa en pantalla en vez de fallar.
 */

import type { ResultadoAnalisis } from "@/components/core/AnalizadorExtracto";
import type { TablaPdf } from "@/lib/extractos/pdf-tabla";
import { ErrorExtracto } from "@/lib/extractos/tipos";
import { formatearEntero } from "@/lib/extractos/texto";
import { nombreSalida } from "@/lib/extractos/pantalla";

export const MAX_MB = 25;
export const MAX_ARCHIVOS = 12;
export const FORMATOS_ENTRADA = ["application/pdf"];

/** Bancos que además de leerse se pueden clasificar y analizar. */
const CON_ANALIZADOR = ["bbva", "comafi"] as const;
type BancoConAnalizador = (typeof CON_ANALIZADOR)[number];

const NOMBRE_BANCO: Record<string, string> = { bbva: "BBVA", comafi: "Comafi", santander: "Santander" };

/** ¿Todos los archivos son del mismo banco, y ese banco tiene analizador? */
async function bancoDeTodos(archivos: File[]): Promise<BancoConAnalizador | null> {
  const { detectarBanco } = await import("@/lib/extractos/conciliacion-tarjetas");
  const bancos = new Set<string>();
  for (const a of archivos) bancos.add((await detectarBanco(a)) ?? "");
  if (bancos.size !== 1) return null;
  const banco = [...bancos][0];
  return (CON_ANALIZADOR as readonly string[]).includes(banco) ? (banco as BancoConAnalizador) : null;
}

/** Análisis completo del banco reconocido (el mismo que su herramienta propia). */
async function analisisDelBanco(banco: BancoConAnalizador, archivos: File[]): Promise<ResultadoAnalisis> {
  const { resultadoDesdeAnalisis } = await import("@/lib/extractos/pantalla");
  if (banco === "bbva") {
    const { analizarBbva, generarExcelBbva } = await import("@/lib/extractos/bbva");
    const a = await analizarBbva(archivos);
    return resultadoDesdeAnalisis(a, {
      titulo: "Movimientos BBVA (clasificados)",
      nombreExcel: nombreSalida(archivos, "_analisis"),
      generarExcel: () => generarExcelBbva(a),
    });
  }
  const { analizarComafi, generarExcelComafi } = await import("@/lib/extractos/comafi");
  const a = await analizarComafi(archivos);
  return resultadoDesdeAnalisis(a, {
    titulo: "Movimientos Comafi (clasificados)",
    nombreExcel: nombreSalida(archivos, "_analisis"),
    generarExcel: () => generarExcelComafi(a),
  });
}

/** Nivel 1: la tabla del PDF, sin interpretar. */
async function tablaTalCual(archivos: File[], avisosPrevios: string[]): Promise<ResultadoAnalisis> {
  const { leerTablaPdf, contrastarConTotales, totalesPorColumna } = await import("@/lib/extractos/pdf-tabla");
  const { generarExcelTablaPdf } = await import("@/lib/extractos/excel-pdf-tabla");

  const tablas: TablaPdf[] = [];
  const errores: string[] = [];
  for (const a of archivos) {
    try {
      tablas.push(await leerTablaPdf(a));
    } catch (e) {
      errores.push(e instanceof ErrorExtracto ? e.message : `No se pudo leer "${a.name}".`);
    }
  }
  if (tablas.length === 0) throw new ErrorExtracto(errores.join(" ") || "No se pudo leer ningún PDF.");

  const avisos = [...avisosPrevios, ...errores, ...tablas.flatMap((t) => t.avisos)];
  const filas = tablas.reduce((s, t) => s + t.filas.length, 0);
  const paginas = tablas.reduce((s, t) => s + t.paginas, 0);

  const controles = tablas.flatMap((t) => {
    const ct = contrastarConTotales(t);
    if (!ct) {
      avisos.push(`"${t.archivo}" no imprime una línea de total, así que no pudimos verificar la extracción contra el propio resumen.`);
      return [];
    }
    return ct.delResumen.map((v, i) => ({
      grupo: tablas.length > 1 ? `${t.archivo} · "${ct.referencia}"` : `Contra "${ct.referencia}" del resumen`,
      control: ct.titulos[i] ?? `Columna ${i + 1}`,
      calculado: ct.extraido[i],
      declarado: v,
      ok: Math.abs(Math.abs(ct.extraido[i]) - Math.abs(v)) < 0.01,
      formato: "num" as const,
    }));
  });

  const primera = tablas[0];
  const importes = totalesPorColumna(primera);

  return {
    titulo: "Tabla del resumen, tal como está impresa",
    subtitulo:
      "Nivel 1: los movimientos con las mismas columnas que usa tu banco, sin clasificar. " +
      "Si tu banco es BBVA o Comafi, tildá la opción para tener además categorías y resúmenes.",
    kpis: [
      { etiqueta: "Movimientos", valor: formatearEntero(filas) },
      { etiqueta: "Páginas leídas", valor: formatearEntero(paginas) },
      { etiqueta: "Columnas reconocidas", valor: formatearEntero(primera.columnas.length) },
    ],
    tablas: [
      {
        titulo: "Primeros movimientos",
        columnas: primera.columnas.map((c) => c.titulo),
        numericas: primera.columnas.map((c, i) => (c.tipo === "importe" ? i : -1)).filter((i) => i >= 0),
        filas: primera.filas.slice(0, 12).map((f) =>
          f.celdas.map((c) =>
            c instanceof Date ? c.toLocaleDateString("es-AR") : typeof c === "number" ? c : String(c ?? ""),
          ),
        ),
      },
      {
        titulo: "Totales por columna",
        columnas: ["Columna", "Movimientos con dato", "Suma"],
        numericas: [1, 2],
        filas: importes.map((t) => [t.titulo, t.cantidad, t.suma]),
      },
    ],
    controles,
    avisos,
    nombreExcel: nombreSalida(archivos, "_tabla"),
    generarExcel: () => generarExcelTablaPdf(tablas),
  };
}

export async function analizar(archivos: File[], detallado: boolean): Promise<ResultadoAnalisis> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");

  if (!detallado) return tablaTalCual(archivos, []);

  const banco = await bancoDeTodos(archivos);
  if (banco) {
    const r = await analisisDelBanco(banco, archivos);
    r.avisos = [
      `Reconocimos el resumen como ${NOMBRE_BANCO[banco]}, así que además de pasarlo a Excel lo clasificamos y armamos los resúmenes.`,
      ...r.avisos,
    ];
    return r;
  }

  // No lo reconocimos: en vez de fallar, damos el nivel 1 y lo decimos.
  return tablaTalCual(archivos, [
    "Pediste el análisis detallado, pero este resumen no es de un banco que sepamos clasificar (hoy: BBVA y Comafi). " +
      "Te damos igual la tabla tal cual está impresa, que es lo que la mayoría necesita para trabajar en Excel. " +
      "Si querés que sumemos tu banco, escribinos: con un resumen real alcanza.",
  ]);
}
