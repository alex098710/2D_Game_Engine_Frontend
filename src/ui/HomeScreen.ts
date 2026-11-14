import { myAchievements, myStats, type ProjectDto, type UserDto } from "../api/client";
import { iconUrl, TEXTURE_BASE } from "../game/assets";
import { currentBalance, currentCreations, playableEnemy, playableHero, playableHeroes } from "../game/balance";
import { spriteUrl } from "../game/sprites";
import { isEnemy, type Kind } from "../model/GameObject";
import { byId, make } from "./dom";
import { NightScene } from "./NightScene";
import { QuickAccess, type QuickSettings } from "./QuickAccess";
import { remembered } from "./HeroDialog";
import { drawLevel } from "./levelPreview";
import { relativeTime } from "./ProjectList";

export type Destination = "home" | "editor" | "play" | "projects" | "settings" | "admin";

const ACHIEVEMENTS_TOTAL = 5;

/** The picture of a project in the recent list: its most telling object. */
export function projectIcon(project: ProjectDto): Kind {
  const kinds = new Set(project.scene.map((object) => object.kind));
  for (const kind of ["house", "brute", "ghost", "chest", "wizard"] as Kind[]) if (kinds.has(kind)) return kind;
  const enemy = project.scene.find((object) => isEnemy(object.kind));
  return enemy?.kind ?? "tree";
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches" for the hour of the day. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** The ranks, from the number of games played (forgeRank's thresholds). */
const RANKS: { from: number; name: string }[] = [
  { from: 0, name: "Aprendiz de la forja" },
  { from: 1, name: "Herrero novato" },
  { from: 10, name: "Forjador" },
  { from: 30, name: "Maestro forjador" },
  { from: 100, name: "Leyenda de la forja" },
];

/** Where the player stands: rank level (1-5), its name, how far to the next one (0-1) and what is left. */
export function rankProgress(games: number): { level: number; name: string; progress: number; next: string } {
  const index = RANKS.reduce((found, rank, i) => (games >= rank.from ? i : found), 0);
  const current = RANKS[index];
  const following = RANKS[index + 1];
  if (following === undefined) return { level: index + 1, name: current.name, progress: 1, next: "Rango máximo: eres una leyenda." };
  const left = following.from - games;
  return {
    level: index + 1,
    name: current.name,
    progress: (games - current.from) / (following.from - current.from),
    next: `Te ${left === 1 ? "falta 1 partida" : `faltan ${left} partidas`} para ser ${following.name}.`,
  };
}

/** A title earned by playing: it only depends on the number of games. */
export function forgeRank(games: number): string {
  if (games >= 100) return "Leyenda de la forja";
  if (games >= 30) return "Maestro forjador";
  if (games >= 10) return "Forjador";
  if (games >= 1) return "Herrero novato";
  return "Aprendiz de la forja";
}

/** Counts a number up from 0 in about 0.9 s (instantly for reduced motion). */
function countUp(element: HTMLElement, value: number, suffix = ""): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
    element.textContent = `${value}${suffix}`;
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / 900);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = `${Math.round(value * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** "1 objeto" / "24 objetos". */
export function objectCount(count: number): string {
  return `${count} ${count === 1 ? "objeto" : "objetos"}`;
}

/**
 * The main menu, shown after the intro: a welcome with the player's numbers,
 * the four options of the engine and the recent projects. The navigation bar
 * on top only exists once the user is in.
 */
export class HomeScreen {
  private readonly screen = byId("home");
  private readonly onGo: (to: Destination, project?: ProjectDto) => void;
  private readonly quick: QuickAccess;
  private partyTimer = 0;
  /** The night behind the menu: runs only while the home is on screen. */
  private readonly scene = new NightScene(byId<HTMLCanvasElement>("home-scene"), byId("home-castle"), byId("home-wizard-spot"));

  constructor(onGo: (to: Destination, project?: ProjectDto) => void, onLogout: () => void, settings: QuickSettings) {
    this.onGo = onGo;
    this.quick = new QuickAccess((project) => onGo("editor", project), settings);
    // The editor view is a big button too: Enter or Space opens the editor.
    this.screen.addEventListener("keydown", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-go][role=button]");
      if (target === null || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      onGo(target.dataset.go as Destination);
    });
    this.screen.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-go]");
      if (target !== null) onGo(target.dataset.go as Destination);
    });
    byId("home-logout").addEventListener("click", onLogout);
    this.followPointer();
  }

  /**
   * Cards and recent rows light up where the pointer is (--mx/--my) and the
   * cards tilt a few degrees towards it (--rx/--ry). Skipped for touch and
   * for people who asked the system for less motion.
   */
  private followPointer(): void {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.screen.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const target = (event.target as HTMLElement).closest<HTMLElement>(".option, .recent-card, .qa-card");
      if (target === null) return;
      const box = target.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      target.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      target.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      if (target.classList.contains("option") && !still.matches) {
        const tilt = target.classList.contains("option-feature") ? 3 : 6;
        target.style.setProperty("--rx", `${((0.5 - y) * tilt).toFixed(2)}deg`);
        target.style.setProperty("--ry", `${((x - 0.5) * tilt).toFixed(2)}deg`);
      }
    });
    this.screen.addEventListener("pointerout", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".option");
      if (target === null || target.contains(event.relatedTarget as Node | null)) return;
      target.style.setProperty("--rx", "0deg");
      target.style.setProperty("--ry", "0deg");
    });
  }

  show(user: UserDto, projects: ProjectDto[]): void {
    const initial = user.username.slice(0, 1).toUpperCase();
    byId("home-avatar").textContent = initial;
    byId("welcome-avatar").textContent = initial;
    byId("home-user").textContent = user.username;
    byId("welcome-title").replaceChildren("Bienvenido, ", make("span", "welcome-name", user.username));
    const now = new Date();
    byId("welcome-greeting").textContent = greeting(now.getHours());
    byId("welcome-date").textContent = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
    countUp(byId("kpi-projects"), projects.length);
    byId("kpi-projects-note").textContent = projects[0] ? `Último: ${projects[0].name}` : "Crea el primero";
    byId("kpi-projects-note").title = projects[0]?.name ?? "";
    this.showRank(0);
    this.showParty();
    byId("option-editor-go").textContent = projects[0] ? `Continuar con “${projects[0].name}”` : "Crear mi primer nivel";
    byId("option-projects-go").textContent = projects.length > 0 ? `Ver los ${projects.length} proyectos` : "Crear un proyecto";
    this.renderRecent(projects);
    this.renderAdmin();
    this.quick.show(projects);
    this.screen.hidden = false;
    this.screen.classList.remove("is-entering");
    void this.screen.offsetWidth;
    this.screen.classList.add("is-entering");
    this.scene.start();
    void this.loadNumbers();
  }

  hide(): void {
    this.screen.hidden = true;
    window.clearInterval(this.partyTimer);
    this.quick.hide();
    this.scene.stop();
  }

  get visible(): boolean {
    return !this.screen.hidden;
  }

  /** The recent projects as cards: a real thumbnail of the map, the name, when, the size and "Abrir". */
  private renderRecent(projects: ProjectDto[]): void {
    const list = byId("recent-projects");
    list.replaceChildren();
    const recent = projects.slice(0, 4);
    byId("recent-count").textContent = String(projects.length);
    if (recent.length === 0) {
      const empty = make("li", "recent-empty");
      const image = make("img");
      image.src = iconUrl("chest");
      image.alt = "";
      const go = make("button", "qa-cta recent-empty-cta");
      go.type = "button";
      go.dataset.go = "editor";
      go.append(make("span", "", "Crear mi primer nivel"), make("i", "", "→"));
      empty.append(image, make("b", "", "Aún no tienes proyectos"), make("span", "", "Abre el editor y crea el primero en segundos, desde una plantilla o con la IA."), go);
      list.append(empty);
      return;
    }
    const biggest = Math.max(1, ...recent.map((project) => project.scene.length));
    recent.forEach((project, index) => {
      const row = make("li", `recent-item row-${index + 1}`);
      const card = make("button", "recent-card");
      card.type = "button";
      card.setAttribute("aria-label", `Abrir «${project.name}»`);
      const thumb = make("span", "recent-thumb");
      const canvas = make("canvas") as HTMLCanvasElement;
      canvas.width = 320;
      canvas.height = 192;
      void drawLevel(canvas, project.scene);
      thumb.append(canvas, make("span", "recent-index", String(index + 1).padStart(2, "0")));
      const text = make("span", "recent-text");
      const name = make("b", "", project.name);
      name.title = project.name;
      text.append(name, make("small", "", `Editado ${relativeTime(project.updated_at)}`));
      const size = make("span", "recent-size");
      const bar = make("span", "recent-bar");
      const fill = make("i");
      fill.style.setProperty("--size", String(Math.max(0.04, project.scene.length / biggest)));
      bar.append(fill);
      size.append(make("small", "", objectCount(project.scene.length)), bar);
      const open = make("span", "recent-open");
      open.append(make("span", "", "Abrir"), make("i", "", "→"));
      card.append(thumb, text, size, open);
      card.addEventListener("click", () => this.onGo("editor", project));
      row.append(card);
      list.append(row);
    });
  }

  /** The admin console: what this account adjusted, and a duel with its own numbers. */
  private renderAdmin(): void {
    const balance = currentBalance();
    byId("home-adm-heroes").textContent = String(Object.keys(balance.heroes).length);
    byId("home-adm-enemies").textContent = String(Object.keys(balance.enemies).length);
    byId("home-adm-creations").textContent = String(currentCreations().length);
    const hero = playableHero(remembered());
    const enemy = playableEnemy("brute");
    byId<HTMLImageElement>("duel-hero").src = spriteUrl(hero.spriteId) ?? `${TEXTURE_BASE}${hero.texture}.png`;
    byId<HTMLImageElement>("duel-enemy").src = spriteUrl(enemy.spriteId) ?? `${TEXTURE_BASE}${enemy.texture}.png`;
    byId("duel-hero-stats").textContent = `♥ ${hero.maxHealth} · ⚔ ${hero.damage}`;
    byId("duel-enemy-stats").textContent = `♥ ${enemy.health} · ⚔ ${enemy.damage}`;
  }

  /** The rank card: level, name, the bar to the next rank and what is left. */
  private showRank(games: number): void {
    const rank = rankProgress(games);
    byId("welcome-rank").textContent = rank.name;
    byId("rank-level").textContent = String(rank.level);
    byId("rank-next").textContent = rank.next;
    byId("rank-bar").style.setProperty("--rank", rank.progress.toFixed(3));
    byId("rank-progress").setAttribute("aria-valuenow", String(Math.round(rank.progress * 100)));
  }

  /** Three heroes walking in place on their ledge: the chosen one first, then two companions. */
  private showParty(): void {
    const heroes = playableHeroes();
    const chosen = heroes.find((hero) => hero.id === remembered()) ?? heroes[0];
    const party = [chosen, ...heroes.filter((hero) => hero !== chosen && !hero.custom)].slice(0, 3);
    const root = byId("welcome-party");
    root.replaceChildren(...party.map((hero, i) => {
      const picture = make("img", `party-hero is-${i}`);
      picture.src = spriteUrl(hero.spriteId) ?? `${TEXTURE_BASE}${hero.texture}.png`;
      picture.alt = "";
      return picture;
    }));
    window.clearInterval(this.partyTimer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const steps = ["walk1", "idle", "walk2", "idle"];
    let tick = 0;
    this.partyTimer = window.setInterval(() => {
      tick += 1;
      party.forEach((hero, i) => {
        if (hero.spriteId !== null || !hero.texture.endsWith("-idle")) return;
        const image = root.children[i] as HTMLImageElement | undefined;
        if (image) image.src = `${TEXTURE_BASE}${hero.texture.replace(/-idle$/, `-${steps[(tick + i) % steps.length]}`)}.png`;
      });
    }, 180);
  }

  private async loadNumbers(): Promise<void> {
    const [stats, achievements] = await Promise.all([myStats(), myAchievements()]).catch(() => [null, null] as const);
    if (stats !== null) {
      countUp(byId("kpi-games"), stats.games_played);
      countUp(byId("kpi-best"), stats.best_score);
      this.showRank(stats.games_played);
      byId("kpi-games-note").textContent = `${stats.games_won} ${stats.games_won === 1 ? "ganada" : "ganadas"}`;
      byId("welcome-sub").textContent = stats.games_played === 0
        ? "Tu forja está lista. Juega tu primera partida y la IA empezará a aprender."
        : `Has jugado ${stats.games_played} ${stats.games_played === 1 ? "partida" : "partidas"} · la IA aprende de cada una.`;
    }
    if (achievements !== null) {
      countUp(byId("kpi-achievements"), achievements.length, `/${ACHIEVEMENTS_TOTAL}`);
      // The ring around the star fills with the share of achievements earned.
      // One block lights up per achievement, one after another.
      [...byId("kpi-blocks").children].forEach((block, i) => {
        block.classList.toggle("is-on", i < achievements.length);
        (block as HTMLElement).style.setProperty("--i", String(i));
      });
    }
  }
}
