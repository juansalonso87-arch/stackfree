#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
  ANALIZADOR DE EXTRACTOS — BANCO SANTANDER
==============================================================================

  ┌──────────────────────────────────────────────────────────────────────┐
  │  IMPORTANTE — TIPO DE REPORTE A DESCARGAR                            │
  │                                                                      │
  │  El archivo TIENE QUE SER el reporte:                                │
  │                                                                      │
  │        >>>  "Cash Management Formato Excel"  <<<                     │
  │                                                                      │
  │  Santander Office Banking → Consultas → Extracto → Exportar,         │
  │  eligiendo ese formato y no otro.                                    │
  │                                                                      │
  │  A pesar de la extensión .xls, ese reporte NO es un Excel: es un     │
  │  archivo de texto con campos separados por tabulaciones, con una     │
  │  línea de cabecera (CUIT / cuenta / fecha) y una línea final con     │
  │  los totales de control del banco.                                   │
  │                                                                      │
  │  Cualquier otro formato (PDF, "Excel" real, CSV de otra consulta)    │
  │  hace que el script se detenga con un mensaje, en vez de leer mal    │
  │  los importes en silencio. NO lo abras y lo vuelvas a guardar con    │
  │  Excel: eso rompe el formato.                                        │
  └──────────────────────────────────────────────────────────────────────┘

USO
---
  python analizador_extracto_santander.py extractos.xls
  python analizador_extracto_santander.py          # toma el .xls más nuevo
  python analizador_extracto_santander.py a.xls b.xls    # varios meses juntos
  python analizador_extracto_santander.py extractos.xls --diagnostico

SALIDA (5 hojas)
----------------
  1. Resumen por Concepto  -> un renglón por concepto, con el código del banco
  2. Resumen por Categoría -> conceptos agrupados en categorías
  3. Concepto x Día        -> matriz concepto vs fecha
  4. Control               -> las verificaciones, para saber que no se escapó nada
  5. Detalle               -> movimiento por movimiento

CONTROLES QUE HACE (hoja "Control")
-----------------------------------
  1. Cantidad y suma de débitos y créditos contra el TRAILER del propio banco
  2. Cadena de saldos: saldo anterior + importe = saldo, movimiento por movimiento
  3. Saldo inicial + suma de movimientos = saldo final del extracto
  4. Filas leídas contra líneas del archivo
  5. Que cada código del banco corresponda a un solo concepto
  6. Conceptos que quedaron sin categoría
