#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================
  ANALIZADOR DE EXTRACTOS BANCARIOS  (banco con columnas
  separadas de Crédito / Débito)
  Configurá los parámetros en la sección "CONFIGURACIÓN"
=============================================================

USO
---
  python analizador_extracto.py "Movimientos (35).xls"
  python analizador_extracto.py                     # toma el archivo de ARCHIVO_ENTRADA
  python analizador_extracto.py archivo.xls --diagnostico   # solo analiza conceptos, no escribe Excel

En Colab:
  !python analizador_extracto.py "/content/Movimientos (35).xls"

SALIDA (5 hojas)
----------------
  1. Resumen por Concepto     -> un renglón por concepto normalizado
  2. Resumen por Categoría    -> conceptos agrupados en categorías
  3. Concepto x Día           -> matriz concepto vs fecha
  4. Diagnóstico Conceptos    -> QUÉ TEXTOS CRUDOS SE UNIFICARON EN CADA CONCEPTO
  5. Detalle                  -> movimientos limpios, con concepto original y normalizado

Los resúmenes usan SUMIFS / COUNTIFS contra la hoja "Detalle": si filtrás o
corregís algo ahí, los totales se recalculan solos.
"""

import argparse
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# =============================================================================
#  CONFIGURACIÓN  <- editá esto sin tocar el resto
# =============================================================================

ARCHIVO_ENTRADA = None      # None = pasá la ruta como argumento
ARCHIVO_SALIDA = None          # None = <entrada>_agrupado.xlsx

HOJA = "Movimientos Históricos"  # None = primera hoja del archivo
FILA_CABECERA = None             # None = la detecta sola (antes usabas skiprows=6)

# Índices base-0 de las columnas del export. None = las busca por nombre.
COLUMNAS_IDX = [0, 2, 4, 6, 7, 8]
COLUMNAS_NOMBRES = ["Fecha", "Concepto", "Nro Documento", "Crédito", "Débito", "Detalle"]

AGRUPAR_POR = "normalizado"   # "normalizado" (recomendado) | "original"
HOJAS_POR_CATEGORIA = False   # True = agrega una pestaña de detalle por categoría

# -----------------------------------------------------------------------------
#  CATEGORÍAS  (se evalúan EN ORDEN: gana la primera que coincide)
#  Las claves van en MAYÚSCULA, sin acentos, sobre el concepto YA normalizado.
# -----------------------------------------------------------------------------
CATEGORIAS = [
    ("Sueldos",                   ["SUELDO", "HABERES", "PAGO DE HABERES", "JORNAL"]),
    ("Impuesto débitos/créditos", ["LEY 25413", "IMPUESTO AL CHEQUE"]),
    ("Retenciones ARBA / IIBB",   ["ARBA", "INGRESOS BRUTOS", "IIBB", "SIRCREB", "SIRTAC"]),
    ("IVA y percepciones",        ["IVA", "PERCEPCION", "RETENCION GANANCIAS", "REGIMEN AFIP"]),
    ("Otros impuestos",           ["IMPUESTO", "TASA", "SELLOS"]),
    ("Mantenimiento de cuenta",   ["MANTENIMIENTO"]),
    ("Comisiones",                ["COMISION", "ARANCEL", "CARGO", "GASTO", "SEGURO",
                                   "CHEQUERA", "ALQUILER DE"]),
    ("Plan de pago / préstamos",  ["PLAN DE PAGO", "PRESTAMO", "CUOTA", "AMORTIZACION",
                                   "INTERES"]),
    ("Cobros con tarjeta",        ["TARJETA", "VISA", "MASTERCARD", "MASTER CARD", "CABAL",
                                   "AMEX", "COMERCIOS", "POSNET", "LIQUIDACION TARJETA"]),
    ("Depósitos en efectivo",     ["DEPOSITO", "EFECTIVO"]),
    ("Cheques",                   ["CHEQUE", "ECHEQ"]),
    ("Dólares / bursátil",        ["DOLAR", "MEP", "CCL", "CANJE", "ARBITRAJE",
                                   "COMPRA VENTA MONEDA", "BURSATIL"]),
    ("Transferencias recibidas",  ["TRANSFERENCIA RECIBIDA", "ACREDITACION", "RECIBIDA",
                                   "CREDITO INMEDIATO", "TRANSFERENCIA A FAVOR"]),
    ("Pago de servicios",         ["DEBITO AUTOMATICO", "PAGO ELECTRONICO", "PAGO DIRECTO",
                                   "SERVICIOS", "PAGO DE SERVICIOS"]),
    ("Transferencias enviadas",   ["TRANSFERENCIA", "PAGO A PROVEEDORES", "PAGO PROVEEDOR"]),
]
CATEGORIA_DEFECTO = "Otros"

# -----------------------------------------------------------------------------
#  NORMALIZACIÓN DE CONCEPTOS  <- el corazón del script
# -----------------------------------------------------------------------------
# 1) Códigos numéricos que SÍ significan algo: se traducen ANTES de borrar números.
#    Se aplica SOLO EL PRIMERO que coincide, para que un reemplazo no dispare otro.
CODIGOS_CON_SIGNIFICADO = [
    (r"\bLEY\s*(N[°º]?\s*)?25[.\s]?413\b", "IMPUESTO CHEQUE"),   # impuesto al cheque
    (r"\bR\.?G\.?\s*2408\b",               "PERCEPCION IVA"),
    (r"\bR\.?G\.?\s*4622\b",               "PERCEPCION IVA"),
    (r"\bR\.?G\.?\s*3337\b",               "RETENCION IVA"),
    (r"\bR\.?G\.?\s*830\b",                "RETENCION GANANCIAS"),
    (r"\bR\.?G\.?\s*\d{3,4}\b",            "REGIMEN AFIP"),
    (r"\bDEC\.?\s*\d{3,4}\s*/\s*\d{2,4}\b", "DECRETO"),
]

# 2) Abreviaturas -> palabra completa (se aplica palabra por palabra).
ABREVIATURAS = {
    "MANT": "MANTENIMIENTO", "MTO": "MANTENIMIENTO", "MANTEN": "MANTENIMIENTO",
    "CTA": "CUENTA", "CTAS": "CUENTAS", "CTE": "CORRIENTE", "CC": "CUENTA CORRIENTE",
    "COM": "COMISION", "COMIS": "COMISION", "COMS": "COMISIONES",
    "IMP": "IMPUESTO", "IMPTO": "IMPUESTO", "IMPTOS": "IMPUESTOS", "IMPS": "IMPUESTOS",
    "DEB": "DEBITO", "DEBS": "DEBITOS", "DTO": "DEBITO", "DB": "DEBITO",
    "CRED": "CREDITO", "CREDS": "CREDITOS", "CR": "CREDITO",
    "ACRED": "ACREDITACION", "ACR": "ACREDITACION",
    "TRANSF": "TRANSFERENCIA", "TRF": "TRANSFERENCIA", "TR": "TRANSFERENCIA",
    "TRANSFS": "TRANSFERENCIAS",
    "RET": "RETENCION", "RETS": "RETENCIONES", "RTN": "RETENCION",
    "PERC": "PERCEPCION", "PERCEP": "PERCEPCION",
    "AUT": "AUTOMATICO", "AUTOM": "AUTOMATICO",
    "SERV": "SERVICIOS", "SRV": "SERVICIOS",
    "DEP": "DEPOSITO", "DEPOS": "DEPOSITO", "EFVO": "EFECTIVO", "EFEC": "EFECTIVO",
    "SUC": "SUCURSAL", "SUCUR": "SUCURSAL",
    "TARJ": "TARJETA", "TJ": "TARJETA", "TJTA": "TARJETA",
    "LIQ": "LIQUIDACION", "LIQUID": "LIQUIDACION",
    "PGO": "PAGO", "PG": "PAGO",
    "CHQ": "CHEQUE", "CHQS": "CHEQUES",
    "DESC": "DESCUENTO", "DCTO": "DESCUENTO",
    "VTO": "VENCIMIENTO", "SDO": "SALDO", "GS": "GASTOS",
    "ELECT": "ELECTRONICO", "ELECTR": "ELECTRONICO",
    "PROVEED": "PROVEEDOR", "PROVEE": "PROVEEDOR",
    # --- plurales -> singular (si no, 'COMISION' y 'COMISIONES' son dos grupos) ---
    "COMISIONES": "COMISION", "IMPUESTOS": "IMPUESTO", "DEBITOS": "DEBITO",
    "CREDITOS": "CREDITO", "TRANSFERENCIAS": "TRANSFERENCIA",
    "RETENCIONES": "RETENCION", "PERCEPCIONES": "PERCEPCION",
    "SERVICIOS": "SERVICIO", "GASTOS": "GASTO", "CARGOS": "CARGO",
    "CHEQUES": "CHEQUE", "SUELDOS": "SUELDO", "HABERES": "SUELDO",
    "CUENTAS": "CUENTA", "DEPOSITOS": "DEPOSITO", "TARJETAS": "TARJETA",
    "COMERCIOS": "COMERCIO", "PROVEEDORES": "PROVEEDOR", "SELLOS": "SELLO",
    "GANANCIAS": "GANANCIA", "INTERESES": "INTERES", "CUOTAS": "CUOTA",
    "PRESTAMOS": "PRESTAMO", "ACREDITACIONES": "ACREDITACION",
}

# 3) Palabras de relleno que no aportan a la agrupación.
PALABRAS_VACIAS = {"DE", "DEL", "LA", "EL", "LOS", "LAS", "POR", "SOBRE", "S", "C",
                   "Y", "A", "EN", "SU", "REF", "NRO", "N", "OP", "SEG", "VAR", "RG"}

# =============================================================================
#  ESTILOS
# =============================================================================
FUENTE = "Arial"
F_TITULO = Font(name=FUENTE, size=14, bold=True, color="1F4E79")
F_SUBTIT = Font(name=FUENTE, size=9, italic=True, color="595959")
F_CABECERA = Font(name=FUENTE, size=10, bold=True, color="FFFFFF")
F_NORMAL = Font(name=FUENTE, size=10)
F_CHICA = Font(name=FUENTE, size=9, color="595959")
F_TOTAL = Font(name=FUENTE, size=10, bold=True)
FILL_CAB = PatternFill("solid", fgColor="1F4E79")
FILL_TOTAL = PatternFill("solid", fgColor="D6E4F0")
FILL_ALT = PatternFill("solid", fgColor="F2F2F2")
FILL_ALERTA = PatternFill("solid", fgColor="FFF2CC")
BORDE_TOP = Border(top=Side(style="thin", color="808080"))

FMT_NUM = '#,##0.00;[RED]-#,##0.00;"-"'
FMT_PCT = '0.0%;-0.0%;"-"'
FMT_FECHA = "DD/MM/YYYY"
FMT_DIA = "DD/MM"
FMT_ENT = '#,##0;-#,##0;"-"'


# =============================================================================
#  NORMALIZACIÓN
# =============================================================================
def sin_acentos(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto))
    return "".join(c for c in t if not unicodedata.combining(c))


def normalizar_concepto(texto) -> str:
    """
    Convierte el texto del banco en un concepto estable y legible.

    'MANT. CTA. 0123'        -> 'MANTENIMIENTO CUENTA'
    'MANTENIMIENTO DE CUENTA'-> 'MANTENIMIENTO CUENTA'
    'IMP.LEY 25413 DEBITOS'  -> 'IMPUESTO DEBITOS Y CREDITOS DEBITOS'
    'RET. ARBA 901/26'       -> 'RETENCION ARBA'
    'TRANSFERENCIA RECIBIDA 20304050607' -> 'TRANSFERENCIA RECIBIDA'
    """
    if texto is None:
        return ""
    t = sin_acentos(texto).upper().strip()
    if not t or t == "NAN":
        return ""

    # (1) códigos con significado, antes de borrar números.
    #     Solo el primero que coincide, para que un reemplazo no dispare al siguiente.
    for patron, reemplazo in CODIGOS_CON_SIGNIFICADO:
        nuevo = re.sub(patron, reemplazo, t)
        if nuevo != t:
            t = nuevo
            break

    # (2) basura numérica: fechas, cuotas, CUIT/CBU, importes, porcentajes, referencias
    t = re.sub(r"\b\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?\b", " ", t)   # 12/03/25
    t = re.sub(r"\b\d{1,3}\s*/\s*\d{1,3}\b", " ", t)                  # cuota 3/12
    t = re.sub(r"\b\d{6,}\b", " ", t)                                 # CUIT, CBU, referencias
    t = re.sub(r"\b\d+[.,]\d+\s*%?", " ", t)                          # 10,5%  1.234,56
    t = re.sub(r"\b\d+\s*%", " ", t)                                  # 21%
    t = re.sub(r"\b\d+\b", " ", t)                                    # cualquier número suelto

    # (3) todo lo que no sea letra o espacio -> espacio
    t = re.sub(r"[^A-ZÑ ]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    # (4) abreviaturas y palabras vacías
    palabras = []
    for p in t.split():
        p = ABREVIATURAS.get(p, p)
        palabras.extend(p.split())
    palabras = [p for p in palabras if p not in PALABRAS_VACIAS and len(p) > 1]

    # (5) sacar palabras repetidas, conservando la primera aparición
    #     ('IVA PERCEPCION IVA' -> 'IVA PERCEPCION')
    limpio, vistas = [], set()
    for p in palabras:
        if p not in vistas:
            limpio.append(p)
            vistas.add(p)
    return " ".join(limpio)


def unificar_equivalentes(serie: pd.Series) -> dict:
    """Une conceptos con las MISMAS palabras en distinto orden.

    'IVA PERCEPCION' y 'PERCEPCION IVA' son lo mismo: se quedan con la
    redacción más frecuente del archivo. Devuelve {concepto: canónico}.
    """
    conteo = serie.value_counts()
    por_conjunto = {}
    for concepto, veces in conteo.items():
        clave = frozenset(concepto.split())
        if not clave:
            continue
        por_conjunto.setdefault(clave, []).append((veces, concepto))
    mapa = {}
    for clave, lista in por_conjunto.items():
        if len(lista) > 1:
            canonico = max(lista)[1]          # el más frecuente
            for _, concepto in lista:
                mapa[concepto] = canonico
    return mapa


_CATEGORIAS_NORM = None


def _categorias_normalizadas():
    """Pasa las palabras clave por el MISMO normalizador que los conceptos.

    Sin esto, una regla como 'ALQUILER DE' nunca engancha, porque el
    normalizador le saca el 'DE' al concepto. Así las reglas se pueden
    escribir en castellano normal y siempre quedan alineadas.
    """
    global _CATEGORIAS_NORM
    if _CATEGORIAS_NORM is None:
        _CATEGORIAS_NORM = [
            (cat, [k for k in (normalizar_concepto(c) for c in claves) if k])
            for cat, claves in CATEGORIAS
        ]
    return _CATEGORIAS_NORM


def clasificar(concepto_normalizado: str) -> str:
    n = f" {concepto_normalizado.upper()} "
    for categoria, claves in _categorias_normalizadas():
        if any(f" {clave} " in n or clave in n for clave in claves):
            return categoria
    return CATEGORIA_DEFECTO


def a_numero(valor) -> float:
    """'1.234,56', '$ 1234.56', '(1.234,56)' o número -> float."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    t = str(valor).strip()
    if not t:
        return 0.0
    negativo = t.startswith("(") and t.endswith(")")
    t = re.sub(r"[^\d,.\-]", "", t.strip("()"))
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    try:
        n = float(t)
    except ValueError:
        return 0.0
    return -n if negativo else n


