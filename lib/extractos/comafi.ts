/**
 * Analizador de movimientos de cuenta de Banco Comafi.
 * Port de `python/Comafi_movimientos.py`.
 *
 * Lee el Excel de movimientos de cuenta (Comafi Empresas → Cuentas →
 * Movimientos → Exportar): reconoce las columnas por su nombre, clasifica
 * cada concepto por palabras clave y arma los resúmenes.
 */

import { CATEGORIA as CAT, CATEGORIA_DEFECTO, ErrorExtracto, PLATAFORMAS, resolverSentido, type AnalisisExtracto, type Control, type Movimiento } from "./tipos";
import { aFecha, aNumero, clasificarPorTexto, formatearFecha, normalizarBasico, rangoFechas, type ReglasCategoria } from "./texto";
import { detectarFilaCabecera, leerPlanilla, type Celda } from "./planilla";
import {
  control,
  crearLibro,
  escribirControl,
  escribirDetalle,
  escribirPivot,
  escribirResumen,
  libroABlob,
  planificarDetalle,
  FMT_FECHA,
  FMT_NUM,
  type EsquemaDetalle,
  type Paleta,
} from "./excel";

const PALETA: Paleta = { principal: "1F3864", total: "D9E1F2" };
const TOLERANCIA = 0.02;

/**
 * Se evalúa en orden: gana la primera categoría cuya palabra clave aparezca.
 * Usa el vocabulario único de categorías (tipos.ts); "transferencia",
 * "efectivo" y "cheque" se resuelven después según el sentido del importe.
 * Pendiente: validar con archivos reales de Comafi (hoy solo sintéticos).
 */
const CATEGORIAS: ReglasCategoria = [
  [CAT.plataformas, PLATAFORMAS.map((p) => p.toLowerCase())],
  [CAT.sueldos, ["sueldo", "haberes", "acreditacion de sueldos"]],
  [CAT.impCheque, ["ley 25413", "ley 25.413", "imp. deb", "imp. cred", "impuesto debitos", "impuesto creditos"]],
  [CAT.iibb, ["iibb", "ingresos brutos", "sircreb", "arba", "agip"]],
  [CAT.iva, ["iva", "percepcion", "retencion"]],
  [CAT.impuestos, ["afip", "arca", "vep"]],
  [CAT.otrosImp, ["impuesto", "imp.", "sellos", "sellado"]],
  [CAT.mantenimiento, ["mantenimiento"]],
  [CAT.seguros, ["seguro", "prepaga", "zurich", "sancor", "galeno", "osde", "swiss medical"]],
  [CAT.comisiones, ["comision", "gastos", "chequera", "arancel", "cargo"]],
  [CAT.intereses, ["interes", "prestamo", "cuota", "descubierto"]],
  [CAT.pagoTarjeta, ["pago tarjeta", "pago visa", "pago master", "pago amex"]],
  [CAT.cobrosTarjeta, ["comercios", "master card", "mastercard", "visa", "cabal", "amex", "american express", "liquidacion tarjeta", "fiserv", "prisma", "payway", "posnet"]],
  ["efectivo", ["deposito", "efectivo", "extraccion", "cajero"]],
  [CAT.embargos, ["embargo", "judicial"]],
  [CAT.dolares, ["dolar", "compra moneda", "venta moneda", "mep", "bursatil"]],
  [CAT.transfRecibidas, ["recibida", "recibido", "acreditacion", "credito inmediato"]],
  [CAT.servicios, ["pago electronico de servicios", "pago de servicios", "pago directo", "debito automatico", "servicios"]],
  [CAT.proveedores, ["pago a proveedores", "proveedores", "b2b", "interbanking"]],
  ["transferencia", ["transferencia", "transf"]],
  ["cheque", ["cheque", "echeq"]],
];

/** Nombres de columna que se reconocen (normalizados, sin acentos). */
const ALIAS: Record<string, string[]> = {
  concepto: ["descripcion", "concepto", "detalle", "movimiento", "descripcion movimiento"],
  fecha: ["fecha", "fecha movimiento", "fecha operacion"],
  id: ["id operacion", "id", "nro operacion", "numero de operacion", "comprobante"],
  moneda: ["moneda", "divisa"],
  importe: ["importe", "monto", "importe movimiento", "credito/debito"],
  saldo: ["saldo", "saldo acumulado"],
};

