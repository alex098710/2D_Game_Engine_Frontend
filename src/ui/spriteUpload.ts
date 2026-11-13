/**
 * Get a picture ready to upload, in the browser, before anything is sent.
 *
 * The browser's own checks come first (so a wrong file is refused at once):
 * the type must be PNG, JPG, GIF or WebP by its first bytes (not by its name),
 * at most MAX_FILE_BYTES, and the browser must be able to decode it as a
 * picture. Then it is redrawn on a canvas, at most MAX_SIDE pixels per side,
 * and exported as a fresh PNG: metadata and anything else in the file stay
 * behind. The server checks the PNG again in full and keeps only its own clean
 * copy (2D_Game_Engine/app/admin/sprite_scan.py); this step never replaces it.
 */

export const MAX_FILE_BYTES = 5_000_000;
/** Sprites are small: big pictures are scaled down to this, keeping their shape. */
export const MAX_SIDE = 128;
const MIN_SIDE = 16;

export class UploadError extends Error {}

/** The format by the file's first bytes, or null if it is not one we accept. */
export function sniffImage(bytes: Uint8Array): "png" | "jpeg" | "gif" | "webp" | null {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0xff, 0xd8, 0xff)) return "jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

/** The size a picture is drawn at: big ones shrink to MAX_SIDE, tiny ones grow to MIN_SIDE (whole pixels). */
export function fittedSize(width: number, height: number): { width: number; height: number; smooth: boolean } {
  const longest = Math.max(width, height);
  if (longest > MAX_SIDE) {
    const scale = MAX_SIDE / longest;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), smooth: scale < 0.5 };
  }
  if (Math.min(width, height) < MIN_SIDE) {
    const scale = Math.ceil(MIN_SIDE / Math.min(width, height));
    return { width: Math.min(MAX_SIDE, width * scale), height: Math.min(MAX_SIDE, height * scale), smooth: false };
  }
  return { width, height, smooth: false };
}

/** A suggested name from the file name: "mi_dragon-final.png" -> "mi dragon final". */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || "Mi imagen").slice(0, 24);
}

/** The upload: a clean PNG as base64 (no "data:" prefix) and its size. */
export async function prepareSprite(file: File): Promise<{ data: string; width: number; height: number }> {
  if (file.size === 0) throw new UploadError("El archivo está vacío.");
  if (file.size > MAX_FILE_BYTES) throw new UploadError("La imagen pesa más de 5 MB. Usa una más pequeña.");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (sniffImage(head) === null) throw new UploadError("Ese archivo no es una imagen PNG, JPG, GIF o WebP.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UploadError("No se pudo leer la imagen: puede estar dañada.");
  }
  const size = fittedSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new UploadError("Tu navegador no pudo preparar la imagen.");
  context.imageSmoothingEnabled = size.smooth;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const url = canvas.toDataURL("image/png");
  return { data: url.slice(url.indexOf(",") + 1), width: size.width, height: size.height };
}
