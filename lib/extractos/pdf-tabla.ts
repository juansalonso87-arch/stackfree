/**
 * Lector de tablas de un resumen bancario en PDF, **sin saber de qué banco es**.
 *
 * Es el "nivel 1" de la herramienta PDF → Excel: devuelve la tabla tal como está
 * impresa (fecha, descripción, débito, crédito, saldo… con los nombres que usa
 * cada banco), sin clasificar nada. Para eso no hace falta conocer el vocabulario
 * del banco, solo dónde están las columnas, así que funciona con bancos que
 * todavía no tienen analizador propio.
 *
 * Los analizadores que sí conocen su banco (`bbva-pdf.ts`, `comafi-pdf.ts`) siguen
 * siendo mejores para lo suyo: saben de saldos corridos, tablas auxiliares y
 * cuentas múltiples. Este módulo es el piso, no el techo.
 */

import { ErrorExtracto } from "./tipos";
import { esImporte, fechaPdf, importePdf, leerTextoPdf, type FragmentoPdf, type LineaPdf } from "./pdf-texto";
import { normalizarBasico } from "./texto";

export type TipoColumna = "fecha" | "texto" | "importe";

export interface ColumnaPdf {
  /** El título tal cual lo imprime el banco ("Débitos", "Crédito", "Saldo"). */
  titulo: string;
  tipo: TipoColumna;
  /** Borde izquierdo del título, en puntos desde el margen de la página. */
  x: number;
  /** Borde derecho: los importes se alinean por ahí. */
  derecha: number;
}

export interface FilaTablaPdf {
  pagina: number;
  /** Una celda por columna, en el orden de `columnas`. */
  celdas: (string | number | Date | null)[];
}

/** Líneas con importes pero sin fecha: "Saldo anterior", "Transporte", "Total". */
export interface LineaEspecial {
  pagina: number;
  texto: string;
  importes: number[];
}

export interface TablaPdf {
  archivo: string;
  paginas: number;
  columnas: ColumnaPdf[];
  filas: FilaTablaPdf[];
  especiales: LineaEspecial[];
  avisos: string[];
}

/* ------------------------------------------------------------------ */
/* Reconocimiento del encabezado                                       */
/* ------------------------------------------------------------------ */

/** Palabras con las que los bancos titulan la columna de fecha. */
const TITULO_FECHA = /^fecha/;

/**
 * Palabras con las que titulan una columna de importe. Se buscan al principio
 * del título porque muchos agregan aclaraciones ("Débitos $", "Saldo al día").
 */
const TITULO_IMPORTE =
  /^(debito|debitos|debe|cargo|cargos|credito|creditos|haber|abono|abonos|importe|importes|monto|montos|saldo|saldos)\b/;

/** Columnas de texto conocidas; cualquier otro título también cuenta como texto. */
const TITULO_TEXTO = /^(descripcion|concepto|detalle|movimiento|referencia|comprobante|origen|operacion|leyenda|sucursal|codigo|nro|numero)/;

function clasificarTitulo(titulo: string): TipoColumna | null {
  const t = normalizarBasico(titulo);
  if (!t) return null;
  if (TITULO_FECHA.test(t)) return "fecha";
  if (TITULO_IMPORTE.test(t)) return "importe";
  if (TITULO_TEXTO.test(t)) return "texto";
  // Un título corto y sin números probablemente sea una columna de texto.
  return /^[a-z][a-z .]{1,24}$/.test(t) ? "texto" : null;
}

/**
 * Busca la línea que hace de encabezado de la tabla: tiene una columna de fecha
 * y al menos dos de importe. Con menos de dos no se puede distinguir un resumen
 * de cualquier otro listado que tenga fechas y números.
 */
