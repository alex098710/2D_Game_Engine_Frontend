/**
 * The opening effect of the intro: hundreds of pixels fly in from the edges of
 * the screen and lock together into the PixelForge emblem, as if forged.
 *
 * Cheap on purpose: the emblem is sampled once on a coarse grid (one particle
 * per cell, about 600-900 of them), each frame is a single pass of fillRect on
 * one canvas, and the animation loop stops as soon as the emblem is complete.
 */

interface Particle {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  delay: number;
  color: string;
}

/** Ease out with a little overshoot, so the pixels "snap" into place. */
export function easeOutBack(t: number): number {
  const c = 1.4;
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

/** Cells of an image whose alpha is above a threshold: the shape the pixels will form. */
export function sampleShape(data: Uint8ClampedArray, width: number, height: number, step: number): { x: number; y: number; r: number; g: number; b: number }[] {
  const points = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 140) points.push({ x, y, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }
  return points;
}

export class PixelAssembly {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private size = 4;
  private frameId = 0;
  private start = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  /**
   * Fly the pixels into the emblem drawn at `target` (an <img>), for `duration` ms.
   * Resolves when they have landed (at once if the image cannot be read).
   */
  play(target: HTMLImageElement, duration = 1100): Promise<void> {
    return new Promise((resolve) => {
      const go = () => {
        if (!this.prepare(target)) return resolve();
        this.start = performance.now();
        const frame = (now: number) => {
          const done = this.draw(now - this.start, duration);
          if (done) {
            this.clear();
            resolve();
            return;
          }
          this.frameId = requestAnimationFrame(frame);
        };
        this.frameId = requestAnimationFrame(frame);
      };
      if (target.complete && target.naturalWidth > 0) go();
      else target.addEventListener("load", go, { once: true });
    });
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
    this.clear();
  }

  private clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private prepare(target: HTMLImageElement): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const box = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(box.width * ratio);
    this.canvas.height = Math.round(box.height * ratio);
    const where = target.getBoundingClientRect();
    if (where.width < 4 || box.width < 4) return false;
    // Sample the emblem at its on-screen size on a coarse grid.
    const w = Math.round(where.width * ratio);
    const h = Math.round(where.height * ratio);
    const sampler = document.createElement("canvas");
    sampler.width = w;
    sampler.height = h;
    const sctx = sampler.getContext("2d", { willReadFrequently: true });
    if (!sctx) return false;
    sctx.drawImage(target, 0, 0, w, h);
    let data: ImageData;
    try {
      data = sctx.getImageData(0, 0, w, h);
    } catch {
      return false; // a tainted image (should not happen: same origin)
    }
    // About 700 particles whatever the screen size.
    const step = Math.max(3, Math.round(Math.sqrt((w * h) / 2600)));
    this.size = Math.max(2, step - 1);
    const offsetX = (where.left - box.left) * ratio;
    const offsetY = (where.top - box.top) * ratio;
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.particles = sampleShape(data.data, w, h, step).map((p) => {
      // Start somewhere on a ring outside the screen, so they converge from every side.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.hypot(width, height) * (0.55 + Math.random() * 0.25);
      const bright = (p.r + p.g + p.b) / 3 > 170;
      return {
        sx: width / 2 + Math.cos(angle) * radius,
        sy: height / 2 + Math.sin(angle) * radius,
        tx: offsetX + p.x,
        ty: offsetY + p.y,
        delay: Math.random() * 0.35,
        color: bright ? "#e9f6ff" : `rgb(${p.r},${p.g},${p.b})`,
      };
    });
    return this.particles.length > 0;
  }

  /** One frame; true when every pixel has landed. */
  private draw(elapsed: number, duration: number): boolean {
    const ctx = this.ctx!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const t = elapsed / duration;
    const s = this.size;
    let landed = 0;
    for (const p of this.particles) {
      const local = Math.min(1, Math.max(0, (t - p.delay) / (1 - 0.35)));
      if (local >= 1) landed++;
      const k = easeOutBack(local);
      const x = p.sx + (p.tx - p.sx) * k;
      const y = p.sy + (p.ty - p.sy) * k;
      // A blue trail while flying, the real colour once close.
      ctx.globalAlpha = 0.35 + 0.65 * local;
      ctx.fillStyle = local < 0.85 ? "#38c4ff" : p.color;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
    return landed === this.particles.length;
  }
}
