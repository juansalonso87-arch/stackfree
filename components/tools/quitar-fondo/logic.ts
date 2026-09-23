/**
 * Lógica de procesamiento de "Quitar fondo de imagen".
 *
 * Regla: este archivo NO sabe nada de React ni de la interfaz. Recibe un
 * archivo, devuelve un resultado. Así se puede probar y cambiar la librería
 * de IA sin tocar la pantalla.
 *
 * Usa `@imgly/background-removal`: un modelo de IA (ISNet) que corre dentro
 * del navegador vía WebAssembly. La foto del usuario nunca sale del
 * dispositivo; lo único que se descarga (una sola vez) es el modelo.
 *
 * ⚠ Licencia: @imgly/background-removal es AGPL-3.0. Ver README.
 */

import type { Config } from "@imgly/background-removal";

export type ModoFondo = "transparente" | "blanco";

export type CallbackProgreso = (porcentaje: number, mensaje: string) => void;

export interface OpcionesQuitarFondo {
  onProgreso?: CallbackProgreso;
  /** Máximo para descargar el modelo (primera vez). Default: 5 min. */
  timeoutDescargaMs?: number;
  /** Máximo para procesar la imagen. Default: 3 min. */
  timeoutProcesoMs?: number;
}

export interface ResultadoQuitarFondo {
  /** PNG con fondo transparente, tal como sale del modelo. */
  png: Blob;
  ancho: number;
  alto: number;
  /** true si la imagen se achicó antes de procesar (ver LADO_MAXIMO). */
  redimensionada: boolean;
}

/**
 * Lado máximo (px) con el que se procesa. Imágenes más grandes se achican
 * antes: el modelo trabaja internamente a 1024px, así que no se pierde
 * calidad de recorte, y evitamos quedarnos sin memoria en celulares.
 */
const LADO_MAXIMO_DESKTOP = 4096;
const LADO_MAXIMO_MOBILE = 2560;

/* ------------------------------------------------------------------ */
/* Carga de la librería y elección del modelo                          */
/* ------------------------------------------------------------------ */

/** La librería pesa varios MB: se importa recién cuando hace falta. */
function cargarLibreria() {
  return import("@imgly/background-removal");
}

/** Servidor donde la librería aloja el modelo (declarado en la CSP). */
const SERVIDOR_MODELO = "https://staticimgly.com/";

/**
 * ¿Este dispositivo puede hablar con el servidor del modelo?
 *
 * Sirve para no acusar a ciegas. En el iPhone del dueño (2026-09-23) el
 * servidor se abría perfecto escribiendo la dirección a mano, pero el pedido
 * desde dentro de la página fallaba siempre con "Load failed": esa asimetría
 * es la firma de un bloqueador de contenido, que filtra los pedidos que hace
 * una página pero no las direcciones que uno abre. Con `mode: "no-cors"` no
 * importa la respuesta ni los permisos CORS: lo único que se pregunta es si el
 * pedido llega a salir. Si ni eso sale, algo lo está bloqueando.
 */