"""

import argparse
import glob
import os
import re
import sys
import unicodedata
from datetime import datetime

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# =============================================================================
#  CONFIGURACIÓN  <- editá esto sin tocar el resto
# =============================================================================

TIPO_REPORTE = "Cash Management Formato Excel"   # el único formato soportado

ARCHIVO_ENTRADA = None      # None = toma el .xls más nuevo de la carpeta
ARCHIVO_SALIDA = None       # None = <entrada>_agrupado.xlsx

# Tolerancia al comparar pesos (redondeos del banco).
TOLERANCIA = 0.02

# -----------------------------------------------------------------------------
#  CATEGORÍAS POR CÓDIGO DEL BANCO
# -----------------------------------------------------------------------------
# Santander numera cada tipo de movimiento. En el archivo de prueba, cada
# código corresponde a UN solo concepto, así que el código es una clave más
# confiable que el texto, que puede cambiar de redacción.
#
# Se usa el código primero; si aparece uno nuevo, se cae a las palabras clave
# de más abajo, y si tampoco engancha queda en "Otros" y el script avisa.
#
# OJO con el código 1968 "Pago a proveedores": el nombre suena a egreso, pero
# en este extracto SIEMPRE tiene importe positivo (es la liquidación semanal
# que entra desde la plataforma de delivery). Por eso la categoría se define
# por código y no por el texto: una regla por palabra clave lo clasificaría
# como transferencia enviada y estaría contando al revés $26,5 millones.
CATEGORIAS_POR_CODIGO = {
    # --- ingresos ---
    "2604": "Cobros con tarjeta",          # Acreditacion a comercio fiserv
    "1968": "Cobros de plataformas",       # Pago a proveedores (ENTRA plata)
    "1970": "Cobros de plataformas",       # Servicios de pago
    "0216": "Cobros de plataformas",       # Pago a proveedores recibido
    "3410": "Transferencias recibidas",    # Transf recibida cvu mismo titular
    # --- egresos operativos ---
    "1862": "Sueldos",                     # Pago haberes
    "1153": "Sueldos",                     # Pago de haberes por cci
    "4712": "Pagos AFIP / impuestos",      # Pago afip servicio interbanking
    "4719": "Pago de servicios",           # Pago de servicios
    "4085": "Pago de servicios",           # Debito automatico
    "0824": "Transferencias enviadas",     # Transferencia realizada
    "2822": "Transferencias enviadas",     # Transferencia inmediata
    "1252": "Transferencias enviadas",     # Debito transf. online banking emp
    "4648": "Transferencias enviadas",     # Transferencia por sistema mep
    "4713": "Transferencias enviadas",     # Pago interbanking b2b
    # --- costos bancarios ---
    "2571": "Comisiones tarjeta",          # Debito comercio fiserv
    "2574": "Comisiones tarjeta",          # Debito comercio payway
    "2960": "Comisiones banco",            # Comision por servicio de cuenta
    "3489": "Comisiones banco",            # Comision servicio cuenta dolares
    "0434": "Comisiones banco",            # Comision transf otros bcos canales
    # --- impuestos que retiene el banco ---
    "4633": "Impuesto al cheque",          # Impuesto ley 25.413 debito 0,6%
    "4637": "Impuesto al cheque",          # Impuesto ley 25.413 credito 0,6%
    "2010": "Retenciones ARBA / IIBB",     # Retencion arba alicuota u
    "1628": "Retenciones ARBA / IIBB",     # Iibb percepcion pcia buenos aires
    "3254": "IVA y percepciones",          # Iva 21% reg de transfisc ley27743
    "3253": "IVA y percepciones",          # Iva percepcion rg 2408
}

# Respaldo por palabras clave, para códigos que todavía no están en la tabla.
# Se evalúan EN ORDEN: gana la primera que coincide.
CATEGORIAS_POR_TEXTO = [
    ("Sueldos",                  ["HABER", "SUELDO", "JORNAL"]),
    ("Pagos AFIP / impuestos",   ["AFIP", "INTERBANKING", "VEP"]),
    ("Impuesto al cheque",       ["LEY 25.413", "LEY 25413"]),
    ("Retenciones ARBA / IIBB",  ["ARBA", "IIBB", "INGRESOS BRUTOS", "SIRCREB"]),
    ("IVA y percepciones",       ["IVA", "PERCEPCION", "RETENCION"]),
    ("Comisiones banco",         ["COMISION", "MANTENIMIENTO", "SERVICIO DE CUENTA"]),
    ("Cobros con tarjeta",       ["ACREDITACION A COMERCIO", "FISERV", "PAYWAY",
                                  "POSNET", "TARJETA"]),
    ("Transferencias recibidas", ["RECIBIDA", "RECIBIDO", "ACREDITACION"]),
    ("Pago de servicios",        ["PAGO DE SERVICIOS", "DEBITO AUTOMATICO"]),
    ("Transferencias enviadas",  ["TRANSFERENCIA", "TRANSF", "PAGO"]),
]
CATEGORIA_DEFECTO = "Otros"

# =============================================================================
#  ESTILOS
# =============================================================================
FUENTE = "Arial"
F_TITULO = Font(name=FUENTE, size=14, bold=True, color="A50E20")
F_SUBTIT = Font(name=FUENTE, size=9, italic=True, color="595959")
F_CABECERA = Font(name=FUENTE, size=10, bold=True, color="FFFFFF")
F_NORMAL = Font(name=FUENTE, size=10)
F_CHICA = Font(name=FUENTE, size=9, color="595959")
F_TOTAL = Font(name=FUENTE, size=10, bold=True)
F_OK = Font(name=FUENTE, size=10, bold=True, color="1E7B34")
F_MAL = Font(name=FUENTE, size=10, bold=True, color="C00000")
FILL_CAB = PatternFill("solid", fgColor="A50E20")
FILL_TOTAL = PatternFill("solid", fgColor="F2DCDB")
FILL_ALT = PatternFill("solid", fgColor="F2F2F2")
FILL_ALERTA = PatternFill("solid", fgColor="FFF2CC")
FILL_OK = PatternFill("solid", fgColor="E2EFDA")
FILL_MAL = PatternFill("solid", fgColor="FCE4E4")
BORDE_TOP = Border(top=Side(style="thin", color="808080"))

FMT_NUM = '#,##0.00;[RED]-#,##0.00;"-"'
FMT_PCT = '0.0%;-0.0%;"-"'
FMT_FECHA = "DD/MM/YYYY"
FMT_DIA = "DD/MM"
FMT_ENT = '#,##0;-#,##0;"-"'


# =============================================================================
#  UTILIDADES
# =============================================================================
def sin_acentos(t) -> str:
    t = unicodedata.normalize("NFKD", str(t))
    return "".join(c for c in t if not unicodedata.combining(c))


def a_numero_santander(valor) -> float:
    """'+00021562956.08' / '-00000136305.75' -> float."""
    t = str(valor).strip()
    if not t:
        return 0.0
    signo = -1.0 if t.startswith("-") else 1.0
    t = t.lstrip("+-").lstrip("0") or "0"
    try:
        return signo * float(t)
    except ValueError:
        return 0.0


def a_numero_ar(valor) -> float:
    """'-81.862.671,63' (formato argentino, usado en el trailer) -> float."""
    t = str(valor).strip()
    if not t:
        return 0.0
    negativo = t.startswith("-")
    t = re.sub(r"[^\d,.]", "", t).replace(".", "").replace(",", ".")
    try:
        n = float(t or 0)
    except ValueError:
        return 0.0
    return -n if negativo else n


def clasificar(codigo: str, concepto: str) -> str:
    if codigo in CATEGORIAS_POR_CODIGO:
        return CATEGORIAS_POR_CODIGO[codigo]
    n = sin_acentos(concepto).upper()
    for categoria, claves in CATEGORIAS_POR_TEXTO:
        if any(clave in n for clave in claves):
            return categoria
    return CATEGORIA_DEFECTO


# =============================================================================
#  LECTURA Y VALIDACIÓN DEL FORMATO
# =============================================================================
MENSAJE_FORMATO = (
    f"\n[ERROR] El archivo no tiene el formato esperado.\n\n"
    f"        Este script solo lee el reporte  >>> {TIPO_REPORTE} <<<\n\n"
    f"        En Santander Office Banking: Consultas -> Extracto -> Exportar,\n"
    f"        eligiendo ese formato.\n\n"
    f"        Importante: aunque termine en .xls, ese reporte es un archivo de\n"
    f"        texto separado por tabulaciones. Si lo abriste con Excel y lo\n"
    f"        volviste a guardar, el formato se rompe: hay que descargarlo de\n"
    f"        nuevo sin abrirlo.\n"
)


def leer_extracto(path: str) -> tuple:
    """Lee el reporte y valida que sea el formato correcto.

    Devuelve (DataFrame de movimientos, dict de cabecera, dict del trailer).
    """
    try:
        with open(path, "rb") as fh:
            arranque = fh.read(8)
    except OSError as e:
        raise SystemExit(f"[ERROR] No puedo abrir {path}: {e}")

    # .xls real (OLE2) o .xlsx (zip) -> no es el reporte correcto
    if arranque.startswith(b"\xd0\xcf\x11\xe0") or arranque.startswith(b"PK\x03\x04"):
        raise SystemExit(MENSAJE_FORMATO +
                         "\n        (El archivo que pasaste es un Excel de verdad, "
                         "no el reporte de texto.)")
    if arranque.lstrip().startswith(b"<"):
        raise SystemExit(MENSAJE_FORMATO +
                         "\n        (El archivo que pasaste es XML/HTML.)")

    with open(path, encoding="latin-1") as fh:
        lineas = [l for l in fh.read().splitlines() if l.strip()]
    if len(lineas) < 3:
        raise SystemExit(MENSAJE_FORMATO + "\n        (El archivo está vacío o casi.)")

    cab = lineas[0].split("\t")
    if len(cab) < 3 or "extracto" not in sin_acentos(cab[2]).lower():
        raise SystemExit(MENSAJE_FORMATO +
                         f"\n        (Primera línea inesperada: {lineas[0][:70]!r})")

    cabecera = {
        "cuit": cab[0].strip(),
        "cuenta": cab[1].strip() if len(cab) > 1 else "",
        "fecha_emision": cab[3].strip() if len(cab) > 3 else "",
    }

    # El trailer trae los totales de control del banco: cant y suma de
    # débitos, cant y suma de créditos. Es la verificación más fuerte que hay.
    trailer, fin = None, len(lineas)
    ultima = lineas[-1].split("\t")
    if len(ultima) in (4, 5) and len(ultima) != 7:
        try:
            trailer = {
                "cant_debitos": int(re.sub(r"\D", "", ultima[0]) or 0),
                "suma_debitos": a_numero_ar(ultima[1]),
                "cant_creditos": int(re.sub(r"\D", "", ultima[2]) or 0),
                "suma_creditos": a_numero_ar(ultima[3]),
            }
            fin = len(lineas) - 1
        except (ValueError, IndexError):
            trailer = None
    if trailer is None:
        print("[!] El archivo no trae la línea final de totales del banco.\n"
              "    Se hacen igual los demás controles, pero se pierde el más fuerte.")

    filas, descartadas = [], []
    for i, linea in enumerate(lineas[1:fin], start=2):
        campos = linea.split("\t")
        if len(campos) != 7:
            descartadas.append((i, linea[:80]))
            continue
        filas.append(campos)

    if descartadas:
        print(f"[!] {len(descartadas)} línea(s) con un número de campos distinto de 7, "
              f"se informan en la hoja Control:")
        for nro, texto in descartadas[:5]:
            print(f"      línea {nro}: {texto!r}")
    if not filas:
        raise SystemExit(MENSAJE_FORMATO + "\n        (No encontré ninguna fila de movimiento.)")

    crudo = pd.DataFrame(filas, columns=["fecha", "concepto_full", "importe",
                                         "comprobante", "sucursal", "saldo", "codigo"])

    df = pd.DataFrame()
    df["Fecha"] = pd.to_datetime(crudo["fecha"].str.strip(), format="%Y%m%d", errors="coerce")
    df["Código"] = crudo["codigo"].str.strip()
    partes = crudo["concepto_full"].str.split(" - ", n=1)
    df["Concepto"] = partes.str[0].str.strip()
    df["Detalle"] = partes.str[1].fillna("").str.strip().str.replace(r"\s{2,}", " ", regex=True)
    df["Importe"] = crudo["importe"].map(a_numero_santander)
    df["Saldo"] = crudo["saldo"].map(a_numero_santander)
    df["Comprobante"] = crudo["comprobante"].str.strip()
    df["Sucursal"] = crudo["sucursal"].str.strip()
    df["Categoría"] = [clasificar(c, t) for c, t in zip(df["Código"], df["Concepto"])]
    df["Débito"] = df["Importe"].where(df["Importe"] < 0, 0.0).abs()
    df["Crédito"] = df["Importe"].where(df["Importe"] > 0, 0.0)

    if df["Fecha"].isna().any():
        malas = int(df["Fecha"].isna().sum())
        print(f"[!] {malas} fila(s) con fecha ilegible (se esperaba AAAAMMDD).")

    meta = {
        "lineas_archivo": len(lineas),
        "filas_leidas": len(df),
        "descartadas": descartadas,
        "orden_original": "descendente" if len(df) > 1 and df["Fecha"].iloc[0] > df["Fecha"].iloc[-1]
                          else "ascendente",
    }
    return df, cabecera, trailer, meta


# =============================================================================
#  CONTROLES
# =============================================================================
def controlar(df: pd.DataFrame, trailer, meta) -> list:
    """Devuelve una lista de controles: (grupo, concepto, calculado, declarado, ok)."""
    controles = []

    def chk(grupo, texto, calculado, declarado, ok, formato="num"):
        controles.append({"grupo": grupo, "control": texto, "calculado": calculado,
                          "declarado": declarado, "ok": ok, "formato": formato})

    # --- 1) contra el trailer del banco ---
    deb = df[df["Importe"] < 0]
    cre = df[df["Importe"] > 0]
    if trailer:
        chk("Totales del banco", "Cantidad de débitos", len(deb), trailer["cant_debitos"],
            len(deb) == trailer["cant_debitos"], "ent")
        chk("Totales del banco", "Suma de débitos", -deb["Importe"].sum().__abs__(),
            trailer["suma_debitos"],
            abs(abs(deb["Importe"].sum()) - abs(trailer["suma_debitos"])) <= TOLERANCIA)
        chk("Totales del banco", "Cantidad de créditos", len(cre), trailer["cant_creditos"],
            len(cre) == trailer["cant_creditos"], "ent")
        chk("Totales del banco", "Suma de créditos", cre["Importe"].sum(),
            trailer["suma_creditos"],
            abs(cre["Importe"].sum() - trailer["suma_creditos"]) <= TOLERANCIA)
        total_decl = trailer["cant_debitos"] + trailer["cant_creditos"]
        chk("Totales del banco", "Movimientos totales", len(df), total_decl,
            len(df) == total_decl, "ent")

    # --- 2) cadena de saldos ---
    crono = df.sort_index(ascending=(meta["orden_original"] == "ascendente"))
    if meta["orden_original"] == "descendente":
        crono = df.iloc[::-1]
    crono = crono.reset_index(drop=True)
    esperado = crono["Saldo"].shift(1) + crono["Importe"]
    dif = (crono["Saldo"] - esperado).abs()
    rupturas = int((dif > TOLERANCIA).sum())
    chk("Cadena de saldos", "Eslabones sin ruptura", len(crono) - 1 - rupturas,
        len(crono) - 1, rupturas == 0, "ent")

    saldo_inicial = crono["Saldo"].iloc[0] - crono["Importe"].iloc[0]
    saldo_final = crono["Saldo"].iloc[-1]
    chk("Cadena de saldos", "Saldo inicial + movimientos = saldo final",
        saldo_inicial + df["Importe"].sum(), saldo_final,
        abs(saldo_inicial + df["Importe"].sum() - saldo_final) <= TOLERANCIA)

    # --- 3) integridad de la lectura ---
    esperadas = meta["lineas_archivo"] - 1 - (1 if trailer else 0)
    chk("Lectura del archivo", "Filas de movimiento leídas", meta["filas_leidas"],
        esperadas, meta["filas_leidas"] == esperadas, "ent")
    chk("Lectura del archivo", "Líneas descartadas por formato", len(meta["descartadas"]),
        0, not meta["descartadas"], "ent")
    chk("Lectura del archivo", "Fechas ilegibles", int(df["Fecha"].isna().sum()), 0,
        not df["Fecha"].isna().any(), "ent")
    chk("Lectura del archivo", "Importes en cero", int((df["Importe"] == 0).sum()), 0,
        True, "ent")

    # --- 4) consistencia de conceptos ---
    por_codigo = df.groupby("Código")["Concepto"].nunique()
    chk("Conceptos", "Códigos con más de un concepto", int((por_codigo > 1).sum()), 0,
        not (por_codigo > 1).any(), "ent")
    mezclados = df.groupby("Código")["Importe"].agg(
        lambda s: (s > 0).any() and (s < 0).any())
    chk("Conceptos", "Códigos con signos mezclados", int(mezclados.sum()), 0,
        True, "ent")
    sin_cat = df[df["Categoría"] == CATEGORIA_DEFECTO]
    chk("Conceptos", "Movimientos sin categoría", len(sin_cat), 0, sin_cat.empty, "ent")

    return controles, saldo_inicial, saldo_final


def informe_consola(df, cabecera, trailer, controles, saldo_inicial, saldo_final):
    print("\n" + "=" * 76)
    print("  EXTRACTO SANTANDER")
    print("=" * 76)
    print(f"  Cuenta   : {cabecera['cuenta']}      CUIT: {cabecera['cuit']}")
    print(f"  Período  : {df['Fecha'].min():%d/%m/%Y} al {df['Fecha'].max():%d/%m/%Y}")
    print(f"  Movimientos: {len(df)}   |   Conceptos: {df['Concepto'].nunique()}   |   "
          f"Categorías: {df['Categoría'].nunique()}")
    print(f"  Saldo inicial: {saldo_inicial:>18,.2f}")
    print(f"  Débitos      : {-abs(df[df.Importe < 0]['Importe'].sum()):>18,.2f}")
    print(f"  Créditos     : {df[df.Importe > 0]['Importe'].sum():>18,.2f}")
    print(f"  Saldo final  : {saldo_final:>18,.2f}")

    print("\n" + "-" * 76)
    print("  CONTROLES")
    print("-" * 76)
    grupo_actual = None
    for c in controles:
        if c["grupo"] != grupo_actual:
            grupo_actual = c["grupo"]
            print(f"  {grupo_actual}")
        marca = "OK  " if c["ok"] else "MAL "
        if c["formato"] == "ent":
            calc, decl = f"{c['calculado']:,}", f"{c['declarado']:,}"
        else:
            calc, decl = f"{c['calculado']:,.2f}", f"{c['declarado']:,.2f}"
        extra = "" if c["ok"] else f"   <-- declarado: {decl}"
        print(f"    [{marca}] {c['control'][:46].ljust(48)} {calc:>20}{extra}")

    fallidos = [c for c in controles if not c["ok"]]
    print("-" * 76)
    if fallidos:
        print(f"  ATENCIÓN: {len(fallidos)} control(es) no cerraron. Revisá la hoja Control.")
    else:
        print("  Todos los controles cerraron: no se escapó ningún movimiento.")

    sin_cat = df[df["Categoría"] == CATEGORIA_DEFECTO]
    if not sin_cat.empty:
        print("\n  Sin categoría (agregá el código a CATEGORIAS_POR_CODIGO):")
        for (cod, concepto), g in sin_cat.groupby(["Código", "Concepto"]):
            print(f"    {cod}  {concepto[:46].ljust(48)} {len(g):>4} mov.  "
                  f"{g['Importe'].sum():>16,.2f}")
    print("=" * 76 + "\n")


# =============================================================================
#  ESCRITURA DEL EXCEL
# =============================================================================
def encabezado_hoja(ws, titulo, subtitulo, ancho):
    ws["A1"] = titulo
    ws["A1"].font = F_TITULO
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ancho)
    ws["A2"] = subtitulo
    ws["A2"].font = F_SUBTIT
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ancho)
    ws.row_dimensions[1].height = 20


def fila_cabecera(ws, fila, cabeceras):
    for j, h in enumerate(cabeceras, start=1):
        c = ws.cell(row=fila, column=j, value=h)
        c.font, c.fill = F_CABECERA, FILL_CAB
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def escribir_detalle(wb, df):
    """Hoja base. Las fórmulas del resto dependen de estas columnas:
       A Fecha | B Código | C Concepto | D Categoría | E Débito | F Crédito
       G Importe | H Saldo | I Comprobante | J Sucursal | K Detalle"""
    ws = wb.create_sheet("Detalle")
    cabeceras = ["Fecha", "Código", "Concepto", "Categoría", "Débito", "Crédito",
                 "Importe", "Saldo", "Comprobante", "Sucursal", "Detalle"]
    fila_cabecera(ws, 1, cabeceras)

    orden = ["Fecha", "Código", "Concepto", "Categoría", "Débito", "Crédito",
             "Importe", "Saldo", "Comprobante", "Sucursal", "Detalle"]
    for _, r in df[orden].iterrows():
        ws.append([None if (isinstance(v, float) and pd.isna(v)) or v is pd.NaT else v
                   for v in r.tolist()])

    ultima = ws.max_row
    for f in range(2, ultima + 1):
        for c in range(1, len(cabeceras) + 1):
            ws.cell(row=f, column=c).font = F_NORMAL
        ws.cell(row=f, column=1).number_format = FMT_FECHA
        for c in (5, 6, 7, 8):
            ws.cell(row=f, column=c).number_format = FMT_NUM

    for col, ancho in zip("ABCDEFGHIJK",
                          [12, 9, 36, 26, 16, 16, 16, 17, 14, 10, 52]):
        ws.column_dimensions[col].width = ancho
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cabeceras))}{ultima}"
    return ultima


def escribir_resumen(wb, df, campo, titulo, nombre_hoja, subtitulo, fin):
    """campo = 'Concepto' (col C, se agrupa por el código de la col B) o 'Categoría' (col D)."""
    por_codigo = campo == "Concepto"
    col_clave = "B" if por_codigo else "D"
    r_clave = f"Detalle!${col_clave}$2:${col_clave}${fin}"
    r_deb = f"Detalle!$E$2:$E${fin}"
    r_cre = f"Detalle!$F$2:$F${fin}"

    ws = wb.create_sheet(nombre_hoja)
    cabeceras = (["Código", "Concepto", "Categoría"] if por_codigo else ["Categoría"]) + \
                ["Movimientos", "Débitos", "Créditos", "Neto", "% s/Débitos", "% s/Créditos"]
    encabezado_hoja(ws, titulo, subtitulo, len(cabeceras))
    fc = 4
    fila_cabecera(ws, fc, cabeceras)

    if por_codigo:
        grupos = (df.groupby(["Código", "Concepto", "Categoría"], as_index=False)["Importe"]
                    .sum().sort_values("Importe", ascending=False))
        col_criterio = "A"          # el código queda en la columna A de esta hoja
        off = 3
    else:
        grupos = (df.groupby("Categoría", as_index=False)["Importe"]
                    .sum().sort_values("Importe", ascending=False))
        col_criterio = "A"
        off = 1

    c_mov, c_deb, c_cre, c_neto = off + 1, off + 2, off + 3, off + 4
    c_pdeb, c_pcre = off + 5, off + 6
    L = {i: get_column_letter(i) for i in range(1, len(cabeceras) + 1)}

    f = fc + 1
    primera = f
    for _, r in grupos.iterrows():
        if por_codigo:
            ws.cell(row=f, column=1, value=r["Código"])
            ws.cell(row=f, column=2, value=r["Concepto"])
            ws.cell(row=f, column=3, value=r["Categoría"])
        else:
            ws.cell(row=f, column=1, value=r["Categoría"])
        ws.cell(row=f, column=c_mov, value=f"=COUNTIFS({r_clave},${col_criterio}{f})")
        ws.cell(row=f, column=c_deb,
                value=f"=SUMIFS({r_deb},{r_clave},${col_criterio}{f})")
        ws.cell(row=f, column=c_cre,
                value=f"=SUMIFS({r_cre},{r_clave},${col_criterio}{f})")
        ws.cell(row=f, column=c_neto, value=f"={L[c_cre]}{f}-{L[c_deb]}{f}")
        f += 1
    ultima, total = f - 1, f

    ws.cell(row=total, column=1, value="TOTAL")
    for c in (c_mov, c_deb, c_cre, c_neto):
        ws.cell(row=total, column=c,
                value=f"=SUM({L[c]}{primera}:{L[c]}{ultima})")
    for r in range(primera, ultima + 1):
        ws.cell(row=r, column=c_pdeb,
                value=f'=IFERROR({L[c_deb]}{r}/${L[c_deb]}${total},"")')
        ws.cell(row=r, column=c_pcre,
                value=f'=IFERROR({L[c_cre]}{r}/${L[c_cre]}${total},"")')
    for c in (c_pdeb, c_pcre):
        ws.cell(row=total, column=c,
                value=f'=IFERROR(SUM({L[c]}{primera}:{L[c]}{ultima}),"")')

    col_cat = 3 if por_codigo else 1
    for r in range(primera, total + 1):
        es_total = r == total
        sin_cat = ws.cell(row=r, column=col_cat).value == CATEGORIA_DEFECTO
        for c in range(1, len(cabeceras) + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_TOTAL if es_total else F_NORMAL
            if es_total:
                celda.fill, celda.border = FILL_TOTAL, BORDE_TOP
            elif sin_cat:
                celda.fill = FILL_ALERTA
            elif (r - primera) % 2 == 1:
                celda.fill = FILL_ALT
        ws.cell(row=r, column=c_mov).number_format = FMT_ENT
        for c in (c_deb, c_cre, c_neto):
            ws.cell(row=r, column=c).number_format = FMT_NUM
        for c in (c_pdeb, c_pcre):
            ws.cell(row=r, column=c).number_format = FMT_PCT

    anchos = ([9, 38, 26] if por_codigo else [30]) + [13, 17, 17, 17, 12, 12]
    for i, ancho in enumerate(anchos, start=1):
        ws.column_dimensions[get_column_letter(i)].width = ancho
    ws.freeze_panes = f"A{fc + 1}"
    ws.auto_filter.ref = f"A{fc}:{get_column_letter(len(cabeceras))}{ultima}"


def escribir_pivot(wb, df, fin, subtitulo):
    fechas = sorted(d for d in df["Fecha"].dropna().dt.normalize().unique())
    if not fechas:
        return
    claves = (df.groupby(["Código", "Concepto"], as_index=False)["Importe"]
                .sum().sort_values("Importe", ascending=False))

    r_cod = f"Detalle!$B$2:$B${fin}"
    r_imp = f"Detalle!$G$2:$G${fin}"
    r_fec = f"Detalle!$A$2:$A${fin}"

    ws = wb.create_sheet("Concepto x Día")
    total_cols = 3 + len(fechas)
    encabezado_hoja(ws, "Neto por concepto y día", subtitulo, total_cols)
    fc = 4
    ws.cell(row=fc, column=1, value="Código")
    ws.cell(row=fc, column=2, value="Concepto")
    for j, fecha in enumerate(fechas, start=3):
        celda = ws.cell(row=fc, column=j, value=pd.Timestamp(fecha).to_pydatetime())
        celda.number_format = FMT_DIA
    ws.cell(row=fc, column=total_cols, value="TOTAL")
    for j in range(1, total_cols + 1):
        celda = ws.cell(row=fc, column=j)
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center")

    f = fc + 1
    primera = f
    for _, r in claves.iterrows():
        ws.cell(row=f, column=1, value=r["Código"])
        ws.cell(row=f, column=2, value=r["Concepto"])
        for j in range(3, 3 + len(fechas)):
            letra = get_column_letter(j)
            ws.cell(row=f, column=j,
                    value=f'=SUMIFS({r_imp},{r_cod},$A{f},{r_fec},{letra}${fc})')
        ws.cell(row=f, column=total_cols,
                value=f"=SUM(C{f}:{get_column_letter(total_cols - 1)}{f})")
        f += 1
    ultima, total = f - 1, f

    ws.cell(row=total, column=1, value="TOTAL")
    for j in range(3, total_cols + 1):
        letra = get_column_letter(j)
        ws.cell(row=total, column=j, value=f"=SUM({letra}{primera}:{letra}{ultima})")

    for r in range(primera, total + 1):
        es_total = r == total
        for c in range(1, total_cols + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_TOTAL if es_total else F_NORMAL
            if es_total:
                celda.fill, celda.border = FILL_TOTAL, BORDE_TOP
            if c >= 3:
                celda.number_format = FMT_NUM
        ws.cell(row=r, column=total_cols).font = F_TOTAL

    ws.column_dimensions["A"].width = 9
    ws.column_dimensions["B"].width = 38
    for j in range(3, total_cols + 1):
        ws.column_dimensions[get_column_letter(j)].width = 15
    ws.freeze_panes = ws.cell(row=fc + 1, column=3)


def escribir_control(wb, df, cabecera, trailer, controles, saldo_inicial, saldo_final,
                     meta, fin, origen):
    ws = wb.create_sheet("Control")
    encabezado_hoja(
        ws, "Control del extracto",
        f"Reporte requerido: {TIPO_REPORTE}  |  Archivo: {origen}  |  "
        f"Generado: {datetime.now():%d/%m/%Y %H:%M}", 6)

    f = 4
    ws.cell(row=f, column=1, value="Cuenta").font = F_TOTAL
    ws.cell(row=f, column=2, value=cabecera["cuenta"]).font = F_NORMAL
    ws.cell(row=f, column=4, value="CUIT").font = F_TOTAL
    ws.cell(row=f, column=5, value=cabecera["cuit"]).font = F_NORMAL
    f += 1
    ws.cell(row=f, column=1, value="Período").font = F_TOTAL
    ws.cell(row=f, column=2,
            value=f"{df['Fecha'].min():%d/%m/%Y} al {df['Fecha'].max():%d/%m/%Y}").font = F_NORMAL
    ws.cell(row=f, column=4, value="Orden del archivo").font = F_TOTAL
    ws.cell(row=f, column=5, value=meta["orden_original"]).font = F_NORMAL
    f += 2

    # --- saldos, con fórmulas contra el Detalle ---
    ws.cell(row=f, column=1, value="Saldos").font = F_TITULO
    f += 1
    for etiqueta, valor in (("Saldo inicial", saldo_inicial),
                            ("Débitos del período", f"=-SUM(Detalle!$E$2:$E${fin})"),
                            ("Créditos del período", f"=SUM(Detalle!$F$2:$F${fin})"),
                            ("Saldo final calculado",
                             f"={get_column_letter(2)}{f}+{get_column_letter(2)}{f + 1}"
                             f"+{get_column_letter(2)}{f + 2}"),
                            ("Saldo final del extracto", saldo_final)):
        ws.cell(row=f, column=1, value=etiqueta).font = F_NORMAL
        celda = ws.cell(row=f, column=2, value=valor)
        celda.font, celda.number_format = F_NORMAL, FMT_NUM
        f += 1
    fila_calc, fila_decl = f - 2, f - 1
    ws.cell(row=f, column=1, value="Diferencia").font = F_TOTAL
    celda = ws.cell(row=f, column=2, value=f"=B{fila_calc}-B{fila_decl}")
    celda.font, celda.number_format = F_TOTAL, FMT_NUM
    f += 2

    # --- tabla de controles ---
    cabeceras = ["Grupo", "Control", "Calculado por el script", "Declarado / esperado",
                 "Diferencia", "Resultado"]
    fila_cabecera(ws, f, cabeceras)
    f += 1
    for c in controles:
        ws.cell(row=f, column=1, value=c["grupo"]).font = F_CHICA
        ws.cell(row=f, column=2, value=c["control"]).font = F_NORMAL
        for col, clave in ((3, "calculado"), (4, "declarado")):
            celda = ws.cell(row=f, column=col, value=c[clave])
            celda.font = F_NORMAL
            celda.number_format = FMT_ENT if c["formato"] == "ent" else FMT_NUM
        celda = ws.cell(row=f, column=5, value=f"=C{f}-D{f}")
        celda.font = F_NORMAL
        celda.number_format = FMT_ENT if c["formato"] == "ent" else FMT_NUM
        celda = ws.cell(row=f, column=6, value="OK" if c["ok"] else "REVISAR")
        celda.font = F_OK if c["ok"] else F_MAL
        celda.fill = FILL_OK if c["ok"] else FILL_MAL
        celda.alignment = Alignment(horizontal="center")
        f += 1

    if meta["descartadas"]:
        f += 1
        ws.cell(row=f, column=1, value="Líneas descartadas por formato").font = F_TITULO
        f += 1
        for nro, texto in meta["descartadas"]:
            ws.cell(row=f, column=1, value=f"línea {nro}").font = F_CHICA
            ws.cell(row=f, column=2, value=texto).font = F_CHICA
            f += 1

    f += 1
    ws.cell(row=f, column=1, value="Recordatorio").font = F_TOTAL
    ws.cell(row=f, column=2,
            value=f'El archivo de entrada debe ser el reporte "{TIPO_REPORTE}". '
                  "No abrirlo ni volver a guardarlo con Excel antes de procesarlo: "
                  "eso rompe el formato.").font = F_CHICA

    for col, ancho in zip("ABCDEF", [26, 54, 22, 22, 16, 12]):
        ws.column_dimensions[col].width = ancho


# =============================================================================
#  FLUJO PRINCIPAL
# =============================================================================
def generar(rutas, path_salida=None, solo_diagnostico=False):
    partes, cabecera, trailer_total, meta_total = [], None, None, None
    for ruta in rutas:
        df, cab, trailer, meta = leer_extracto(ruta)
        df["archivo_origen"] = os.path.basename(ruta)
        partes.append(df)
        if cabecera is None:
            cabecera, trailer_total, meta_total = cab, trailer, meta
        else:
            if trailer and trailer_total:
                for k in trailer_total:
                    trailer_total[k] += trailer[k]
            meta_total["lineas_archivo"] += meta["lineas_archivo"]
            meta_total["filas_leidas"] += meta["filas_leidas"]
            meta_total["descartadas"] += meta["descartadas"]
        print(f"    {os.path.basename(ruta)}: {len(df)} movimientos")

    df = pd.concat(partes, ignore_index=True)
    if len(rutas) > 1:
        antes = len(df)
        df = df.drop_duplicates(subset=["Fecha", "Comprobante", "Importe", "Saldo"])
        if antes - len(df):
            print(f"[i] Descarto {antes - len(df)} movimientos duplicados entre archivos.")

    controles, saldo_inicial, saldo_final = controlar(df, trailer_total, meta_total)
    informe_consola(df, cabecera, trailer_total, controles, saldo_inicial, saldo_final)
    if solo_diagnostico:
        return None

    df = df.sort_values(["Fecha", "Comprobante"]).reset_index(drop=True)
    if path_salida is None:
        base = os.path.splitext(rutas[0])[0]
        path_salida = f"{base}_agrupado.xlsx"

    subtitulo = (f"Cuenta {cabecera['cuenta']}  |  "
                 f"{df['Fecha'].min():%d/%m/%Y} al {df['Fecha'].max():%d/%m/%Y}  |  "
                 f"{len(df)} movimientos  |  Reporte: {TIPO_REPORTE}  |  "
                 f"Generado: {datetime.now():%d/%m/%Y %H:%M}")

    wb = Workbook()
    wb.remove(wb.active)
    fin = escribir_detalle(wb, df)            # primero: todo lo demás la referencia
    escribir_resumen(wb, df, "Concepto", "Resumen por concepto",
                     "Resumen por Concepto", subtitulo, fin)
    escribir_resumen(wb, df, "Categoría", "Resumen por categoría",
                     "Resumen por Categoría", subtitulo, fin)
    escribir_pivot(wb, df, fin, subtitulo)
    escribir_control(wb, df, cabecera, trailer_total, controles, saldo_inicial,
                     saldo_final, meta_total, fin, ", ".join(os.path.basename(r) for r in rutas))

    orden = ["Resumen por Concepto", "Resumen por Categoría", "Concepto x Día",
             "Control", "Detalle"]
    wb._sheets = [wb[n] for n in orden if n in wb.sheetnames]
    wb.active = 0
    wb.save(path_salida)

    print(f"--> {path_salida}")
    return path_salida


def main():
    ap = argparse.ArgumentParser(
        description=f'Agrupa el extracto de Santander. Requiere el reporte "{TIPO_REPORTE}".')
    ap.add_argument("entradas", nargs="*", help="uno o más extractos")
    ap.add_argument("-o", "--salida", default=ARCHIVO_SALIDA)
    ap.add_argument("--diagnostico", action="store_true",
                    help="solo corre los controles, no escribe el Excel")
    args = ap.parse_args()

    rutas = args.entradas or ([ARCHIVO_ENTRADA] if ARCHIVO_ENTRADA else [])
    if not rutas:
        candidatos = [f for f in glob.glob("*.xls") + glob.glob("*.txt")
                      if not f.startswith("~$") and "_agrupado" not in f.lower()]
        if not candidatos:
            sys.exit("[ERROR] No hay ningún extracto en esta carpeta.\n"
                     f"        Descargá el reporte \"{TIPO_REPORTE}\" y pasá la ruta.")
        rutas = [max(candidatos, key=os.path.getmtime)]
        print(f"[i] Uso el archivo más reciente: {rutas[0]}")

    faltantes = [r for r in rutas if not os.path.exists(r)]
    if faltantes:
        sys.exit(f"[ERROR] No existe: {', '.join(faltantes)}")

    print("Leyendo:")
    generar(rutas, args.salida, solo_diagnostico=args.diagnostico)


if __name__ == "__main__":
    main()