function mapearColumnas(cabecera: Celda[]): Record<string, number> {
  const encontradas: Record<string, number> = {};
  const usadas = new Set<number>();
  const normalizadas = cabecera.map((c) => normalizarBasico(c));
  for (const [clave, alias] of Object.entries(ALIAS)) {
    for (let i = 0; i < normalizadas.length; i++) {
      const n = normalizadas[i];
      if (!n || usadas.has(i)) continue;
      if (alias.includes(n) || alias.some((a) => n.startsWith(a))) {
        encontradas[clave] = i;
        usadas.add(i);
        break;
      }
    }
  }
  return encontradas;
}

export interface AnalisisComafi extends AnalisisExtracto {
  banco: "comafi";
}

export async function analizarComafi(archivos: File[]): Promise<AnalisisComafi> {
  if (archivos.length === 0) throw new ErrorExtracto("No hay archivos para analizar.");
  const movimientos: Movimiento[] = [];
  const avisos: string[] = [];
  let ilegibles = 0;
  let saldoDisponible = true;

  for (const archivo of archivos) {
    const hojas = await leerPlanilla(archivo);
    const hoja = hojas.find((h) => h.filas.length > 1) ?? hojas[0];
    const filaCab = detectarFilaCabecera(
      hoja.filas,
      (celdas) => celdas.some((c) => ALIAS.concepto.includes(c)) && celdas.some((c) => ALIAS.importe.includes(c)),
    );
    if (filaCab < 0) {
      throw new ErrorExtracto(
        `No encontré las columnas de movimientos en "${archivo.name}". Se esperan títulos como "Descripción" e "Importe". ` +
          `Verificá que sea el Excel de movimientos de cuenta exportado desde Comafi.`,
      );
    }
    const cols = mapearColumnas(hoja.filas[filaCab]);
    if (cols.concepto === undefined || cols.importe === undefined) {
      throw new ErrorExtracto(`No encontré las columnas "Descripción" e "Importe" en "${archivo.name}".`);
    }
    if (cols.saldo === undefined) saldoDisponible = false;

    for (const fila of hoja.filas.slice(filaCab + 1)) {
      const concepto = String(fila[cols.concepto] ?? "").trim();
      if (!concepto || /^(nan|total|totales)$/i.test(concepto)) continue;
      const importe = aNumero(fila[cols.importe]);
      const fecha = cols.fecha !== undefined ? aFecha(fila[cols.fecha]) : null;
      if (cols.fecha !== undefined && !fecha) ilegibles++;
      movimientos.push({
        fecha,
        comprobante: cols.id !== undefined ? String(fila[cols.id] ?? "").trim() : "",
        concepto,
        categoria: resolverSentido(clasificarPorTexto(concepto, CATEGORIAS), importe > 0),
        moneda: cols.moneda !== undefined ? String(fila[cols.moneda] ?? "PESOS").trim().toUpperCase() || "PESOS" : "PESOS",
        importe,
        debito: importe < 0 ? -importe : 0,
        credito: importe > 0 ? importe : 0,
        saldo: cols.saldo !== undefined ? aNumero(fila[cols.saldo]) : null,
      });
    }
  }
  if (movimientos.length === 0) throw new ErrorExtracto("No se encontraron movimientos en el archivo.");

  movimientos.sort(
    (a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0) || (a.comprobante ?? "").localeCompare(b.comprobante ?? ""),
  );

  const controles: Control[] = [];
  const sinCategoria = movimientos.filter((m) => m.categoria === CATEGORIA_DEFECTO).length;
  controles.push(control("Lectura del archivo", "Movimientos leídos", movimientos.length, movimientos.length, true, "ent"));
  controles.push(control("Lectura del archivo", "Fechas ilegibles", ilegibles, 0, ilegibles === 0, "ent"));
  controles.push(control("Conceptos", "Movimientos sin categoría", sinCategoria, 0, sinCategoria === 0, "ent"));
  if (ilegibles) avisos.push(`${ilegibles} movimiento(s) con fecha ilegible: quedan sin fecha en el Detalle.`);
  if (sinCategoria) avisos.push(`${sinCategoria} movimiento(s) quedaron en "Otros": revisalos en el resumen (fila amarilla).`);

  // Si el archivo trae saldo, se verifica la cadena movimiento por movimiento (por moneda).
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  if (saldoDisponible && archivos.length === 1 && movimientos.every((m) => typeof m.saldo === "number")) {
    const pesos = movimientos.filter((m) => m.moneda === "PESOS" || movimientos.every((x) => x.moneda === m.moneda));
    let rupturas = 0;
    for (let i = 1; i < pesos.length; i++) {
      const esperado = (pesos[i - 1].saldo ?? 0) + pesos[i].importe;
      if (Math.abs((pesos[i].saldo ?? 0) - esperado) > TOLERANCIA) rupturas++;
    }
    if (pesos.length > 1) {
      controles.push(control("Cadena de saldos", "Eslabones sin ruptura", pesos.length - 1 - rupturas, pesos.length - 1, rupturas === 0, "ent"));
      saldoInicial = (pesos[0].saldo ?? 0) - pesos[0].importe;
      saldoFinal = pesos[pesos.length - 1].saldo ?? 0;
      if (rupturas > 0) {
        avisos.push(
          "La cadena de saldos no cierra en algunos puntos: puede que el archivo esté ordenado de otra forma o mezcle monedas. Los totales igual son correctos.",
        );
      }
    }
  }

  const { desde, hasta } = rangoFechas(movimientos);
  return {
    banco: "comafi",
    movimientos,
    desde,
    hasta,
    saldoInicial,
    saldoFinal,
    controles,
    avisos,
    archivos: archivos.map((a) => a.name),
  };
}