# =============================================================================
#  LECTURA DEL EXTRACTO
# =============================================================================
def _leer_crudo(path: str, hoja):
    """Lee el archivo sin cabecera, probando los motores que sirven para cada formato.
    Muchos '.xls' de home banking son en realidad HTML o CSV disfrazados."""
    intentos = []
    ext = os.path.splitext(path)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        intentos = [("openpyxl", None)]
    elif ext == ".xls":
        intentos = [("xlrd", None), ("openpyxl", None), ("html", None), ("csv", None)]
    else:
        intentos = [("openpyxl", None), ("xlrd", None), ("html", None), ("csv", None)]

    errores = []
    for motor, _ in intentos:
        try:
            if motor == "html":
                tablas = pd.read_html(path)
                if not tablas:
                    raise ValueError("sin tablas HTML")
                return max(tablas, key=len).reset_index(drop=True)
            if motor == "csv":
                return pd.read_csv(path, header=None, sep=None, engine="python",
                                   encoding="latin-1")
            kw = {"header": None, "engine": motor}
            if hoja is not None:
                kw["sheet_name"] = hoja
            df = pd.read_excel(path, **kw)
            if isinstance(df, dict):
                df = list(df.values())[0]
            return df
        except Exception as e:                                   # noqa: BLE001
            errores.append(f"{motor}: {type(e).__name__} {e}")
            if hoja is not None and motor in ("xlrd", "openpyxl"):
                # la hoja puede llamarse distinto: reintento con la primera
                try:
                    df = pd.read_excel(path, header=None, engine=motor)
                    print(f"[!] No encontré la hoja '{hoja}', uso la primera del archivo.")
                    return df
                except Exception:                                # noqa: BLE001
                    pass
    raise SystemExit("[ERROR] No pude abrir el archivo.\n        " + "\n        ".join(errores))


