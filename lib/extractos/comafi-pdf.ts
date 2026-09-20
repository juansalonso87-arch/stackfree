/**
 * Lector del resumen de cuenta mensual de Banco Comafi en PDF ("Resumen de
 * operaciones", el mismo que llega por mail o se descarga desde Comafi
 * Empresas → Cuentas → Resúmenes). Convierte el "Detalle de movimientos" en
 * los mismos movimientos crudos que entrega el Excel, para que `comafi.ts`
 * los clasifique y arme el análisis sin distinguir de dónde vinieron.
 *
 * Cómo viene el PDF (relevado con un resumen real de agosto 2026, 21 páginas,
 * generado con WeasyPrint):
 *  - Una tabla por cuenta ("CUENTA CORRIENTE BANCARIA EN PESOS", "…ESPECIAL EN
 *    DOLARES"), con columnas Fecha | Conceptos | Referencias | Débitos |
 *    Créditos | Saldo. Los importes van alineados a la derecha.
 *  - "Saldo Anterior" al inicio, "Transporte" al cortar y retomar cada página
 *    y "Saldo al: dd/mm/aaaa" al final. El saldo se imprime solo en el último
 *    movimiento de cada día; acá se lleva el saldo corrido y se verifica en
 *    cada uno de esos puntos (y en cada Transporte).
 *  - El concepto viene RECORTADO a ~30 caracteres ("Creditos a comercios
 *    Master Ca", "Impuesto a los creditos-tasa g") y pegado a la referencia
 *    ("Ca 0004175"). Las transferencias ocupan dos líneas: la segunda trae la
 *    contraparte ("DELIVERY HERO FI") y el importe.
 *  - Después del detalle vienen tablas auxiliares que el Excel no tiene:
 *    "PAGO DE SERVICIOS EFECTUADOS" (qué empresa cobró cada pago electrónico:
 *    Naturgy, Movistar, IMP.AFIP…) y "TRANSFERENCIAS ELECTRONICAS ENVIADAS /
 *    RECIBIDAS" (CUIT y nombre de la contraparte). Se cruzan por referencia
 *    o por fecha + importe y se vuelcan al detalle del movimiento.
 */

import { columnaPorDerecha, esImporte, fechaPdf, importePdf, leerTextoPdf, type FragmentoPdf, type LineaPdf } from "./pdf-texto";
import { ErrorExtracto } from "./tipos";

/** Movimiento tal como sale del PDF, todavía sin categoría. */
export interface MovimientoPdfComafi {
  fecha: Date;
  concepto: string;
  /** Número de operación (la "Referencia" del resumen, sin ceros a la izquierda). */
  comprobante: string;
  /** Contraparte u otra información de las tablas auxiliares. */
  detalle: string;
  moneda: string;
  cuenta: string;
  debito: number;
  credito: number;
  importe: number;
  /** Saldo corrido después del movimiento (a partir del "Saldo Anterior"). */
  saldo: number;
}

export interface LecturaPdfComafi {
  movimientos: MovimientoPdfComafi[];
  /** Cuentas encontradas con movimientos ("0560-03680-6 PESOS"). */
  cuentas: string[];
  /** Cuánto pide el PDF que coincida el saldo corrido y cuántas veces coincidió. */
  puntosSaldo: number;
  puntosOk: number;
  saldoAnterior: number | null;
  saldoFinal: number | null;
  /** Cuántos movimientos se enriquecieron con las tablas auxiliares. */
  enriquecidos: number;
  avisos: string[];
}

const TOLERANCIA = 0.02;

interface Columnas {
  xConceptos: number;
  xReferencias: number;
  /** Bordes derechos de Débitos, Créditos y Saldo. */
  derechas: [number, number, number];
}

