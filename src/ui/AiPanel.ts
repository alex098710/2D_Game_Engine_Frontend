import { aiModel, aiObstacles, askAi, setAiDifficulty, type AiModelDto, type DifficultyLevel, type ProjectDto } from "../api/client";
import { byId, errorText, make } from "./dom";
import { toast } from "./toast";

/** The four levels the player can choose, with the value the backend stores. */
export const DIFFICULTIES: readonly { level: DifficultyLevel; name: string; value: number }[] = [
  { level: "easy", name: "Fácil", value: 0.2 },
  { level: "medium", name: "Medio", value: 0.45 },
  { level: "hard", name: "Difícil", value: 0.7 },
  { level: "extreme", name: "Extremo", value: 0.95 },
];

/** The level a difficulty between 0 and 1 falls in: the nearest of the four. */
export function levelOf(value: number): DifficultyLevel {
  return DIFFICULTIES.reduce((best, item) => (Math.abs(item.value - value) < Math.abs(best.value - value) ? item : best)).level;
}

/** "Fácil", "Medio", "Difícil" or "Extremo" for a difficulty between 0 and 1. */
export function difficultyLabel(value: number): string {
  return DIFFICULTIES.find((item) => item.level === levelOf(value))!.name;
}

/**
 * Two ways to use the AI: describe objects in words, or let the model that
 * learned from your runs place new obstacles. The player also chooses the
 * difficulty. Only one AI request runs at a time: while it works, every AI
 * control is disabled and the pressed button shows a spinning wheel.
 */
export class AiPanel {
  private readonly getProjectId: () => number | null;
  private readonly onScene: (project: ProjectDto) => void;
  private readonly beforeRequest: () => Promise<void>;
  private readonly count = byId<HTMLInputElement>("ai-count");
  private working = false;
  private level: DifficultyLevel = "medium";
  /** When the last request ended (performance.now()), to ignore a press that comes right after. */
  private finishedAt = -Infinity;

