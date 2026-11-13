import type Phaser from "phaser";

/**
 * The account's own pictures (uploaded in the admin panel). The server only
 * ever sends back the clean copy it rebuilt after its security check (see
 * 2D_Game_Engine/app/admin/sprite_scan.py), as a PNG data URL.
 *
 * A creation that uses a picture is drawn with it instead of its base's
 * drawing. In the game the picture is fitted into a texture of exactly the
 * base's frame size, so it is a drop-in replacement: same collision box,
 * scale and position as the drawing it replaces.
 */
export interface SpriteDto {
  id: number;
  name: string;
  width: number;
  height: number;
  data_url: string;
  created_at?: string;
  /** The checks the upload passed (only in the answer to an upload). */
  checks?: string[];
}

let sprites = new Map<number, SpriteDto>();
const images = new Map<number, HTMLImageElement>();

/** Only data URLs of PNG pictures are accepted, whatever an answer says. */
function isPngDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/png;base64,");
}

/** Replace the account's pictures (after login, after an upload or a delete). */
export function setSprites(list: readonly SpriteDto[]): void {
  sprites = new Map(list.filter((sprite) => isPngDataUrl(sprite.data_url)).map((sprite) => [sprite.id, sprite]));
  for (const id of [...images.keys()]) if (!sprites.has(id)) images.delete(id);
  for (const sprite of sprites.values()) {
    if (images.has(sprite.id)) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = sprite.data_url;
    images.set(sprite.id, image);
  }
}

export function currentSprites(): SpriteDto[] {
  return [...sprites.values()];
}

export function spriteById(id: number | null | undefined): SpriteDto | undefined {
  return id === null || id === undefined ? undefined : sprites.get(id);
}

/** The picture as a URL for <img> and CSS, or null if the account has no such picture. */
export function spriteUrl(id: number | null | undefined): string | null {
  return spriteById(id)?.data_url ?? null;
}

/** Wait until every picture can be drawn (they are small data URLs: this is quick). */
export async function spritesReady(): Promise<void> {
  await Promise.all([...images.values()].map((image) => image.decode().catch(() => undefined)));
}

/**
 * The texture key to draw a creation with: its picture fitted into a frame the
 * size of `baseKey`'s (made once per size), or `baseKey` if there is no picture
 * or it is not loaded yet.
 */
export function spriteTexture(scene: Phaser.Scene, spriteId: number | null | undefined, baseKey: string): string {
  const image = spriteId === null || spriteId === undefined ? undefined : images.get(spriteId);
  if (image === undefined || !image.complete || image.naturalWidth === 0 || !scene.textures.exists(baseKey)) return baseKey;
  const frame = scene.textures.getFrame(baseKey);
  const width = Math.max(1, Math.round(frame.realWidth));
  const height = Math.max(1, Math.round(frame.realHeight));
  const key = `sprite-${spriteId}-${width}x${height}`;
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, width, height);
  if (canvas === null) return baseKey;
  const context = canvas.getContext();
  context.imageSmoothingEnabled = false;
  // Fit the whole picture inside the frame, centred on the bottom (feet on the ground).
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  context.drawImage(image, Math.floor((width - drawWidth) / 2), height - drawHeight, drawWidth, drawHeight);
  canvas.refresh();
  return key;
}
