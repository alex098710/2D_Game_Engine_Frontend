import { TEXTURE_BASE } from "../game/assets";
import { prefersReducedMotion } from "./fx";

/**
 * The backdrop of the access screen: a small battlefield drawn with the
 * engine's own textures (Kenney Tiny Battle, Tiny Town and OpenGameArt, CC0).
 *
 * Two camps face each other across a river: the blue army advances from the
 * left, the red army holds the right. Soldiers trade tracer fire, artillery
 * shells arc over and explode, planes cross the sky and the camera drifts
 * slowly from side to side.
 *
 * Pixel art never stretches: the canvas is resized to its box times the
 * device pixel ratio on every resize or rotation, and every tile is drawn at
 * a whole-number scale with smoothing off.
 */

const TEXTURES = [
  "grass", "road", "water", "bridge", "sandbag", "bunker", "tower", "hedgehog", "rock", "tree", "bush",
  "flag", "banner", "ally", "guard", "soldier", "legionary", "grenadier", "tank", "tank-blue", "artillery",
  "jeep-blue", "plane-blue", "plane-red", "explosive", "box",
  "explosion-1", "explosion-2", "explosion-3", "explosion-4", "explosion-5",
] as const;
type Texture = (typeof TEXTURES)[number];

/** Size of a source texture (they are all 16 px tiles drawn at 2x). */
const SOURCE = 32;

interface Prop { texture: Texture; col: number; row: number }
interface Unit {
  texture: Texture;
  x: number; // world px
  y: number;
  home: number;
  side: -1 | 1; // -1: blue (left), 1: red (right)
  nextShot: number;
  phase: number;
}
interface Tracer { x1: number; y1: number; x2: number; y2: number; life: number; color: string }
interface Shell { x1: number; y1: number; x2: number; y2: number; t: number; duration: number }
interface Blast { x: number; y: number; t: number; size: number }
interface Plane { texture: Texture; x: number; y: number; speed: number }

/** A small seeded random generator, so the same window size always gives the same field. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whole-number scale for a 32 px texture so a tile is about `cssTile` CSS pixels. */
export function tileScale(cssTile: number, ratio: number): number {
  return Math.max(1, Math.round((cssTile * ratio) / SOURCE));
}