def _detectar_cabecera(crudo: pd.DataFrame, max_filas=25) -> int:
    """Busca la fila que tiene los títulos reales (fecha + concepto + importes)."""
    claves_a = {"fecha"}
    claves_b = {"concepto", "descripcion", "detalle", "movimiento"}
    claves_c = {"credito", "debito", "importe", "haber", "debe"}
    for i in range(min(max_filas, len(crudo))):
        celdas = {sin_acentos(c).lower().strip() for c in crudo.iloc[i].tolist()
                  if pd.notna(c)}
        if not celdas:
            continue
        hay = lambda claves: any(any(k in c for k in claves) for c in celdas)  # noqa: E731
        if hay(claves_a) and hay(claves_b) and hay(claves_c):
            return i
    return 0


def leer_extracto(path: str) -> pd.DataFrame:
    crudo = _leer_crudo(path, HOJA)
    fila_cab = FILA_CABECERA if FILA_CABECERA is not None else _detectar_cabecera(crudo)
    print(f"[i] Cabecera detectada en la fila {fila_cab + 1} del archivo.")

    df = crudo.iloc[fila_cab + 1:].copy()
    df.columns = [str(c).strip() for c in crudo.iloc[fila_cab].tolist()]
    df = df.reset_index(drop=True).dropna(how="all")

    # --- elegir columnas: primero por nombre, si falla por índice ---
    def buscar(*claves):
        for col in df.columns:
            n = sin_acentos(col).lower().strip()
            if any(n == k or n.startswith(k) for k in claves):
                return col
        return None

    cols = {
        "Fecha": buscar("fecha"),
        "Concepto": buscar("concepto", "descripcion", "movimiento"),
        "Nro Documento": buscar("nro documento", "nro doc", "documento", "comprobante"),
        "Crédito": buscar("credito", "haber"),
        "Débito": buscar("debito", "debe"),
        "Detalle": buscar("detalle", "observacion", "referencia", "leyenda"),
    }
    if not cols["Fecha"] or not cols["Concepto"] or (not cols["Crédito"] and not cols["Débito"]):
        if COLUMNAS_IDX and len(COLUMNAS_IDX) == len(COLUMNAS_NOMBRES):
            print("[!] No reconocí los títulos; uso COLUMNAS_IDX de la configuración.")
            sub = df.iloc[:, COLUMNAS_IDX].copy()
            sub.columns = COLUMNAS_NOMBRES
            df, cols = sub, {n: n for n in COLUMNAS_NOMBRES}
        else:
            raise SystemExit(f"[ERROR] No encuentro las columnas. Títulos leídos: {list(df.columns)}")

    def texto(col):
        """Serie de texto sin NaN. Funciona igual en pandas 2 y 3."""
        if not col:
            return ""
        s = df[col].fillna("").astype(str).str.strip()
        return s.replace({"nan": "", "NaN": "", "None": "", "<NA>": ""})

    out = pd.DataFrame()
    out["Fecha"] = pd.to_datetime(df[cols["Fecha"]], dayfirst=True, errors="coerce")
    out["Nro Documento"] = texto(cols["Nro Documento"])
    out["Concepto original"] = texto(cols["Concepto"])
    out["Detalle"] = texto(cols["Detalle"])
    out["Crédito"] = df[cols["Crédito"]].map(a_numero) if cols["Crédito"] else 0.0
    out["Débito"] = df[cols["Débito"]].map(a_numero).abs() if cols["Débito"] else 0.0

    # --- descartar filas de relleno / subtotales del export ---
    out = out[~(out["Concepto original"].str.lower().isin(["", "nan", "none", "total", "totales"]))]
    out = out[~(out["Fecha"].isna() & (out["Crédito"] == 0) & (out["Débito"] == 0))]

    # --- normalización de conceptos ---
    out["Concepto"] = out["Concepto original"].map(normalizar_concepto)
    # si el concepto quedó vacío (era solo un código), me apoyo en el Detalle
    vacios = out["Concepto"].str.len() < 3
    if vacios.any():
        respaldo = out.loc[vacios, "Detalle"].map(normalizar_concepto)
        out.loc[vacios, "Concepto"] = respaldo.where(respaldo.str.len() >= 3,
                                                     "SIN CONCEPTO")
    # mismas palabras en distinto orden -> un solo concepto
    mapa = unificar_equivalentes(out["Concepto"])
    if mapa:
        for origen, destino in mapa.items():
            if origen != destino:
                print(f"[i] Unifico '{origen}' -> '{destino}'")
        out["Concepto"] = out["Concepto"].replace(mapa)

    if AGRUPAR_POR == "original":
        out["Concepto"] = out["Concepto original"]

    out["Categoría"] = out["Concepto"].map(clasificar)
    out["Neto"] = out["Crédito"] - out["Débito"]

    orden = ["Fecha", "Nro Documento", "Concepto", "Categoría", "Crédito", "Débito",
             "Neto", "Concepto original", "Detalle"]
    return out[orden].sort_values(["Fecha", "Nro Documento"],
                                  na_position="last").reset_index(drop=True)


