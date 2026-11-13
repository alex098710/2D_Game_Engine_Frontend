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
  }

  show(user: UserDto, projects: ProjectDto[]): void {
    const initial = user.username.slice(0, 1).toUpperCase();
    byId("home-avatar").textContent = initial;
    byId("welcome-avatar").textContent = initial;
    byId("home-user").textContent = user.username;
    byId("welcome-title").textContent = `Bienvenido, ${user.username}`;
    byId("kpi-projects").textContent = String(projects.length);
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
    if (projects.length === 0) {
      list.append(make("li", "recent-empty", "Aún no tienes proyectos. Abre el editor para crear el primero."));
      return;
    }
    for (const project of projects.slice(0, 4)) {
      const row = make("li");
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
      button.append(thumb, text, make("span", "recent-chip", objectCount(project.scene.length)), make("span", "recent-arrow", "→"));
      button.addEventListener("click", () => this.onGo("editor", project));
      row.append(button);
      list.append(row);
    }
  }

  private async loadNumbers(): Promise<void> {
    const [stats, achievements] = await Promise.all([myStats(), myAchievements()]).catch(() => [null, null] as const);
    if (stats !== null) {
      byId("kpi-games").textContent = String(stats.games_played);
      byId("kpi-best").textContent = String(stats.best_score);
      byId("welcome-sub").textContent = stats.games_played === 0
        ? "Tu forja está lista. Juega tu primera partida y la IA empezará a aprender."
        : `Has jugado ${stats.games_played} ${stats.games_played === 1 ? "partida" : "partidas"} · la IA aprende de cada una.`;
    }
    if (achievements !== null) byId("kpi-achievements").textContent = `${achievements.length}/${ACHIEVEMENTS_TOTAL}`;
  }
}
