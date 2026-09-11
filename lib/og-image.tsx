import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

export const tamanoOg = { width: 1200, height: 630 };

/** Estrella de 4 puntas dibujada como SVG (no depende de fuentes del sistema). */
export function Chispa({ size = 28, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" />
    </svg>
  );
}

/**
 * Genera la imagen que se ve al compartir un link en WhatsApp, Twitter,
 * Facebook, etc. Se dibuja con JSX + estilos simples (limitaciones de la
 * librería: solo flexbox, sin CSS externo).
 */
export function generarImagenOg({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #312e81 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, opacity: 0.9 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#6366f1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Chispa size={26} />
          </div>
          {siteConfig.nombre}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 30, opacity: 0.8, lineHeight: 1.35 }}>{subtitulo}</div>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 24 }}>
          {["Gratis", "Sin registro", "Sin subir archivos"].map((t) => (
            <div
              key={t}
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    tamanoOg,
  );
}