# =============================================================================
#  DIAGNÓSTICO DE CONCEPTOS
# =============================================================================
def construir_diagnostico(df: pd.DataFrame) -> pd.DataFrame:
    filas = []
    for concepto, g in df.groupby("Concepto"):
        variantes = Counter(g["Concepto original"])
        ejemplos_det = [str(d) for d in g["Detalle"].unique()
                        if isinstance(d, str) and d.strip()][:2]
        filas.append({
            "Concepto normalizado": concepto,
            "Categoría": g["Categoría"].iloc[0],
            "Variantes": len(variantes),
            "Movimientos": len(g),
            "Crédito": g["Crédito"].sum(),
            "Débito": g["Débito"].sum(),
            "Neto": g["Neto"].sum(),
            "Textos originales del banco": "  |  ".join(
                f"{t} (x{n})" for t, n in variantes.most_common(4)),
            "Ejemplo de Detalle": "  |  ".join(ejemplos_det),
        })
    diag = pd.DataFrame(filas)
    return diag.sort_values(["Variantes", "Movimientos"], ascending=False).reset_index(drop=True)


def informe_consola(df: pd.DataFrame, diag: pd.DataFrame) -> None:
    print("\n" + "=" * 72)
    print("  DIAGNÓSTICO DE CONCEPTOS")
    print("=" * 72)
    print(f"  Textos distintos declarados por el banco : {df['Concepto original'].nunique()}")
    print(f"  Conceptos después de normalizar          : {df['Concepto'].nunique()}")
    print(f"  Categorías                               : {df['Categoría'].nunique()}")

    unificados = diag[diag["Variantes"] > 1]
    if not unificados.empty:
        print(f"\n  Conceptos que unificaron variantes ({len(unificados)}):")
        for _, r in unificados.head(12).iterrows():
            print(f"    - {r['Concepto normalizado'][:44].ljust(46)} "
                  f"{r['Variantes']} variantes, {r['Movimientos']} mov.")

    otros = df[df["Categoría"] == CATEGORIA_DEFECTO]
    if not otros.empty:
        print(f"\n  ⚠ SIN CATEGORÍA ({len(otros)} movimientos) — agregá reglas en CATEGORIAS:")
        for concepto, g in otros.groupby("Concepto"):
            print(f"    - {concepto[:50].ljust(52)} {len(g)} mov.  "
                  f"neto {g['Neto'].sum():,.2f}")
    else:
        print("\n  ✔ Todos los conceptos quedaron categorizados.")
    print("=" * 72 + "\n")


