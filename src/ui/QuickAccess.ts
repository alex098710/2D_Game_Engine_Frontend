import { isDemo, type ProjectDto, type SettingsDto } from "../api/client";
import { TEXTURE_BASE } from "../game/assets";
import { playableHeroes, type PlayableHero } from "../game/balance";
import { spriteUrl } from "../game/sprites";
import { WORLD_HEIGHT, WORLD_WIDTH, type GameObject } from "../model/GameObject";
import { byId, make } from "./dom";
import { remember, remembered } from "./HeroDialog";
import { drawLevel, SAMPLE_SCENE, viewAround } from "./levelPreview";
import { relativeTime } from "./ProjectList";

/** What the quick settings card needs from the settings drawer. */
export interface QuickSettings {
  readonly value: SettingsDto;
  change(change: Partial<SettingsDto>): void;
  listen(listener: (settings: SettingsDto) => void): void;
}

/** "Hoy, 10:24 a. m.", "Ayer, 18:02" or "12 nov, 9:15": when the last project was saved. */
export function lastSession(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return `${date.toLocaleDateString("es", { day: "numeric", month: "short" })}, ${time}`;
}

/** "1 proyecto" / "3 proyectos". */
export function projectCount(count: number): string {
  return `${count} ${count === 1 ? "proyecto" : "proyectos"}`;
}

/** How much of the world the editor view shows: a close look, like the editor zoomed in. */
const VIEW_ZOOM = 1.5;
const HEROES_PER_PAGE = 3;
const WALK = ["walk1", "idle", "walk2", "idle"];

/**
 * The quick access cards of the home screen, like a small dashboard:
 * - Editor de niveles: the last project's map drawn with the game's textures
 *   (around the hero), a minimap with the part in view, when it was last saved.
 * - Jugar: the heroes in a carousel; the chosen one walks in place, and it is
 *   the hero the "Elegir héroe" dialog starts on.
 * - Mis proyectos: the last project with its thumbnail.
 * - Ajustes: theme, sound and grid, changed right here.
 */
export class QuickAccess {
  private readonly onOpen: (project: ProjectDto) => void;
  private readonly settings: QuickSettings;
  private heroes: PlayableHero[] = [];
  private chosen = 0;
  private walkTimer = 0;
  private turnTimer = 0;
  private paused = false;
  private editorScene: readonly GameObject[] = SAMPLE_SCENE;
  private frame = 0;