function buscarEncabezado(lineas: LineaPdf[]): { indice: number; columnas: ColumnaPdf[] } | null {
  for (let i = 0; i < lineas.length; i++) {
    const columnas: ColumnaPdf[] = [];
    for (const f of lineas[i].fragmentos) {
      const tipo = clasificarTitulo(f.texto);
      if (tipo) columnas.push({ titulo: f.texto.trim(), tipo, x: f.x, derecha: f.derecha });
    }
    const fechas = columnas.filter((c) => c.tipo === "fecha").length;
    const importes = columnas.filter((c) => c.tipo === "importe").length;
    if (fechas === 1 && importes >= 2) return { indice: i, columnas };
  }
  return null;
}

/**
 * Encabezados y pies de página: se repiten en varias hojas y, si no se filtran,
 * terminan pegados a la descripción del movimiento anterior (en el resumen de
 * Galicia, "Página 1 / 3 Resumen de Cuenta Corriente…" quedaba dentro de un
 * débito a Allianz). Se detectan por repetición entre páginas, que es genérico,
 * más la numeración de páginas, que es universal.
 */
function marcarRelleno(lineas: LineaPdf[]): Set<LineaPdf> {
  const relleno = new Set<LineaPdf>();
  const paginasPorTexto = new Map<string, Set<number>>();
  for (const l of lineas) {
    const clave = normalizarBasico(l.texto).replace(/\d+/g, "#");
    if (clave.length < 8) continue;
    const p = paginasPorTexto.get(clave) ?? new Set<number>();
    p.add(l.pagina);
    paginasPorTexto.set(clave, p);
  }
  for (const l of lineas) {
    const t = normalizarBasico(l.texto);
    if (/pagina\s*\d+\s*(\/|de)\s*\d+/.test(t)) {
      relleno.add(l);
      continue;
    }
    const clave = t.replace(/\d+/g, "#");
    if ((paginasPorTexto.get(clave)?.size ?? 0) >= 2 && !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l.texto)) relleno.add(l);
  }
  return relleno;
}

/** ¿Esta línea es el encabezado repetido en la página siguiente? */
function esEncabezadoRepetido(linea: LineaPdf, columnas: ColumnaPdf[]): boolean {
  const titulos = new Set(columnas.map((c) => normalizarBasico(c.titulo)));
  const iguales = linea.fragmentos.filter((f) => titulos.has(normalizarBasico(f.texto))).length;
  return iguales >= Math.min(3, columnas.length);
}

/* ------------------------------------------------------------------ */
/* Fechas sin año                                                       */
/* ------------------------------------------------------------------ */

/**
 * Varios bancos imprimen la fecha del movimiento como "30/01", sin año (BBVA lo
 * hace en todos sus resúmenes). El año se deduce del resto del documento: se
 * cuenta cuál aparece más veces entre todas las fechas completas y los años
 * sueltos del encabezado.
 */
function anioDelDocumento(lineas: LineaPdf[]): number | null {
  const cuenta = new Map<number, number>();
  const sumar = (a: number) => {
    if (a >= 2000 && a <= 2100) cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  };
  for (const l of lineas.slice(0, 600)) {
    for (const m of l.texto.matchAll(/\b\d{1,2}[/-]\d{1,2}[/-](\d{2}|\d{4})\b/g)) {
      sumar(m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]));
    }
    for (const m of l.texto.matchAll(/\b(20\d{2})\b/g)) sumar(Number(m[1]));
  }
  let mejor: number | null = null;
  let max = 0;
  for (const [anio, n] of cuenta) {
    if (n > max) {
      max = n;
      mejor = anio;
    }
  }
  return mejor;
}

/** "30/01" (día/mes sin año) → día y mes; null si no tiene esa forma. */
function diaMesSinAnio(texto: string): { dia: number; mes: number } | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  return dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 ? { dia, mes } : null;
}

/* ------------------------------------------------------------------ */
/* Armado de las filas                                                  */
/* ------------------------------------------------------------------ */

