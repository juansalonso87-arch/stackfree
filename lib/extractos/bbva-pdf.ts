/**
 * Lector del resumen de cuenta mensual de BBVA en PDF ("Resumen Pymes y
 * Negocios / Cuentas y paquetes", el que se descarga desde BBVA Net Cash o
 * llega por mail). Devuelve las mismas filas crudas que el Excel de
 * movimientos para que `bbva.ts` las normalice, clasifique y controle igual.
 *
 * Cómo viene el PDF (relevado con un resumen real de agosto 2026, 8 páginas,
 * generado con PDFlib):
 *  - Sección "Movimientos en cuentas" con columnas FECHA | ORIGEN | CONCEPTO |
 *    DÉBITO | CRÉDITO | SALDO. La fecha es "dd/mm" SIN año; los débitos vienen
 *    con signo menos y el saldo se imprime en TODAS las filas (el Excel no lo
 *    trae), así que acá se verifica la cadena de saldos completa.
 *  - El concepto es más largo que en el Excel (27 caracteres contra 12:
 *    "CUPONES ARGEN./MASTERCARD" en vez de "CUPON. ARGEN") pero NO trae el
 *    código de operación de tres dígitos; la columna ORIGEN ("D", "D 587") es
 *    el canal, no ese código. La clasificación queda a cargo del texto.
 *  - "SALDO ANTERIOR", "SALDO AL dd DE <MES>" y "TOTAL MOVIMIENTOS" (débitos y
 *    créditos totales) sirven de controles.
 *  - Tablas auxiliares que el Excel no tiene: "Transferencias RECIBIDAS /
 *    ENVIADAS" (CUIT y nombre de la contraparte) y "Débitos automáticos
 *    REALIZADOS" (qué empresa cobró cada "DEBITO DIRECTO"). Se cruzan por
 *    referencia o por fecha + importe para completar el detalle.
 *  - El PDF fecha cada movimiento por su fecha valor (dos filas del 31/07
 *    aparecen en el resumen de agosto) mientras el Excel usa la fecha de
 *    asiento (las mismas dos figuran el 03/08).
 */

import { columnaPorDerecha, esImporte, fechaPdf, importePdf, leerTextoPdf, type FragmentoPdf, type LineaPdf } from "./pdf-texto";
import { ErrorExtracto } from "./tipos";

/** Fila cruda del resumen, con los mismos campos que entrega el Excel más el saldo. */
export interface FilaPdfBbva {
  fecha: Date;
  /** Texto completo del concepto con sus referencias ("CUPONES CABAL 413540-10000205718"). */
  original: string;
  /** Columna ORIGEN del resumen ("D", "D 587"): canal por el que entró la operación. */
  origen: string;
  detalle: string;
  credito: number;
  debito: number;
  saldo: number;
}

export interface LecturaPdfBbva {
  filas: FilaPdfBbva[];
  cuenta: string;
  saldoAnterior: number | null;
  saldoFinal: number | null;
  /** Totales declarados en "TOTAL MOVIMIENTOS" (débitos en positivo). */
  totalDebitos: number | null;
  totalCreditos: number | null;
  /** Filas cuyo saldo impreso coincide con el saldo anterior más el movimiento. */
  eslabones: number;
  eslabonesOk: number;
  enriquecidos: number;
  avisos: string[];
}

const TOLERANCIA = 0.02;

interface Columnas {
  xOrigen: number;
  xConcepto: number;
  derechas: [number, number, number];
}

function columnasDe(linea: LineaPdf): Columnas | null {
  const f = (nombre: string) => linea.fragmentos.find((x) => x.texto.toUpperCase() === nombre);
  const fecha = f("FECHA");
  const concepto = f("CONCEPTO");
  const debito = f("DÉBITO") ?? f("DEBITO");
  const credito = f("CRÉDITO") ?? f("CREDITO");
  const saldo = f("SALDO");
  if (!fecha || !concepto || !debito || !credito || !saldo) return null;
  return { xOrigen: f("ORIGEN")?.x ?? fecha.derecha + 5, xConcepto: concepto.x, derechas: [debito.derecha, credito.derecha, saldo.derecha] };
}

/**
 * pdf.js a veces entrega dos importes en un solo fragmento ("-135.168.843,41
 * 129.055.294,84"): se separan repartiendo el ancho en proporción al largo.
 */