const ESQUEMA: EsquemaDetalle = {
  columnas: [
    { id: "fecha", titulo: "Fecha", ancho: 12, valor: (m) => m.fecha, formato: FMT_FECHA },
    { id: "comprobante", titulo: "ID Operación", ancho: 14, valor: (m) => m.comprobante ?? "" },
    { id: "concepto", titulo: "Concepto", ancho: 42, valor: (m) => m.concepto },
    { id: "categoria", titulo: "Categoría", ancho: 26, valor: (m) => m.categoria },
    { id: "moneda", titulo: "Moneda", ancho: 10, valor: (m) => m.moneda ?? "" },
    { id: "debito", titulo: "Débito", ancho: 16, valor: (m) => m.debito, formato: FMT_NUM },
    { id: "credito", titulo: "Crédito", ancho: 16, valor: (m) => m.credito, formato: FMT_NUM },
    { id: "importe", titulo: "Importe", ancho: 16, valor: (m) => m.importe, formato: FMT_NUM },
    { id: "saldo", titulo: "Saldo", ancho: 16, valor: (m) => m.saldo ?? null, formato: FMT_NUM },
  ],
};

export async function generarExcelComafi(a: AnalisisComafi): Promise<Blob> {
  const wb = await crearLibro();
  const det = planificarDetalle(ESQUEMA, a.movimientos.length);
  const subtitulo =
    `Período: ${formatearFecha(a.desde)} al ${formatearFecha(a.hasta)}  |  ${a.movimientos.length} movimientos  |  ` +
    `Origen: ${a.archivos.join(", ")}  |  Generado: ${formatearFecha(new Date())}`;
  const claveMoneda = { titulo: "Moneda", columna: "moneda", ancho: 10 };

  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Concepto",
      titulo: "Resumen por concepto",
      subtitulo,
      claves: [{ titulo: "Concepto", columna: "concepto", ancho: 44 }, claveMoneda],
      extras: [{ titulo: "Categoría", ancho: 26, valor: (g) => g[0].categoria }],
      columnaCategoria: "categoria",
    },
    PALETA,
  );
  escribirResumen(
    wb,
    a.movimientos,
    det,
    {
      nombreHoja: "Resumen por Categoría",
      titulo: "Resumen por categoría",
      subtitulo,
      claves: [{ titulo: "Categoría", columna: "categoria", ancho: 30 }, claveMoneda],
      columnaCategoria: "categoria",
    },
    PALETA,
  );
  escribirPivot(
    wb,
    a.movimientos,
    det,
    { claves: [{ titulo: "Concepto", columna: "concepto", ancho: 44 }, claveMoneda], subtitulo },
    PALETA,
  );
  if (a.controles.length > 0) {
    escribirControl(wb, a, det, { subtitulo: `Archivo: ${a.archivos.join(", ")}  |  Generado: ${formatearFecha(new Date())}` }, PALETA);
  }
  escribirDetalle(wb, a.movimientos, ESQUEMA, PALETA);
  return libroABlob(wb);
}
