#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agrupar_movimientos.py
----------------------
Toma el Excel de movimientos de cuenta y devuelve otro Excel con los
conceptos agrupados.

USO
---
  python agrupar_movimientos.py movimientos_cuenta.xlsx
  python agrupar_movimientos.py                # toma el .xlsx mas nuevo de la carpeta
  python agrupar_movimientos.py entrada.xlsx -o salida.xlsx

En Google Colab:
  !python agrupar_movimientos.py /content/movimientos_cuenta.xlsx
  (o pegar el archivo en /content y correr sin argumentos)

SALIDA (4 hojas)
----------------
  1. Resumen por Concepto   -> un renglon por concepto, con SUMIFS contra el Detalle
  2. Resumen por Categoria  -> conceptos agrupados en categorias (editable abajo)
  3. Concepto x Dia         -> matriz concepto vs fecha
  4. Detalle                -> los movimientos limpios, con la categoria asignada

Las hojas de resumen usan formulas (SUMIFS / COUNTIFS) apuntando a "Detalle":
si filtras o corregis algo en el detalle, los totales se recalculan solos.
"""

import argparse
import os
import re
import sys
import unicodedata
from datetime import datetime

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# ----------------------------------------------------------------------------
# 1) CATEGORIAS  <-- EDITAR ACA PARA SUMAR O CAMBIAR REGLAS
# ----------------------------------------------------------------------------
# Se evalua en orden: la primera categoria cuya palabra clave aparezca en el
# concepto, gana. Las claves van en minuscula y SIN acentos.
CATEGORIAS = [
    ("Sueldos",                  ["sueldo", "haberes", "acreditacion de sueldos"]),
    ("Impuestos",                ["impuesto", "imp.", "iva", "percepcion", "retencion",
                                  "iibb", "ingresos brutos", "sircreb", "ley 25413"]),
    ("Comisiones y gastos banco", ["comision", "mantenimiento", "gastos", "seguro",
                                   "chequera", "arancel"]),
    ("Cobros con tarjeta",       ["comercios", "master card", "mastercard", "visa",
                                  "cabal", "amex", "american express", "liquidacion tarjeta"]),
    ("Depositos en efectivo",    ["deposito", "efectivo"]),
    ("Transferencias recibidas", ["recibida", "recibido", "acreditacion", "credito inmediato"]),
    ("Pago de servicios",        ["pago electronico de servicios", "pago de servicios",
                                  "pago directo", "debito automatico"]),
    ("Transferencias enviadas",  ["transferencia", "transf", "pago a proveedores"]),
    ("Cheques",                  ["cheque", "echeq"]),
]
CATEGORIA_DEFECTO = "Otros"

# ----------------------------------------------------------------------------
# 2) NOMBRES DE COLUMNAS QUE EL SCRIPT RECONOCE
# ----------------------------------------------------------------------------
ALIAS_COLUMNAS = {
    "concepto":  ["descripcion", "concepto", "detalle", "movimiento", "descripcion movimiento"],
    "fecha":     ["fecha", "fecha movimiento", "fecha operacion"],
    "id":        ["id operacion", "id", "nro operacion", "numero de operacion", "comprobante"],
    "moneda":    ["moneda", "divisa"],
    "importe":   ["importe", "monto", "importe movimiento", "credito/debito"],
    "saldo":     ["saldo", "saldo acumulado"],
}

# ----------------------------------------------------------------------------
# Estilos
# ----------------------------------------------------------------------------
FUENTE = "Arial"
F_TITULO   = Font(name=FUENTE, size=14, bold=True, color="1F3864")
F_SUBTIT   = Font(name=FUENTE, size=9, italic=True, color="595959")
F_CABECERA = Font(name=FUENTE, size=10, bold=True, color="FFFFFF")
F_NORMAL   = Font(name=FUENTE, size=10)
F_TOTAL    = Font(name=FUENTE, size=10, bold=True)
FILL_CAB   = PatternFill("solid", fgColor="1F3864")
FILL_TOTAL = PatternFill("solid", fgColor="D9E1F2")
FILL_ALT   = PatternFill("solid", fgColor="F2F2F2")
BORDE_TOP  = Border(top=Side(style="thin", color="808080"))

FMT_NUM   = '#,##0.00;[RED]-#,##0.00;"-"'
FMT_PCT   = '0.0%;-0.0%;"-"'
FMT_FECHA = "DD/MM/YYYY"
FMT_DIA   = "DD/MM"
FMT_ENT   = '#,##0;-#,##0;"-"'


# ----------------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------------
def normalizar(texto) -> str:
    """minusculas, sin acentos, sin espacios de mas."""
    if texto is None:
        return ""
    t = str(texto).strip().lower()
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t)


def a_numero(valor):
    """Convierte '1.234,56', '$ 1234.56', '(1.234,56)' o numero -> float."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    t = str(valor).strip()
    if not t:
        return 0.0
    negativo = t.startswith("(") and t.endswith(")")
    t = t.strip("()")
    t = re.sub(r"[^\d,.\-]", "", t)          # saca $, espacios, ARS, etc.
    if "," in t and "." in t:                 # formato argentino 1.234,56
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:                            # 1234,56
        t = t.replace(",", ".")
    try:
        n = float(t)
    except ValueError:
        return 0.0
    return -n if negativo else n


