/**
 * Contador de usos de las herramientas.
 *
 * Es lo único del sitio que guarda algo en un servidor, y lo que guarda es un
 * número por herramienta: cuántas veces se procesó un archivo. Nada del
 * archivo llega acá (ver `lib/contador.ts` y /verificar-privacidad).
 *
 * Base de datos: Redis por HTTP (Upstash, plan gratuito; en Vercel se crea
 * desde Storage y las variables quedan puestas solas). Se aceptan los dos
 * juegos de nombres, el de Vercel KV y el de Upstash. **Sin variables no hay
 * contador**: la API contesta `ok: false` y la insignia no se muestra, así el
 * sitio nunca depende de esto para funcionar.
 */
import { NextResponse } from "next/server";
import { obtenerPagina } from "@/lib/tools-registry";
import type { RespuestaUsos } from "@/lib/contador";

export const dynamic = "force-dynamic";

const PREFIJO = "usos:v1:";
const CLAVE_TOTAL = `${PREFIJO}total`;

function credenciales(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/**
 * Respaldo para desarrollo: sin base configurada y fuera de producción, el
 * contador vive en la memoria del proceso. Sirve para ver la insignia
 * funcionando con `next dev`; los números se pierden al reiniciar.
 */
const enMemoria = new Map<string, number>();
const hayRespaldoLocal = process.env.NODE_ENV !== "production";

/** Manda varios comandos de Redis en un solo viaje. */
async function comandos(cmds: string[][]): Promise<number[] | null> {
  const cred = credenciales();
  if (!cred) return null;
  try {
    const r = await fetch(`${cred.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${cred.token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const datos = (await r.json()) as { result?: unknown; error?: string }[];
    return datos.map((d) => Number(d?.result) || 0);
  } catch {
    return null;
  }
}

/**
 * El slug que llega del navegador se valida contra el registry y se lleva a la
 * herramienta base: así una variante ("webp-a-jpg") suma en la herramienta a la
 * que pertenece y nadie puede inventar claves nuevas escribiendo cualquier cosa.
 */
function herramientaValida(slug: unknown): string | null {
  if (typeof slug !== "string" || slug.length > 80) return null;
  const pagina = obtenerPagina(slug);
  return pagina ? pagina.herramienta.slug : null;
}

function respuesta(datos: RespuestaUsos, cache?: string) {
  return NextResponse.json(datos, {
    headers: cache ? { "cache-control": cache } : { "cache-control": "no-store" },
  });
}

/** GET /api/usos?h=extracto-bbva → cuántas veces se usó. */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("h");
  const clave = slug ? herramientaValida(slug) : null;
  if (slug && !clave) return respuesta({ ok: false });

  const cmds = clave
    ? [["GET", PREFIJO + clave], ["GET", CLAVE_TOTAL]]
    : [["GET", CLAVE_TOTAL]];
  const r = await comandos(cmds);

  if (!r) {
    if (!hayRespaldoLocal) return respuesta({ ok: false });
    const usos = clave ? (enMemoria.get(clave) ?? 0) : undefined;
    return respuesta({ ok: true, usos, total: enMemoria.get("total") ?? 0 });
  }

  // 60 segundos en la caché de Vercel: el número no necesita estar al segundo
  // y así una visita con mucho tráfico no golpea la base en cada carga.
  return respuesta(
    clave ? { ok: true, usos: r[0], total: r[1] } : { ok: true, total: r[0] },
    "public, s-maxage=60, stale-while-revalidate=600",
  );
}

/** POST /api/usos {"h":"extracto-bbva"} → suma un uso y devuelve el total. */
export async function POST(request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return respuesta({ ok: false });
  }
  const clave = herramientaValida((cuerpo as { h?: unknown })?.h);
  if (!clave) return respuesta({ ok: false });

  const r = await comandos([["INCR", PREFIJO + clave], ["INCR", CLAVE_TOTAL]]);

  if (!r) {
    if (!hayRespaldoLocal) return respuesta({ ok: false });
    const usos = (enMemoria.get(clave) ?? 0) + 1;
    const total = (enMemoria.get("total") ?? 0) + 1;
    enMemoria.set(clave, usos);
    enMemoria.set("total", total);
    return respuesta({ ok: true, usos, total });
  }

  return respuesta({ ok: true, usos: r[0], total: r[1] });
}
