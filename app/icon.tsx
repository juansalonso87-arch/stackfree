import { ImageResponse } from "next/og";
import { Chispa } from "@/lib/og-image";

/** Favicon generado en el build (reemplaza al favicon.ico clásico). */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          background: "#4f46e5",
        }}
      >
        <Chispa size={40} />
      </div>
    ),
    size,
  );
}