def detectar_fila_cabecera(path: str, hoja=0, max_filas=20) -> int:
    """Busca la fila que contiene la cabecera real (por si el export trae titulos arriba)."""
    previa = pd.read_excel(path, sheet_name=hoja, header=None, nrows=max_filas)
    claves_concepto = set(ALIAS_COLUMNAS["concepto"])
    claves_importe = set(ALIAS_COLUMNAS["importe"])
    for i, fila in previa.iterrows():
        celdas = {normalizar(c) for c in fila.tolist()}
        if celdas & claves_concepto and celdas & claves_importe:
            return int(i)
    return 0


def mapear_columnas(df: pd.DataFrame) -> dict:
    """Devuelve {clave_interna: nombre_real_de_columna}."""
    encontradas, usadas = {}, set()
    normalizadas = {col: normalizar(col) for col in df.columns}
    for clave, alias in ALIAS_COLUMNAS.items():
        for col, norm in normalizadas.items():
            if col in usadas:
                continue
            if norm in alias or any(norm.startswith(a) for a in alias):
                encontradas[clave] = col
                usadas.add(col)
                break
    return encontradas


def clasificar(concepto: str) -> str:
    n = normalizar(concepto)
    for categoria, claves in CATEGORIAS:
        if any(clave in n for clave in claves):
            return categoria
    return CATEGORIA_DEFECTO


# ----------------------------------------------------------------------------
# Lectura y limpieza
# ----------------------------------------------------------------------------
def leer_movimientos(path: str) -> pd.DataFrame:
    fila_cab = detectar_fila_cabecera(path)
    df = pd.read_excel(path, header=fila_cab)
    df = df.dropna(how="all")

    cols = mapear_columnas(df)
    faltan = [c for c in ("concepto", "importe") if c not in cols]
    if faltan:
        raise SystemExit(
            f"[ERROR] No encuentro las columnas {faltan} en '{os.path.basename(path)}'.\n"
            f"        Columnas del archivo: {list(df.columns)}\n"
            f"        Agregalas al diccionario ALIAS_COLUMNAS arriba del script."
        )

    out = pd.DataFrame()
    out["Concepto"] = df[cols["concepto"]].astype(str).str.strip()
    out["Importe"] = df[cols["importe"]].map(a_numero)

    if "fecha" in cols:
        out["Fecha"] = pd.to_datetime(df[cols["fecha"]], dayfirst=True, errors="coerce")
    else:
        out["Fecha"] = pd.NaT

    out["ID Operación"] = df[cols["id"]] if "id" in cols else ""
    out["Moneda"] = (df[cols["moneda"]].astype(str).str.strip().str.upper()
                     if "moneda" in cols else "PESOS")
    out["Saldo"] = df[cols["saldo"]].map(a_numero) if "saldo" in cols else None

    out = out[(out["Concepto"] != "") & (out["Concepto"].str.lower() != "nan")]
    out["Categoría"] = out["Concepto"].map(clasificar)

    orden = ["Fecha", "ID Operación", "Concepto", "Categoría", "Moneda", "Importe", "Saldo"]
    out = out[orden].sort_values(["Fecha", "ID Operación"], na_position="last").reset_index(drop=True)
    return out


