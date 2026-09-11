/**
 * Empaquetado ZIP en el navegador (fflate, MIT, ~8 KB).
 * Sin compresión: los archivos que agrupamos (imágenes, PDF) ya vienen
 * comprimidos y volver a comprimirlos solo gasta tiempo.
 */

export interface EntradaZip {
  nombre: string;
  blob: Blob;
}

export async function crearZip(entradas: EntradaZip[]): Promise<Blob> {
  const { zip } = await import("fflate");
  const archivos: Record<string, [Uint8Array, { level: 0 }]> = {};
  const usados = new Set<string>();
  for (const e of entradas) {
    // Evita nombres repetidos dentro del ZIP (foto.jpg, foto (2).jpg...).
    let nombre = e.nombre;
    let n = 2;
    while (usados.has(nombre)) {
      nombre = e.nombre.replace(/(\.[^.]+)$/, ` (${n++})$1`);
    }
    usados.add(nombre);
    archivos[nombre] = [new Uint8Array(await e.blob.arrayBuffer()), { level: 0 }];
  }
  const datos = await new Promise<Uint8Array>((resolver, rechazar) => {
    zip(archivos, (err, out) => (err ? rechazar(err) : resolver(out)));
  });
  return new Blob([datos as BlobPart], { type: "application/zip" });
}