function partirImportes(fr: FragmentoPdf): FragmentoPdf[] {
  const partes = fr.texto.split(/\s+/);
  if (partes.length < 2 || !partes.every(esImporte)) return [fr];
  const total = partes.reduce((s, p) => s + p.length, 0) + partes.length - 1;
  const anchoPorLetra = (fr.derecha - fr.x) / total;
  let x = fr.x;
  return partes.map((p) => {
    const f = { x, derecha: x + p.length * anchoPorLetra, texto: p };
    x = f.derecha + anchoPorLetra;
    return f;
  });
}

/** Separa una fila en origen, concepto e importes por columna. */
function partirFila(fragmentos: FragmentoPdf[], cols: Columnas) {
  const origen: string[] = [];
  const concepto: string[] = [];
  const importes: (number | null)[] = [null, null, null];
  const limiteTexto = cols.derechas[0] - 110;
  for (const fr of fragmentos.flatMap(partirImportes)) {
    if (fr.x > limiteTexto && esImporte(fr.texto)) {
      const col = columnaPorDerecha(fr, cols.derechas);
      if (col >= 0 && importes[col] === null) {
        importes[col] = importePdf(fr.texto);
        continue;
      }
    }
    if (fr.x < cols.xConcepto - 3) origen.push(fr.texto);
    else concepto.push(fr.texto);
  }
  return {
    origen: origen.join(" ").trim(),
    concepto: concepto.join(" ").replace(/\s+/g, " ").trim(),
    debito: importes[0],
    credito: importes[1],
    saldo: importes[2],
  };
}

/**
 * El resumen no imprime el año en las filas. Se toma de la primera fecha
 * completa que aparezca en el documento ("IMP.LEY 25413 31/07/26",
 * "información al: 01/09/2026") y se corrige si el mes de la fila queda del
 * otro lado de un cambio de año.
 */
function armarFecha(diaMes: string, ancla: Date): Date | null {
  const m = diaMes.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let anio = ancla.getFullYear();
  const mesAncla = ancla.getMonth() + 1;
  if (mes - mesAncla > 6) anio--;
  if (mesAncla - mes > 6) anio++;
  const f = new Date(anio, mes - 1, dia);
  return f.getDate() === dia ? f : null;
}