  constructor(onOpen: (project: ProjectDto) => void, settings: QuickSettings) {
    this.onOpen = onOpen;
    this.settings = settings;
    this.wireSettings();
    const carousel = document.querySelector<HTMLElement>(".qa-heroes")!;
    // The carousel turns by itself, and waits while the pointer or the keyboard is on it.
    carousel.addEventListener("pointerenter", () => (this.paused = true));
    carousel.addEventListener("pointerleave", () => (this.paused = false));
    carousel.addEventListener("focusin", () => (this.paused = true));
    carousel.addEventListener("focusout", () => (this.paused = false));
    // The editor view is drawn at its real size: again when the window changes size.
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.drawEditor());
      }).observe(document.querySelector(".qa-stage")!);
    }
  }

  show(projects: readonly ProjectDto[]): void {
    this.showEditor(projects);
    this.showHeroes();
    this.showProject(projects);
    this.showSettings(this.settings.value);
  }

  hide(): void {
    window.clearInterval(this.walkTimer);
    window.clearInterval(this.turnTimer);
  }

  // ---------------------------------------------------------------- editor

  private showEditor(projects: readonly ProjectDto[]): void {
    const last = projects[0];
    this.editorScene = last && last.scene.length > 0 ? last.scene : SAMPLE_SCENE;
    this.drawEditor();
    void drawLevel(byId<HTMLCanvasElement>("qa-minimap"), this.editorScene);
    const status = byId("qa-status");
    status.classList.toggle("is-blue", isDemo());
    status.querySelector("span")!.textContent = isDemo() ? "Demo" : "En línea";
    byId("qa-last").textContent = last ? `Última sesión: ${lastSession(last.updated_at)}` : "Aún sin sesiones";
    byId("qa-editor-title").textContent = last ? "Continúa construyendo tu mundo" : "Crea tu primer mundo";
    byId("qa-editor-sub").textContent = last
      ? `Tu creatividad no tiene límites. Sigue con «${last.name}» donde lo dejaste.`
      : "Empieza con una plantilla o deja que la IA lo construya por ti.";
    byId("option-editor-go").textContent = last ? "Continuar creando" : "Crear mi primer nivel";
  }

  /** The close view around the hero, at the stage's real size (nothing cropped, nothing stretched). */
  private drawEditor(): void {
    const canvas = byId<HTMLCanvasElement>("qa-scene");
    const box = canvas.parentElement!.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const scene = this.editorScene;
    const view = viewAround(scene, box.width / VIEW_ZOOM, box.height / VIEW_ZOOM);
    void drawLevel(canvas, scene, view);
    const inView = byId("qa-viewport");
    inView.style.left = `${(view.x / WORLD_WIDTH) * 100}%`;
    inView.style.top = `${(view.y / WORLD_HEIGHT) * 100}%`;
    inView.style.width = `${(view.width / WORLD_WIDTH) * 100}%`;
    inView.style.height = `${(view.height / WORLD_HEIGHT) * 100}%`;
    // The selection box of the editor, around the hero.
    const select = byId("qa-select");
    const hero = scene.find((object) => object.kind === "player");
    select.hidden = hero === undefined;
    if (hero) {
      select.style.left = `${((hero.x - 20 - view.x) / view.width) * 100}%`;
      select.style.top = `${((hero.y - 20 - view.y) / view.height) * 100}%`;
      select.style.width = `${(40 / view.width) * 100}%`;
      select.style.height = `${(40 / view.height) * 100}%`;
    }
  }

  // ---------------------------------------------------------------- heroes

  private showHeroes(): void {
    this.heroes = playableHeroes();
    const saved = remembered();
    const index = this.heroes.findIndex((hero) => hero.id === saved);
    this.chosen = index >= 0 ? index : 0;
    const track = byId("qa-hero-track");
    track.replaceChildren(...this.heroes.map((hero, i) => {
      const card = make("button", "qa-hero");
      card.type = "button";
      card.setAttribute("role", "option");
      card.title = hero.name;
      const picture = make("img");
      picture.src = spriteUrl(hero.spriteId) ?? `${TEXTURE_BASE}${hero.texture}.png`;
      picture.alt = "";
      card.append(picture, make("span", "", hero.name));
      card.addEventListener("click", () => this.choose(i));
      return card;
    }));
    const dots = byId("qa-hero-dots");
    const pages = Math.ceil(this.heroes.length / HEROES_PER_PAGE);
    dots.replaceChildren(...Array.from({ length: pages }, (_, page) => {
      const dot = make("button", "qa-dot");
      dot.type = "button";
      dot.setAttribute("aria-label", `Héroes ${page * HEROES_PER_PAGE + 1} a ${Math.min(this.heroes.length, (page + 1) * HEROES_PER_PAGE)}`);
      dot.addEventListener("click", () => this.choose(page * HEROES_PER_PAGE));
      return dot;
    }));
    this.paint();
    window.clearInterval(this.turnTimer);
    window.clearInterval(this.walkTimer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.turnTimer = window.setInterval(() => {
      if (!this.paused && document.visibilityState === "visible") this.select((this.chosen + 1) % this.heroes.length);
    }, 3200);
    let step = 0;
    this.walkTimer = window.setInterval(() => {
      step = (step + 1) % WALK.length;
      const hero = this.heroes[this.chosen];
      const picture = byId("qa-hero-track").children[this.chosen]?.querySelector("img");
      // Only the game's own heroes have walking poses; a hero with its own picture keeps it.
      if (picture && hero && hero.spriteId === null && hero.texture.endsWith("-idle")) {
        picture.src = `${TEXTURE_BASE}${hero.texture.replace(/-idle$/, `-${WALK[step]}`)}.png`;
      }
    }, 170);
  }

  /** Pick a hero: it is also the one "Elegir héroe" starts on. */
  private choose(index: number): void {
    this.select(index);
    remember(this.heroes[this.chosen].id);
  }

  private select(index: number): void {
    const previous = byId("qa-hero-track").children[this.chosen]?.querySelector("img");
    const old = this.heroes[this.chosen];
    if (previous && old) previous.src = spriteUrl(old.spriteId) ?? `${TEXTURE_BASE}${old.texture}.png`;
    this.chosen = index;
    this.paint();
  }

  private paint(): void {
    const track = byId("qa-hero-track");
    [...track.children].forEach((card, i) => {
      card.classList.toggle("is-active", i === this.chosen);
      card.setAttribute("aria-selected", String(i === this.chosen));
    });
    // Keep the chosen hero in the middle of the three in view (or at the ends).
    const first = Math.min(Math.max(this.chosen - 1, 0), Math.max(0, this.heroes.length - HEROES_PER_PAGE));
    track.style.setProperty("--first", String(first));
    const page = Math.floor(this.chosen / HEROES_PER_PAGE);
    [...byId("qa-hero-dots").children].forEach((dot, i) => dot.classList.toggle("is-active", i === page));
  }

  // ---------------------------------------------------------------- projects

  private showProject(projects: readonly ProjectDto[]): void {
    byId("qa-project-count").querySelector("span")!.textContent = projectCount(projects.length);
    const root = byId("qa-project");
    const last = projects[0];
    if (last === undefined) {
      const empty = make("button", "qa-project-empty");
      empty.type = "button";
      empty.dataset.go = "projects";
      empty.append(make("b", "", "Aún no tienes proyectos"), make("span", "", "Crea uno desde una plantilla o con la IA."));
      root.replaceChildren(empty);
      return;
    }
    const open = make("button", "qa-project-row");
    open.type = "button";
    open.setAttribute("aria-label", `Abrir «${last.name}»`);
    const thumb = make("canvas", "qa-thumb") as HTMLCanvasElement;
    thumb.width = 200;
    thumb.height = 120;
    void drawLevel(thumb, last.scene);
    const text = make("span", "qa-project-text");
    const name = make("b", "", last.name);
    name.title = last.name;
    const when = make("small", "", `Modificado ${relativeTime(last.updated_at)}`);
    const saved = make("span", "qa-saved", "Guardado");
    text.append(name, when, saved);
    const go = make("span", "qa-go");
    go.setAttribute("aria-hidden", "true");
    go.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>';
    open.append(thumb, text, go);
    open.addEventListener("click", () => this.onOpen(last));
    root.replaceChildren(open);
  }

  // ---------------------------------------------------------------- settings

  private wireSettings(): void {
    byId<HTMLSelectElement>("qa-theme").addEventListener("change", (event) => {
      this.settings.change({ theme: (event.target as HTMLSelectElement).value as SettingsDto["theme"] });
    });
    byId<HTMLInputElement>("qa-sound").addEventListener("change", (event) => {
      const on = (event.target as HTMLInputElement).checked;
      this.settings.change(on ? { sfx_volume: 80, music_volume: 70 } : { sfx_volume: 0, music_volume: 0 });
    });
    byId<HTMLInputElement>("qa-grid").addEventListener("change", (event) => {
      this.settings.change({ show_grid: (event.target as HTMLInputElement).checked });
    });
    this.settings.listen((settings) => this.showSettings(settings));
  }

  private showSettings(settings: SettingsDto): void {
    byId<HTMLSelectElement>("qa-theme").value = settings.theme;
    const sound = settings.sfx_volume > 0 || settings.music_volume > 0;
    byId<HTMLInputElement>("qa-sound").checked = sound;
    byId("qa-sound-label").textContent = sound ? "Activado" : "Desactivado";
    byId<HTMLInputElement>("qa-grid").checked = settings.show_grid;
    byId("qa-grid-label").textContent = settings.show_grid ? "Activada" : "Desactivada";
  }
}