export class BattleDiorama {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly images = new Map<Texture, HTMLImageElement>();
  private readonly observer: ResizeObserver | null;
  private frameId = 0;
  private last = 0;
  private time = 0;
  private running = false;
  // Layout, in device pixels.
  private tile = 64;
  private cols = 0;
  private rows = 0;
  private width = 0;
  private height = 0;
  private pan = 0;
  private props: Prop[] = [];
  private ground: Prop[] = [];
  private units: Unit[] = [];
  private tracers: Tracer[] = [];
  private shells: Shell[] = [];
  private blasts: Blast[] = [];
  private planes: Plane[] = [];
  private nextShell = 1600;
  private nextPlane = 2500;
  private random = seeded(7);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    for (const name of TEXTURES) {
      const image = new Image();
      image.src = `${TEXTURE_BASE}${name}.png`;
      image.onload = () => {
        if (!this.running) this.draw();
      };
      this.images.set(name, image);
    }
    this.observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resize());
    this.observer?.observe(canvas);
    window.addEventListener("orientationchange", () => this.resize());
  }

  start(): void {
    this.resize();
    if (this.running || prefersReducedMotion()) {
      this.draw();
      return;
    }
    this.running = true;
    this.last = performance.now();
    this.frameId = requestAnimationFrame((now) => this.frame(now));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  /** Rebuild the field for the new size: a wider window gets a wider battle, never a stretched one. */
  private resize(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const box = this.canvas.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.width = Math.round(box.width * ratio);
    this.height = Math.round(box.height * ratio);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    // Bigger tiles on big screens, smaller on phones; always a whole multiple of the pixel art.
    // 32 CSS px per tile: the textures' own size, so a 16 px sprite pixel is 2 x 2 on screen.
    this.tile = SOURCE * tileScale(32, ratio);
    this.cols = Math.ceil(this.width / this.tile) + 10; // extra columns to drift over
    this.rows = Math.ceil(this.height / this.tile) + 1;
    this.layout();
    this.draw();
  }

  /** Where everything stands: the river, the roads, both camps and the no man's land. */
  private layout(): void {
    const rnd = (this.random = seeded(this.cols * 97 + this.rows));
    const { cols, rows } = this;
    const river = Math.floor(cols / 2);
    const road = Math.max(2, Math.round(rows * 0.62));
    this.ground = [];
    this.props = [];
    this.units = [];
    for (let r = 0; r < rows; r++) {
      this.ground.push({ texture: "water", col: river, row: r });
      this.ground.push({ texture: "water", col: river + 1, row: r });
    }
    for (let c = 0; c < cols; c++) {
      if (c === river || c === river + 1) this.ground.push({ texture: "bridge", col: c, row: road });
      else this.ground.push({ texture: "road", col: c, row: road });
    }
    const taken = new Set<string>();
    const free = (c: number, r: number) =>
      c >= 0 && r >= 0 && c < cols && r < rows && c !== river && c !== river + 1 && r !== road && !taken.has(`${c},${r}`);
    const place = (texture: Texture, c: number, r: number) => {
      if (!free(c, r)) return;
      taken.add(`${c},${r}`);
      this.props.push({ texture, col: c, row: r });
    };
    // Sandbag lines in front of each camp, open where the road passes.
    const blueLine = river - 4;
    const redLine = river + 5;
    for (let r = 1; r < rows - 1; r++) {
      if (Math.abs(r - road) <= 0) continue;
      if (r % 5 !== 0 && r % 5 !== 3) {
        place("sandbag", blueLine, r);
        place("sandbag", redLine, r);
      }
    }
    // Camps: bunkers, towers and flags.
    place("bunker", blueLine - 4, road - 2);
    place("tower", blueLine - 7, Math.max(1, road - 4));
    place("flag", blueLine - 2, road - 1);
    place("jeep-blue", blueLine - 5, road + 1);
    place("bunker", redLine + 4, road - 2);
    place("tower", redLine + 7, Math.max(1, road - 4));
    place("banner", redLine + 2, road - 1);
    place("artillery", redLine + 3, road + 2);
    place("explosive", redLine - 1, road + 2);
    place("box", blueLine - 1, road + 2);
    // No man's land: hedgehogs and hills; trees along the top and bottom edges.
    for (let i = 0; i < Math.max(4, Math.round(rows * 0.6)); i++) {
      const c = blueLine + 1 + Math.floor(rnd() * (redLine - blueLine - 1));
      const r = Math.floor(rnd() * rows);
      place(rnd() < 0.6 ? "hedgehog" : "rock", c, r);
    }
    for (let c = 0; c < cols; c++) {
      if (rnd() < 0.55) place(rnd() < 0.7 ? "tree" : "bush", c, 0);
      if (rnd() < 0.55) place(rnd() < 0.7 ? "tree" : "bush", c, rows - 1);
    }
    // Soldiers in both trenches.
    const t = this.tile;
    for (let r = 2; r < rows - 1; r += 3) {
      if (r === road) continue;
      const jitter = () => (rnd() - 0.5) * t * 0.3;
      this.units.push({ texture: rnd() < 0.5 ? "ally" : "guard", x: (blueLine - 1) * t + t / 2 + jitter(), y: r * t + t / 2, home: (blueLine - 1) * t + t / 2, side: -1, nextShot: rnd() * 2000, phase: rnd() * 6 });
      this.units.push({ texture: rnd() < 0.6 ? "soldier" : rnd() < 0.5 ? "legionary" : "grenadier", x: (redLine + 1) * t + t / 2 + jitter(), y: r * t + t / 2, home: (redLine + 1) * t + t / 2, side: 1, nextShot: rnd() * 2000, phase: rnd() * 6 });
    }
    // The tanks hold the road.
    this.units.push({ texture: "tank-blue", x: (blueLine - 2) * t, y: road * t + t / 2, home: (blueLine - 2) * t, side: -1, nextShot: 1200, phase: 0 });
    this.units.push({ texture: "tank", x: (redLine + 2) * t + t, y: road * t + t / 2, home: (redLine + 2) * t + t, side: 1, nextShot: 2400, phase: 1 });
  }

  private frame(now: number): void {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    if (this.running) this.frameId = requestAnimationFrame((next) => this.frame(next));
  }

  private update(dt: number): void {
    const t = this.tile;
    const extra = Math.max(0, this.cols * t - this.width);
    // Drift slowly across the field and back (a full sweep takes about 40 s).
    this.pan = extra * (0.5 - 0.5 * Math.cos((this.time / 40000) * Math.PI * 2));
    const rnd = this.random;
    for (const unit of this.units) {
      // Small steps forward and back, like soldiers shifting in the trench.
      unit.x = unit.home + Math.sin(this.time / 1400 + unit.phase) * t * 0.12;
      unit.nextShot -= dt;
      if (unit.nextShot <= 0) {
        const foes = this.units.filter((u) => u.side !== unit.side);
        const target = foes[Math.floor(rnd() * foes.length)];
        if (target) {
          const tank = unit.texture === "tank" || unit.texture === "tank-blue";
          this.tracers.push({
            x1: unit.x + unit.side * -t * 0.3, y1: unit.y - t * 0.1, x2: target.x + (rnd() - 0.5) * t, y2: target.y + (rnd() - 0.5) * t * 0.6,
            life: tank ? 260 : 140, color: unit.side < 0 ? "rgba(140,210,255," : "rgba(255,190,110,",
          });
          if (tank) this.blasts.push({ x: target.x + (rnd() - 0.5) * t, y: target.y, t: 0, size: 1.4 });
        }
        unit.nextShot = 900 + rnd() * 2600;
      }
    }
    this.nextShell -= dt;
    if (this.nextShell <= 0) {
      const from = this.units.find((u) => u.texture === "artillery") ?? this.units[this.units.length - 1];
      const x2 = (this.cols / 2 - 6 + rnd() * 8) * t;
      const y2 = (1 + rnd() * (this.rows - 2)) * t;
      const startX = from ? from.x : this.cols * t * 0.7;
      const startY = from ? from.y : t * 3;
      this.shells.push({ x1: startX, y1: startY, x2, y2, t: 0, duration: 1100 });
      this.nextShell = 1800 + rnd() * 2200;
    }
    this.nextPlane -= dt;
    if (this.nextPlane <= 0) {
      const blue = rnd() < 0.5;
      this.planes.push({ texture: blue ? "plane-blue" : "plane-red", x: blue ? this.pan - t * 2 : this.pan + this.width + t * 2, y: (0.6 + rnd() * (this.rows - 2)) * t, speed: (blue ? 1 : -1) * t * 4.2 });
      this.nextPlane = 7000 + rnd() * 6000;
    }
    for (const tracer of this.tracers) tracer.life -= dt;
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    for (const shell of this.shells) shell.t += dt;
    for (const shell of this.shells.filter((s) => s.t >= s.duration)) this.blasts.push({ x: shell.x2, y: shell.y2, t: 0, size: 2.2 });
    this.shells = this.shells.filter((s) => s.t < s.duration);
    for (const blast of this.blasts) blast.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < 5 * 70);
    for (const plane of this.planes) plane.x += (plane.speed * dt) / 1000;
    this.planes = this.planes.filter((p) => p.x > this.pan - t * 4 && p.x < this.pan + this.width + t * 4);
  }

  private image(name: Texture): HTMLImageElement | null {
    const image = this.images.get(name);
    return image && image.complete && image.naturalWidth > 0 ? image : null;
  }

  /** Draw a texture centred at (x, y) in world pixels, at the whole-number scale of the field. */
  private sprite(ctx: CanvasRenderingContext2D, name: Texture, x: number, y: number, extra = 1, flip = false): void {
    const image = this.image(name);
    if (!image) return;
    const scale = (this.tile / SOURCE) * extra;
    const w = Math.round(image.naturalWidth * scale);
    const h = Math.round(image.naturalHeight * scale);
    const dx = Math.round(x - this.pan - w / 2);
    const dy = Math.round(y - h / 2);
    if (dx > this.width || dx + w < 0) return;
    if (flip) {
      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, w, h);
      ctx.restore();
    } else ctx.drawImage(image, dx, dy, w, h);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || this.width === 0) return;
    ctx.imageSmoothingEnabled = false;
    const t = this.tile;
    ctx.fillStyle = "#3f6b3a";
    ctx.fillRect(0, 0, this.width, this.height);
    const grass = this.image("grass");
    if (grass) {
      const first = Math.floor(this.pan / t);
      for (let c = first; c <= first + Math.ceil(this.width / t) + 1; c++) {
        for (let r = 0; r < this.rows; r++) ctx.drawImage(grass, Math.round(c * t - this.pan), r * t, t, t);
      }
    }
    for (const g of this.ground) this.sprite(ctx, g.texture, g.col * t + t / 2, g.row * t + t / 2);
    // Props and units sorted by their feet, so what is lower on screen stands in front.
    const things: { y: number; draw: () => void }[] = [];
    for (const p of this.props) things.push({ y: p.row * t + t, draw: () => this.sprite(ctx, p.texture, p.col * t + t / 2, p.row * t + t / 2) });
    for (const u of this.units) {
      const big = u.texture === "tank" || u.texture === "tank-blue";
      const bob = big ? 0 : Math.abs(Math.sin(this.time / 220 + u.phase)) * -t * 0.04;
      things.push({ y: u.y + t / 2, draw: () => this.sprite(ctx, u.texture, u.x, u.y + bob, big ? 1.3 : 1, u.side > 0 && !big) });
    }
    things.sort((a, b) => a.y - b.y).forEach((thing) => thing.draw());
    // Tracers: a bright core over a soft glow.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const tr of this.tracers) {
      const a = Math.min(1, tr.life / 120);
      for (const [width, alpha] of [[t * 0.09, 0.25], [t * 0.03, 0.95]] as const) {
        ctx.strokeStyle = `${tr.color}${alpha * a})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(tr.x1 - this.pan, tr.y1);
        ctx.lineTo(tr.x2 - this.pan, tr.y2);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Shells: a dark dot on a high arc with its shadow on the ground.
    for (const s of this.shells) {
      const k = s.t / s.duration;
      const x = s.x1 + (s.x2 - s.x1) * k - this.pan;
      const groundY = s.y1 + (s.y2 - s.y1) * k;
      const lift = Math.sin(k * Math.PI) * t * 3.2;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, groundY, t * 0.12, t * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2b2f38";
      ctx.fillRect(Math.round(x - t * 0.07), Math.round(groundY - lift - t * 0.07), Math.ceil(t * 0.14), Math.ceil(t * 0.14));
    }
    for (const b of this.blasts) {
      const frame = Math.min(5, 1 + Math.floor(b.t / 70)) as 1 | 2 | 3 | 4 | 5;
      if (b.t < 90) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,170,80,${0.35 * (1 - b.t / 90)})`;
        ctx.beginPath();
        ctx.arc(b.x - this.pan, b.y, t * b.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      this.sprite(ctx, `explosion-${frame}`, b.x, b.y - t * 0.2, b.size);
    }
    // Planes high above: the shadow far below and to the side.
    for (const p of this.planes) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.filter = "brightness(0)";
      this.sprite(ctx, p.texture, p.x + t * 0.8, p.y + t * 1.6, 1.4, p.speed < 0);
      ctx.restore();
      this.sprite(ctx, p.texture, p.x, p.y, 1.4, p.speed < 0);
    }
  }
}