# ----------------------------------------------------------------------------
# Escritura del Excel
# ----------------------------------------------------------------------------
def escribir_detalle(wb: Workbook, df: pd.DataFrame) -> None:
    ws = wb.create_sheet("Detalle")
    cabeceras = list(df.columns)
    ws.append(cabeceras)
    for celda in ws[1]:
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center")

    for _, fila in df.iterrows():
        ws.append([None if pd.isna(v) else v for v in fila.tolist()])

    ultima = ws.max_row
    for r in range(2, ultima + 1):
        for c in range(1, len(cabeceras) + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_NORMAL
        ws.cell(row=r, column=1).number_format = FMT_FECHA
        ws.cell(row=r, column=6).number_format = FMT_NUM
        ws.cell(row=r, column=7).number_format = FMT_NUM

    anchos = [12, 14, 42, 26, 10, 16, 16]
    for i, a in enumerate(anchos, start=1):
        ws.column_dimensions[get_column_letter(i)].width = a
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cabeceras))}{ultima}"


def encabezado_hoja(ws, titulo: str, subtitulo: str, ancho_merge: int) -> None:
    ws["A1"] = titulo
    ws["A1"].font = F_TITULO
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ancho_merge)
    ws["A2"] = subtitulo
    ws["A2"].font = F_SUBTIT
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ancho_merge)
    ws.row_dimensions[1].height = 20


