import { deleteProject, duplicateProject, listProjects, type ProjectDto } from "../api/client";
import { iconUrl } from "../game/assets";
import { once } from "./busy";
import { byId, errorText, make } from "./dom";
import { projectIcon } from "./HomeScreen";
import { toast } from "./toast";

const COPY_ICON = "M9 9h11v11H9zM5 15H4V4h11v1";
const TRASH_ICON = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";

/** "hace 5 min", "ayer"... for the project dates. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "hace un momento";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/**
 * The "Mis proyectos" panel. It only shows data and tells the app which
 * project was opened; duplicating and deleting call the backend directly.
 */
export class ProjectList {
  private readonly list = byId("projects");
  private currentId: number | null = null;
  private readonly onOpen: (project: ProjectDto) => void;
  private readonly onDeleted: (id: number) => void;

  constructor(onOpen: (project: ProjectDto) => void, onDeleted: (id: number) => void) {
    this.onOpen = onOpen;
    this.onDeleted = onDeleted;
  }

  private row(project: ProjectDto): HTMLElement {
    const item = make("li", "project-row");
    item.classList.toggle("is-current", project.id === this.currentId);
    const thumb = make("span", "project-thumb");
    const icon = make("img");
    icon.src = iconUrl(projectIcon(project));
    icon.alt = "";
    thumb.append(icon);
    // The name is cut with "…" by CSS; the full name shows on hover.
    const text = make("div", "project-text");
    const name = make("strong", "", project.name);
    name.title = project.name;
    text.append(name, make("small", "", `${project.scene.length} objetos · ${relativeTime(project.updated_at)}`));
    const actions = make("div", "project-actions");
    actions.append(this.action(COPY_ICON, "Duplicar", () => this.duplicate(project)), this.action(TRASH_ICON, "Eliminar", () => this.remove(project), true));
    item.append(thumb, text, actions);
    item.addEventListener("click", () => this.onOpen(project));
    return item;
  }

  private action(path: string, label: string, handler: () => void | Promise<void>, danger = false): HTMLButtonElement {
    const button = make("button", `project-action${danger ? " is-danger" : ""}`);
    button.type = "button";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("d", path);
    svg.append(shape);
    button.append(svg);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void once(button, async () => handler()); // one request at a time, with its wheel
    });
    return button;
  }

  private async duplicate(project: ProjectDto): Promise<void> {
    try {
      const copy = await duplicateProject(project.id);
      toast(`Copiado como "${copy.name}".`, "success");
      await this.refresh();
    } catch (error) {
      toast(errorText(error), "error");
    }
  }

  private async remove(project: ProjectDto): Promise<void> {
    if (!window.confirm(`¿Eliminar "${project.name}"? No se puede deshacer.`)) return;
    try {
      await deleteProject(project.id);
      toast("Proyecto eliminado.", "success");
      this.onDeleted(project.id);
      await this.refresh();
    } catch (error) {
      toast(errorText(error), "error");
    }
  }

  async refresh(): Promise<ProjectDto[]> {
    const projects = await listProjects();
    this.list.replaceChildren();
    if (projects.length === 0) {
      this.list.append(make("li", "empty", "Aún no tienes proyectos. Crea el primero con “+ Nuevo”."));
    }
    for (const project of projects) this.list.append(this.row(project));
    return projects;
  }

  setCurrent(id: number | null): void {
    this.currentId = id;
  }

  clear(): void {
    this.list.replaceChildren();
  }
}
