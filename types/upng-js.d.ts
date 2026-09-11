/** Tipos mínimos para upng-js (la librería no los incluye). */
declare module "upng-js" {
  interface UPNG {
    /**
     * Codifica una o más imágenes RGBA como PNG.
     * @param frames  Buffers RGBA (uno por cuadro; uno solo para imagen fija)
     * @param width   Ancho en px
     * @param height  Alto en px
     * @param colors  Cantidad de colores (0 = sin pérdida, 256 = paleta de 256)
     * @param delays  Duración de cada cuadro (solo animaciones)
     */
    encode(frames: ArrayBuffer[], width: number, height: number, colors: number, delays?: number[]): ArrayBuffer;
    decode(buffer: ArrayBuffer): { width: number; height: number; depth: number; ctype: number; frames: unknown[]; data: Uint8Array };
    toRGBA8(img: ReturnType<UPNG["decode"]>): ArrayBuffer[];
  }
  const upng: UPNG;
  export default upng;
}
