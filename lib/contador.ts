/**
 * Contador de usos de cada herramienta.
 *
 * Qué cuenta: un archivo procesado de punta a punta (el estado "listo" de
 * `ProcessingCard`). No cuenta visitas, no cuenta clics: cuenta trabajo hecho.
 *
 * Qué NO viaja: nada del archivo. El navegador le manda al servidor una sola
 * cosa — el slug de la herramienta ("extracto-bbva") — y recibe el total. Ni
 * el nombre, ni el tamaño, ni el contenido, ni un identificador del usuario.
 * Por eso la CSP sigue siendo `connect-src 'self'`: el pedido va a nuestro
 * propio dominio y a ningún otro (ver /verificar-privacidad).
 *
 * Dónde se guarda: en el servidor (`app/api/usos/route.ts`). Si no hay base
 * configurada, la API contesta `ok: false` y el contador no se muestra: el
 * sitio funciona exactamente igual que sin esta función.
 */

/** Respuesta de /api/usos. `ok: false` = no hay contador disponible. */
export interface RespuestaUsos {
  ok: boolean;
  /** Usos de la herramienta pedida. */
  usos?: number;
  /** Usos de todas las herramientas juntas. */
  total?: number;
}

/**
 * Debajo de este número no se muestra nada.
 *
 * Un contador honesto que diga "se usó 7 veces" espanta más de lo que
 * convence: el número recién funciona como prueba social cuando es grande.
 * Mientras tanto la insignia simplemente no aparece (no se inventa ningún
 * número). Para verlo igual mientras el sitio es nuevo: agregar `?contador=1`
 * a la dirección de la página.
 */
export const MINIMO_PARA_MOSTRAR = 100;

/**
 * Tope de usos que un mismo navegador puede sumar por día **y por herramienta**.
 *
 * Es por herramienta a propósito: con un tope compartido, alguien que procesa
 * quince extractos por la mañana dejaba de sumar en todo lo que usara después,
 * sin enterarse. El tope está para que nadie infle el número apretando en bucle,
 * no para castigar a quien de verdad trabaja con varias herramientas el mismo día.
 */
const TOPE_DIARIO = 20;
const CLAVE_TOPE = "planillar:usos-hoy:";

/** Evento interno para que la insignia se actualice apenas termina un uso. */
const EVENTO = "planillar:usos";

/** 1284 → "1.284" */
export function formatearUsos(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

/** Hoy en formato aaaa-mm-dd, para el tope diario por navegador. */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ¿Este navegador ya sumó demasiados usos hoy en esta herramienta? Evita que una
 * sola persona apretando "analizar otro archivo" en bucle infle el número. No
 * identifica a nadie: es un número en el almacenamiento local del propio navegador.
 */
function superoElTope(slug: string): boolean {
  try {
    const clave = CLAVE_TOPE + slug;
    const crudo = window.localStorage.getItem(clave);
    const [dia, cantidad] = (crudo ?? "").split("|");
    if (dia !== hoy()) {
      window.localStorage.setItem(clave, `${hoy()}|1`);
      return false;
    }
    const n = Number(cantidad) || 0;
    if (n >= TOPE_DIARIO) return true;
    window.localStorage.setItem(clave, `${hoy()}|${n + 1}`);
    return false;
  } catch {
    // Navegación privada con el almacenamiento bloqueado: se cuenta igual.
    return false;
  }
}

async function pedir(opciones: RequestInit & { url: string }): Promise<RespuestaUsos> {
  const { url, ...init } = opciones;
  try {
    const r = await fetch(url, init);
    if (!r.ok) return { ok: false };
    return (await r.json()) as RespuestaUsos;
  } catch {
    // Sin conexión (el caso del short de privacidad) o con un bloqueador:
    // el contador no aparece y la herramienta sigue funcionando igual.
    return { ok: false };
  }
}

/** Lee cuántas veces se usó una herramienta. */
export function leerUsos(slug: string): Promise<RespuestaUsos> {
  return pedir({ url: `/api/usos?h=${encodeURIComponent(slug)}` });
}

/** Suma un uso y avisa a la insignia para que se actualice en el momento. */
export async function registrarUso(slug: string): Promise<RespuestaUsos> {
  if (typeof window === "undefined") return { ok: false };
  if (superoElTope(slug)) return { ok: false };

  const r = await pedir({
    url: "/api/usos",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ h: slug }),
    // Si el usuario cierra la pestaña justo después, el pedido igual sale.
    keepalive: true,
  });

  if (r.ok && typeof r.usos === "number") {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { slug, usos: r.usos } }));
  }
  return r;
}

/** Escucha los usos que se registran mientras la página está abierta. */
export function alRegistrarUso(
  cb: (datos: { slug: string; usos: number }) => void,
): () => void {
  const manejar = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(EVENTO, manejar);
  return () => window.removeEventListener(EVENTO, manejar);
}
