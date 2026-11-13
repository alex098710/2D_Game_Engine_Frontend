import { iconUrl, TEXTURE_BASE } from "../game/assets";
import { isGround, SIZES, WORLD_HEIGHT, WORLD_WIDTH, type GameObject, type Kind } from "../model/GameObject";

/**
 * A picture of a level drawn with the game's own textures (not coloured
 * boxes), for the home screen: either a close view around the hero, like a
 * screenshot of the editor, or the whole world as a small thumbnail.
 */

const images = new Map<string, Promise<HTMLImageElement | null>>();

function load(url: string): Promise<HTMLImageElement | null> {
  let image = images.get(url);
  if (image === undefined) {
    image = new Promise((resolve) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => resolve(null);
      element.src = url;
    });
    images.set(url, image);
  }
  return image;
}

/** The hero stands in for the "player" marker, so the picture shows a real character. */
function urlOf(kind: Kind): string {
  return kind === "player" ? `${TEXTURE_BASE}hero-knight-idle.png` : iconUrl(kind);
}

/** The part of the world a close view shows: centred on the hero (or the middle of the map), inside the world. */
export function viewAround(scene: readonly GameObject[], width: number, height: number): { x: number; y: number; width: number; height: number } {
  const player = scene.find((object) => object.kind === "player");
  const centreX = player?.x ?? (scene.length ? scene.reduce((sum, o) => sum + o.x, 0) / scene.length : WORLD_WIDTH / 2);
  const centreY = player?.y ?? (scene.length ? scene.reduce((sum, o) => sum + o.y, 0) / scene.length : WORLD_HEIGHT / 2);
  const w = Math.min(width, WORLD_WIDTH);
  const h = Math.min(height, WORLD_HEIGHT);
  return {
    x: Math.min(Math.max(centreX - w / 2, 0), WORLD_WIDTH - w),
    y: Math.min(Math.max(centreY - h / 2, 0), WORLD_HEIGHT - h),
    width: w,
    height: h,
  };
}

/**
 * Draw `scene` on `canvas` with the textures: the whole world, or only `view`
 * (world pixels) scaled to fill the canvas. Pixel art stays crisp.
 */
export async function drawLevel(canvas: HTMLCanvasElement, scene: readonly GameObject[], view = { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }): Promise<void> {
  const context = canvas.getContext("2d");
  if (context === null) return;
  const kinds = [...new Set(scene.map((object) => object.kind))];
  const [grass, ...pictures] = await Promise.all([load(`${TEXTURE_BASE}grass.png`), ...kinds.map((kind) => load(urlOf(kind)))]);
  const pictureOf = new Map(kinds.map((kind, i) => [kind, pictures[i]]));
  const scale = Math.min(canvas.width / view.width, canvas.height / view.height);
  context.imageSmoothingEnabled = false;
  context.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
  // Grass under everything, tile by tile.
  if (grass) {
    const tile = grass.naturalWidth || 32;
    for (let x = Math.floor(view.x / tile) * tile; x < view.x + view.width; x += tile) {
      for (let y = Math.floor(view.y / tile) * tile; y < view.y + view.height; y += tile) context.drawImage(grass, x, y, tile, tile);
    }
  } else {
    context.fillStyle = "#8fbf6a";
    context.fillRect(view.x, view.y, view.width, view.height);
  }
  // Ground and water first, then the rest from back to front (like the game's depth).
  const flat = (kind: Kind) => isGround(kind) || kind === "water";
  const ordered = [...scene.filter((o) => flat(o.kind)), ...scene.filter((o) => !flat(o.kind)).sort((a, b) => a.y - b.y)];
  for (const object of ordered) {
    const [width, height] = SIZES[object.kind] ?? [32, 32];
    if (object.x + width < view.x || object.x - width > view.x + view.width || object.y + height < view.y || object.y - height > view.y + view.height) continue;
    const picture = pictureOf.get(object.kind);
    if (!picture) continue;
    const w = picture.naturalWidth || width;
    const h = picture.naturalHeight || height;
    context.drawImage(picture, Math.round(object.x - w / 2), Math.round(object.y - h / 2), w, h);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
}

/** A small level for the home screen when the player has no project yet: a village with a hero. */
export const SAMPLE_SCENE: GameObject[] = [
  { id: "h", kind: "house", x: 640, y: 420 }, { id: "t1", kind: "tree", x: 560, y: 380 }, { id: "t2", kind: "tree", x: 940, y: 360 },
  { id: "t3", kind: "tree", x: 980, y: 560 }, { id: "b1", kind: "bush", x: 600, y: 560 }, { id: "f1", kind: "fence", x: 720, y: 520 },
  { id: "f2", kind: "fence", x: 752, y: 520 }, { id: "p1", kind: "path", x: 800, y: 480 }, { id: "p2", kind: "path", x: 832, y: 480 },
  { id: "p3", kind: "path", x: 864, y: 480 }, { id: "c", kind: "chest", x: 900, y: 470 }, { id: "s", kind: "enemy", x: 1000, y: 470 },
  { id: "k", kind: "coin", x: 860, y: 420 }, { id: "player-1", kind: "player", x: 800, y: 470 }, { id: "w", kind: "water", x: 700, y: 620 },
  { id: "w2", kind: "water", x: 732, y: 620 }, { id: "r", kind: "rock", x: 1040, y: 400 },
];
