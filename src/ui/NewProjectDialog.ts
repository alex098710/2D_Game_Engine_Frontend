import { listTemplates, type ProjectDto, type TemplateDto } from "../api/client";
import { bindNameCounter, byId, errorText, make } from "./dom";
import { trackActive } from "./editorFx";
import { drawPreview } from "./mapPreview";

let showNewNameCount: (() => void) | undefined;
let wired = false;

const FALLBACK: TemplateDto[] = [{ code: "empty", name: "Vacío", description: "Una escena sin objetos", object_count: 0 }];

/** What the player chose: a template, or a description for the AI (prompt). */
export interface NewProjectChoice {
  name: string;
  template: string;
  prompt: string | null;
}

/** Step 1 creating, 2 the AI builds the map, 3 opening the editor. */
export type ProgressStep = 1 | 2 | 3;

/** The prompt to send, or null when the player starts from a template. */
export function promptFor(mode: "template" | "ai", text: string): string | null {
  const prompt = text.trim();
  return mode === "ai" && prompt !== "" ? prompt : null;
}

/**
 * Ask for a name and how to start: a template or a description for the AI.
 * The dialog stays open while `build` runs (it creates the project and, with
 * a description, lets the AI fill the map) and shows each step; nothing can
 * be pressed or closed meanwhile. Resolves to the new project, or null when
 * cancelled.
 */
export async function askNewProject(
  build: (choice: NewProjectChoice, step: (step: ProgressStep) => void) => Promise<ProjectDto>,
): Promise<ProjectDto | null> {
  const dialog = byId<HTMLDialogElement>("new-project-dialog");
  const form = byId<HTMLFormElement>("new-project-form");
  const name = byId<HTMLInputElement>("new-project-name");
  const prompt = byId<HTMLTextAreaElement>("np-prompt");
  const templates = byId("templates");
  wire();

  const options = await listTemplates().catch(() => FALLBACK);
  templates.replaceChildren(...options.map((t, i) => templateOption(t, i === 0)));
  name.value = "Mi juego";
  prompt.value = "";
  prompt.dispatchEvent(new Event("input"));
  showNewNameCount ??= bindNameCounter(name, byId("new-project-count"));
  showNewNameCount();
  setMode("template");
  setBusy(false);
  byId("np-progress").hidden = true;
  byId("np-error").textContent = "";
  dialog.showModal();
  name.select();

  return new Promise((resolve) => {
    let busy = false;
    const blockEscape = (event: Event): void => {
      if (busy) event.preventDefault();
    };
    const onSubmit = async (event: SubmitEvent): Promise<void> => {
      const submitter = event.submitter as HTMLButtonElement | null;
      if (submitter?.value !== "create") return; // Cancelar closes the dialog as usual
      event.preventDefault();
      if (busy) return;
      const mode = currentMode();
      const choice: NewProjectChoice = {
        name: name.value.trim(),
        template: templates.querySelector<HTMLInputElement>("input:checked")?.value ?? "empty",
        prompt: promptFor(mode, prompt.value),
      };
      if (choice.name === "") {
        byId("np-error").textContent = "Escribe un nombre para el proyecto.";
        name.focus();
        return;
      }
      if (mode === "ai" && choice.prompt === null) {
        byId("np-error").textContent = "Describe el mapa o elige una de las ideas.";
        prompt.focus();
        return;
      }
      busy = true;
      setBusy(true);
      byId("np-error").textContent = "";
      showProgress(choice.prompt !== null);
      try {
        const project = await build(choice, markStep);
        markStep(3);
        await new Promise((done) => window.setTimeout(done, 350));
        finish(project);
      } catch (error) {
        busy = false;
        setBusy(false);
        byId("np-progress").hidden = true;
        byId("np-error").textContent = errorText(error);
      }
    };
    const onClose = (): void => finish(null);
    const finish = (project: ProjectDto | null): void => {
      form.removeEventListener("submit", onSubmit);
      dialog.removeEventListener("cancel", blockEscape);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close(project === null ? "cancel" : "create");
      resolve(project);
    };
    form.addEventListener("submit", onSubmit);
    dialog.addEventListener("cancel", blockEscape);
    dialog.addEventListener("close", onClose, { once: true });
  });
}