async function servidorDelModeloResponde(): Promise<boolean> {
  try {
    await fetch(SERVIDOR_MODELO, { mode: "no-cors", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

function esDispositivoModesto(): boolean {
  if (typeof navigator === "undefined") return false;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memoria === "number" && memoria <= 4) return true;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Modelo "mediano" (fp16, ~80 MB) para computadoras; "chico" (quint8,
 * ~40 MB) para celulares y equipos con poca memoria. Ambos se descargan
 * una sola vez y quedan en la caché del navegador.
 */
function elegirModelo(): Config["model"] {
  return esDispositivoModesto() ? "isnet_quint8" : "isnet_fp16";
}

export function ladoMaximo(): number {
  return esDispositivoModesto() ? LADO_MAXIMO_MOBILE : LADO_MAXIMO_DESKTOP;
}

/* ------------------------------------------------------------------ */
/* Progreso: traducimos los eventos de la librería a un % y un mensaje  */
/* ------------------------------------------------------------------ */

const oyentes = new Set<CallbackProgreso>();
const descargas = new Map<string, { actual: number; total: number }>();
let ultimoPorcentaje = 0;

/** Emite a la interfaz. El porcentaje nunca retrocede (queda feo en una barra). */
function emitir(porcentaje: number, mensaje: string) {
  ultimoPorcentaje = Math.max(ultimoPorcentaje, Math.round(porcentaje));
  for (const oyente of oyentes) oyente(ultimoPorcentaje, mensaje);
}

function reiniciarProgreso() {
  ultimoPorcentaje = 0;
}

function manejarProgresoLibreria(clave: string, actual: number, total: number) {
  if (clave.startsWith("fetch:")) {
    // El modelo llega en varios trozos: sumamos todos para un % global.
    // No podemos saber si viene de internet o de la caché del navegador,
    // por eso el mensaje dice "cargando" y no "descargando".
    descargas.set(clave, { actual, total });
    let sumaActual = 0;
    let sumaTotal = 0;
    for (const d of descargas.values()) {
      sumaActual += d.actual;
      sumaTotal += d.total;
    }
    const fraccion = sumaTotal > 0 ? sumaActual / sumaTotal : 0;
    emitir(fraccion * 70, "Cargando el modelo de IA (la primera vez se descarga y puede tardar)…");
    return;
  }
  switch (clave) {
    case "compute:decode":
      emitir(72, "Leyendo la imagen…");
      break;
    case "compute:inference":
      emitir(78, "Detectando el fondo con IA…");
      break;
    case "compute:mask":
      emitir(90, "Recortando…");
      break;
    case "compute:encode":
      emitir(actual >= total ? 99 : 95, "Generando la imagen final…");
      break;
  }
}

/**
 * Número de intento de carga del modelo. Sube de a uno cada vez que falla.
 *
 * No es cosmético, arregla un bug real (visto el 2026-09-23): la librería
 * memoriza la sesión con `memoize` de lodash usando `JSON.stringify(config)`
 * como clave, y memoize **guarda también las promesas rechazadas**. Con una
 * config fija, el primer fallo queda cacheado para siempre y cada "Reintentar"
 * recibe el MISMO error sin tocar la red; solo se destraba recargando la página
 * entera. Cambiar el intento cambia la clave, así el reintento arranca limpio.
 *
 * Tiene que ser el mismo valor en `preload` y en `removeBackground`, porque es
 * lo que hace que la segunda reutilice la sesión que preparó la primera.
 */
let intentoModelo = 0;

function configuracion(): Config {
  return {
    model: elegirModelo(),
    device: "cpu",
    output: { format: "image/png", quality: 1 },
    progress: manejarProgresoLibreria,
    // `fetchArgs` va tal cual al fetch de cada trozo (las propiedades que no
    // conoce las ignora) y entra en la clave del memoize. En los reintentos,
    // `cache: "reload"` obliga además a pedir los trozos a la red en vez de
    // usar una copia que pudo quedar cortada en la caché del navegador: la
    // librería no tiene almacén propio, se apoya en la del navegador.
    fetchArgs: intentoModelo === 0 ? {} : { cache: "reload", intento: intentoModelo },
  };
}

/* ------------------------------------------------------------------ */
/* Precarga del modelo                                                  */
/* ------------------------------------------------------------------ */

let promesaPrecarga: Promise<void> | null = null;

/**
 * Empieza a descargar el modelo en segundo plano. Se llama apenas el
 * usuario elige una imagen, así cuando toca "Quitar fondo" ya está listo.
 * Es idempotente: llamarla varias veces no descarga dos veces.
 */
export function precargarModelo(): Promise<void> {
  if (!promesaPrecarga) {
    descargas.clear();
    promesaPrecarga = cargarLibreria()
      .then((lib) => lib.preload(configuracion()))
      .catch((error) => {
        // Si falló (p. ej. sin internet), permitimos reintentar más tarde.
        promesaPrecarga = null;
        // Y le cambiamos la clave a la librería: si no, el reintento recibe la
        // misma promesa rechazada que quedó memorizada (ver `intentoModelo`).
        intentoModelo += 1;
        throw error;
      });
  }
  return promesaPrecarga;
}

/* ------------------------------------------------------------------ */
/* Utilidades de imagen (Canvas)                                        */
/* ------------------------------------------------------------------ */

function crearCanvas(ancho: number, alto: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(ancho, alto);
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

async function decodificar(origen: Blob): Promise<ImageBitmap> {
  try {
    // 'from-image' respeta la orientación EXIF (fotos de celular giradas).
    return await createImageBitmap(origen, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorQuitarFondo(
      "imagen-invalida",
      "No pudimos leer la imagen. Verifica que el archivo no esté dañado y que sea PNG, JPG o WEBP.",
    );
  }
}

/**
 * Decodifica el archivo, corrige la orientación EXIF y lo achica si supera
 * el lado máximo. Devuelve un Blob "normalizado" listo para el modelo.
 *
 * Nota: la librería declara aceptar ImageData pero en la práctica solo
 * procesa bien Blobs (bug en 1.7.0), por eso re-exportamos desde el canvas.
 * Para JPG usamos JPG de alta calidad (ya era con pérdida); para PNG/WEBP
 * usamos PNG para conservar transparencias y no perder nada.
 */
async function prepararImagen(archivo: File) {
  const bitmap = await decodificar(archivo);
  try {
    const maximo = ladoMaximo();
    const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = crearCanvas(ancho, alto);
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new ErrorQuitarFondo("navegador", MENSAJE_NAVEGADOR);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const esJpeg = archivo.type === "image/jpeg";
    const blob = await exportarBlob(canvas, esJpeg ? "image/jpeg" : "image/png", 0.95);
    return { blob, ancho, alto, redimensionada: escala < 1 };
  } finally {
    bitmap.close();
  }
}

/**
 * Variante "fondo blanco": dibuja el PNG transparente sobre un lienzo
 * blanco y lo exporta como JPG (formato ideal para fotos de producto,
 * documentos y perfiles que no admiten transparencia).
 */
export async function componerSobreBlanco(png: Blob, calidad = 0.92): Promise<Blob> {
  const bitmap = await decodificar(png);
  try {
    const canvas = crearCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new ErrorQuitarFondo("navegador", MENSAJE_NAVEGADOR);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return await exportarBlob(canvas, "image/jpeg", calidad);
  } finally {
    bitmap.close();
  }
}

function exportarBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  tipo: string,
  calidad: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: tipo, quality: calidad });
  return new Promise((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error("toBlob devolvió null"))),
      tipo,
      calidad,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Errores amigables                                                    */
/* ------------------------------------------------------------------ */

export type CodigoError =
  | "sin-conexion"
  | "descarga-incompleta"
  | "programa"
  | "navegador"
  | "memoria"
  | "timeout"
  | "imagen-invalida"
  | "desconocido";

const MENSAJE_NAVEGADOR =
  "Tu navegador no es compatible con esta herramienta. Prueba con una versión actualizada de Chrome, Edge, Firefox o Safari.";

/** Mientras no sabemos si el servidor del modelo contesta o no (ver `precisarSiEstaBloqueado`). */
const MENSAJE_SERVIDOR_MODELO =
  "No pudimos traer el modelo de IA desde staticimgly.com, el servidor que lo aloja. Tu conexión funciona, así que probá desactivando bloqueadores de contenido o la VPN, cambiá de Wi-Fi a datos móviles, o usá esta herramienta desde una computadora. (Tu imagen no se envía a ningún lado: lo único que se descarga es el modelo.)";

/** El servidor ni contesta: algo del dispositivo o de la red corta el pedido. */
const MENSAJE_BLOQUEADO =
  "Algo en este dispositivo o en su red está bloqueando staticimgly.com, el servidor donde vive el modelo de IA. No es tu conexión: el resto del sitio funciona. Suele ser un bloqueador de contenido del navegador, una VPN o un filtro de la red. En iPhone: Ajustes → Safari → Extensiones, y Ajustes → tu nombre → iCloud → Relay privado. Si no querés tocar nada, usá esta herramienta desde una computadora: las demás herramientas del sitio no dependen de ningún servidor y te siguen funcionando igual acá.";

/** El servidor contesta, pero la descarga grande no llegó a completarse. */
const MENSAJE_DESCARGA_PESADA =
  "El servidor del modelo responde, pero este navegador no pudo completar la descarga de 40 MB. Suele pasar en teléfonos con poca memoria libre o con una conexión que se corta. Probá cerrando otras pestañas y apps, o hacelo desde una computadora. (Tu imagen no se envía a ningún lado.)";

export class ErrorQuitarFondo extends Error {
  constructor(
    public codigo: CodigoError,
    mensaje: string,
    /**
     * Texto técnico corto (el error original + qué modelo se estaba usando).
     * Va a la pantalla en letra chica y al formulario de reporte: sin esto, un
     * usuario que falla en el celular no tiene forma de contarnos qué pasó, y
     * nosotros no tenemos cómo mirarle la consola.
     */
    public detalle?: string,
  ) {
    super(mensaje);
    this.name = "ErrorQuitarFondo";
  }
}

/**
 * No se pudo bajar el JavaScript de la herramienta (el `import()` dinámico).
 * El navegador lo informa con un texto que incluye "fetch", así que sin esta
 * regla el usuario leía "no se pudo descargar el modelo", que manda a revisar
 * lo que no es.
 */
function esFalloDePrograma(texto: string): boolean {
  return /dynamically imported module|ChunkLoadError|Loading chunk|module script failed/i.test(
    texto,
  );
}

/**
 * Un trozo del modelo llegó con menos bytes de los que debía. La librería lo
 * informa como "Failed to fetch <recurso> with size 4194304 but got 1234".
 */
function esDescargaIncompleta(texto: string): boolean {
  return /with size \d+ but got \d+/i.test(texto);
}

/** Convierte cualquier error técnico en un mensaje que una persona entienda. */
export function aErrorAmigable(error: unknown): ErrorQuitarFondo {
  if (error instanceof ErrorQuitarFondo) return error;

  // El detalle técnico va a la consola (sirve para diagnosticar reportes de
  // usuarios); a la persona le mostramos algo entendible.
  console.error("[quitar-fondo]", error);

  const texto = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const detalle = `${texto.slice(0, 200)} · modelo ${elegirModelo()} · intento ${intentoModelo}`;

  if (typeof WebAssembly === "undefined" || /WebAssembly|SharedArrayBuffer|ort-wasm/i.test(texto)) {
    return new ErrorQuitarFondo("navegador", MENSAJE_NAVEGADOR, detalle);
  }
  // Ojo con el orden: los dos casos de abajo también dicen "fetch", así que van
  // antes de la regla general de conexión.
  if (esFalloDePrograma(texto)) {
    return new ErrorQuitarFondo(
      "programa",
      "Faltaba descargar una parte de la herramienta y no se pudo. Si estás sin conexión, conectate un momento; si no, recargá la página con Ctrl+F5. Tu imagen nunca se envía: lo que falta es el programa que la procesa.",
      detalle,
    );
  }
  if (esDescargaIncompleta(texto)) {
    return new ErrorQuitarFondo(
      "descarga-incompleta",
      "El modelo de IA llegó incompleto y el reintento sin usar la copia guardada tampoco funcionó. Suele pasar con una conexión inestable o en redes de oficina que cortan las descargas grandes (el modelo pesa entre 40 y 80 MB). Probá desde otra red, o desde el celular con datos móviles. Tu imagen no se envía a ningún lado.",
      detalle,
    );
  }
  if (/Failed to fetch|NetworkError|Load failed|fetch|ERR_|network/i.test(texto)) {
    // Si el navegador se sabe sin conexión, es eso y punto. Si dice que hay
    // conexión (y la hay: esta página cargó), mandar a "revisá tu internet" es
    // desorientar. Visto el 2026-09-23 en el iPhone del dueño: los tres
    // intentos fallaron igual, con la conexión perfecta y el CDN respondiendo
    // bien desde otras máquinas; el pedido no llegaba a salir del teléfono.
    const sinRed = typeof navigator !== "undefined" && navigator.onLine === false;
    return new ErrorQuitarFondo(
      "sin-conexion",
      sinRed
        ? "Estás sin conexión y esta herramienta necesita descargar el modelo de IA la primera vez. Conectate un momento y probá de nuevo. (Tu imagen no se envía a ningún lado: solo se descarga el modelo.)"
        : MENSAJE_SERVIDOR_MODELO,
      detalle,
    );
  }
  if (/memory|allocation|RangeError|Array buffer allocation/i.test(texto)) {
    return new ErrorQuitarFondo(
      "memoria",
      "La imagen es demasiado grande para la memoria disponible en tu dispositivo. Prueba con una imagen más chica o cierra otras pestañas.",
      detalle,
    );
  }
  return new ErrorQuitarFondo(
    "desconocido",
    "No pudimos procesar la imagen. Intenta de nuevo o prueba con otra foto.",
    detalle,
  );
}

function conTimeout<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(
      () => rechazar(new ErrorQuitarFondo("timeout", mensaje)),
      ms,
    );
    promesa.then(
      (v) => {
        clearTimeout(temporizador);
        resolver(v);
      },
      (e) => {
        clearTimeout(temporizador);
        rechazar(e);
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/* Función principal                                                    */
/* ------------------------------------------------------------------ */

const MENSAJE_TIMEOUT_DESCARGA =
  "La descarga del modelo está tardando demasiado. Revisa tu conexión e intenta de nuevo.";

/**
 * Afina el mensaje de "no pudimos traer el modelo" preguntándole al servidor
 * si contesta. Son dos problemas muy distintos y con soluciones distintas:
 * que algo bloquee los pedidos (bloqueador, VPN, filtro de red) o que la
 * descarga de 40 MB no haya podido completarse. Se consulta recién cuando ya
 * falló, así no agrega ningún pedido al camino normal.
 */
async function precisarElMensaje(e: ErrorQuitarFondo): Promise<ErrorQuitarFondo> {
  if (e.codigo !== "sin-conexion" || e.message !== MENSAJE_SERVIDOR_MODELO) return e;
  const responde = await servidorDelModeloResponde();
  return new ErrorQuitarFondo(
    e.codigo,
    responde ? MENSAJE_DESCARGA_PESADA : MENSAJE_BLOQUEADO,
    `${e.detalle ?? ""} · servidor ${responde ? "responde" : "no responde"}`,
  );
}

/**
 * Deja el modelo listo, con un reintento automático.
 *
 * Reportado por el dueño el 2026-09-23: le fallaba en dos dispositivos y
 * "Reintentar" no cambiaba nada. La causa es que un fallo de descarga queda
 * memorizado dentro de la librería (ver `intentoModelo`), así que el segundo
 * intento tiene que arrancar con otra config; de paso pide los trozos a la red
 * en vez de usar una copia que pudo quedar cortada en la caché del navegador.
 */
async function asegurarModelo(timeoutMs: number): Promise<void> {
  try {
    await conTimeout(precargarModelo(), timeoutMs, MENSAJE_TIMEOUT_DESCARGA);
    return;
  } catch (error) {
    if (error instanceof ErrorQuitarFondo && error.codigo === "timeout") throw error;
    const texto = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (!esDescargaIncompleta(texto) && !/Failed to fetch|NetworkError|Load failed/i.test(texto)) {
      throw error;
    }
    reiniciarProgreso();
    emitir(0, "La descarga vino incompleta. Reintentando…");
    await conTimeout(precargarModelo(), timeoutMs, MENSAJE_TIMEOUT_DESCARGA);
  }
}

export async function quitarFondo(
  archivo: File,
  opciones: OpcionesQuitarFondo = {},
): Promise<ResultadoQuitarFondo> {
  const {
    onProgreso,
    timeoutDescargaMs = 5 * 60_000,
    timeoutProcesoMs = 3 * 60_000,
  } = opciones;

  if (onProgreso) oyentes.add(onProgreso);
  try {
    if (typeof WebAssembly === "undefined" || typeof createImageBitmap === "undefined") {
      throw new ErrorQuitarFondo("navegador", MENSAJE_NAVEGADOR);
    }

    reiniciarProgreso();
    emitir(0, "Preparando…");

    // 1) Modelo listo (si ya está en memoria, esto termina al instante).
    await asegurarModelo(timeoutDescargaMs);

    // 2) Decodificar y, si hace falta, achicar la imagen.
    emitir(71, "Leyendo la imagen…");
    const imagen = await prepararImagen(archivo);

    // 3) Inferencia: acá trabaja la IA. Todo ocurre en el navegador.
    const lib = await cargarLibreria();
    const png = await conTimeout(
      lib.removeBackground(imagen.blob, configuracion()),
      timeoutProcesoMs,
      "El procesamiento tardó demasiado. Prueba con una imagen más chica.",
    );

    emitir(100, "¡Listo!");
    return { png, ancho: imagen.ancho, alto: imagen.alto, redimensionada: imagen.redimensionada };
  } catch (error) {
    throw await precisarElMensaje(aErrorAmigable(error));
  } finally {
    if (onProgreso) oyentes.delete(onProgreso);
  }
}

/** Nombre sugerido para la descarga: "foto.jpg" → "foto-sin-fondo.png". */
export function nombreResultado(nombreOriginal: string, modo: ModoFondo): string {
  const base = nombreOriginal.replace(/\.[^.]+$/, "").slice(0, 80) || "imagen";
  return modo === "blanco" ? `${base}-fondo-blanco.jpg` : `${base}-sin-fondo.png`;
}