/** Columna de texto más cercana por la izquierda (los textos se alinean así). */
function columnaDeTexto(fragmento: FragmentoPdf, columnas: ColumnaPdf[]): number {
  let mejor = -1;
  let distancia = Infinity;
  columnas.forEach((c, i) => {
    if (c.tipo !== "texto") return;
    const d = Math.abs(fragmento.x - c.x);
    if (d < distancia) {
      distancia = d;
      mejor = i;
    }
  });
  return mejor;
}

/** Columna de importe cuyo borde derecho está más cerca del fragmento. */
function columnaDeImporte(fragmento: FragmentoPdf, columnas: ColumnaPdf[], tolerancia: number): number {
  let mejor = -1;
  let distancia = Infinity;
  columnas.forEach((c, i) => {
    if (c.tipo !== "importe") return;
    const d = Math.abs(fragmento.derecha - c.derecha);
    if (d < distancia) {
      distancia = d;
      mejor = i;
    }
  });
  return distancia <= tolerancia ? mejor : -1;
}

/**
 * Lee la tabla de movimientos de un resumen en PDF.
 *
 * Reglas, que salieron de mirar resúmenes reales de varios bancos:
 * - Una línea que arranca con una fecha en la columna de fecha **abre un
 *   movimiento nuevo**.
 * - Una línea sin fecha y sin importes es **continuación** del movimiento
 *   anterior: varios bancos imprimen el CUIT, la contraparte o el banco de
 *   origen en líneas debajo (Galicia lo hace en todos los movimientos).
 * - Una línea sin fecha pero **con** importes es una línea especial del propio
 *   resumen ("Saldo anterior", "Transporte", "Total"): no es un movimiento, va
 *   aparte y se muestra en la hoja de control.
 */
