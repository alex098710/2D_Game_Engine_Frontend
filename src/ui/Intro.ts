import { byId } from "./dom";
import { LogoFx, prefersReducedMotion } from "./fx";
import { PixelAssembly } from "./PixelAssembly";

export const INTRO_MS = 5200;
const STEPS = ["Forjando el mundo…", "Cargando texturas…", "Reuniendo a los ejércitos…", "Despertando a la IA…", "Listo"];

/**
 * The intro that plays once after logging in or registering, before the menu.
 *
 * Five beats: pixels fly in and forge the emblem (PixelAssembly); a flash, a
 * shockwave and a lightning strike reveal it; the wordmark and the tagline come
 * in; the army marches along the grid while the systems check in; then the
 * camera pushes in and fades to the menu. The bar follows the real loading of
 * the workspace, not only the clock. Any key, a click on "Saltar" or the end of
 * the animation closes it (never before the workspace is ready).
 */
export class Intro {
  private readonly screen = byId("intro");
  private readonly fx = new LogoFx(byId<HTMLCanvasElement>("intro-fx"), byId("intro"), byId("intro-emblem"));
  private readonly pixels = new PixelAssembly(byId<HTMLCanvasElement>("intro-pixels"));
  private timers: number[] = [];
  private finish: (() => void) | null = null;

  constructor() {
    byId("intro-skip").addEventListener("click", () => this.close());
    window.addEventListener("keydown", () => this.close());
  }

  /** Resolves when the intro is over (or skipped). `work` runs meanwhile; the intro waits for it. */
  play(work: Promise<unknown> = Promise.resolve()): Promise<void> {
    const reduced = prefersReducedMotion();
    const duration = reduced ? 900 : INTRO_MS;
    const screen = this.screen;
    screen.hidden = false;
    screen.classList.remove("is-playing", "is-forged", "is-leaving");
    void screen.offsetWidth; // restart the CSS animations
    screen.classList.add("is-playing");
    this.fx.start();

    let workDone = false;
    let clockShare = 0;
    const progress = () => {
      // The clock alone never fills more than 90%: the last stretch waits for the real work.
      const value = workDone ? 1 : Math.min(0.9, clockShare);
      byId("intro-bar").style.setProperty("--progress", value.toFixed(3));
      byId("intro-percent").textContent = `${Math.round(value * 100)}%`;
    };
    const ready = work.catch(() => undefined).then(() => {
      workDone = true;
      progress();
    });
    const at = (ms: number, fn: () => void) => this.timers.push(window.setTimeout(fn, reduced ? 0 : ms));
    for (let tick = 1; tick <= 20; tick++) {
      at((tick * duration) / 20, () => {
        clockShare = tick / 20;
        progress();
      });
    }
    progress();

    // Beat 1-2: forge the emblem from flying pixels, then reveal it with a flash.
    const forge = () => {
      screen.classList.add("is-forged");
      this.fx.strikeNow();
    };
    if (reduced) forge();
    else at(380, () => void this.pixels.play(byId<HTMLImageElement>("intro-emblem"), 1100).then(forge));

    // Beat 4: the status line and the systems log.
    const text = byId("intro-text");
    STEPS.forEach((step, i) => at((i * duration) / STEPS.length, () => (text.textContent = step)));
    const lines = [...byId("intro-log").querySelectorAll("li")];
    lines.forEach((line) => line.classList.remove("is-shown", "is-done"));
    lines.forEach((line, i) => {
      at(1500 + i * 650, () => line.classList.add("is-shown"));
      at(1900 + i * 650, () => line.classList.add("is-done"));
    });

    const shown = new Promise<void>((resolve) => {
      this.finish = resolve;
      at(duration, resolve);
    });
    // Skipping cannot open a workspace that is not ready yet.
    return Promise.all([shown, ready]).then(() => this.leave());
  }

  private close(): void {
    this.finish?.();
  }

  private async leave(): Promise<void> {
    this.finish = null;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    this.pixels.stop();
    this.screen.classList.add("is-forged", "is-leaving");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    this.fx.stop();
    this.screen.hidden = true;
    this.screen.classList.remove("is-playing", "is-forged", "is-leaving");
  }
}