/** ¿Es la fila de títulos de la tabla de movimientos? Devuelve la geometría de las columnas. */
function columnasDe(linea: LineaPdf): Columnas | null {
  const f = (nombre: string) => linea.fragmentos.find((x) => x.texto.toLowerCase() === nombre);
  const fecha = f("fecha");
  const conceptos = f("conceptos");
  const referencias = f("referencias");
  const debitos = f("débitos") ?? f("debitos");
  const creditos = f("créditos") ?? f("creditos");
  const saldo = f("saldo");
  if (!fecha || !conceptos || !debitos || !creditos || !saldo) return null;
  return {
    xConceptos: conceptos.x,
    xReferencias: referencias?.x ?? conceptos.x + 130,
    derechas: [debitos.derecha, creditos.derecha, saldo.derecha],
  };
}

/** Separa los fragmentos de una fila en texto (concepto/referencia) e importes por columna. */
function partirFila(fragmentos: FragmentoPdf[], cols: Columnas) {
  const texto: string[] = [];
  const importes: (number | null)[] = [null, null, null];
  const limiteTexto = cols.derechas[0] - 90; // los importes de Débitos empiezan a la derecha de acá
  for (const fr of fragmentos) {
    if (fr.x > limiteTexto && esImporte(fr.texto)) {
      const col = columnaPorDerecha(fr, cols.derechas);
      if (col >= 0 && importes[col] === null) {
        importes[col] = importePdf(fr.texto);
        continue;
      }
    }
    texto.push(fr.texto);
  }
  return { texto: texto.join(" ").replace(/\s+/g, " ").trim(), debito: importes[0], credito: importes[1], saldo: importes[2] };
}

/**
 * El concepto viene pegado a la columna Referencias: "Creditos a comercios
 * Master Ca 0004175" → concepto + referencia "4175". La referencia es el
 * primer número largo; lo que sigue ("Transferencia #6550004") es detalle.
 */
function separarReferencia(texto: string): { concepto: string; comprobante: string; detalle: string } {
  const m = texto.match(/^(.*?)\s+(\d{5,})(?:\s+(.*))?$/);
  if (!m) return { concepto: texto, comprobante: "", detalle: "" };
  return { concepto: m[1].trim(), comprobante: m[2].replace(/^0+(?=\d)/, ""), detalle: (m[3] ?? "").trim() };
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

/** Fecha, importe (último fragmento) y referencia numérica de una fila de tabla auxiliar. */
function filaAuxiliar(linea: LineaPdf): FilaAuxiliar | null {
  const fecha = fechaPdf(linea.fragmentos[0].texto);
  if (!fecha) return null;
  const ultimo = linea.fragmentos[linea.fragmentos.length - 1];
  const importe = importePdf(ultimo.texto.replace(/^\$\s*/, ""));
  if (importe === null) return null;
  return { fecha, referencia: "", importe, descripcion: "" };
}

const sinCeros = (s: string) => s.replace(/^0+(?=\d)/, "");

/**
 * "PAGO DE SERVICIOS EFECTUADOS": Empresa | Medio de Pago | Identificador |
 * Prestación | Referencia | Cta.Debitada | Fecha | Importe. La "Prestación"
 * ("000658405") es la referencia del movimiento "Pago electronico de servicios 0658405".
 */
function leerPagosServicios(lineas: LineaPdf[], desde: number): FilaAuxiliar[] {
  const filas: FilaAuxiliar[] = [];
  for (let i = desde; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^(NOVEDADES|TRANSFERENCIAS ELECTRONICAS|RECIBIDAS|ENVIADAS)\b/.test(l.texto)) break;
    const fr = l.fragmentos;
    const iFecha = fr.findIndex((f) => fechaPdf(f.texto));
    if (iFecha < 2) continue;
    const importe = importePdf(fr.slice(iFecha + 1).map((f) => f.texto).join("").replace(/^\$/, ""));
    if (importe === null) continue;
    // Entre la empresa y la cuenta debitada: la cuenta es "0560-03680-6"; la prestación es el número justo antes.
    const iCuenta = fr.findIndex((f, k) => k < iFecha && /^\d{4}-\d{5}-\d$/.test(f.texto));
    const referencia = iCuenta > 0 ? sinCeros(fr[iCuenta - 1].texto) : "";
    const empresa = fr
      .slice(0, iCuenta > 0 ? iCuenta - 1 : iFecha)
      .map((f) => f.texto)
      .filter((t) => !/^\d+$/.test(t) && !/^(Pago|Directo|Electrónico|Electronico)$/.test(t))
      .join(" ")
      .replace(/\bPago$/, "")
      .trim();
    filas.push({ fecha: fechaPdf(fr[iFecha].texto), referencia, importe, descripcion: empresa });
  }
  return filas;
}

