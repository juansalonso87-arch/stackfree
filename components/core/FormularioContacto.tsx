"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MOTIVOS_CONTACTO, PARAMETROS_CONTACTO, esMotivoContacto, type MotivoContacto } from "@/lib/contacto";

const CAMPO =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const OPCION_BANCO_NUEVO = "Un banco que no está";

interface Props {
  /** Clave pública de Web3Forms (NEXT_PUBLIC_WEB3FORMS_KEY). Sin clave, se ofrece el correo directo. */
  claveFormulario?: string;
  emailContacto: string;
  /** Herramientas para el selector "¿Sobre qué herramienta?" (el slug permite precargar desde la URL). */
  herramientas: { slug: string; nombre: string }[];
}

/**
 * Formulario de contacto sin servidor propio: el mensaje viaja al servicio
 * Web3Forms (gratuito), que lo reenvía por correo. Es la única página del
 * sitio con permiso para conectarse a un servicio externo (ver lib/csp.ts).
 *
 * Acepta parámetros en la URL (ver lib/contacto.ts) para llegar con el
 * motivo, la herramienta y un resumen técnico ya escritos: así, reportar
 * algo raro desde una herramienta es un clic y dos líneas.
 */
export function FormularioContacto({ claveFormulario, emailContacto, herramientas }: Props) {
  const parametros = useSearchParams();
  const motivoInicial: MotivoContacto = (() => {
    const m = parametros.get(PARAMETROS_CONTACTO.motivo);
    return esMotivoContacto(m) ? m : "error";
  })();
  const slugInicial = parametros.get(PARAMETROS_CONTACTO.herramienta) ?? "";
  const herramientaInicial =
    herramientas.find((h) => h.slug === slugInicial)?.nombre ?? (slugInicial ? OPCION_BANCO_NUEVO : "");
  const contexto = parametros.get(PARAMETROS_CONTACTO.contexto)?.trim();
  const mensajeInicial = contexto
    ? `${contexto}\n\n— Qué vi raro / qué esperaba: \n`
    : "";

  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [error, setError] = useState<string>();

  const asuntoMailto = (motivo: string, herramienta: string) =>
    encodeURIComponent(`[Sitio] ${motivo}${herramienta ? ` · ${herramienta}` : ""}`);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const datos = new FormData(form);
    // Trampa para bots: los humanos no ven este campo.
    if (datos.get("sitio_web")) return;

    const motivo = String(datos.get("motivo") ?? "");
    const herramienta = String(datos.get("herramienta") ?? "");
    if (!claveFormulario) {
      const cuerpo = encodeURIComponent(
        `Nombre: ${datos.get("nombre") ?? ""}\nMotivo: ${motivo}\nHerramienta: ${herramienta}\nNavegador: ${navigator.userAgent}\n\n${datos.get("mensaje") ?? ""}`,
      );
      window.location.href = `mailto:${emailContacto}?subject=${asuntoMailto(motivo, herramienta)}&body=${cuerpo}`;
      return;
    }

    setEstado("enviando");
    setError(undefined);
    try {
      const respuesta = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: claveFormulario,
          subject: `[Sitio] ${motivo}${herramienta ? ` · ${herramienta}` : ""}`,
          from_name: String(datos.get("nombre") || "Visitante del sitio"),
          name: datos.get("nombre"),
          email: datos.get("email"),
          motivo,
          herramienta,
          navegador: navigator.userAgent,
          message: datos.get("mensaje"),
          botcheck: "",
        }),
      });
      const json = (await respuesta.json()) as { success?: boolean; message?: string };
      if (!respuesta.ok || !json.success) throw new Error(json.message || "El servicio de correo no aceptó el mensaje.");
      setEstado("enviado");
      form.reset();
    } catch (err) {
      console.warn("[contacto]", err);
      setError("No se pudo enviar. Probá de nuevo en un momento o escribinos directamente por correo.");
      setEstado("error");
    }
  };

  if (estado === "enviado") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Mensaje enviado. ¡Gracias de verdad!</AlertTitle>
        <AlertDescription>
          Cada aviso nos sirve para que la herramienta funcione mejor para todos. Lo leemos y te respondemos al correo que
          indicaste.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setEstado("idle")}>
            Enviar otro
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium">
            Nombre
          </label>
          <input id="nombre" name="nombre" type="text" autoComplete="name" className={CAMPO} maxLength={80} />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Tu correo <span className="text-destructive">*</span>
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO} maxLength={120} />
        </div>
        <div className="space-y-1">
          <label htmlFor="motivo" className="text-sm font-medium">
            Motivo
          </label>
          <select id="motivo" name="motivo" className={CAMPO} defaultValue={MOTIVOS_CONTACTO[motivoInicial]}>
            {Object.values(MOTIVOS_CONTACTO).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="herramienta" className="text-sm font-medium">
            ¿Sobre qué herramienta?
          </label>
          <select id="herramienta" name="herramienta" className={CAMPO} defaultValue={herramientaInicial}>
            <option value="">— Ninguna en particular —</option>
            {herramientas.map((h) => (
              <option key={h.slug}>{h.nombre}</option>
            ))}
            <option>{OPCION_BANCO_NUEVO}</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="mensaje" className="text-sm font-medium">
          Mensaje <span className="text-destructive">*</span>
        </label>
        <textarea
          id="mensaje"
          name="mensaje"
          required
          rows={contexto ? 10 : 6}
          className={CAMPO}
          maxLength={4000}
          defaultValue={mensajeInicial}
          placeholder="Contanos qué pasó, con qué archivo (tipo y banco) y qué esperabas que hiciera."
        />
        <p className="text-xs text-muted-foreground">
          {contexto
            ? "Arriba va un resumen técnico del análisis (cantidades, sin importes ni datos personales); podés editarlo. Agregá abajo qué te pareció raro."
            : "No adjuntes ni pegues tu extracto: si querés compartir un ejemplo, quitale los datos personales primero."}
        </p>
      </div>
      {/* Campo trampa para bots (oculto para las personas). */}
      <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo enviar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={estado === "enviando"}>
          {estado === "enviando" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : claveFormulario ? <Send data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
          {estado === "enviando" ? "Enviando…" : claveFormulario ? "Enviar mensaje" : "Abrir en mi correo"}
        </Button>
        <span className="text-sm text-muted-foreground">
          o escribinos a{" "}
          <a href={`mailto:${emailContacto}`} className="underline underline-offset-2 hover:text-foreground">
            {emailContacto}
          </a>
        </span>
      </div>
    </form>
  );
}