  /** beforeRequest saves pending edits: the AI works on the scene stored in the backend. */
  constructor(getProjectId: () => number | null, onScene: (project: ProjectDto) => void, beforeRequest: () => Promise<void>) {
    this.getProjectId = getProjectId;
    this.onScene = onScene;
    this.beforeRequest = beforeRequest;
    this.count.addEventListener("input", () => (byId("ai-count-value").textContent = this.count.value));
    byId<HTMLFormElement>("ai-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.ask();
    });
    // "Pedir a la IA" only works with something written, and only once at a time.
    const prompt = byId<HTMLTextAreaElement>("ai-prompt");
    prompt.addEventListener("input", () => {
      prompt.classList.remove("is-needed");
      byId("ai-prompt-note").hidden = true;
      this.syncAsk();
    });
    this.syncAsk();
    byId("btn-ai-obstacles").addEventListener("click", () => void this.obstacles());
    for (const button of byId("ai-difficulty").querySelectorAll<HTMLButtonElement>("[data-level]")) {
      button.addEventListener("click", () => void this.choose(button.dataset.level as DifficultyLevel));
    }
    this.showLevel(this.level);
  }

  /** The ask button: off while the box is empty or a request is running. */
  private syncAsk(): void {
    const empty = byId<HTMLTextAreaElement>("ai-prompt").value.trim() === "";
    const button = byId<HTMLButtonElement>("btn-ai-ask");
    button.disabled = this.working || empty;
    button.title = empty ? "Escribe primero qué quieres que haga la IA" : "";
  }

  private async ask(): Promise<void> {
    // One request at a time, and none again right after one ends (a double press sends one).
    if (this.working || performance.now() - this.finishedAt < 700) return;
    const prompt = byId<HTMLTextAreaElement>("ai-prompt");
    if (prompt.value.trim() === "") {
      // Said once, next to the box: no new notice for every press.
      prompt.classList.remove("is-needed");
      void prompt.offsetWidth;
      prompt.classList.add("is-needed");
      byId("ai-prompt-note").hidden = false;
      prompt.focus();
      return;
    }
    const id = this.requireProject();
    if (id === null) return;
    await this.busy(byId<HTMLButtonElement>("btn-ai-ask"), "Pensando…", "La IA está creando lo que pediste", async () => {
      await this.beforeRequest();
      const project = await askAi(id, prompt.value.trim());
      this.onScene(project);
      prompt.value = "";
      toast(aiSummary(project.ai), project.ai && project.ai.added + project.ai.removed === 0 ? "info" : "success");
    });
  }

  private async obstacles(): Promise<void> {
    if (this.working) return;
    const id = this.requireProject();
    if (id === null) return;
    await this.busy(byId<HTMLButtonElement>("btn-ai-obstacles"), "Colocando obstáculos…", "La IA está colocando obstáculos", async () => {
      await this.beforeRequest();
      const result = await aiObstacles(id, Number(this.count.value));
      this.onScene(result);
      toast(`La IA colocó ${result.added} obstáculos (${difficultyLabel(result.difficulty)}).`, "success");
      await this.refresh(id);
    });
  }

  /** Pick one of the four levels; shown at once, then saved. */
  private async choose(level: DifficultyLevel): Promise<void> {
    if (this.working || level === this.level) return;
    const id = this.requireProject();
    if (id === null) return;
    const previous = this.level;
    this.showLevel(level);
    const button = byId("ai-difficulty").querySelector<HTMLButtonElement>(`[data-level="${level}"]`)!;
    await this.busy(button, null, "Guardando la dificultad", async () => {
      try {
        const model = await setAiDifficulty(id, level);
        this.showModel(model);
        toast(`Dificultad: ${difficultyLabel(model.difficulty)}. La IA seguirá aprendiendo desde aquí.`, "success");
      } catch (error) {
        this.showLevel(previous);
        throw error;
      }
    });
  }

  async refresh(id: number | null = this.getProjectId()): Promise<void> {
    const root = byId("ai-model");
    if (id === null) {
      root.replaceChildren(make("span", "", "Abre un proyecto para ver lo que aprendió la IA."));
      return;
    }
    let model: AiModelDto;
    try {
      model = await aiModel(id);
    } catch {
      root.replaceChildren(make("span", "", "La IA aún no está disponible."));
      return;
    }
    this.showModel(model);
  }

  private showModel(model: AiModelDto): void {
    this.showLevel(model.level ?? levelOf(model.difficulty));
    const meter = make("span", "meter");
    const fill = make("span");
    fill.style.width = `${Math.round(model.difficulty * 100)}%`;
    meter.append(fill);
    const line = make("span", "ai-model-line");
    line.append("Dificultad actual: ", make("strong", "", `${difficultyLabel(model.difficulty)} · ${Math.round(model.difficulty * 100)}%`));
    const runs = make("span", "", model.samples_seen === 0
      ? "Juega una partida para que la IA empiece a aprender."
      : `Aprendió de ${model.samples_seen} partida${model.samples_seen === 1 ? "" : "s"}.`);
    byId("ai-model").replaceChildren(line, meter, runs);
  }

  private showLevel(level: DifficultyLevel): void {
    this.level = level;
    const root = byId("ai-difficulty");
    root.dataset.level = level;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-level]")) {
      const chosen = button.dataset.level === level;
      button.classList.toggle("is-active", chosen);
      button.setAttribute("aria-checked", String(chosen));
    }
    byId("ai-level-name").textContent = DIFFICULTIES.find((item) => item.level === level)!.name;
  }

  /** Locks every AI control, spins the wheel on the pressed button, unlocks at the end. */
  private async busy(button: HTMLButtonElement, working: string | null, status: string, work: () => Promise<void>): Promise<void> {
    this.working = true;
    const panel = button.closest<HTMLElement>(".dock-panel")!;
    const label = button.querySelector(".btn-label");
    const idle = label?.textContent ?? "";
    if (label && working) label.textContent = working;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    panel.classList.add("is-ai-working");
    const controls = [...panel.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement | HTMLInputElement>("button, textarea, input")];
    for (const control of controls) control.disabled = true;
    byId("ai-working-text").textContent = status;
    byId("ai-working").hidden = false;
    try {
      await work();
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      this.working = false;
      this.finishedAt = performance.now();
      if (label) label.textContent = idle;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      panel.classList.remove("is-ai-working");
      for (const control of controls) control.disabled = false;
      byId("ai-working").hidden = true;
      this.syncAsk();
    }
  }

  private requireProject(): number | null {
    const id = this.getProjectId();
    if (id === null) toast("Crea o abre un proyecto primero.", "error");
    return id;
  }
}

/** What the AI changed, in words: "La IA quitó 12 objetos y añadió 3." */
export function aiSummary(change?: { added: number; removed: number }): string {
  if (!change) return "La IA actualizó la escena.";
  const n = (count: number) => `${count} objeto${count === 1 ? "" : "s"}`;
  const parts = [];
  if (change.removed > 0) parts.push(`quitó ${n(change.removed)}`);
  if (change.added > 0) parts.push(`añadió ${n(change.added)}`);
  if (parts.length === 0) return "La IA no encontró nada que cambiar con esa petición.";
  return `La IA ${parts.join(" y ")}.`;
}