/**
 * "TRANSFERENCIAS ELECTRONICAS ENVIADAS": Fecha | Referencia | Cuenta Origen |
 * CUIT Destinatario | Nombre | Moneda | Importe. Cada transferencia aparece
 * dos veces: con el CUIT real del destinatario y, en otra fila "Fac…", con el
 * banco como destinatario; se conserva la primera.
 */
function leerEnviadas(lineas: LineaPdf[], desde: number): FilaAuxiliar[] {
  const filas: FilaAuxiliar[] = [];
  for (let i = desde; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^RECIBIDAS\b/.test(l.texto)) break;
    const base = filaAuxiliar(l);
    if (!base) continue;
    const fr = l.fragmentos;
    const iCuit = fr.findIndex((f, k) => k >= 3 && /^\d{11}$/.test(f.texto));
    if (iCuit < 0) continue;
    const nombre = fr
      .slice(iCuit + 1, -1)
      .map((f) => f.texto)
      .filter((t) => t !== "$")
      .join(" ");
    if (/BANCO COMAFI/i.test(nombre)) continue; // la fila espejo del banco
    filas.push({ ...base, referencia: fr[1].texto, descripcion: `CUIT ${fr[iCuit].texto}${nombre ? " " + nombre : ""}` });
  }
  return filas;
}

/** "RECIBIDAS": Fecha | Nombre Ordenante | Referencia | Banco Origen | CUIT Ordenante | Cuenta Destino | Moneda | Importe. */
function leerRecibidas(lineas: LineaPdf[], desde: number): FilaAuxiliar[] {
  const filas: FilaAuxiliar[] = [];
  for (let i = desde; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^(NOVEDADES|TRANSFERENCIAS ELECTRONICAS|ENVIADAS|PAGO DE SERVICIOS)\b/.test(l.texto)) break;
    const base = filaAuxiliar(l);
    if (!base) continue;
    const fr = l.fragmentos;
    const iCuit = fr.findIndex((f, k) => k >= 2 && /^\d{11}$/.test(f.texto));
    if (iCuit < 0) continue;
    // Entre la fecha y el CUIT: nombre del ordenante, referencia ("PRO4223071", "VCAB26080503186") y banco de origen.
    const palabras = fr
      .slice(1, iCuit)
      .map((f) => f.texto)
      .join(" ")
      .split(" ");
    const iRef = palabras.findIndex((t) => /^[A-Z]{2,5}\d{5,}$/.test(t) || /^\d{6,}$/.test(t));
    const nombre = (iRef > 0 ? palabras.slice(0, iRef) : palabras).join(" ");
    const banco = iRef >= 0 ? palabras.slice(iRef + 1).join(" ") : "";
    filas.push({ ...base, referencia: iRef >= 0 ? palabras[iRef] : "", descripcion: `${nombre} | CUIT ${fr[iCuit].texto}${banco ? " | " + banco : ""}` });
  }
  return filas;
}

/* ------------------------------------------------------------------ */
/* Lectura principal                                                    */
/* ------------------------------------------------------------------ */

