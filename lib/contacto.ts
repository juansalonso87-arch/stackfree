/**
 * Enlaces al formulario de contacto con los campos ya completados.
 *
 * Idea: cuando el usuario ve algo raro en una herramienta, un solo clic lo
 * lleva a /contacto con el motivo, la herramienta y un resumen técnico ya
 * escritos. Menos fricción → más devoluciones → menos errores con archivos
 * nuevos. El formulario lee estos parámetros de la URL (FormularioContacto).
 *
 * Nunca se incluyen importes ni datos del extracto en el contexto: solo
 * cantidades, nombres de controles y avisos.
 */

export type MotivoContacto = "error" | "banco" | "sugerencia" | "otro";

/** Texto visible de cada motivo (opciones del <select>). */
export const MOTIVOS_CONTACTO: Record<MotivoContacto, string> = {
  error: "Reportar un error o algo raro",
  banco: "Pedir un banco o una herramienta nueva",
  sugerencia: "Sugerencia",
  otro: "Otro",
};

/** Nombres de los parámetros que acepta /contacto. */
export const PARAMETROS_CONTACTO = {
  motivo: "motivo",
  herramienta: "herramienta",
  contexto: "contexto",
} as const;

/** Largo máximo del contexto en la URL (evita URLs enormes). */
const MAX_CONTEXTO = 1500;

export interface ParametrosContacto {
  motivo?: MotivoContacto;
  /** Slug de la herramienta (el de la URL /herramientas/<slug>). */
  herramienta?: string;
  /** Resumen técnico que se pega al inicio del mensaje. */
  contexto?: string;
}

/** Arma la ruta relativa a /contacto con los parámetros indicados. */
export function urlContacto(p: ParametrosContacto = {}): string {
  const q = new URLSearchParams();
  if (p.motivo) q.set(PARAMETROS_CONTACTO.motivo, p.motivo);
  if (p.herramienta) q.set(PARAMETROS_CONTACTO.herramienta, p.herramienta);
  if (p.contexto) q.set(PARAMETROS_CONTACTO.contexto, p.contexto.slice(0, MAX_CONTEXTO));
  const consulta = q.toString();
  return consulta ? `/contacto?${consulta}` : "/contacto";
}

/** "/herramientas/extracto-bbva" → "extracto-bbva"; cualquier otra ruta → undefined. */
export function slugDesdeRuta(pathname: string | null | undefined): string | undefined {
  const m = /^\/herramientas\/([a-z0-9-]+)\/?$/.exec(pathname ?? "");
  return m?.[1];
}

export function esMotivoContacto(valor: string | null | undefined): valor is MotivoContacto {
  return !!valor && valor in MOTIVOS_CONTACTO;
}