def escribir_resumen(wb, df, campo, titulo, nombre_hoja, subtitulo, fila_detalle_fin):
    """campo = 'Concepto' o 'Categoría'. Genera el resumen con SUMIFS al Detalle."""
    col_clave = "C" if campo == "Concepto" else "D"   # columna en la hoja Detalle
    rango_clave = f"Detalle!${col_clave}$2:${col_clave}${fila_detalle_fin}"
    rango_moneda = f"Detalle!$E$2:$E${fila_detalle_fin}"
    rango_importe = f"Detalle!$F$2:$F${fila_detalle_fin}"

    ws = wb.create_sheet(nombre_hoja)
    cabeceras = [campo, "Moneda", "Movimientos", "Débitos", "Créditos",
                 "Neto", "% s/Débitos", "% s/Créditos"]
    encabezado_hoja(ws, titulo, subtitulo, len(cabeceras))

    fila_cab = 4
    for j, h in enumerate(cabeceras, start=1):
        celda = ws.cell(row=fila_cab, column=j, value=h)
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    resumen = (df.groupby([campo, "Moneda"], as_index=False)["Importe"]
                 .sum().sort_values("Importe", ascending=False))

    fila = fila_cab + 1
    primera = fila
    for _, r in resumen.iterrows():
        ws.cell(row=fila, column=1, value=r[campo])
        ws.cell(row=fila, column=2, value=r["Moneda"])
        ws.cell(row=fila, column=3,
                value=f'=COUNTIFS({rango_clave},$A{fila},{rango_moneda},$B{fila})')
        ws.cell(row=fila, column=4,
                value=f'=SUMIFS({rango_importe},{rango_clave},$A{fila},'
                      f'{rango_moneda},$B{fila},{rango_importe},"<0")')
        ws.cell(row=fila, column=5,
                value=f'=SUMIFS({rango_importe},{rango_clave},$A{fila},'
                      f'{rango_moneda},$B{fila},{rango_importe},">0")')
        ws.cell(row=fila, column=6, value=f"=D{fila}+E{fila}")
        fila += 1
    ultima = fila - 1
    fila_total = fila

    # Totales
    ws.cell(row=fila_total, column=1, value="TOTAL")
    for col in ("C", "D", "E", "F"):
        ws[f"{col}{fila_total}"] = f"=SUM({col}{primera}:{col}{ultima})"

    # Porcentajes (con el total como denominador)
    for r in range(primera, ultima + 1):
        ws.cell(row=r, column=7, value=f'=IFERROR(D{r}/$D${fila_total},"")')
        ws.cell(row=r, column=8, value=f'=IFERROR(E{r}/$E${fila_total},"")')
    ws.cell(row=fila_total, column=7, value=f'=IFERROR(SUM(G{primera}:G{ultima}),"")')
    ws.cell(row=fila_total, column=8, value=f'=IFERROR(SUM(H{primera}:H{ultima}),"")')

    # Formato
    for r in range(primera, fila_total + 1):
        es_total = r == fila_total
        for c in range(1, len(cabeceras) + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_TOTAL if es_total else F_NORMAL
            if es_total:
                celda.fill, celda.border = FILL_TOTAL, BORDE_TOP
            elif (r - primera) % 2 == 1:
                celda.fill = FILL_ALT
        ws.cell(row=r, column=3).number_format = FMT_ENT
        for c in (4, 5, 6):
            ws.cell(row=r, column=c).number_format = FMT_NUM
        for c in (7, 8):
            ws.cell(row=r, column=c).number_format = FMT_PCT

    for col, ancho in zip("ABCDEFGH", [44, 10, 13, 17, 17, 17, 12, 12]):
        ws.column_dimensions[col].width = ancho
    ws.freeze_panes = f"A{fila_cab + 1}"
    ws.auto_filter.ref = f"A{fila_cab}:H{ultima}"


def escribir_pivot(wb, df, fila_detalle_fin):
    """Matriz concepto x dia (neto por dia)."""
    fechas = sorted(d for d in df["Fecha"].dropna().dt.normalize().unique())
    if not fechas:
        return
    claves = (df.groupby(["Concepto", "Moneda"], as_index=False)["Importe"]
                .sum().sort_values("Importe", ascending=False))

    rango_conc = f"Detalle!$C$2:$C${fila_detalle_fin}"
    rango_mon = f"Detalle!$E$2:$E${fila_detalle_fin}"
    rango_imp = f"Detalle!$F$2:$F${fila_detalle_fin}"
    rango_fec = f"Detalle!$A$2:$A${fila_detalle_fin}"

    ws = wb.create_sheet("Concepto x Día")
    total_cols = 3 + len(fechas)
    encabezado_hoja(ws, "Neto por concepto y día",
                    "Cada celda es la suma de los importes de ese concepto en esa fecha.",
                    total_cols)

    fila_cab = 4
    ws.cell(row=fila_cab, column=1, value="Concepto")
    ws.cell(row=fila_cab, column=2, value="Moneda")
    for j, f in enumerate(fechas, start=3):
        celda = ws.cell(row=fila_cab, column=j, value=pd.Timestamp(f).to_pydatetime())
        celda.number_format = FMT_DIA
    ws.cell(row=fila_cab, column=total_cols, value="TOTAL")
    for j in range(1, total_cols + 1):
        celda = ws.cell(row=fila_cab, column=j)
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center")

    fila = fila_cab + 1
    primera = fila
    for _, r in claves.iterrows():
        ws.cell(row=fila, column=1, value=r["Concepto"])
        ws.cell(row=fila, column=2, value=r["Moneda"])
        for j in range(3, 3 + len(fechas)):
            letra = get_column_letter(j)
            ws.cell(row=fila, column=j,
                    value=f'=SUMIFS({rango_imp},{rango_conc},$A{fila},'
                          f'{rango_mon},$B{fila},{rango_fec},{letra}${fila_cab})')
        ws.cell(row=fila, column=total_cols,
                value=f"=SUM(C{fila}:{get_column_letter(total_cols - 1)}{fila})")
        fila += 1
    ultima = fila - 1
    fila_total = fila

    ws.cell(row=fila_total, column=1, value="TOTAL")
    for j in range(3, total_cols + 1):
        letra = get_column_letter(j)
        ws.cell(row=fila_total, column=j, value=f"=SUM({letra}{primera}:{letra}{ultima})")

    for r in range(primera, fila_total + 1):
        es_total = r == fila_total
        for c in range(1, total_cols + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_TOTAL if es_total else F_NORMAL
            if es_total:
                celda.fill, celda.border = FILL_TOTAL, BORDE_TOP
            if c >= 3:
                celda.number_format = FMT_NUM
        ws.cell(row=r, column=total_cols).font = F_TOTAL

    ws.column_dimensions["A"].width = 44
    ws.column_dimensions["B"].width = 10
    for j in range(3, total_cols + 1):
        ws.column_dimensions[get_column_letter(j)].width = 15
    ws.freeze_panes = ws.cell(row=fila_cab + 1, column=3)


def generar(path_entrada: str, path_salida: str) -> str:
    df = leer_movimientos(path_entrada)
    if df.empty:
        raise SystemExit("[ERROR] No se encontraron movimientos en el archivo.")

    fila_detalle_fin = len(df) + 1
    f_min, f_max = df["Fecha"].min(), df["Fecha"].max()
    periodo = (f"Período: {f_min:%d/%m/%Y} al {f_max:%d/%m/%Y}"
               if pd.notna(f_min) else "Período: sin fechas en el archivo")
    subtitulo = (f"{periodo}  |  {len(df)} movimientos  |  "
                 f"Origen: {os.path.basename(path_entrada)}  |  "
                 f"Generado: {datetime.now():%d/%m/%Y %H:%M}")

    wb = Workbook()
    wb.remove(wb.active)
    escribir_detalle(wb, df)                      # se crea primero (las formulas la referencian)
    escribir_resumen(wb, df, "Concepto", "Resumen por concepto",
                     "Resumen por Concepto", subtitulo, fila_detalle_fin)
    escribir_resumen(wb, df, "Categoría", "Resumen por categoría",
                     "Resumen por Categoría", subtitulo, fila_detalle_fin)
    escribir_pivot(wb, df, fila_detalle_fin)

    # Orden final de las solapas
    orden = ["Resumen por Concepto", "Resumen por Categoría", "Concepto x Día", "Detalle"]
    wb._sheets = [wb[n] for n in orden if n in wb.sheetnames]
    wb.active = 0
    wb.save(path_salida)

    print(f"OK  {len(df)} movimientos | {df['Concepto'].nunique()} conceptos | "
          f"{df['Categoría'].nunique()} categorías")
    print(f"    Débitos:  {df.loc[df['Importe'] < 0, 'Importe'].sum():,.2f}")
    print(f"    Créditos: {df.loc[df['Importe'] > 0, 'Importe'].sum():,.2f}")
    print(f"    Neto:     {df['Importe'].sum():,.2f}")
    print(f"--> {path_salida}")
    return path_salida


def main():
    ap = argparse.ArgumentParser(description="Agrupa los movimientos de cuenta por concepto.")
    ap.add_argument("entrada", nargs="?", help="Excel de movimientos (.xlsx)")
    ap.add_argument("-o", "--salida", help="Excel de salida (default: <entrada>_agrupado.xlsx)")
    args = ap.parse_args()

    entrada = args.entrada
    if not entrada:  # sin argumento: toma el .xlsx mas nuevo de la carpeta
        candidatos = [f for f in os.listdir(".")
                      if f.lower().endswith((".xlsx", ".xls")) and not f.startswith("~$")
                      and "_agrupado" not in f.lower()]
        if not candidatos:
            sys.exit("[ERROR] No hay ningún .xlsx en esta carpeta. Pasá la ruta como argumento.")
        entrada = max(candidatos, key=os.path.getmtime)
        print(f"[i] Usando el archivo más reciente: {entrada}")

    if not os.path.exists(entrada):
        sys.exit(f"[ERROR] No existe el archivo: {entrada}")

    salida = args.salida or f"{os.path.splitext(entrada)[0]}_agrupado.xlsx"
    generar(entrada, salida)


if __name__ == "__main__":
    main()