export async function leerPdfComafi(archivo: File): Promise<LecturaPdfComafi> {
  const { lineas, titulo } = await leerTextoPdf(archivo);
  if (lineas.length === 0) {
    throw new ErrorExtracto(
      `"${archivo.name}" no tiene texto legible: parece un PDF escaneado (una imagen). Descargá el resumen desde Comafi Empresas o exportá los movimientos a Excel.`,
    );
  }
  const esComafi = /comafi/i.test(titulo) || lineas.some((l) => /comafi/i.test(l.texto));
  if (!esComafi) {
    throw new ErrorExtracto(`"${archivo.name}" no parece un resumen de Banco Comafi.`);
  }

  const movimientos: MovimientoPdfComafi[] = [];
  const avisos: string[] = [];
  const cuentas = new Set<string>();
  let puntosSaldo = 0;
  let puntosOk = 0;
  let saldoAnterior: number | null = null;
  let saldoFinal: number | null = null;

  let moneda = "PESOS";
  let cuenta = "";
  let cols: Columnas | null = null;
  let enTabla = false;
  let saldoCorrido = 0;
  let pendiente: MovimientoPdfComafi | null = null;
  let iPagos = -1;
  let iEnviadas = -1;
  let iRecibidas = -1;

  const verificar = (declarado: number) => {
    puntosSaldo++;
    if (Math.abs(declarado - saldoCorrido) <= TOLERANCIA) puntosOk++;
    else saldoCorrido = declarado; // se resincroniza para no arrastrar una sola diferencia a todo el resto
  };

  const cerrarPendiente = () => {
    if (pendiente && (pendiente.debito || pendiente.credito)) movimientos.push(pendiente);
    pendiente = null;
  };

  const registrar = (fecha: Date, fila: ReturnType<typeof partirFila>, detalle: string) => {
    const { concepto, comprobante, detalle: extra } = separarReferencia(fila.texto);
    const debito = fila.debito ?? 0;
    const credito = fila.credito ?? 0;
    const importe = credito - debito;
    saldoCorrido += importe;
    const m: MovimientoPdfComafi = {
      fecha,
      concepto,
      comprobante,
      detalle: [detalle, extra].filter(Boolean).join(" "),
      moneda,
      cuenta,
      debito,
      credito,
      importe,
      saldo: saldoCorrido,
    };
    if (fila.saldo !== null) verificar(fila.saldo);
    return m;
  };

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const t = l.texto;

    // Encabezado de cada cuenta.
    const cta = t.match(/\b(CUENTA CORRIENTE[A-Z ]*|CAJA DE AHORRO[A-Z ]*) EN (PESOS|DOLARES)\b/i);
    if (cta) {
      cerrarPendiente();
      enTabla = false;
      moneda = cta[2].toUpperCase();
      const sig = lineas[i + 1]?.texto.match(/\b(\d{4}-\d{5}-\d)\b/);
      cuenta = sig ? sig[1] : "";
      continue;
    }
    if (/^PAGO DE SERVICIOS\b/.test(t)) iPagos = i;
    if (/^ENVIADAS\b/.test(t)) iEnviadas = i;
    if (/^RECIBIDAS\b/.test(t)) iRecibidas = i;

    const c = columnasDe(l);
    if (c) {
      cols = c;
      enTabla = true;
      continue;
    }
    if (!enTabla || !cols) continue;

    if (/^Saldo Anterior\b/i.test(t.replace(/^\d{2}\/\d{2}\/\d{2}\s*/, ""))) {
      const ultimo = l.fragmentos[l.fragmentos.length - 1];
      const s = importePdf(ultimo.texto);
      if (s !== null) {
        saldoCorrido = s;
        if (moneda === "PESOS" && saldoAnterior === null) saldoAnterior = s;
      }
      continue;
    }
    if (/^Transporte\b/.test(t)) {
      cerrarPendiente();
      const s = importePdf(l.fragmentos[l.fragmentos.length - 1].texto);
      if (s !== null) verificar(s);
      continue;
    }
    if (/^Saldo al\b/i.test(t)) {
      cerrarPendiente();
      const s = importePdf(l.fragmentos[l.fragmentos.length - 1].texto);
      if (s !== null) {
        verificar(s);
        if (moneda === "PESOS" && saldoFinal === null) saldoFinal = s;
      }
      enTabla = false;
      continue;
    }
    if (/^SIN MOVIMIENTOS\b/i.test(t)) continue;

    const fecha = fechaPdf(l.fragmentos[0].texto);
    if (fecha && l.fragmentos[0].x < cols.xConceptos) {
      cerrarPendiente();
      const fila = partirFila(l.fragmentos.slice(1), cols);
      const m = registrar(fecha, fila, "");
      if (m.debito || m.credito) {
        movimientos.push(m);
        cuentas.add(`${cuenta} ${moneda}`.trim());
      } else {
        // Sin importe todavía: la línea siguiente trae la contraparte y el importe.
        saldoCorrido -= m.importe;
        pendiente = m;
      }
      continue;
    }

    // Continuación de un movimiento (contraparte y/o importe en la segunda línea).
    if (pendiente && l.fragmentos[0].x >= cols.xReferencias - 5) {
      const fila = partirFila(l.fragmentos, cols);
      const debito = fila.debito ?? 0;
      const credito = fila.credito ?? 0;
      pendiente.detalle = [pendiente.detalle, fila.texto].filter(Boolean).join(" ");
      if (debito || credito) {
        pendiente.debito = debito;
        pendiente.credito = credito;
        pendiente.importe = credito - debito;
        saldoCorrido += pendiente.importe;
        pendiente.saldo = saldoCorrido;
        if (fila.saldo !== null) verificar(fila.saldo);
        movimientos.push(pendiente);
        cuentas.add(`${cuenta} ${moneda}`.trim());
        pendiente = null;
      }
    }
  }
  cerrarPendiente();

  if (movimientos.length === 0) {
    throw new ErrorExtracto(`No encontré el "Detalle de movimientos" en "${archivo.name}". Verificá que sea el resumen de cuenta de Comafi.`);
  }

  // Enriquecimiento con las tablas auxiliares.
  let enriquecidos = 0;
  const pagos = iPagos >= 0 ? leerPagosServicios(lineas, iPagos + 1) : [];
  const enviadas = iEnviadas >= 0 ? leerEnviadas(lineas, iEnviadas + 1) : [];
  const recibidas = iRecibidas >= 0 ? leerRecibidas(lineas, iRecibidas + 1) : [];
  // El detalle puede fechar un pago un día después que la tabla auxiliar (Zurich: débito el 10, asentado el 11).
  const diasEntre = (a: Date | null, b: Date) => (a ? Math.abs(a.getTime() - b.getTime()) / 86_400_000 : Infinity);
  const usadas = new Set<FilaAuxiliar>();
  const buscar = (tabla: FilaAuxiliar[], m: MovimientoPdfComafi, monto: number) =>
    tabla.find(
      (f) =>
        !usadas.has(f) &&
        Math.abs(f.importe - monto) <= TOLERANCIA &&
        ((f.referencia !== "" && sinCeros(f.referencia) === m.comprobante) || diasEntre(f.fecha, m.fecha) <= 1.5),
    );
  const yaDice = (detalle: string, texto: string) => {
    const primera = texto.split(/\s*\|\s*/)[0].toUpperCase().replace(/\s+/g, " ").slice(0, 10);
    return primera.length >= 4 && detalle.toUpperCase().replace(/\s+/g, " ").includes(primera);
  };

  for (const m of movimientos) {
    let extra: FilaAuxiliar | undefined;
    if (m.debito > 0 && /^pago/i.test(m.concepto)) extra = buscar(pagos, m, m.debito);
    else if (m.debito > 0 && /^transf/i.test(m.concepto)) extra = buscar(enviadas, m, m.debito);
    else if (m.credito > 0 && /^transf/i.test(m.concepto)) extra = buscar(recibidas, m, m.credito);
    if (extra) {
      usadas.add(extra);
      // Si la segunda línea del detalle ya nombró a la contraparte, se agrega solo el resto (CUIT, banco).
      const partes = extra.descripcion.split(/\s*\|\s*/);
      const nuevo = (yaDice(m.detalle, extra.descripcion) ? partes.slice(1) : partes).join(" | ");
      if (nuevo && !m.detalle.includes(nuevo)) m.detalle = [m.detalle, nuevo].filter(Boolean).join(" | ");
      enriquecidos++;
    }
  }

  if (puntosSaldo > 0 && puntosOk < puntosSaldo) {
    avisos.push(`El saldo corrido no coincidió con el impreso en ${puntosSaldo - puntosOk} de ${puntosSaldo} puntos del resumen: puede haber una línea que no se leyó bien.`);
  }

  return { movimientos, cuentas: [...cuentas], puntosSaldo, puntosOk, saldoAnterior, saldoFinal, enriquecidos, avisos };
}
