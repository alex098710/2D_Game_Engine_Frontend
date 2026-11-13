import { prefersReducedMotion } from "./fx";

/**
 * The backdrop of the access screen: a night in pixel art, drawn in code.
 *
 * A castle on a cliff stands between the copy and the card, under a big moon;
 * stars twinkle, clouds drift and blue pixels float up from the valley. In the
 * bottom-left corner a wizard stands on a grassy cliff: he breathes, his cape
 * moves, the orb of his staff glows and throws sparks, and every few seconds
 * he raises the staff and casts a spell that bursts in the sky.
 *
 * Everything is drawn into a small buffer (one unit = PIXEL CSS px) and scaled
 * up with smoothing off, so every pixel is a crisp square at any size. The
 * wizard has his own buffer and a whole-number scale that fits the space the
 * layout gives him (`.wizard-spot`), so he never covers the copy.
 */

/** CSS px per unit of the scene: 3 on wide screens, 2 on phones (a smaller castle). */
const PIXEL = 3;
const PIXEL_PHONE = 2;
/** The wizard's buffer, in units: he is about 50 units tall. */
const WIZ_W = 40;
const WIZ_H = 60;
/** Where his feet are inside his buffer. */
const FEET_X = 16;
const FEET_Y = 56;

const C = {
  outline: "#070b1c",
  hat: "#2c3fb4", hatHi: "#4f6cf0", hatLo: "#1c2a80", band: "#f2c95c",
  skin: "#f3c9a4", skinLo: "#c98f6e",
  beard: "#e9eff9", beardLo: "#a9b7d2",
  robe: "#4a2fb0", robeHi: "#6e52e0", robeLo: "#2f1d7e", trim: "#f2c95c",
  cape: "#13246e", capeLo: "#0c1850",
  boot: "#24173a",
  wood: "#8a5a34", woodHi: "#b98250",
  orb: "#8fe3ff", orbCore: "#ffffff",
};

interface Star { x: number; y: number; phase: number; big: boolean }
interface Cloud { x: number; y: number; w: number; speed: number }
interface Mote { x: number; y: number; vy: number; phase: number; life: number; max: number; color: string }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }
/** A lightning bolt: a jagged path redrawn every few frames so it flickers, with side branches. */
interface Ray { sx: number; sy: number; tx: number; ty: number; t: number; duration: number; redraw: number; path: [number, number][]; branches: [number, number][][] }
interface Bolt { x: number; y: number; tx: number; ty: number; t: number; duration: number; sx: number; sy: number; trail: [number, number][] }
interface Lit { x: number; y: number; w: number; h: number; phase: number }

/** A small seeded random generator: the same size always gives the same sky. */
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

/** Whole-number scale for the wizard so he fits a spot `height` CSS px tall (0: he does not fit). */
export function wizardScale(height: number, width: number): number {
  for (const scale of [4, 3, 2]) {
    if (height >= WIZ_H * scale + 8 && width >= WIZ_W * scale) return scale;
  }
  return 0;
}