# =============================================================================
#  ESCRITURA DEL EXCEL
# =============================================================================
def encabezado_hoja(ws, titulo, subtitulo, ancho_merge):
    ws["A1"] = titulo
    ws["A1"].font = F_TITULO
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ancho_merge)
    ws["A2"] = subtitulo
    ws["A2"].font = F_SUBTIT
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ancho_merge)
    ws.row_dimensions[1].height = 20


def escribir_detalle(wb, df):
    """Hoja Detalle. OJO: las fórmulas de los resúmenes dependen de estas columnas:
       A Fecha | B Nro Doc | C Concepto | D Categoría | E Crédito | F Débito | G Neto"""
    ws = wb.create_sheet("Detalle")
    ws.append(list(df.columns))
    for celda in ws[1]:
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center")

    for _, fila in df.iterrows():
        ws.append([None if (isinstance(v, float) and pd.isna(v)) or v is pd.NaT else v
                   for v in fila.tolist()])

    ultima = ws.max_row
    for r in range(2, ultima + 1):
        for c in range(1, len(df.columns) + 1):
            ws.cell(row=r, column=c).font = F_NORMAL
        ws.cell(row=r, column=1).number_format = FMT_FECHA
        for c in (5, 6, 7):
            ws.cell(row=r, column=c).number_format = FMT_NUM

    for col, ancho in zip("ABCDEFGHI", [12, 15, 40, 26, 15, 15, 15, 34, 30]):
        ws.column_dimensions[col].width = ancho
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(df.columns))}{ultima}"
    return ultima


