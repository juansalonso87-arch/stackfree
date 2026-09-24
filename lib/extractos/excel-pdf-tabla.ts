/**
 * Excel de la herramienta "PDF del banco a Excel" (nivel 1: la tabla tal cual
 * está impresa, sin clasificar).
 *
 * Dos hojas:
 * - **Movimientos**: una fila por movimiento, con las mismas columnas y los
 *   mismos nombres que usa el resumen. Nada inventado, nada interpretado.
 * - **Control**: lo que sumó cada columna y, cuando el resumen imprime una línea
 *   de total, si coincide. Ese contraste es lo que hace honesta a la herramienta:
 *   lee bancos que nadie validó, así que no promete exactitud, pero avisa cuando
 *   no cuadra.
 */

import {
  FMT_FECHA,
  FMT_NUM,
  anchos,
  autofiltro,
  congelar,
  crearLibro,
  encabezadoHoja,
  estiloFila,
  fechaExcel,
  filaCabecera,
  fuentes,
  libroABlob,
  relleno,
  type Paleta,
} from "./excel";
import { contrastarConTotales, totalesPorColumna, type TablaPdf } from "./pdf-tabla";

const PALETA: Paleta = { principal: "1F3864", total: "D9E2F3" };

const fecha = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

export async function generarExcelTablaPdf(tablas: TablaPdf[]): Promise<Blob> {
  const wb = await crearLibro();
  const varios = tablas.length > 1;

  /* ---------------- Movimientos ---------------- */
  const ws = wb.addWorksheet("Movimientos");
  // Todas las tablas comparten las columnas de la primera: si alguien sube dos
  // resúmenes del mismo banco, encajan; si son de bancos distintos, se avisa.
  const columnas = tablas[0].columnas;
  const cabeceras = [...(varios ? ["Archivo"] : []), "Pág.", ...columnas.map((c) => c.titulo)];

  const desde = tablas.map((t) => t.filas.map((f) => f.celdas[columnas.findIndex((c) => c.tipo === "fecha")]))
    .flat()
    .filter((v): v is Date => v instanceof Date);
  const periodo = desde.length
    ? `${fecha(new Date(Math.min(...desde.map((d) => d.getTime()))))} al ${fecha(new Date(Math.max(...desde.map((d) => d.getTime()))))}`
    : "sin fechas";
  const totalFilas = tablas.reduce((s, t) => s + t.filas.length, 0);

  encabezadoHoja(
    ws,
    "Movimientos del resumen en PDF",
    `${periodo}  ·  ${totalFilas} movimientos  ·  tal como están impresos, sin clasificar`,
    cabeceras.length,
    PALETA,
  );
  filaCabecera(ws, 4, cabeceras, PALETA);

  let fila = 5;
  for (const t of tablas) {
    for (const f of t.filas) {
      let col = 1;
      if (varios) ws.getCell(fila, col++).value = t.archivo;
      ws.getCell(fila, col++).value = f.pagina;
      for (let i = 0; i < columnas.length; i++) {
        const celda = ws.getCell(fila, col++);
        const v = f.celdas[i];
        if (v instanceof Date) {
          celda.value = fechaExcel(v);
          celda.numFmt = FMT_FECHA;
        } else if (typeof v === "number") {
          celda.value = v;
          celda.numFmt = FMT_NUM;
        } else {
          celda.value = v ?? "";
        }
      }
      estiloFila(ws, fila, cabeceras.length, { alterna: fila % 2 === 0 });
      fila++;
    }
  }
  anchos(ws, [...(varios ? [26] : []), 6, 12, ...columnas.slice(1).map((c) => (c.tipo === "texto" ? 46 : 16))]);
  congelar(ws, 4);
  autofiltro(ws, 4, 1, fila - 1, cabeceras.length);

  /* ---------------- Control ---------------- */
  const wc = wb.addWorksheet("Control");
  encabezadoHoja(wc, "Control de la extracción", "Compará estos números con los que imprime tu resumen", 5, PALETA);
  let f = 4;

  for (const t of tablas) {
    wc.getCell(f, 1).value = t.archivo;
    wc.getCell(f, 1).font = fuentes.total;
    f += 1;
    wc.getCell(f, 1).value = `${t.paginas} páginas · ${t.filas.length} movimientos leídos`;
    wc.getCell(f, 1).font = fuentes.chica;
    f += 2;

    filaCabecera(wc, f, ["Columna", "Movimientos con dato", "Suma", "", ""], PALETA);
    f++;
    for (const total of totalesPorColumna(t)) {
      wc.getCell(f, 1).value = total.titulo;
      wc.getCell(f, 2).value = total.cantidad;
      wc.getCell(f, 3).value = total.suma;
      wc.getCell(f, 3).numFmt = FMT_NUM;
      estiloFila(wc, f, 5, { alterna: f % 2 === 0 });
      f++;
    }
    f++;

    const ct = contrastarConTotales(t);
    if (ct) {
      wc.getCell(f, 1).value = `Contra la línea "${ct.referencia}" del propio resumen:`;
      wc.getCell(f, 1).font = fuentes.total;
      f++;
      filaCabecera(wc, f, ["", "Dice el resumen", "Extrajimos", "Diferencia", "¿Coincide?"], PALETA);
      f++;
      ct.delResumen.forEach((v, i) => {
        wc.getCell(f, 1).value = ct.titulos[i] ?? `Columna ${i + 1}`;
        wc.getCell(f, 2).value = v;
        wc.getCell(f, 3).value = ct.extraido[i];
        wc.getCell(f, 4).value = { formula: `C${f}-B${f}`, date1904: false };
        [2, 3, 4].forEach((c) => (wc.getCell(f, c).numFmt = FMT_NUM));
        const bien = Math.abs(Math.abs(ct.extraido[i]) - Math.abs(v)) < 0.01;
        wc.getCell(f, 5).value = bien ? "Sí" : "NO";
        wc.getCell(f, 5).font = bien ? fuentes.ok : fuentes.mal;
        if (!bien) wc.getCell(f, 5).fill = relleno("FCE4E4");
        f++;
      });
      f++;
      wc.getCell(f, 1).value = ct.coincide
        ? "La extracción cuadra con el total impreso en el resumen."
        : "ATENCIÓN: la extracción NO cuadra con el total impreso. Revisá el PDF antes de usar estos datos.";
      wc.getCell(f, 1).font = ct.coincide ? fuentes.ok : fuentes.mal;
      f += 2;
    } else {
      wc.getCell(f, 1).value = "Este resumen no imprime una línea de total, así que no se pudo verificar la extracción contra él.";
      wc.getCell(f, 1).font = fuentes.chica;
      f += 2;
    }

    if (t.especiales.length) {
      wc.getCell(f, 1).value = "Líneas del resumen que no son movimientos (saldo anterior, transporte, totales):";
      wc.getCell(f, 1).font = fuentes.total;
      f++;
      for (const e of t.especiales) {
        wc.getCell(f, 1).value = `p${e.pagina}`;
        wc.getCell(f, 2).value = e.texto;
        e.importes.forEach((v, i) => {
          wc.getCell(f, 3 + i).value = v;
          wc.getCell(f, 3 + i).numFmt = FMT_NUM;
        });
        f++;
      }
      f++;
    }

    for (const a of t.avisos) {
      wc.getCell(f, 1).value = `• ${a}`;
      wc.getCell(f, 1).font = fuentes.chica;
      f++;
    }
    f += 2;
  }
  anchos(wc, [22, 40, 18, 18, 14]);

  return libroABlob(wb);
}