/** Mode tabs, idea cards and the prompt counter are wired once. */
function wire(): void {
  if (wired) return;
  wired = true;
  const modes = byId("np-modes");
  for (const tab of modes.querySelectorAll<HTMLButtonElement>(".np-mode")) {
    tab.addEventListener("click", () => {
      setMode(tab.dataset.mode as "template" | "ai");
      if (tab.dataset.mode === "ai") byId("np-prompt").focus();
    });
  }
  trackActive(modes, modes.querySelector<HTMLElement>(".tab-pill")!, ".np-mode.is-active");
  const prompt = byId<HTMLTextAreaElement>("np-prompt");
  prompt.addEventListener("input", () => {
    byId("np-prompt-count").textContent = `${prompt.value.length}/500`;
    for (const idea of document.querySelectorAll<HTMLElement>("#np-ideas .idea")) idea.classList.toggle("is-active", idea.dataset.prompt === prompt.value);
  });
  for (const idea of document.querySelectorAll<HTMLButtonElement>("#np-ideas .idea")) {
    idea.addEventListener("click", () => {
      prompt.value = idea.dataset.prompt ?? "";
      prompt.dispatchEvent(new Event("input"));
      prompt.focus();
    });
  }
}

function currentMode(): "template" | "ai" {
  return byId("np-modes").querySelector<HTMLElement>(".np-mode.is-active")?.dataset.mode === "ai" ? "ai" : "template";
}

function setMode(mode: "template" | "ai"): void {
  for (const tab of byId("np-modes").querySelectorAll<HTMLButtonElement>(".np-mode")) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const panel of document.querySelectorAll<HTMLElement>("#new-project-form .np-panel")) panel.hidden = panel.dataset.panel !== mode;
  byId("new-project-dialog").dataset.mode = mode;
  byId("np-create").querySelector(".btn-label")!.textContent = mode === "ai" ? "Crear con IA" : "Crear";
  byId("np-error").textContent = "";
}

function setBusy(busy: boolean): void {
  const form = byId<HTMLFormElement>("new-project-form");
  for (const control of form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>("button, input, textarea")) control.disabled = busy;
  const create = byId("np-create");
  create.classList.toggle("is-loading", busy);
  create.querySelector(".btn-label")!.textContent = busy ? "Creando…" : currentMode() === "ai" ? "Crear con IA" : "Crear";
  form.classList.toggle("is-busy", busy);
}

function showProgress(withAi: boolean): void {
  const list = byId("np-progress");
  list.hidden = false;
  list.querySelector<HTMLElement>('[data-step="2"]')!.hidden = !withAi;
  for (const item of list.querySelectorAll<HTMLElement>("li")) item.dataset.state = "";
}

function markStep(step: ProgressStep): void {
  for (const item of byId("np-progress").querySelectorAll<HTMLElement>("li")) {
    const n = Number(item.dataset.step);
    item.dataset.state = n < step ? "done" : n === step ? "active" : "";
  }
}

function templateOption(template: TemplateDto, checked: boolean): HTMLElement {
  const label = make("label", "template");
  const radio = make("input");
  radio.type = "radio";
  radio.name = "template";
  radio.value = template.code;
  radio.checked = checked;
  const text = make("span", "template-text");
  const title = make("strong", "", template.name);
  title.title = template.name;
  text.append(title, make("small", "", `${template.description} · ${template.object_count} objetos`));
  label.append(radio);
  // A small picture of the map, so the player sees what they are choosing.
  const preview = make("canvas", "template-preview");
  preview.width = 100;
  preview.height = 60;
  preview.setAttribute("aria-hidden", "true");
  drawPreview(preview, template.scene ?? []);
  label.append(preview, text);
  return label;
}