def escribir_resumen(wb, df, campo, titulo, nombre_hoja, subtitulo, fin_detalle):
    """campo = 'Concepto' (col C del Detalle) o 'Categoría' (col D)."""
    col_clave = "C" if campo == "Concepto" else "D"
    rango_clave = f"Detalle!${col_clave}$2:${col_clave}${fin_detalle}"
    rango_cred = f"Detalle!$E$2:$E${fin_detalle}"
    rango_deb = f"Detalle!$F$2:$F${fin_detalle}"

    ws = wb.create_sheet(nombre_hoja)
    cabeceras = [campo, "Variantes", "Movimientos", "Débitos", "Créditos", "Neto",
                 "% s/Débitos", "% s/Créditos"]
    encabezado_hoja(ws, titulo, subtitulo, len(cabeceras))

    fila_cab = 4
    for j, h in enumerate(cabeceras, start=1):
        celda = ws.cell(row=fila_cab, column=j, value=h)
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    resumen = (df.groupby(campo)
                 .agg(Variantes=("Concepto original", "nunique"),
                      Neto=("Neto", "sum"))
                 .reset_index()
                 .sort_values("Neto", ascending=False))

    fila = fila_cab + 1
    primera = fila
    for _, r in resumen.iterrows():
        ws.cell(row=fila, column=1, value=r[campo])
        ws.cell(row=fila, column=2, value=int(r["Variantes"]))
        ws.cell(row=fila, column=3, value=f'=COUNTIFS({rango_clave},$A{fila})')
        ws.cell(row=fila, column=4, value=f'=SUMIFS({rango_deb},{rango_clave},$A{fila})')
        ws.cell(row=fila, column=5, value=f'=SUMIFS({rango_cred},{rango_clave},$A{fila})')
        ws.cell(row=fila, column=6, value=f"=E{fila}-D{fila}")
        fila += 1
    ultima, fila_total = fila - 1, fila

    ws.cell(row=fila_total, column=1, value="TOTAL")
    for col in ("B", "C", "D", "E", "F"):
        ws[f"{col}{fila_total}"] = f"=SUM({col}{primera}:{col}{ultima})"
    for r in range(primera, ultima + 1):
        ws.cell(row=r, column=7, value=f'=IFERROR(D{r}/$D${fila_total},"")')
        ws.cell(row=r, column=8, value=f'=IFERROR(E{r}/$E${fila_total},"")')
    ws.cell(row=fila_total, column=7, value=f'=IFERROR(SUM(G{primera}:G{ultima}),"")')
    ws.cell(row=fila_total, column=8, value=f'=IFERROR(SUM(H{primera}:H{ultima}),"")')

    for r in range(primera, fila_total + 1):
        es_total = r == fila_total
        sin_cat = ws.cell(row=r, column=1).value == CATEGORIA_DEFECTO
        for c in range(1, len(cabeceras) + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_TOTAL if es_total else F_NORMAL
            if es_total:
                celda.fill, celda.border = FILL_TOTAL, BORDE_TOP
            elif sin_cat:
                celda.fill = FILL_ALERTA
            elif (r - primera) % 2 == 1:
                celda.fill = FILL_ALT
        for c in (2, 3):
            ws.cell(row=r, column=c).number_format = FMT_ENT
        for c in (4, 5, 6):
            ws.cell(row=r, column=c).number_format = FMT_NUM
        for c in (7, 8):
            ws.cell(row=r, column=c).number_format = FMT_PCT

    for col, ancho in zip("ABCDEFGH", [46, 11, 13, 16, 16, 16, 12, 12]):
        ws.column_dimensions[col].width = ancho
    ws.freeze_panes = f"A{fila_cab + 1}"
    ws.auto_filter.ref = f"A{fila_cab}:H{ultima}"


def escribir_pivot(wb, df, fin_detalle):
    fechas = sorted(d for d in df["Fecha"].dropna().dt.normalize().unique())
    if not fechas:
        print("[!] Sin fechas válidas: omito la hoja 'Concepto x Día'.")
        return
    claves = (df.groupby("Concepto")["Neto"].sum()
                .sort_values(ascending=False).reset_index())

    rango_conc = f"Detalle!$C$2:$C${fin_detalle}"
    rango_neto = f"Detalle!$G$2:$G${fin_detalle}"
    rango_fec = f"Detalle!$A$2:$A${fin_detalle}"

    ws = wb.create_sheet("Concepto x Día")
    total_cols = 2 + len(fechas)
    encabezado_hoja(ws, "Neto por concepto y día",
                    "Cada celda es crédito menos débito de ese concepto en esa fecha.",
                    total_cols)

    fila_cab = 4
    ws.cell(row=fila_cab, column=1, value="Concepto")
    for j, f in enumerate(fechas, start=2):
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
        for j in range(2, 2 + len(fechas)):
            letra = get_column_letter(j)
            ws.cell(row=fila, column=j,
                    value=f'=SUMIFS({rango_neto},{rango_conc},$A{fila},'
                          f'{rango_fec},{letra}${fila_cab})')
        ws.cell(row=fila, column=total_cols,
                value=f"=SUM(B{fila}:{get_column_letter(total_cols - 1)}{fila})")
        fila += 1
    ultima, fila_total = fila - 1, fila

    ws.cell(row=fila_total, column=1, value="TOTAL")
    for j in range(2, total_cols + 1):
        letra = get_column_letter(j)
        ws.cell(row=fila_total, column=j, value=f"=SUM({letra}{primera}:{letra}{ultima})")

    for r in range(primera, fila_total + 1):
        es_total = r == fila_total
        for c in range(1, total_cols + 1):
            celda = ws.cell(row=r, column=c)
            celda.font = F_TOTAL if es_total else F_NORMAL
            if es_total:
                celda.fill, celda.border = FILL_TOTAL, BORDE_TOP
            if c >= 2:
                celda.number_format = FMT_NUM
        ws.cell(row=r, column=total_cols).font = F_TOTAL

    ws.column_dimensions["A"].width = 46
    for j in range(2, total_cols + 1):
        ws.column_dimensions[get_column_letter(j)].width = 15
    ws.freeze_panes = ws.cell(row=fila_cab + 1, column=2)


def escribir_diagnostico(wb, diag, subtitulo):
    ws = wb.create_sheet("Diagnóstico Conceptos")
    cabeceras = list(diag.columns)
    encabezado_hoja(ws, "Diagnóstico de conceptos del banco",
                    "Qué textos crudos se unificaron en cada concepto. "
                    "Las filas amarillas quedaron sin categoría: agregá la regla en CATEGORIAS.",
                    len(cabeceras))
    fila_cab = 4
    for j, h in enumerate(cabeceras, start=1):
        celda = ws.cell(row=fila_cab, column=j, value=h)
        celda.font, celda.fill = F_CABECERA, FILL_CAB
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for i, (_, r) in enumerate(diag.iterrows(), start=fila_cab + 1):
        for j, h in enumerate(cabeceras, start=1):
            celda = ws.cell(row=i, column=j, value=r[h])
            celda.font = F_CHICA if j >= 8 else F_NORMAL
            if r["Categoría"] == CATEGORIA_DEFECTO:
                celda.fill = FILL_ALERTA
            celda.alignment = Alignment(vertical="top", wrap_text=(j >= 8))
        for j in (3, 4):
            ws.cell(row=i, column=j).number_format = FMT_ENT
        for j in (5, 6, 7):
            ws.cell(row=i, column=j).number_format = FMT_NUM

    for col, ancho in zip("ABCDEFGHI", [40, 24, 10, 12, 15, 15, 15, 60, 40]):
        ws.column_dimensions[col].width = ancho
    ws.freeze_panes = f"A{fila_cab + 1}"
    ws.auto_filter.ref = f"A{fila_cab}:{get_column_letter(len(cabeceras))}{fila_cab + len(diag)}"


def escribir_hojas_por_categoria(wb, df):
    """Opcional: una pestaña de detalle por cada categoría (como tus FILTROS)."""
    for categoria in sorted(df["Categoría"].unique()):
        sub = df[df["Categoría"] == categoria]
        nombre = re.sub(r"[\\/*?:\[\]]", "-", categoria)[:31]
        ws = wb.create_sheet(nombre)
        cabeceras = ["Fecha", "Nro Documento", "Concepto", "Crédito", "Débito", "Neto",
                     "Concepto original", "Detalle"]
        encabezado_hoja(ws, f"Detalle — {categoria}",
                        f"{len(sub)} movimientos", len(cabeceras))
        fila_cab = 4
        for j, h in enumerate(cabeceras, start=1):
            celda = ws.cell(row=fila_cab, column=j, value=h)
            celda.font, celda.fill = F_CABECERA, FILL_CAB
            celda.alignment = Alignment(horizontal="center", vertical="center")
        fila = fila_cab + 1
        for _, r in sub.iterrows():
            valores = [r["Fecha"], r["Nro Documento"], r["Concepto"], r["Crédito"],
                       r["Débito"], r["Neto"], r["Concepto original"], r["Detalle"]]
            for j, v in enumerate(valores, start=1):
                celda = ws.cell(row=fila, column=j,
                                value=None if v is pd.NaT else v)
                celda.font = F_NORMAL
            ws.cell(row=fila, column=1).number_format = FMT_FECHA
            for j in (4, 5, 6):
                ws.cell(row=fila, column=j).number_format = FMT_NUM
            fila += 1
        fila_total = fila
        ws.cell(row=fila_total, column=1, value="TOTAL").font = F_TOTAL
        for j, letra in zip((4, 5, 6), ("D", "E", "F")):
            celda = ws.cell(row=fila_total, column=j,
                            value=f"=SUM({letra}{fila_cab + 1}:{letra}{fila - 1})")
            celda.font, celda.fill, celda.border = F_TOTAL, FILL_TOTAL, BORDE_TOP
            celda.number_format = FMT_NUM
        for col, ancho in zip("ABCDEFGH", [12, 15, 40, 15, 15, 15, 34, 30]):
            ws.column_dimensions[col].width = ancho
        ws.freeze_panes = f"A{fila_cab + 1}"


# =============================================================================
#  FLUJO PRINCIPAL
# =============================================================================
def generar(path_entrada: str, path_salida: str, solo_diagnostico=False):
    print(f"Leyendo: {os.path.basename(path_entrada)}")
    df = leer_extracto(path_entrada)
    if df.empty:
        raise SystemExit("[ERROR] No se encontraron movimientos en el archivo.")
    print(f"    {len(df)} movimientos cargados.")

    diag = construir_diagnostico(df)
    informe_consola(df, diag)
    if solo_diagnostico:
        return None

    f_min, f_max = df["Fecha"].min(), df["Fecha"].max()
    periodo = (f"Período: {f_min:%d/%m/%Y} al {f_max:%d/%m/%Y}"
               if pd.notna(f_min) else "Período: sin fechas en el archivo")
    subtitulo = (f"{periodo}  |  {len(df)} movimientos  |  "
                 f"{df['Concepto original'].nunique()} textos del banco agrupados en "
                 f"{df['Concepto'].nunique()} conceptos  |  "
                 f"Origen: {os.path.basename(path_entrada)}  |  "
                 f"Generado: {datetime.now():%d/%m/%Y %H:%M}")

    wb = Workbook()
    wb.remove(wb.active)
    fin_detalle = escribir_detalle(wb, df)     # primero: las fórmulas la referencian
    escribir_resumen(wb, df, "Concepto", "Resumen por concepto",
                     "Resumen por Concepto", subtitulo, fin_detalle)
    escribir_resumen(wb, df, "Categoría", "Resumen por categoría",
                     "Resumen por Categoría", subtitulo, fin_detalle)
    escribir_pivot(wb, df, fin_detalle)
    escribir_diagnostico(wb, diag, subtitulo)
    if HOJAS_POR_CATEGORIA:
        escribir_hojas_por_categoria(wb, df)

    orden = ["Resumen por Concepto", "Resumen por Categoría", "Concepto x Día",
             "Diagnóstico Conceptos", "Detalle"]
    resto = [h for h in wb.sheetnames if h not in orden]
    wb._sheets = [wb[n] for n in orden if n in wb.sheetnames] + [wb[n] for n in resto]
    wb.active = 0
    wb.save(path_salida)

    print(f"  Débitos:  {df['Débito'].sum():,.2f}")
    print(f"  Créditos: {df['Crédito'].sum():,.2f}")
    print(f"  Neto:     {df['Neto'].sum():,.2f}")
    print(f"--> {path_salida}")
    return path_salida


def main():
    ap = argparse.ArgumentParser(description="Agrupa los movimientos del extracto por concepto.")
    ap.add_argument("entrada", nargs="?", default=ARCHIVO_ENTRADA, help="Extracto (.xls/.xlsx)")
    ap.add_argument("-o", "--salida", default=ARCHIVO_SALIDA)
    ap.add_argument("--diagnostico", action="store_true",
                    help="solo analiza los conceptos, no escribe el Excel")
    args = ap.parse_args()

    if not os.path.exists(args.entrada):
        sys.exit(f"[ERROR] No existe el archivo: {args.entrada}\n"
                 f"        Editá ARCHIVO_ENTRADA o pasá la ruta como argumento.")
    salida = args.salida or f"{os.path.splitext(args.entrada)[0]}_agrupado.xlsx"
    generar(args.entrada, salida, solo_diagnostico=args.diagnostico)


if __name__ == "__main__":
    main()