function buscarAncla(lineas: LineaPdf[]): Date | null {
  for (const l of lineas) {
    const m = l.texto.match(/\b(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\b/);
    if (m) {
      const f = fechaPdf(m[1]);
      if (f) return f;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tablas auxiliares                                                    */
/* ------------------------------------------------------------------ */

interface FilaAuxiliar {
  fecha: Date | null;
  referencia: string;
  importe: number;
  descripcion: string;
}

const sinCeros = (s: string) => s.replace(/^0+(?=\d)/, "");

/**
 * Lee una tabla auxiliar (Transferencias RECIBIDAS / ENVIADAS ACEPTADAS,
 * Débitos automáticos REALIZADOS): filas "dd/mm … $ importe CC $ 337-…".
 * `describir` arma el texto útil a partir de los fragmentos entre la fecha y
 * el importe.
 */
function leerTablaAuxiliar(lineas: LineaPdf[], desde: number, ancla: Date, describir: (medio: string[]) => { referencia: string; descripcion: string } | null): FilaAuxiliar[] {
  const filas: FilaAuxiliar[] = [];
  for (let i = desde; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^(RECIBIDAS|ENVIADAS|REALIZADOS|RECHAZADOS|NOVEDADES|Legales|Débitos automáticos|Transferencias)\b/.test(l.texto) && i > desde) break;
    const fr = l.fragmentos;
    const fecha = armarFecha(fr[0]?.texto ?? "", ancla);
    if (!fecha) continue;
    // El importe es el último fragmento numérico antes de la cuenta ("CC $ 337-772910/7").
    const iImporte = fr.findLastIndex((f) => esImporte(f.texto));
    if (iImporte < 2) continue;
    const importe = importePdf(fr[iImporte].texto)!;
    const medio = fr
      .slice(1, iImporte)
      .map((f) => f.texto)
      .filter((t) => t !== "$");
    const d = describir(medio);
    if (!d) continue;
    filas.push({ fecha, importe, ...d });
  }
  return filas;
}

/** "072 | 30715221159DELIVERY HERO FI | P.PROV.E/C OTROS B | VARIOS 4219437 4219437" → CUIT + nombre, referencia 4219437. */
function describirRecibida(medio: string[]) {
  const texto = medio.join(" ");
  const m = texto.match(/\b(\d{11})\s*([A-Z][A-Z .&-]*?)(?=\s+[A-Z.]+\/|\s+VARIOS|\s+\d|$)/);
  if (!m) return null;
  const ref = texto.match(/VARIOS\s+(\d{5,})/);
  return { referencia: ref ? sinCeros(ref[1]) : "", descripcion: `${m[2].trim()} | CUIT ${m[1]}`.replace(/^\s*\|\s*/, "") };
}

/** "30717210480 | 0002718159 | VARIOS TRANSF.MEP.ENVIA" o "30688312937 LA PINERA | 0000000000 | VARIOS TR. E/CTAS.BBVA-". */
function describirEnviada(medio: string[]) {
  const texto = medio.join(" ");
  const m = texto.match(/^(\d{11})\s*([A-Za-z][A-Za-z .&-]*?)?\s+(\d{10})\b/);
  if (!m) return null;
  const nombre = (m[2] ?? "").trim();
  return { referencia: sinCeros(m[3]), descripcion: `${nombre ? nombre + " | " : ""}CUIT ${m[1]}` };
}

/** "ZURICH IGU | CUOTAS P | 3400386600000014000000 | 000000032148701" → empresa y servicio. */
function describirDebitoAutomatico(medio: string[]) {
  const palabras = medio.filter((t) => !/^\d{6,}$/.test(t));
  if (palabras.length === 0) return null;
  return { referencia: "", descripcion: palabras.join(" ") };
}

/* ------------------------------------------------------------------ */
/* Lectura principal                                                    */
/* ------------------------------------------------------------------ */

export async function leerPdfBbva(archivo: File): Promise<LecturaPdfBbva> {
  const { lineas } = await leerTextoPdf(archivo);
  if (lineas.length === 0) {
    throw new ErrorExtracto(
      `"${archivo.name}" no tiene texto legible: parece un PDF escaneado (una imagen). Descargá el resumen desde BBVA Net Cash o exportá los movimientos a Excel.`,
    );
  }
  if (!lineas.some((l) => /\bBBVA\b/.test(l.texto))) {
    throw new ErrorExtracto(`"${archivo.name}" no parece un resumen de BBVA.`);
  }
  const ancla = buscarAncla(lineas) ?? new Date();

  const filas: FilaPdfBbva[] = [];
  const avisos: string[] = [];
  let cuenta = "";
  let saldoAnterior: number | null = null;
  let saldoFinal: number | null = null;
  let totalDebitos: number | null = null;
  let totalCreditos: number | null = null;
  let eslabones = 0;
  let eslabonesOk = 0;
  let cols: Columnas | null = null;
  let enTabla = false;
  let saldoCorrido: number | null = null;
  let iRecibidas = -1;
  let iEnviadas = -1;
  let iDebitos = -1;

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const t = l.texto;

    if (/^Movimientos en cuentas\b/i.test(t)) {
      const sig = lineas[i + 1]?.texto.match(/\b(CC|CA)\s*\$?\s*([\d/-]+)/);
      if (sig) cuenta = `${sig[1]} ${sig[2]}`;
      continue;
    }
    if (/^RECIBIDAS\b/.test(t)) iRecibidas = i;
    if (/^ENVIADAS\b/.test(t)) iEnviadas = i;
    if (/^REALIZADOS\b/.test(t)) iDebitos = i;

    const c = columnasDe(l);
    if (c) {
      cols = c;
      enTabla = true;
      continue;
    }
    if (!enTabla || !cols) continue;

    if (/^SALDO ANTERIOR\b/i.test(t)) {
      const s = importePdf(l.fragmentos[l.fragmentos.length - 1].texto);
      if (s !== null) {
        saldoCorrido = s;
        saldoAnterior ??= s;
      }
      continue;
    }
    if (/^SALDO AL\b/i.test(t)) {
      const s = importePdf(l.fragmentos[l.fragmentos.length - 1].texto);
      if (s !== null) saldoFinal = s;
      continue;
    }
    if (/^TOTAL MOVIMIENTOS\b/i.test(t)) {
      const nums = l.fragmentos
        .flatMap(partirImportes)
        .map((f) => importePdf(f.texto))
        .filter((n): n is number => n !== null);
      if (nums.length >= 2) {
        totalDebitos = Math.abs(nums[0]);
        totalCreditos = nums[1];
      }
      enTabla = false;
      continue;
    }

    // La fecha va en la primera columna; antes puede colarse un glifo del código de barras del margen.
    const iFecha = l.fragmentos.findIndex((f) => f.x < cols!.xOrigen && /^\d{1,2}\/\d{1,2}$/.test(f.texto));
    if (iFecha < 0) continue; // texto suelto (pie de página, avisos)
    const fecha = armarFecha(l.fragmentos[iFecha].texto, ancla);
    if (!fecha) continue;
    // Se ignora lo que queda a la derecha de la columna Saldo (el pie "Banco BBVA Argentina S.A." puede caer en la misma línea).
    const fila = partirFila(l.fragmentos.slice(iFecha + 1).filter((f) => f.x <= cols!.derechas[2] + 5), cols);
    const debito = fila.debito !== null ? Math.abs(fila.debito) : 0;
    const credito = fila.credito ?? 0;
    if (!debito && !credito) continue;
    const saldo: number = fila.saldo ?? (saldoCorrido ?? 0) + credito - debito;
    if (saldoCorrido !== null && fila.saldo !== null) {
      eslabones++;
      if (Math.abs(saldoCorrido + credito - debito - fila.saldo) <= TOLERANCIA) eslabonesOk++;
    }
    saldoCorrido = saldo;
    filas.push({ fecha, original: fila.concepto, origen: fila.origen, detalle: "", credito, debito, saldo });
  }

  if (filas.length === 0) {
    throw new ErrorExtracto(`No encontré la sección "Movimientos en cuentas" en "${archivo.name}". Verificá que sea el resumen de cuenta de BBVA.`);
  }

  // Enriquecimiento con las tablas auxiliares.
  const recibidas = iRecibidas >= 0 ? leerTablaAuxiliar(lineas, iRecibidas + 1, ancla, describirRecibida) : [];
  const enviadas = iEnviadas >= 0 ? leerTablaAuxiliar(lineas, iEnviadas + 1, ancla, describirEnviada) : [];
  const debitosAuto = iDebitos >= 0 ? leerTablaAuxiliar(lineas, iDebitos + 1, ancla, describirDebitoAutomatico) : [];
  const diasEntre = (a: Date | null, b: Date) => (a ? Math.abs(a.getTime() - b.getTime()) / 86_400_000 : Infinity);
  const usadas = new Set<FilaAuxiliar>();
  const buscar = (tabla: FilaAuxiliar[], f: FilaPdfBbva, monto: number) => {
    const refs = f.original.match(/\d{5,}/g) ?? [];
    return tabla.find(
      (x) =>
        !usadas.has(x) &&
        Math.abs(x.importe - monto) <= TOLERANCIA &&
        ((x.referencia !== "" && refs.some((r) => sinCeros(r).endsWith(x.referencia))) || diasEntre(x.fecha, f.fecha) <= 1.5),
    );
  };
  let enriquecidos = 0;
  for (const f of filas) {
    let extra: FilaAuxiliar | undefined;
    if (f.debito > 0 && /DEBITO DIRECTO|DEBITO AUTOM/i.test(f.original)) extra = buscar(debitosAuto, f, f.debito);
    else if (f.debito > 0 && /TRANSF|PAGOS AFIP|BTOB/i.test(f.original)) extra = buscar(enviadas, f, f.debito);
    else if (f.credito > 0 && /DNET|TRANSF|TR\.|CREDITO/i.test(f.original)) extra = buscar(recibidas, f, f.credito);
    if (extra) {
      usadas.add(extra);
      f.detalle = extra.descripcion;
      enriquecidos++;
    }
  }

  if (eslabones > 0 && eslabonesOk < eslabones) {
    avisos.push(`El saldo impreso no coincide con el saldo anterior más el movimiento en ${eslabones - eslabonesOk} de ${eslabones} filas: puede haber una línea que no se leyó bien.`);
  }
  if (saldoFinal === null && saldoCorrido !== null) saldoFinal = saldoCorrido;

  return { filas, cuenta, saldoAnterior, saldoFinal, totalDebitos, totalCreditos, eslabones, eslabonesOk, enriquecidos, avisos };
}
