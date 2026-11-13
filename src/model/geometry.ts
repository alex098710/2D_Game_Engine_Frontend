import { SIZES, WORLD_HEIGHT, WORLD_WIDTH, type Kind } from "./GameObject";

/** Snap a centre coordinate so the object sits exactly on grid cells. */
export function snap(value: number, kind: Kind, grid: number): number {
  const size = SIZES[kind][0];
  // Objects as big as the grid (or bigger) align their edges; small ones their centre.
  const offset = size >= grid ? (size / 2) % grid : grid / 2;
  return Math.round((value - offset) / grid) * grid + offset;
}

/** Move a centre so the whole object stays inside the world. */
export function clampToWorld(x: number, y: number, kind: Kind): [number, number] {
  const [w, h] = SIZES[kind];
  return [
    Math.min(WORLD_WIDTH - w / 2, Math.max(w / 2, x)),
    Math.min(WORLD_HEIGHT - h / 2, Math.max(h / 2, y)),
  ];
}

/** Largest zoom that shows the whole world inside a viewport, with a small margin. */
export function fitZoom(viewWidth: number, viewHeight: number, margin = 24): number {
  const zoom = Math.min((viewWidth - margin * 2) / WORLD_WIDTH, (viewHeight - margin * 2) / WORLD_HEIGHT);
  return Math.max(0.1, Math.round(zoom * 100) / 100);
}

/** Zoom at which the world fills the whole view (no empty bands); the rest is reached by panning. */
export function coverZoom(viewWidth: number, viewHeight: number): number {
  const zoom = Math.max(viewWidth / WORLD_WIDTH, viewHeight / WORLD_HEIGHT);
  return Math.max(0.1, Math.ceil(zoom * 100) / 100);
}

/** True when two objects' boxes intersect. */
export function overlaps(a: { kind: Kind; x: number; y: number }, b: { kind: Kind; x: number; y: number }): boolean {
  const [aw, ah] = SIZES[a.kind];
  const [bw, bh] = SIZES[b.kind];
  return Math.abs(a.x - b.x) < (aw + bw) / 2 && Math.abs(a.y - b.y) < (ah + bh) / 2;
}
