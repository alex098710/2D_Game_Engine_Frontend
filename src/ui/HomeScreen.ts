import { myAchievements, myStats, type ProjectDto, type UserDto } from "../api/client";
import { iconUrl } from "../game/assets";
import { isEnemy, type Kind } from "../model/GameObject";
import { byId, make } from "./dom";
import { relativeTime } from "./ProjectList";

export type Destination = "home" | "editor" | "play" | "projects" | "settings";

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

  constructor(onGo: (to: Destination, project?: ProjectDto) => void, onLogout: () => void) {
    this.onGo = onGo;
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
      const target = (event.target as HTMLElement).closest<HTMLElement>(".option, .recent-row");
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
    byId("option-editor-go").textContent = projects[0] ? `Continuar con “${projects[0].name}”` : "Crear mi primer nivel";
    byId("option-projects-go").textContent = projects.length > 0 ? `Ver los ${projects.length} proyectos` : "Crear un proyecto";
    this.renderRecent(projects);
    this.screen.hidden = false;
    this.screen.classList.remove("is-entering");
    void this.screen.offsetWidth;
    this.screen.classList.add("is-entering");
    void this.loadNumbers();
  }

  hide(): void {
    this.screen.hidden = true;
  }

  get visible(): boolean {
    return !this.screen.hidden;
  }

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
      const go = make("button", "btn-outline", "Crear mi primer nivel →");
      go.type = "button";
      go.dataset.go = "editor";
      empty.append(image, make("b", "", "Aún no tienes proyectos"), make("span", "", "Abre el editor y crea el primero en segundos."), go);
      list.append(empty);
      return;
    }
    // The size bar compares each project with the biggest one in the list.
    const biggest = Math.max(1, ...recent.map((project) => project.scene.length));
    recent.forEach((project, index) => {
      const row = make("li");
      row.classList.add(`row-${index + 1}`);
      const button = make("button", "recent-row");
      button.type = "button";
      const thumb = make("span", "recent-thumb");
      const icon = make("img");
      icon.src = iconUrl(projectIcon(project));
      icon.alt = "";
      thumb.append(icon);
      const text = make("span", "recent-text");
      const name = make("b", "", project.name);
      name.title = project.name;
      text.append(name, make("small", "", `Editado ${relativeTime(project.updated_at)}`));
      const size = make("span", "recent-size");
      const bar = make("span", "recent-bar");
      const fill = make("i");
      fill.style.width = `${Math.max(4, (project.scene.length / biggest) * 100)}%`;
      bar.append(fill);
      size.append(make("small", "", objectCount(project.scene.length)), bar);
      const open = make("span", "recent-open");
      open.append(make("span", "", "Abrir"), make("i", "", "→"));
      button.append(make("span", "recent-index", String(index + 1).padStart(2, "0")), thumb, text, size, open);
      button.addEventListener("click", () => this.onGo("editor", project));
      row.append(button);
      list.append(row);
    });
  }

  private async loadNumbers(): Promise<void> {
    const [stats, achievements] = await Promise.all([myStats(), myAchievements()]).catch(() => [null, null] as const);
    if (stats !== null) {
      countUp(byId("kpi-games"), stats.games_played);
      countUp(byId("kpi-best"), stats.best_score);
      byId("welcome-rank").textContent = forgeRank(stats.games_played);
      byId("welcome-sub").textContent = stats.games_played === 0
        ? "Tu forja está lista. Juega tu primera partida y la IA empezará a aprender."
        : `Has jugado ${stats.games_played} ${stats.games_played === 1 ? "partida" : "partidas"} · la IA aprende de cada una.`;
    }
    if (achievements !== null) {
      countUp(byId("kpi-achievements"), achievements.length, `/${ACHIEVEMENTS_TOTAL}`);
      // The ring around the star fills with the share of achievements earned.
      byId("kpi-ring").style.setProperty("--p", String(Math.min(1, achievements.length / ACHIEVEMENTS_TOTAL)));
    }
  }
}