export async function leerTablaPdf(archivo: File): Promise<TablaPdf> {
  const { lineas, paginas } = await leerTextoPdf(archivo);
  if (lineas.length === 0) {
    throw new ErrorExtracto(
      `"${archivo.name}" no tiene texto adentro: parece un PDF escaneado (una foto de las hojas). ` +
        "De esos no se puede sacar la tabla sin reconocimiento de caracteres. Bajá el resumen del home banking en vez de escanearlo.",
    );
  }

  const encabezado = buscarEncabezado(lineas);
  if (!encabezado) {
    throw new ErrorExtracto(
      `No encontramos la tabla de movimientos en "${archivo.name}". Buscamos una fila de títulos con una columna de fecha y al menos dos de importe ` +
        "(por ejemplo: Fecha · Descripción · Débito · Crédito · Saldo). Si el resumen tiene esa tabla y aun así falla, mandanos el archivo y lo agregamos.",
    );
  }

  const { columnas } = encabezado;
  const iFecha = columnas.findIndex((c) => c.tipo === "fecha");
  const iTextos = columnas.map((c, i) => (c.tipo === "texto" ? i : -1)).filter((i) => i >= 0);
  const avisos: string[] = [];
  if (iTextos.length === 0) {
    // Sin columna de texto no hay dónde poner la descripción: se agrega una.
    columnas.splice(iFecha + 1, 0, { titulo: "Descripción", tipo: "texto", x: columnas[iFecha].derecha + 4, derecha: columnas[iFecha].derecha + 200 });
    avisos.push("El resumen no titula la columna de la descripción; se agregó una llamada “Descripción”.");
  }

  // Tolerancia para pegar un importe a su columna: la mitad de la distancia
  // entre columnas de importe vecinas, así no se roban valores entre sí.
  const derechasImportes = columnas.filter((c) => c.tipo === "importe").map((c) => c.derecha).sort((a, b) => a - b);
  const separacion = derechasImportes.length > 1 ? Math.min(...derechasImportes.slice(1).map((d, i) => d - derechasImportes[i])) : 80;
  const tolerancia = Math.max(12, Math.min(45, separacion / 2));

  const filas: FilaTablaPdf[] = [];
  const especiales: LineaEspecial[] = [];
  let actual: FilaTablaPdf | null = null;
  let sueltas = 0;

  let sinImportes = 0;
  const cerrar = () => {
    if (actual) {
      // Una fila con fecha pero sin ningún importe no es un movimiento: suele ser
      // una tabla auxiliar impresa después del detalle (BBVA lista ahí los
      // débitos automáticos y las transferencias, con fecha y sin columnas).
      if (actual.celdas.some((c) => typeof c === "number")) filas.push(actual);
      else sinImportes++;
    }
    actual = null;
  };

  const relleno = marcarRelleno(lineas);
  const anioBase = anioDelDocumento(lineas);
  let anioActual = anioBase;
  let mesPrevio = 0;
  let sinAnio = 0;

  /** Fecha del primer fragmento: completa, o "día/mes" con el año del documento. */
  const fechaDeLinea = (linea: LineaPdf): Date | null => {
    if (linea.fragmentos.length === 0) return null;
    const texto = linea.fragmentos[0].texto;
    const completa = fechaPdf(texto);
    if (completa) {
      anioActual = completa.getFullYear();
      mesPrevio = completa.getMonth() + 1;
      return completa;
    }
    const corta = diaMesSinAnio(texto);
    if (!corta || anioActual === null) return null;
    // Si el mes retrocede de golpe (diciembre → enero), el resumen cruzó de año.
    if (mesPrevio >= 11 && corta.mes <= 2) anioActual += 1;
    mesPrevio = corta.mes;
    sinAnio++;
    const f = new Date(anioActual, corta.mes - 1, corta.dia);
    return f.getDate() === corta.dia ? f : null;
  };

  for (const linea of lineas.slice(encabezado.indice + 1)) {
    if (esEncabezadoRepetido(linea, columnas) || relleno.has(linea)) continue;

    const fecha = fechaDeLinea(linea);
    const importes = linea.fragmentos.filter((f) => esImporte(f.texto));

    if (fecha) {
      cerrar();
      actual = { pagina: linea.pagina, celdas: columnas.map(() => null) };
      actual.celdas[columnas.findIndex((c) => c.tipo === "fecha")] = fecha;
    } else if (importes.length > 0) {
      // Saldo anterior, transporte, total: no es un movimiento.
      const texto = linea.fragmentos.filter((f) => !esImporte(f.texto)).map((f) => f.texto).join(" ").trim();
      if (texto) especiales.push({ pagina: linea.pagina, texto, importes: importes.map((f) => importePdf(f.texto)!) });
      continue;
    } else if (!actual) {
      continue; // Encabezados de página, pie, publicidad: antes del primer movimiento.
    }

    if (!actual) continue;
    const fila: FilaTablaPdf = actual;

    for (const f of linea.fragmentos) {
      const texto = f.texto.trim();
      if (!texto) continue;
      // El fragmento de la fecha ya se usó para abrir la fila.
      if (texto === linea.fragmentos[0].texto.trim() && fila.celdas[iFecha] instanceof Date && (fechaPdf(texto) || diaMesSinAnio(texto))) continue;

      if (esImporte(texto)) {
        const col = columnaDeImporte(f, columnas, tolerancia);
        if (col >= 0) {
          const valor = importePdf(texto)!;
          // Si la columna ya tiene valor (el banco repitió el importe), gana el primero.
          if (fila.celdas[col] === null) fila.celdas[col] = valor;
        } else {
          sueltas++;
        }
        continue;
      }

      const col = columnaDeTexto(f, columnas);
      if (col >= 0) {
        const previo = fila.celdas[col];
        fila.celdas[col] = previo === null ? texto : `${String(previo)} ${texto}`;
      }
    }
  }
  cerrar();

  if (filas.length === 0) {
    throw new ErrorExtracto(
      `Encontramos la tabla en "${archivo.name}" pero ninguna fila con fecha. Puede que el resumen use un formato de fecha que todavía no leemos: mandanos el archivo y lo agregamos.`,
    );
  }
  if (sueltas > 0) {
    avisos.push(`${sueltas} importe(s) quedaron lejos de toda columna y no se ubicaron. Revisá esas filas contra el PDF.`);
  }
  if (sinImportes > 0) {
    avisos.push(`${sinImportes} línea(s) con fecha pero sin ningún importe quedaron afuera: no son movimientos (suelen ser tablas auxiliares del final del resumen).`);
  }
  if (sinAnio > 0) {
    avisos.push(
      `El resumen imprime las fechas sin año (por ejemplo "30/01"). Se completaron ${sinAnio} con el año ${anioBase}, tomado del propio resumen; verificá que sea el correcto.`,
    );
  }

  return { archivo: archivo.name, paginas, columnas, filas, especiales, avisos };
}

