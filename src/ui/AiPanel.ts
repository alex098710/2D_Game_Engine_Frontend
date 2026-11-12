import { aiModel, aiObstacles, askAi, type AiModelDto, type ProjectDto } from "../api/client";
import { byId, errorText, make } from "./dom";
import { toast } from "./toast";

/** "Fácil", "Normal"... for a difficulty between 0 and 1. */
export function difficultyLabel(value: number): string {
  if (value < 0.3) return "Fácil";
  if (value < 0.55) return "Normal";
  if (value < 0.8) return "Difícil";
  return "Muy difícil";
}

/**
 * Two ways to use the AI: describe objects in words, or let the model that
 * learned from your runs place new obstacles. The model summary shows what
 * it has learned so far.
 */
export class AiPanel {
  private readonly getProjectId: () => number | null;
  private readonly onScene: (project: ProjectDto) => void;
  private readonly beforeRequest: () => Promise<void>;
  private readonly count = byId<HTMLInputElement>("ai-count");

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
    byId("btn-ai-obstacles").addEventListener("click", () => void this.obstacles());
  }

  private async ask(): Promise<void> {
    const id = this.requireProject();
    const prompt = byId<HTMLTextAreaElement>("ai-prompt");
    if (id === null) return;
    if (prompt.value.trim() === "") {
      toast("Escribe qué debe crear o borrar la IA.", "error");
      return;
    }
    await this.busy(byId<HTMLFormElement>("ai-form").querySelector("button")!, async () => {
      await this.beforeRequest();
      const project = await askAi(id, prompt.value.trim());
      this.onScene(project);
      prompt.value = "";
      toast(aiSummary(project.ai), project.ai && project.ai.added + project.ai.removed === 0 ? "info" : "success");
    });
  }

  private async obstacles(): Promise<void> {
    const id = this.requireProject();
    if (id === null) return;
    await this.busy(byId<HTMLButtonElement>("btn-ai-obstacles"), async () => {
      await this.beforeRequest();
      const result = await aiObstacles(id, Number(this.count.value));
      this.onScene(result);
      toast(`La IA colocó ${result.added} obstáculos (${difficultyLabel(result.difficulty)}).`, "success");
      await this.refresh(id);
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
    const meter = make("span", "meter");
    const fill = make("span");
    fill.style.width = `${Math.round(model.difficulty * 100)}%`;
    meter.append(fill);
    const line = make("span");
    line.append("Dificultad: ", make("strong", "", difficultyLabel(model.difficulty)));
    const runs = make("span", "", model.samples_seen === 0
      ? "Juega una partida para que la IA empiece a aprender."
      : `Aprendió de ${model.samples_seen} partida${model.samples_seen === 1 ? "" : "s"}.`);
    root.replaceChildren(line, meter, runs);
  }

  private async busy(button: HTMLButtonElement, work: () => Promise<void>): Promise<void> {
    button.classList.add("is-loading");
    button.disabled = true;
    try {
      await work();
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      button.classList.remove("is-loading");
      button.disabled = false;
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