export class NightScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly art: HTMLElement;
  private readonly spot: HTMLElement;
  private readonly sky = document.createElement("canvas");
  /** Mountains, the cliff and the castle: drawn over the stars and clouds. */
  private readonly land = document.createElement("canvas");
  private readonly buffer = document.createElement("canvas");
  private readonly wizard = document.createElement("canvas");
  private readonly silhouette = document.createElement("canvas");
  private readonly observer: ResizeObserver | null;
  private frameId = 0;
  private running = false;
  private last = 0;
  private time = 0;
  // Sizes: units of the buffer, canvas px per CSS px.
  private w = 0;
  private h = 0;
  private ratio = 1;
  private px = PIXEL;
  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private motes: Mote[] = [];
  private sparks: Spark[] = [];
  private bolts: Bolt[] = [];
  private rays: Ray[] = [];
  private casts = 0;
  /** The flash of the last lightning over the whole scene (0 to 1). */
  private flash = 0;
  private windows: Lit[] = [];
  private flag = { x: 0, y: 0 };
  private nextCast = 2600;
  private castUntil = 0;
  private random = seeded(11);

  constructor(canvas: HTMLCanvasElement, art: HTMLElement, spot: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.art = art;
    this.spot = spot;
    this.wizard.width = WIZ_W;
    this.wizard.height = WIZ_H;
    this.silhouette.width = WIZ_W;
    this.silhouette.height = WIZ_H;
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

  /** The wizard casts a spell right now (used when the login succeeds). */
  castNow(): void {
    this.nextCast = 0;
  }

  /** The wizard strikes a point of the screen (CSS px from the canvas corner) with lightning. */
  castAt(cssX: number, cssY: number): void {
    const place = this.wizardPlace();
    if (place.scale === 0 || this.w === 0) return;
    const [ox, oy] = this.orb(place, 4);
    this.castUntil = this.time + 800;
    this.nextCast = 2800;
    this.strike(ox, oy, cssX / this.px, cssY / this.px);
  }

  // ---------------------------------------------------------------- layout

  private resize(): void {
    const box = this.canvas.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.px = box.width < 700 ? PIXEL_PHONE : PIXEL;
    this.w = Math.ceil(box.width / this.px);
    this.h = Math.ceil(box.height / this.px);
    const unit = Math.max(1, Math.round(this.px * dpr));
    this.canvas.width = this.w * unit;
    this.canvas.height = this.h * unit;
    this.ratio = this.canvas.width / box.width;
    this.buffer.width = this.w;
    this.buffer.height = this.h;
    this.sky.width = this.w;
    this.sky.height = this.h;
    this.land.width = this.w;
    this.land.height = this.h;
    this.random = seeded(11 + this.w * 7 + this.h);
    this.paintSky();
    if (!this.running) this.draw();
  }

  /** The castle stands where the copy ends and the card begins (or top-right on a phone). */
  private castleAnchor(): { x: number; y: number } {
    const art = this.art.getBoundingClientRect();
    const canvas = this.canvas.getBoundingClientRect();
    const wide = canvas.width > 900;
    if (wide) {
      return { x: Math.round((art.right - canvas.left) / this.px), y: Math.round(this.h * 0.5) };
    }
    return { x: this.w - 30, y: Math.round(Math.min(this.h, 520 / this.px) * 0.5) };
  }

  /** The still part of the night, painted once per size: sky, moon, mountains, the castle and its cliff. */
  private paintSky(): void {
    let g = this.sky.getContext("2d");
    if (g === null) return;
    const { w, h } = this;
    const random = this.random;
    // Sky: bands of blue from the top down, blended with a 2 x 2 ordered dither.
    const bands = ["#03060f", "#050a1a", "#071026", "#0a1633", "#0d1d42", "#112552", "#142b5e"];
    const bayer = [0, 0.5, 0.75, 0.25];
    for (let y = 0; y < h; y++) {
      const t = Math.min(0.999, (y / h) * 1.15) * (bands.length - 1);
      const index = Math.floor(t);
      const blend = t - index;
      for (let x = 0; x < w; x++) {
        const next = blend > bayer[(x & 1) + (y & 1) * 2] ? 1 : 0;
        g.fillStyle = bands[Math.min(bands.length - 1, index + next)];
        g.fillRect(x, y, 1, 1);
      }
    }
    const castle = this.castleAnchor();
    const moon = { x: castle.x + 30, y: castle.y - 78 };
    // Moon halo: stepped rings, each a little brighter.
    for (const [radius, alpha] of [[44, 0.05], [34, 0.07], [26, 0.1], [20, 0.14]] as const) {
      g.fillStyle = `rgba(150, 190, 255, ${alpha})`;
      this.disc(g, moon.x, moon.y, radius);
    }
    g.fillStyle = "#dfe9ff";
    this.disc(g, moon.x, moon.y, 15);
    g.fillStyle = "#f6f9ff";
    this.disc(g, moon.x - 2, moon.y - 2, 12);
    g.fillStyle = "#c3d2f0";
    for (const [dx, dy, r] of [[-5, -3, 3], [4, 3, 2], [-1, 6, 2], [6, -6, 1]] as const) this.disc(g, moon.x + dx, moon.y + dy, r);

    // Everything below goes on the land layer, in front of the stars and clouds.
    const sky = g;
    g = this.land.getContext("2d") ?? sky;
    g.clearRect(0, 0, w, h);
    // Far and near mountains.
    const ridge = (base: number, amp: number, freq: number, color: string, seed: number): void => {
      g.fillStyle = color;
      for (let x = 0; x < w; x++) {
        const y = Math.round(base + Math.sin(x * freq + seed) * amp + Math.sin(x * freq * 2.7 + seed * 2) * amp * 0.45);
        g.fillRect(x, y, 1, h - y);
      }
    };
    ridge(h * 0.68, 10, 0.035, "#0a1636", 1);
    ridge(h * 0.78, 7, 0.05, "#08112b", 4);

    // The cliff under the castle: wider at the bottom, lit on the moon side.
    const top = castle.y;
    for (let x = castle.x - 52; x <= castle.x + 52; x++) {
      const edge = Math.abs(x - castle.x) / 52;
      const y0 = Math.round(top + edge * edge * 26 + (random() < 0.3 ? 1 : 0));
      for (let y = y0; y < h; y++) {
        const lit = x > castle.x + 20 && y < y0 + 3;
        g.fillStyle = lit ? "#1d2f5c" : (x + y * 3) % 11 === 0 ? "#0a142e" : x > castle.x ? "#121f45" : "#0e1938";
        g.fillRect(x, y, 1, 1);
      }
      if (random() < 0.12) {
        g.fillStyle = "#08102a";
        g.fillRect(x, y0 + 4 + Math.floor(random() * 30), 1, 3 + Math.floor(random() * 6));
      }
    }
    this.paintCastle(g, castle.x, top);
    // Valley mist at the bottom.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(40, 80, 160, ${0.05 + i * 0.012})`;
      g.fillRect(0, h - 40 + i * 7, w, 40 - i * 7);
    }

    // Stars, clouds and windows for the moving layer.
    this.stars = [];
    for (let i = 0; i < Math.round((w * h) / 260); i++) {
      const y = random() * h * 0.7;
      this.stars.push({ x: Math.floor(random() * w), y: Math.floor(y), phase: random() * Math.PI * 2, big: random() < 0.12 });
    }
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: random() * w, y: 12 + random() * h * 0.4, w: 18 + Math.floor(random() * 22), speed: 0.6 + random() * 1.2 });
    }
    this.motes = [];
  }

  private paintCastle(g: CanvasRenderingContext2D, cx: number, base: number): void {
    const wall = "#14214a";
    const shade = "#0d1735";
    const lit = "#22377a";
    const roof = "#1c2c72";
    const roofLit = "#3550b8";
    const block = (x: number, y: number, bw: number, bh: number): void => {
      g.fillStyle = wall;
      g.fillRect(x, y, bw, bh);
      g.fillStyle = shade;
      g.fillRect(x, y, 2, bh);
      g.fillStyle = lit;
      g.fillRect(x + bw - 2, y, 2, bh);
      // Stone rows.
      g.fillStyle = shade;
      for (let row = y + 4; row < y + bh; row += 5) {
        for (let col = x + ((row / 5) % 2 === 0 ? 2 : 5); col < x + bw - 3; col += 7) g.fillRect(col, row, 3, 1);
      }
      // Battlements.
      g.fillStyle = wall;
      for (let col = x; col < x + bw; col += 4) g.fillRect(col, y - 3, 2, 3);
    };
    const cone = (x: number, y: number, bw: number, height: number): void => {
      for (let i = 0; i < height; i++) {
        const half = Math.max(0, Math.round((bw / 2) * (i / height)));
        g.fillStyle = roof;
        g.fillRect(x + bw / 2 - half - 1, y - height + i, half + 1, 1);
        g.fillStyle = roofLit;
        g.fillRect(x + bw / 2, y - height + i, half + 1, 1);
      }
    };
    const top = base - 2;
    // Curtain wall, then the towers in front of it.
    block(cx - 36, top - 22, 72, 24);
    block(cx - 44, top - 40, 14, 42);
    cone(cx - 45, top - 43, 16, 16);
    block(cx + 30, top - 48, 14, 50);
    cone(cx + 29, top - 51, 16, 18);
    block(cx - 12, top - 62, 24, 64);
    cone(cx - 14, top - 65, 28, 22);
    // Gate.
    g.fillStyle = "#050914";
    g.fillRect(cx - 5, top - 12, 10, 14);
    g.fillRect(cx - 4, top - 14, 8, 2);
    g.fillStyle = "#2a3c7a";
    for (let col = cx - 4; col < cx + 5; col += 3) g.fillRect(col, top - 12, 1, 12);
    this.flag = { x: cx, y: top - 87 };
    this.windows = [];
    const win = (x: number, y: number, ww = 2, wh = 3): void => {
      this.windows.push({ x, y, w: ww, h: wh, phase: this.random() * Math.PI * 2 });
    };
    win(cx - 39, top - 32); win(cx - 39, top - 22);
    win(cx + 35, top - 40); win(cx + 35, top - 28); win(cx + 35, top - 16);
    win(cx - 4, top - 50, 3, 4); win(cx + 2, top - 50, 3, 4); win(cx - 1, top - 34, 3, 4);
    win(cx - 26, top - 15); win(cx + 20, top - 15);
  }

  private disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.round(Math.sqrt(r * r - y * y));
      g.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
    }
  }

  // ---------------------------------------------------------------- frame

  private frame(now: number): void {
    if (!this.running) return;
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    this.frameId = requestAnimationFrame((next) => this.frame(next));
  }

  /** Where the wizard stands, in buffer units, and his scale (0: hidden). */
  private wizardPlace(): { x: number; y: number; scale: number; cssX: number; cssY: number } {
    const spot = this.spot.getBoundingClientRect();
    const canvas = this.canvas.getBoundingClientRect();
    const scale = wizardScale(spot.height, spot.width);
    const cssX = spot.left - canvas.left + FEET_X * scale + 12;
    const cssY = spot.bottom - canvas.top - 6;
    return { x: Math.round(cssX / this.px), y: Math.round(cssY / this.px), scale, cssX, cssY };
  }

  /** The tip of the staff (the orb), in buffer units. */
  private orb(place: { scale: number; cssX: number; cssY: number }, raised: number): [number, number] {
    const x = place.cssX + (29 - FEET_X) * place.scale;
    const y = place.cssY - (45 + raised) * place.scale;
    return [x / this.px, y / this.px];
  }

  private update(dt: number): void {
    const random = this.random;
    for (const cloud of this.clouds) {
      cloud.x += (cloud.speed * dt) / 1000;
      if (cloud.x > this.w + cloud.w) cloud.x = -cloud.w * 2;
    }
    // Pixels floating up from the valley.
    if (this.motes.length < Math.round(this.w / 8) && random() < 0.25) {
      this.motes.push({
        x: random() * this.w, y: this.h + 2, vy: 4 + random() * 8, phase: random() * 6,
        life: 0, max: 6000 + random() * 6000, color: random() < 0.7 ? "#3aa0ff" : "#9fe6ff",
      });
    }
    for (const mote of this.motes) {
      mote.life += dt;
      mote.y -= (mote.vy * dt) / 1000;
    }
    this.motes = this.motes.filter((m) => m.life < m.max && m.y > -4);

    const place = this.wizardPlace();
    const casting = this.time < this.castUntil;
    if (place.scale > 0) {
      const [ox, oy] = this.orb(place, casting ? 4 : 0);
      // The orb throws a few sparks all the time, many while casting.
      if (random() < (casting ? 0.9 : 0.18)) {
        const angle = random() * Math.PI * 2;
        const speed = casting ? 14 + random() * 18 : 4 + random() * 6;
        this.sparks.push({
          x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 6,
          life: 0, max: 500 + random() * 700, color: ["#9fe6ff", "#ffffff", "#7d8bff", "#3aa0ff"][Math.floor(random() * 4)],
        });
      }
      this.nextCast -= dt;
      if (this.nextCast <= 0) {
        this.nextCast = 3400 + random() * 2200;
        this.castUntil = this.time + 900;
        this.casts += 1;
        const tx = Math.min(this.w - 20, ox + 50 + random() * 110);
        const ty = Math.max(10, oy - 80 - random() * 50);
        if (this.casts % 3 === 0) {
          this.bolts.push({ x: ox, y: oy, sx: ox, sy: oy, tx, ty, t: 0, duration: 900, trail: [] });
        } else {
          // Lightning: one bolt, sometimes a second one that forks to another point of the sky.
          this.strike(ox, oy, tx, ty);
          if (random() < 0.5) this.strike(ox, oy, Math.max(10, tx - 40 - random() * 50), Math.max(8, ty - 10 - random() * 20));
        }
      }
    }
    for (const spark of this.sparks) {
      spark.life += dt;
      spark.x += (spark.vx * dt) / 1000;
      spark.y += (spark.vy * dt) / 1000;
      spark.vy += (6 * dt) / 1000;
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);
    for (const bolt of this.bolts) {
      bolt.t += dt;
      const k = Math.min(1, bolt.t / bolt.duration);
      const ease = 1 - (1 - k) * (1 - k);
      bolt.x = bolt.sx + (bolt.tx - bolt.sx) * ease;
      bolt.y = bolt.sy + (bolt.ty - bolt.sy) * ease - Math.sin(k * Math.PI) * 24;
      bolt.trail.unshift([bolt.x, bolt.y]);
      bolt.trail.length = Math.min(bolt.trail.length, 14);
      if (k >= 1) {
        // The burst: a ring of sparks.
        for (let i = 0; i < 26; i++) {
          const angle = (i / 26) * Math.PI * 2;
          const speed = 18 + random() * 22;
          this.sparks.push({
            x: bolt.x, y: bolt.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 0, max: 700 + random() * 600, color: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#9fe6ff" : "#8a7dff",
          });
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.t < b.duration);
    for (const ray of this.rays) {
      ray.t += dt;
      ray.redraw -= dt;
      if (ray.redraw <= 0) {
        ray.redraw = 60 + random() * 40;
        this.shapeRay(ray);
      }
    }
    this.rays = this.rays.filter((ray) => ray.t < ray.duration);
    this.flash = Math.max(0, this.flash - dt / 260);
  }

  /** Throw a lightning bolt from the orb to a point of the sky, with a flash and sparks where it hits. */
  private strike(sx: number, sy: number, tx: number, ty: number): void {
    const ray: Ray = { sx, sy, tx, ty, t: 0, duration: 520 + this.random() * 200, redraw: 0, path: [], branches: [] };
    this.shapeRay(ray);
    this.rays.push(ray);
    this.flash = 1;
    for (let i = 0; i < 18; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 10 + this.random() * 26;
      this.sparks.push({
        x: tx, y: ty, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0, max: 500 + this.random() * 600, color: i % 2 === 0 ? "#ffffff" : "#9fe6ff",
      });
    }
  }

  /** A new jagged path for the bolt (midpoint displacement) and two or three branches. */
  private shapeRay(ray: Ray): void {
    const random = this.random;
    let points: [number, number][] = [[ray.sx, ray.sy], [ray.tx, ray.ty]];
    let rough = Math.hypot(ray.tx - ray.sx, ray.ty - ray.sy) * 0.22;
    for (let pass = 0; pass < 5; pass++) {
      const next: [number, number][] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[i + 1];
        next.push([x1, y1], [(x1 + x2) / 2 + (random() - 0.5) * rough, (y1 + y2) / 2 + (random() - 0.5) * rough]);
      }
      next.push(points[points.length - 1]);
      points = next;
      rough *= 0.55;
    }
    ray.path = points;
    ray.branches = [];
    for (let b = 0; b < 2 + Math.floor(random() * 2); b++) {
      const start = points[4 + Math.floor(random() * (points.length - 10))];
      const angle = Math.atan2(ray.ty - ray.sy, ray.tx - ray.sx) + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.6);
      const branch: [number, number][] = [start];
      let [x, y] = start;
      for (let i = 0; i < 5; i++) {
        x += Math.cos(angle) * (3 + random() * 4) + (random() - 0.5) * 3;
        y += Math.sin(angle) * (3 + random() * 4) + (random() - 0.5) * 3;
        branch.push([x, y]);
      }
      ray.branches.push(branch);
    }
  }

  /** A line of whole pixels (Bresenham), `size` units thick. */
  private pixelLine(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number): void {
    let x = Math.round(x1);
    let y = Math.round(y1);
    const ex = Math.round(x2);
    const ey = Math.round(y2);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const stepX = x < ex ? 1 : -1;
    const stepY = y < ey ? 1 : -1;
    let error = dx + dy;
    const half = Math.floor(size / 2);
    for (;;) {
      g.fillRect(x - half, y - half, size, size);
      if (x === ex && y === ey) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += stepX; }
      if (twice <= dx) { error += dx; y += stepY; }
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const g = this.buffer.getContext("2d");
    if (ctx === null || g === null || this.w === 0) return;
    const t = this.time / 1000;
    g.drawImage(this.sky, 0, 0);
    // Stars twinkle.
    for (const star of this.stars) {
      const glow = 0.5 + 0.5 * Math.sin(t * 1.6 + star.phase);
      g.fillStyle = `rgba(220, 235, 255, ${0.35 + glow * 0.65})`;
      g.fillRect(star.x, star.y, 1, 1);
      if (star.big && glow > 0.7) {
        g.fillStyle = `rgba(160, 200, 255, ${(glow - 0.7) * 1.6})`;
        g.fillRect(star.x - 1, star.y, 3, 1);
        g.fillRect(star.x, star.y - 1, 1, 3);
      }
    }
    // Clouds.
    for (const cloud of this.clouds) {
      const x = Math.round(cloud.x);
      const y = Math.round(cloud.y);
      g.fillStyle = "rgba(30, 52, 110, 0.55)";
      g.fillRect(x, y, cloud.w, 3);
      g.fillRect(x + 4, y - 2, cloud.w - 10, 2);
      g.fillRect(x + 8, y - 4, Math.max(4, cloud.w - 20), 2);
      g.fillStyle = "rgba(70, 100, 170, 0.35)";
      g.fillRect(x + 8, y - 4, Math.max(4, cloud.w - 20), 1);
    }
    g.drawImage(this.land, 0, 0);
    // Lit windows flicker like candles.
    for (const win of this.windows) {
      const light = 0.75 + 0.25 * Math.sin(t * 3 + win.phase) * Math.sin(t * 1.3 + win.phase * 2);
      g.fillStyle = `rgba(255, 207, 110, ${light})`;
      g.fillRect(win.x, win.y, win.w, win.h);
      g.fillStyle = `rgba(255, 207, 110, ${light * 0.18})`;
      g.fillRect(win.x - 1, win.y - 1, win.w + 2, win.h + 2);
    }
    // The flag on the keep.
    g.fillStyle = "#33415f";
    g.fillRect(this.flag.x, this.flag.y, 1, 9);
    for (let i = 0; i < 7; i++) {
      const wave = Math.round(Math.sin(t * 5 - i * 0.8));
      g.fillStyle = i % 2 === 0 ? "#3aa0ff" : "#2a7fe0";
      g.fillRect(this.flag.x + 1 + i, this.flag.y + wave + (i > 4 ? 1 : 0), 1, 4 - (i > 4 ? 1 : 0));
    }
    // Floating pixels.
    for (const mote of this.motes) {
      const fade = Math.min(1, mote.life / 800, (mote.max - mote.life) / 1200);
      g.globalAlpha = Math.max(0, fade) * 0.85;
      g.fillStyle = mote.color;
      g.fillRect(Math.round(mote.x + Math.sin(t + mote.phase) * 3), Math.round(mote.y), 1, 1);
    }
    g.globalAlpha = 1;

    const place = this.wizardPlace();
    this.paintGround(g, place);
    // Spell trail and sparks (in the sky, behind nothing).
    for (const bolt of this.bolts) {
      bolt.trail.forEach(([x, y], i) => {
        g.globalAlpha = 1 - i / bolt.trail.length;
        g.fillStyle = i < 3 ? "#ffffff" : i < 7 ? "#9fe6ff" : "#5a6cff";
        const size = i < 2 ? 3 : i < 7 ? 2 : 1;
        g.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      });
    }
    g.globalAlpha = 1;
    // Lightning: a wide blue glow, then the white core; it flickers while it lives.
    for (const ray of this.rays) {
      const alive = 1 - ray.t / ray.duration;
      if (Math.sin(ray.t / 22) < -0.6 && alive < 0.8) continue;
      const strokes: [number, number, string][] = [[5, 0.18 * alive + 0.08, "#3a7bff"], [3, 0.45 * alive + 0.2, "#7cc8ff"], [1, 1, "#ffffff"]];
      for (const [size, alpha, color] of strokes) {
        g.globalAlpha = alpha;
        g.fillStyle = color;
        for (let i = 0; i < ray.path.length - 1; i++) this.pixelLine(g, ray.path[i][0], ray.path[i][1], ray.path[i + 1][0], ray.path[i + 1][1], size);
        g.fillStyle = size === 1 ? "#cfefff" : color;
        for (const branch of ray.branches) {
          for (let i = 0; i < branch.length - 1; i++) this.pixelLine(g, branch[i][0], branch[i][1], branch[i + 1][0], branch[i + 1][1], Math.max(1, size - 2));
        }
      }
    }
    g.globalAlpha = 1;
    if (this.flash > 0) {
      g.fillStyle = `rgba(140, 200, 255, ${this.flash * 0.22})`;
      g.fillRect(0, 0, this.w, this.h);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
    if (place.scale > 0) this.drawWizard(ctx, place);
    // Sparks on top of the wizard, drawn at the scene's pixel size.
    const unit = this.canvas.width / this.w;
    for (const spark of this.sparks) {
      ctx.globalAlpha = Math.max(0, 1 - spark.life / spark.max);
      ctx.fillStyle = spark.color;
      ctx.fillRect(Math.round(spark.x) * unit, Math.round(spark.y) * unit, unit, unit);
    }
    ctx.globalAlpha = 1;
  }

  /** The grassy cliff the wizard stands on: grass with tufts, a lit rock face with stones, an edge that drops. */
  private paintGround(g: CanvasRenderingContext2D, place: { x: number; y: number; scale: number }): void {
    if (place.scale === 0) return;
    const top = place.y;
    // The ledge ends just past the staff, so the motto under it reads on open sky.
    const right = place.x + Math.round((18 * place.scale) / this.px) + 4;
    const drop = (x: number): number => (x > right ? Math.round((x - right) ** 1.35) : 0);
    for (let x = 0; x <= right + 22; x++) {
      const y0 = top + drop(x) + (x % 11 === 0 ? 1 : 0);
      if (y0 >= this.h) continue;
      // Dark line above the grass, so the cliff stands out against the night.
      g.fillStyle = "#04081a";
      g.fillRect(x, y0 - 1, 1, 1);
      for (let y = y0; y < this.h; y++) {
        const depth = y - y0;
        let color: string;
        if (depth === 0) color = x % 3 === 0 ? "#7cf0a8" : "#4fd68a";
        else if (depth < 3) color = "#2fa866";
        else if (depth < 4) color = (x % 4 === 0 ? "#2fa866" : "#1c6e46"); // grass hanging over the rock
        else if (depth < 5) color = "#0b1a2e";
        else {
          // Rock in big stones: lit tops, dark joints.
          const row = Math.floor((depth - 5) / 6);
          const col = Math.floor((x + (row % 2) * 5) / 10);
          const inStoneY = (depth - 5) % 6;
          const inStoneX = (x + (row % 2) * 5) % 10;
          if (inStoneY === 5 || inStoneX === 9) color = "#0a1228";
          else if (inStoneY === 0) color = "#33467e";
          else color = (col + row) % 3 === 0 ? "#22325f" : "#1a2850";
          if (x >= right && x - right < 2) color = "#3b54a0"; // the edge catches the moonlight
        }
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
      // Tufts of grass that sway.
      if (x % 5 === 2 && x < right + 4) {
        const sway = Math.round(Math.sin(this.time / 500 + x * 0.7) * 0.7);
        g.fillStyle = "#7cf0a8";
        g.fillRect(x + sway, y0 - 2, 1, 2);
        g.fillStyle = "#4fd68a";
        g.fillRect(x + 1, y0 - 1, 1, 1);
      }
      // Little blue flowers.
      if (x % 17 === 8 && x < right) {
        g.fillStyle = "#9fe6ff";
        g.fillRect(x, y0 - 2, 1, 1);
      }
    }
  }

  /** Paint the wizard in his own buffer, outline him and draw him scaled at his spot. */
  private drawWizard(ctx: CanvasRenderingContext2D, place: { scale: number; cssX: number; cssY: number }): void {
    const w = this.wizard.getContext("2d");
    const s = this.silhouette.getContext("2d");
    if (w === null || s === null) return;
    const t = this.time;
    const casting = t < this.castUntil;
    const breathe = Math.sin(t / 700) > 0 ? 1 : 0;
    const raised = casting ? 4 : 0;
    w.clearRect(0, 0, WIZ_W, WIZ_H);
    const px = (color: string, x: number, y: number, pw = 1, ph = 1): void => {
      w.fillStyle = color;
      w.fillRect(x, y, pw, ph);
    };
    const fx = FEET_X;
    const fy = FEET_Y;
    const up = fy - breathe; // the upper body rises with the breath

    // Cape behind him, rippling at the back edge.
    for (let row = 0; row < 26; row++) {
      const y = up - 30 + row;
      const ripple = Math.round(Math.sin(t / 260 - row * 0.45) * (row / 26) * 2);
      const left = fx - 7 - Math.round(row * 0.28) + ripple;
      px(row % 5 === 4 ? C.capeLo : C.cape, left, y, fx + 3 - left, 1);
    }
    // Boots.
    px(C.boot, fx - 5, fy - 2, 4, 2);
    px(C.boot, fx + 1, fy - 2, 5, 2);
    // Robe: a long trapezoid, lit on the left, shaded on the right, gold hem.
    for (let row = 0; row < 24; row++) {
      const y = up - 25 + row;
      const half = 5 + Math.round(row * 0.18);
      const sway = row > 18 ? Math.round(Math.sin(t / 300 + row) * 0.6) : 0;
      px(C.robe, fx - half + sway, y, half * 2, 1);
      px(C.robeHi, fx - half + 1 + sway, y, 2, 1);
      px(C.robeLo, fx + half - 2 + sway, y, 2, 1);
    }
    px(C.trim, fx - 9, up - 3, 18, 1);
    px(C.trim, fx - 1, up - 24, 1, 21);
    // Belt with a gem.
    px("#3a2a1a", fx - 6, up - 15, 12, 2);
    px(C.orb, fx - 1, up - 15, 2, 2);
    // Back arm (left), hanging.
    px(C.robeLo, fx - 8, up - 23, 3, 10);
    px(C.skin, fx - 8, up - 13, 3, 2);
    // Head.
    px(C.skin, fx - 3, up - 31, 8, 7);
    px(C.skinLo, fx - 3, up - 31, 2, 7);
    px(C.outline, fx + 2, up - 29, 1, 2);
    px(C.outline, fx + 4, up - 29, 1, 2);
    px(C.skinLo, fx + 5, up - 27, 1, 1);
    // Beard: long and white, swaying a little.
    const beardSway = Math.round(Math.sin(t / 500));
    for (let row = 0; row < 12; row++) {
      const half = Math.max(1, 5 - Math.round(row * 0.4));
      const x = fx + 1 - half + (row > 6 ? beardSway : 0);
      px(C.beard, x, up - 26 + row, half * 2, 1);
      px(C.beardLo, x + half * 2 - 1, up - 26 + row, 1, 1);
    }
    px(C.beard, fx - 3, up - 27, 9, 1);
    // Hat: wide brim, gold band, a tall cone whose tip bends back.
    px(C.hatLo, fx - 8, up - 33, 18, 2);
    px(C.hatHi, fx - 7, up - 33, 6, 1);
    px(C.band, fx - 4, up - 35, 10, 2);
    for (let row = 0; row < 14; row++) {
      const y = up - 36 - row;
      const half = Math.max(1, 5 - Math.round(row * 0.36));
      const bend = row > 8 ? -Math.round((row - 8) * 0.9) : 0;
      px(C.hat, fx + 1 - half + bend, y, half * 2, 1);
      px(C.hatHi, fx + 1 - half + bend, y, 1, 1);
    }
    px(C.band, fx - 1, up - 41, 1, 1);
    px("#fff3b0", fx + 2, up - 44, 1, 1);
    // Staff: held in the front hand, raised while casting.
    const staffX = 28;
    px(C.wood, staffX, up - 40 - raised, 2, 38 + raised - (up - fy));
    px(C.woodHi, staffX, up - 40 - raised, 1, 38 + raised - (up - fy));
    px(C.wood, staffX - 1, up - 44 - raised, 1, 4);
    px(C.wood, staffX + 2, up - 44 - raised, 1, 4);
    // Front arm reaching the staff.
    px(C.robe, fx + 5, up - 23 - (casting ? 2 : 0), 3, 4);
    px(C.robe, fx + 7, up - 21 - (casting ? 3 : 0), staffX - fx - 7, 3);
    px(C.skin, staffX - 1, up - 21 - (casting ? 3 : 0), 3, 3);
    // Orb with a pulsing halo.
    const pulse = 0.5 + 0.5 * Math.sin(t / 240);
    const oy = up - 47 - raised;
    w.globalAlpha = casting ? 0.55 : 0.18 + pulse * 0.18;
    px(C.orb, staffX - 3, oy - 2, 8, 8);
    w.globalAlpha = casting ? 0.8 : 0.35 + pulse * 0.25;
    px(C.orb, staffX - 2, oy - 1, 6, 6);
    w.globalAlpha = 1;
    px(C.orb, staffX - 1, oy, 4, 4);
    px(C.orbCore, staffX, oy + 1, 2, 2);

    // The outline: the silhouette in dark, shifted one unit each way, under the sprite.
    s.clearRect(0, 0, WIZ_W, WIZ_H);
    s.globalCompositeOperation = "source-over";
    s.drawImage(this.wizard, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = C.outline;
    s.fillRect(0, 0, WIZ_W, WIZ_H);
    s.globalCompositeOperation = "source-over";

    const scale = Math.max(1, Math.round(place.scale * this.ratio));
    const x0 = Math.round(place.cssX * this.ratio) - FEET_X * scale;
    const y0 = Math.round(place.cssY * this.ratio) - FEET_Y * scale;
    ctx.imageSmoothingEnabled = false;
    // A soft glow of the orb on the ground and a shadow under the feet.
    ctx.fillStyle = "rgba(3, 6, 15, 0.45)";
    ctx.fillRect(x0 + (FEET_X - 9) * scale, y0 + (FEET_Y - 1) * scale, 20 * scale, 2 * scale);
    if (casting) {
      // A magic circle on the ground while he casts.
      const turn = (t / 120) % 12;
      for (let i = 0; i < 12; i++) {
        const angle = ((i + turn) / 12) * Math.PI * 2;
        ctx.fillStyle = i % 2 === 0 ? "rgba(159, 230, 255, 0.9)" : "rgba(122, 108, 255, 0.8)";
        ctx.fillRect(x0 + Math.round((FEET_X + Math.cos(angle) * 13) * scale), y0 + Math.round((FEET_Y - 1 + Math.sin(angle) * 3) * scale), scale, scale);
      }
    }
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      ctx.drawImage(this.silhouette, x0 + dx * scale, y0 + dy * scale, WIZ_W * scale, WIZ_H * scale);
    }
    ctx.drawImage(this.wizard, x0, y0, WIZ_W * scale, WIZ_H * scale);
  }
}