/* ------------------------------------------------------------------ */
/* Controles                                                            */
/* ------------------------------------------------------------------ */

export interface TotalColumna {
  titulo: string;
  indice: number;
  suma: number;
  cantidad: number;
}

export interface ContrasteTotales {
  /** Texto de la línea del resumen con la que se comparó ("TOTAL MOVIMIENTOS"). */
  referencia: string;
  /** Nombre de cada columna comparada, como lo escribe el banco. */
  titulos: string[];
  /** Lo que dice el resumen, columna por columna. */
  delResumen: number[];
  /** Lo que sumó la extracción, en las mismas columnas. */
  extraido: number[];
  coincide: boolean;
}

/**
 * Compara lo extraído contra el total que el propio resumen imprime al final.
 *
 * Es el control que hace honesta a esta herramienta: como lee bancos que nadie
 * validó, no puede prometer exactitud, pero **sí puede avisar cuando no cuadra**.
 * En el resumen de Galicia que usamos de prueba, la línea "Total" coincidió al
 * centavo con las columnas extraídas; en uno de BBVA no, y por eso ese banco
 * tiene lector propio.
 */
export function contrastarConTotales(t: TablaPdf): ContrasteTotales | null {
  const columnas = totalesPorColumna(t);
  if (columnas.length === 0) return null;
  const candidata = t.especiales.find((e) => /^total\b|total de movimientos|total movimientos/i.test(normalizarBasico(e.texto)));
  if (!candidata) return null;

  const sinSaldo = columnas.filter((c) => !/^saldo/.test(normalizarBasico(c.titulo)));
  const usar = candidata.importes.length === sinSaldo.length ? sinSaldo : columnas;
  if (candidata.importes.length !== usar.length) return null;

  // Ojo con el saldo: ahí el resumen no informa una suma sino el saldo FINAL,
  // así que se compara contra el último saldo de la tabla, no contra el total
  // de la columna (sumar saldos corridos no significa nada).
  const extraido = usar.map((c) => {
    if (!/^saldo/.test(normalizarBasico(c.titulo))) return c.suma;
    for (let i = t.filas.length - 1; i >= 0; i--) {
      const v = t.filas[i].celdas[c.indice];
      if (typeof v === "number") return v;
    }
    return 0;
  });
  return {
    referencia: candidata.texto,
    titulos: usar.map((c) => c.titulo),
    delResumen: candidata.importes,
    extraido,
    coincide: extraido.every((v, i) => Math.abs(Math.abs(v) - Math.abs(candidata.importes[i])) < 0.01),
  };
}

/** Suma cada columna de importes: es lo que se compara contra el propio resumen. */
export function totalesPorColumna(t: TablaPdf): TotalColumna[] {
  return t.columnas
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.tipo === "importe")
    .map(({ c, i }) => {
      const valores = t.filas.map((f) => f.celdas[i]).filter((v): v is number => typeof v === "number");
      return { titulo: c.titulo, indice: i, suma: valores.reduce((s, v) => s + v, 0), cantidad: valores.length };
    });
}
