import { byId } from "./dom";
import { LogoFx, prefersReducedMotion } from "./fx";
import { NightScene } from "./NightScene";
import { PixelAssembly } from "./PixelAssembly";

export const INTRO_MS = 5200;
const STEPS = ["Forjando el mundo…", "Cargando texturas…", "Reuniendo a los ejércitos…", "Despertando a la IA…", "Listo"];

/**
 * The intro that plays once after logging in or registering, before the menu.
 *
 * It happens in the night of the access screen (NightScene): the wizard on
 * his cliff strikes the centre of the sky with lightning and pixels fly in to
 * forge the emblem (PixelAssembly); a second strike, a flash and a ring reveal
 * it; the wordmark, the tag and the motto come in while the HUD checks the
 * systems; then everything fades to the menu. The bar follows the real loading of
 * the workspace, not only the clock. Any key, a click on "Saltar" or the end of
 * the animation closes it (never before the workspace is ready).
 */
export class Intro {
  private readonly screen = byId("intro");
  private readonly fx = new LogoFx(byId<HTMLCanvasElement>("intro-fx"), byId("intro"), byId("intro-emblem"));
  private readonly pixels = new PixelAssembly(byId<HTMLCanvasElement>("intro-pixels"));
  private readonly scene = new NightScene(byId<HTMLCanvasElement>("intro-scene"), byId("intro-castle"), byId("intro-wizard-spot"));
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
    this.scene.start();

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
    const emblem = byId<HTMLImageElement>("intro-emblem");
    const strikeEmblem = () => {
      const box = emblem.getBoundingClientRect();
      this.scene.castAt(box.left + box.width / 2, box.top + box.height / 2);
    };
    const forge = () => {
      screen.classList.add("is-forged");
      this.fx.strikeNow();
      if (!reduced) strikeEmblem();
    };
    if (reduced) forge();
    else {
      at(260, strikeEmblem);
      at(380, () => void this.pixels.play(emblem, 1100).then(forge));
    }

    // Beat 4: the status line and the systems log.
    const text = byId("intro-text");
    STEPS.forEach((step, i) => at((i * duration) / STEPS.length, () => (text.textContent = step)));
    const lines = [...byId("intro-log").querySelectorAll("li")];
    lines.forEach((line) => line.classList.remove("is-shown", "is-done"));
    lines.forEach((line, i) => {
      at(900 + i * 800, () => line.classList.add("is-shown"));
      at(1400 + i * 800, () => line.classList.add("is-done"));
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
    await new Promise((resolve) => window.setTimeout(resolve, 480));
    this.fx.stop();
    this.scene.stop();
    this.screen.hidden = true;
    this.screen.classList.remove("is-playing", "is-forged", "is-leaving");
  }
}
