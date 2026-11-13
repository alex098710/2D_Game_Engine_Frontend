import "./quietConsole";
import "./style.css";
import {
  ApiError,
  askAi,
  getBalance,
  listCreations,
  listSprites,
  type BalanceDto,
  type CreationDto,
  type SpriteDto,
  createProject,
  finishRun,
  getCharacterLines,
  getMe,
  hasSession,
  isDemo,
  resumeDemo,
  startDemo,
  http,
  logOut,
  renameProject,
  saveScene,
  startRun,
  type FinishDto,
  type ProjectDto,
  type RunResultDto,
  type UserDto,
} from "./api/client";
import { forgetAll } from "./api/cache";
import type { Tool } from "./game/EditorScene";
import type { GameHost } from "./game/GameHost";
import { CHARACTER_KINDS, ENEMY_KINDS, isKind, KIND_INFO, type Kind } from "./model/GameObject";
import { countByKind, hasPlayer, nextObjectId, SceneModel } from "./model/SceneModel";
import { AdminPanel } from "./ui/AdminPanel";
import { once } from "./ui/busy";
import { AiPanel, aiSummary } from "./ui/AiPanel";
import { bindNameCounter, byId, errorText } from "./ui/dom";
import { initEditorFx } from "./ui/editorFx";
import { chooseHero } from "./ui/HeroDialog";
import { HomeScreen, type Destination } from "./ui/HomeScreen";
import { setHudVisible, showHud } from "./ui/Hud";
import { initTouchControls, setTouchControlsActive, wantsTouchControls } from "./ui/TouchControls";
import { IdleTimer } from "./ui/IdleTimer";
import { Intro } from "./ui/Intro";
import { Inspector } from "./ui/Inspector";
import { DRAG_TYPE, Library, VARIANT_TYPE } from "./ui/Library";
import { setRules, variantName } from "./game/balance";
import { setSprites, spritesReady } from "./game/sprites";
import { hideLoader, showLoader } from "./ui/loader";
import { LoginScreen } from "./ui/LoginScreen";
import { askNewProject } from "./ui/NewProjectDialog";
import { refreshProgress } from "./ui/ProgressPanel";
import { ProjectList } from "./ui/ProjectList";
import { showResult } from "./ui/ResultDialog";
import { SceneTree } from "./ui/SceneTree";
import { SecurityPanel } from "./ui/SecurityPanel";
import { SettingsPanel } from "./ui/SettingsPanel";
import { bindShortcuts } from "./ui/shortcuts";
import { setupTabs, showTab } from "./ui/Tabs";
import { toast } from "./ui/toast";
import { ToolBar, TOOL_NAMES } from "./ui/ToolBar";

const model = new SceneModel();
let projectId: number | null = null;
let savedVersion = 0;
let playing = false;
let runId: number | null = null;
let difficulty = 0.5;
let currentUser: UserDto | null = null;
let hero = "knight";

/** Used until (or if) the backend's character lines arrive. */
let characterLines: Record<string, string[]> = {
  villager: ["¡Hola, viajero!"],
  knight: ["Ataca con Espacio y esquiva con Shift."],
  wizard: ["La IA aprende de tus partidas."],
};

function setStatus(message: string, kind: "info" | "error" | "success" = "info"): void {
  const status = byId("status");
  status.textContent = message;
  status.classList.toggle("is-error", kind === "error");
  status.classList.toggle("is-success", kind === "success");
}

/** Run an action and show its error, if any, as a toast. */
async function attempt(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    toast(errorText(error), "error");
  }
}

function isDirty(): boolean {
  return projectId !== null && model.version !== savedVersion;
}

// --- Editing tools -----------------------------------------------------------

const inspector = new Inspector({
  move: (id, x, y) => model.move(id, x, y),
  remove: (id) => removeObject(id),
});

const toolbar = new ToolBar((tool) => applyTool(tool));

const library = new Library((kind) => {
  if (kind !== null) applyTool("brush");
  else if (toolbar.value === "brush") applyTool("select");
  // On a phone the library is a drawer over the map: close it so the map can be painted.
  if (kind !== null) closeDocks();
});

// --- Docks as drawers on narrow screens (phones, small tablets) -------------------------------

const narrow = window.matchMedia("(max-width: 960px)");

function openDock(side: "left" | "right"): void {
  const app = byId("app");
  const open = !app.classList.contains(`show-${side}`);
  closeDocks();
  if (!open) return;
  app.classList.add(`show-${side}`);
  byId(`btn-dock-${side}`).setAttribute("aria-expanded", "true");
  byId("dock-backdrop").hidden = false;
}

function closeDocks(): void {
  const app = byId("app");
  app.classList.remove("show-left", "show-right");
  byId("btn-dock-left").setAttribute("aria-expanded", "false");
  byId("btn-dock-right").setAttribute("aria-expanded", "false");
  byId("dock-backdrop").hidden = true;
}

byId("btn-dock-left").addEventListener("click", () => openDock("left"));
byId("btn-dock-right").addEventListener("click", () => openDock("right"));
byId("dock-backdrop").addEventListener("click", closeDocks);
narrow.addEventListener("change", () => closeDocks());

/** Switch tool everywhere: editor, buttons, library highlight and hint. */
function applyTool(tool: Tool): void {
  if (tool === "brush" && library.current === null) {
    toast("Elige en la Biblioteca qué objeto quieres pintar.", "info");
    showTab("library");
    tool = "select";
  }
  if (tool !== "brush") library.highlight(null);
  toolbar.show(tool);
  host.editor.setTool(tool, library.current);
  const hint = byId("placing-hint");
  hint.hidden = tool === "select";
  const kind = library.current;
  const hints: Record<Tool, string> = {
    select: "",
    hand: "Mano: arrastra para mover la vista",
    brush: kind ? `Pincel: ${variantName(kind, library.currentVariant) ?? KIND_INFO[kind].name} — clic para colocar · Esc para terminar` : "",
    erase: "Borrar: haz clic en un objeto para quitarlo · Esc para terminar",
  };
  hint.textContent = hints[tool];
  refreshEmptyState();
}

/**
 * The game engine (Phaser, the biggest part of the app) is loaded only when it
 * is needed: the access screen shows without it, and it is fetched in the
 * background while the user types (see prefetchHost), so it is usually ready
 * by the time they log in.
 */
let host!: GameHost;
let hostLoading: Promise<GameHost> | null = null;
function loadHost(): Promise<GameHost> {
  hostLoading ??= import("./game/GameHost").then(({ GameHost }) => (host = createHost(GameHost)));
  return hostLoading;
}
function prefetchHost(): void {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => void loadHost());
  else window.setTimeout(() => void loadHost(), 1200);
}

const createHost = (Host: typeof GameHost): GameHost => new Host(
  byId("game"),
  model,
  {
    onSelect: (id) => {
      inspector.show(id === null ? undefined : model.find(id));
      if (id !== null) showTab("inspector");
      refreshSceneTree();
    },
    onPlace: (kind, x, y) => placeObject(kind, x, y, library.current === kind ? library.currentVariant : undefined),
    onErase: (id) => removeObject(id),
    onPointer: (x, y) => (byId("status-pointer").textContent = `x ${x} · y ${y}`),
    onZoom: (zoom) => (byId("zoom-value").textContent = `${Math.round(zoom * 100)}%`),
    onView: (left, top, width, height) => placeFrame(left, top, width, height),
  },
  {
    onHud: showHud,
    onFinish: (result) => void runFinished(result),
    linesFor: (kind) => characterLines[kind] ?? [],
    onNotice: (text) => toast(text, "success", 2200),
  },
);
initTouchControls(byId("game").parentElement!, () => host?.quitPlay());

/** The blue corners follow the map's edges; when the map is larger than the view they stay at the view's edge. */
function placeFrame(left: number, top: number, width: number, height: number): void {
  const frame = document.querySelector<HTMLElement>(".stage-frame");
  const stage = frame?.parentElement;
  if (!frame || !stage) return;
  const inset = 6;
  const x0 = Math.max(inset, left);
  const y0 = Math.max(inset, top);
  const x1 = Math.min(stage.clientWidth - inset, left + width);
  const y1 = Math.min(stage.clientHeight - inset, top + height);
  frame.style.setProperty("--frame-left", `${x0}px`);
  frame.style.setProperty("--frame-top", `${y0}px`);
  frame.style.setProperty("--frame-width", `${Math.max(0, x1 - x0)}px`);
  frame.style.setProperty("--frame-height", `${Math.max(0, y1 - y0)}px`);
}

function placeObject(kind: Kind, x: number, y: number, variant?: number): void {
  if (projectId === null) {
    toast("Crea o abre un proyecto antes de colocar objetos.", "error");
    return;
  }
  if (kind === "player" && hasPlayer(model)) {
    toast("La escena ya tiene un jugador.", "error");
    return;
  }
  const id = nextObjectId(model, kind);
  model.add(variant === undefined ? { id, kind, x, y } : { id, kind, x, y, variant });
  setStatus(`${variantName(kind, variant) ?? KIND_INFO[kind].name} colocado en ${Math.round(x)}, ${Math.round(y)}.`);
  if (kind === "player") {
    library.pick(null);
    host.editor.select(id);
  } else if (toolbar.value !== "brush") {
    host.editor.select(id);
  }
}

function removeObject(id: string | null = host.editor.selectedId): void {
  if (id === null || !model.remove(id)) {
    setStatus("Selecciona un objeto para eliminarlo.", "error");
    return;
  }
  if (host.editor.selectedId === id) host.editor.select(null);
}

// Drag a card from the library and drop it on the map.
const stage = document.querySelector<HTMLElement>(".stage")!;
const dropZone = byId("drop-zone");
stage.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  dropZone.hidden = false;
  byId("empty-state").hidden = true; // the onboarding card must not get in the way of the drop
});
stage.addEventListener("dragleave", (event) => {
  if (stage.contains(event.relatedTarget as Node)) return;
  dropZone.hidden = true;
  refreshEmptyState();
});
stage.addEventListener("drop", (event) => {
  dropZone.hidden = true;
  refreshEmptyState();
  const kind = event.dataTransfer?.getData(DRAG_TYPE);
  if (!isKind(kind)) return;
  event.preventDefault();
  const point = host.editor.worldPointAt(event.clientX, event.clientY);
  if (point === null) return;
  const [x, y] = host.editor.snapPoint(point.x, point.y, kind);
  const variant = Number(event.dataTransfer?.getData(VARIANT_TYPE));
  placeObject(kind, x, y, variant > 0 ? variant : undefined);
});

// --- Panels that follow the model ----------------------------------------------

const sceneTree = new SceneTree({
  select: (id) => host.editor.select(id),
  focus: (id) => {
    host.editor.select(id);
    host.editor.focusOn(id);
  },
});

function refreshSceneTree(): void {
  // The game host loads lazily; until then nothing is selected.
  sceneTree.render(model, host?.editor.selectedId ?? null);
}

function refreshEmptyState(): void {
  const empty = byId("empty-state");
  // Hidden while painting too: the card must never cover the spot the user clicks.
  empty.hidden = playing || toolbar.value === "brush" || (projectId !== null && model.size() > 0);
  byId("empty-title").textContent = projectId === null ? "Empieza tu primer nivel" : "Tu escena está vacía";
  byId("btn-empty-new").hidden = projectId !== null;
  byId("btn-empty-ai").hidden = projectId === null;
}

let seenVersion = -1;
function watchModel(): void {
  try {
    refreshFromModel();
  } catch (error) {
    // One failed refresh must never stop the loop: the status bar, undo/redo
    // and the save state would freeze for the rest of the session.
    console.error(error);
  }
  requestAnimationFrame(watchModel);
}

function refreshFromModel(): void {
  if (model.version !== seenVersion) {
    seenVersion = model.version;
    const counts = countByKind(model);
    const total = (kinds: readonly Kind[]) => kinds.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0);
    byId("status-objects").textContent =
      `${model.size()} objetos · ${counts.coin ?? 0} monedas · ${total(ENEMY_KINDS)} enemigos · ${total(CHARACTER_KINDS)} personajes`;
    library.setPlayerAvailable(!hasPlayer(model));
    const selected = host?.editor.selectedId ?? null;
    inspector.show(selected === null ? undefined : model.find(selected));
    byId<HTMLButtonElement>("btn-undo").disabled = !model.canUndo();
    byId<HTMLButtonElement>("btn-redo").disabled = !model.canRedo();
    const dirty = isDirty();
    const saveState = byId("save-state");
    saveState.dataset.state = dirty ? "dirty" : "clean";
    saveState.textContent = projectId === null ? "Sin proyecto" : dirty ? "Sin guardar" : "Guardado";
    document.title = `${dirty ? "● " : ""}PixelForge · 2D Game Engine`;
    refreshSceneTree();
    refreshEmptyState();
  }
}

// --- Projects ----------------------------------------------------------------------

const projectList = new ProjectList(
  (project) => void attempt(async () => openProject(project)),
  (id) => {
    if (id === projectId) openProject(null);
  },
);

const showProjectNameCount = bindNameCounter(byId<HTMLInputElement>("project-name"), byId("project-name-count"));

function openProject(project: ProjectDto | null): void {
  if (isDirty() && !window.confirm("Hay cambios sin guardar. ¿Abrir otro proyecto igualmente?")) return;
  projectId = project?.id ?? null;
  model.replaceAll(project?.scene ?? []);
  savedVersion = model.version;
  seenVersion = -1;
  host.editor.select(null);
  const name = byId<HTMLInputElement>("project-name");
  name.value = project?.name ?? "";
  name.disabled = project === null;
  showProjectNameCount();
  projectList.setCurrent(projectId);
  void projectList.refresh();
  void aiPanel.refresh();
  setStatus(project ? `Abierto "${project.name}".` : "Crea o abre un proyecto para empezar.");
}

async function newProject(): Promise<void> {
  let aiNote = "";
  let aiFailed = false;
  const project = await askNewProject(async (choice, step) => {
    step(1);
    // With a description the project starts empty and the AI fills the map.
    const created = await createProject(choice.name, choice.prompt === null ? choice.template : "empty");
    if (choice.prompt === null) return created;
    step(2);
    try {
      const filled = await askAi(created.id, choice.prompt);
      aiNote = ` ${aiSummary(filled.ai)}`;
      return filled;
    } catch (error) {
      // The project exists already: open it empty and say why.
      aiNote = ` ${errorText(error)} Puedes pedírselo desde la pestaña IA.`;
      aiFailed = true;
      return created;
    }
  });
  if (project === null) return;
  openProject(project);
  showTab("library");
  toast(`Proyecto "${project.name}" creado.${aiNote}`, aiFailed ? "error" : "success");
}

/** The save in progress: a second save while one runs waits for it instead of sending another. */
let saving: Promise<void> | null = null;

async function save(): Promise<void> {
  if (projectId === null) {
    toast("Crea o abre un proyecto primero.", "error");
    return;
  }
  saving ??= (async () => {
    const project = await saveScene(projectId!, model.toJson());
    savedVersion = model.version;
    seenVersion = -1;
    setStatus(`Guardado: ${project.scene.length} objetos.`, "success");
    await projectList.refresh();
  })().finally(() => {
    saving = null;
  });
  return saving;
}

let renaming = false;
byId<HTMLInputElement>("project-name").addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (projectId === null || input.value.trim() === "" || renaming) return;
  renaming = true;
  void attempt(async () => {
    await renameProject(projectId!, input.value.trim());
    await projectList.refresh();
    toast("Nombre actualizado.", "success");
  }).finally(() => {
    renaming = false;
  });
});

const aiPanel = new AiPanel(
  () => projectId,
  (project) => {
    model.replaceAll(project.scene);
    savedVersion = model.version;
  },
  async () => {
    if (isDirty()) await save();
  },
);

for (const chip of document.querySelectorAll<HTMLButtonElement>("[data-prompt]")) {
  chip.addEventListener("click", () => {
    const prompt = byId<HTMLTextAreaElement>("ai-prompt");
    prompt.value = chip.dataset.prompt!;
    prompt.dispatchEvent(new Event("input")); // the ask button wakes up
    prompt.focus();
  });
}

// --- Playing -------------------------------------------------------------------------

async function play(): Promise<void> {
  if (projectId === null) {
    toast("Crea o abre un proyecto para jugar.", "error");
    return;
  }
  library.pick(null);
  applyTool("select");
  const chosen = await chooseHero();
  if (chosen === null) return;
  hero = chosen;
  // Saving and starting the run: once, with the wheel on "Jugar".
  await once(byId<HTMLButtonElement>("btn-play"), async () => {
    if (isDirty()) await save();
    const run = await startRun(projectId!);
    runId = run.id;
    difficulty = run.difficulty;
    setPlaying(true);
    host.play(difficulty, hero);
  });
}

function setPlaying(value: boolean): void {
  playing = value;
  if (value) closeDocks();
  byId("app").classList.toggle("is-playing", value);
  byId("btn-play").hidden = value;
  byId("btn-stop").hidden = !value;
  setHudVisible(value);
  setTouchControlsActive(value);
  refreshEmptyState();
  setStatus(value
    ? wantsTouchControls()
      ? "Jugando: joystick para moverte, Atacar y Saltar a la derecha."
      : "Jugando: WASD para moverte, Espacio para atacar, Shift para saltar y esquivar."
    : "Editando.");
}

async function runFinished(result: RunResultDto): Promise<void> {
  let learned: FinishDto | null = null;
  if (projectId !== null && runId !== null) {
    learned = await finishRun(projectId, runId, result).catch(() => null);
  }
  runId = null;
  void refreshProgress();
  void aiPanel.refresh();
  const choice = await showResult(result, learned);
  if (choice === "again") {
    await attempt(async () => {
      const run = await startRun(projectId!);
      runId = run.id;
      difficulty = run.difficulty;
      host.restart(difficulty, hero);
    });
  } else {
    setPlaying(false);
    host.edit();
  }
}

// --- Buttons and shortcuts ---------------------------------------------------------------

/** request: the button talks to the server, so it runs once at a time and shows its wheel. */
function bind(id: string, handler: () => void | Promise<void>, request = false): void {
  const button = byId<HTMLButtonElement>(id);
  button.addEventListener("click", () => void attempt(async () => {
    if (request) await once(button, async () => handler());
    else await handler();
  }));
}

bind("btn-save", save, true);
bind("btn-undo", () => void model.undo());
bind("btn-redo", () => void model.redo());
bind("btn-play", play);
bind("btn-stop", () => host.quitPlay());
bind("btn-new-project", newProject);
bind("btn-empty-new", newProject);
bind("btn-empty-ai", () => {
  showTab("ai");
  byId("ai-prompt").focus();
});
bind("zoom-in", () => host.editor.zoomBy(1.2));
bind("zoom-out", () => host.editor.zoomBy(1 / 1.2));
bind("zoom-fit", () => host.editor.fitView());
bind("zoom-center", () => host.editor.showWholeWorld());
bind("btn-logout", () => leaveApp(true));
bind("btn-home", () => goHome());
bind("btn-back", () => goHome());

bindShortcuts(
  {
    save: () => void attempt(save),
    undo: () => void model.undo(),
    redo: () => void model.redo(),
    remove: () => removeObject(),
    play: () => void attempt(play),
    cancel: () => {
      library.pick(null);
      applyTool("select");
      host.editor.select(null);
    },
    toolSelect: () => applyTool("select"),
    toolHand: () => applyTool("hand"),
    toolBrush: () => applyTool("brush"),
    toolErase: () => applyTool("erase"),
    focus: () => {
      const id = host.editor.selectedId;
      if (id !== null) host.editor.focusOn(id);
    },
  },
  () => !playing && byId("app").hidden === false && !home.visible,
);

window.addEventListener("beforeunload", (event) => {
  if (isDirty()) event.preventDefault();
});

setupTabs();
initEditorFx();
byId("status-tool").textContent = TOOL_NAMES.select;

const settings = new SettingsPanel((value) =>
  host?.setEditorOptions({ showGrid: value.show_grid, snapToGrid: value.snap_to_grid, gridSize: value.grid_size }),
);

const security = new SecurityPanel(
  () => currentUser,
  () => void leaveApp(false, "Cerraste la sesión en todos tus dispositivos."),
);
byId("btn-settings").addEventListener("click", () => void security.refresh());

// Closes a session left open on a shared computer.
const idle = new IdleTimer({
  onWarning: () => toast("Tu sesión se cerrará en 2 minutos por inactividad.", "info", 10_000),
  onTimeout: () => void leaveApp(true, "Cerramos tu sesión por inactividad."),
});

// --- Session ------------------------------------------------------------------------------

const login = new LoginScreen(
  (user) => enterApp(user, true),
  () => void attempt(async () => enterApp(startDemo(), true)),
);

// "Crear cuenta gratis" in the demo: leave it (it is erased) and open the register form.
document.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("[data-demo-signup]") === null) return;
  void leaveApp(true).then(() => {
    if (currentUser === null) login.openRegister();
  });
});
const intro = new Intro();
const home = new HomeScreen(
  (to, project) => void attempt(async () => go(to, project)),
  () => void leaveApp(true),
);

/** Stage of the page: only the access screen before login, the intro, then the engine. */
function setStage(stage: "auth" | "intro" | "app"): void {
  document.body.dataset.stage = stage;
}

const admin = new AdminPanel(() => void goHome(), (balance, creations) => applyRules(balance, creations));

async function goHome(): Promise<void> {
  if (playing) return;
  byId("app").hidden = true;
  admin.hide();
  const projects = await projectList.refresh().catch(() => [] as ProjectDto[]);
  home.show(currentUser!, projects);
}

function openEditor(): void {
  home.hide();
  const app = byId("app");
  app.hidden = false;
  app.classList.remove("is-entering");
  void app.offsetWidth; // restart the entrance animation
  app.classList.add("is-entering");
  host.editor.fitView();
}

/** Where the menu options and the navigation bar lead. */
async function go(to: Destination, project?: ProjectDto): Promise<void> {
  if (to === "home") return goHome();
  if (to === "admin") {
    home.hide();
    admin.show();
    return;
  }
  if (project !== undefined && project.id !== projectId) openProject(project);
  openEditor();
  if (to === "projects") showTab("projects");
  if (to === "settings") byId("btn-settings").click();
  if (to === "play") {
    if (projectId === null) {
      toast("Crea un proyecto para jugar: elige una plantilla.", "info");
      await newProject();
    }
    if (projectId !== null) await play();
  }
}

/** The admin panel's rules of this account: numbers of heroes and enemies, and own creations. */
async function loadRules(): Promise<void> {
  const [balance, creations, pictures] = await Promise.all([getBalance(), listCreations(), listSprites().catch(() => [])]).catch(
    () => [{ heroes: {}, enemies: {} }, [], []] as [BalanceDto, CreationDto[], SpriteDto[]],
  );
  setSprites(pictures);
  await spritesReady();
  applyRules(balance, creations);
}

function applyRules(balance: BalanceDto, creations: CreationDto[]): void {
  setRules(balance, creations);
  library.setCreations(creations);
  host?.editor.refresh();
}

async function enterApp(user: UserDto, withIntro: boolean): Promise<void> {
  currentUser = user;
  login.hide();
  document.body.classList.toggle("is-demo", isDemo());
  byId("user-name").textContent = user.username;
  byId("user-avatar").textContent = user.username.slice(0, 1).toUpperCase();
  // The workspace loads while the intro plays; the menu opens when both are done.
  const ready = (async () => {
    await loadHost();
    host.start();
    await settings.load();
    await loadRules();
    getCharacterLines()
      .then((lines) => {
        if (Object.keys(lines).length > 0) characterLines = lines;
      })
      .catch(() => undefined);
    const projects = await projectList.refresh().catch(() => [] as ProjectDto[]);
    openProject(projects[0] ?? null);
    void refreshProgress();
    return projects;
  })();
  if (withIntro) {
    setStage("intro");
    hideLoader();
    await intro.play(ready);
  } else {
    showLoader("Preparando tu espacio de trabajo…");
  }
  const projects = await ready;
  setStage("app");
  idle.start();
  hideLoader();
  home.show(user, projects);
}

async function leaveApp(callBackend: boolean, note = ""): Promise<void> {
  if (callBackend && isDemo() && !window.confirm("Al salir de la demo se borra todo lo que creaste en ella. ¿Salir?")) return;
  if (callBackend && !isDemo()) {
    // An idle timeout cannot wait for an answer: nobody is there to give it.
    if (note === "" && isDirty() && !window.confirm("Hay cambios sin guardar. ¿Salir igualmente?")) return;
    await logOut();
  }
  idle.stop();
  currentUser = null;
  if (playing) {
    setPlaying(false);
    host.edit();
  }
  projectId = null;
  model.replaceAll([]);
  savedVersion = model.version;
  projectList.clear();
  settings.close();
  byId("app").hidden = true;
  home.hide();
  admin.hide();
  // Another account may log in next: its rules and pictures are loaded after login.
  setSprites([]);
  applyRules({ heroes: {}, enemies: {} }, []);
  if (callBackend && isDemo()) await logOut();
  document.body.classList.remove("is-demo");
  setStage("auth");
  login.show(note);
}

http.whenSessionLost(() => {
  forgetAll();
  void leaveApp(false, "Tu sesión terminó. Vuelve a iniciar sesión.");
});

window.setInterval(() => {
  if (http.tokens.refresh !== null && http.tokens.expiresSoon(120_000)) void http.refreshTokens();
}, 30_000);

/**
 * The saved session ends only when the server rejects it (401/403). If the server is asleep
 * (Render's free plan takes a while to wake up) or the phone has no network, it keeps trying
 * instead of sending the player back to the login screen.
 */
async function resumeSession(): Promise<UserDto | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getMe();
    } catch (error) {
      if (!hasSession()) return null; // the refresh token was rejected and cleared
      if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
        http.tokens.clear();
        forgetAll();
        return null;
      }
      showLoader(attempt < 2 ? "Conectando con el servidor…" : "Despertando el servidor… puede tardar unos segundos");
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(15_000, 2_000 * 2 ** Math.min(attempt, 3))));
    }
  }
}

async function boot(): Promise<void> {
  showLoader("Cargando motor…");
  resumeDemo(); // a demo running in this tab survives a reload
  requestAnimationFrame(watchModel);
  if (hasSession()) {
    const me = await resumeSession();
    if (me !== null) {
      await enterApp(me, false);
      return;
    }
  }
  setStage("auth");
  login.show();
  hideLoader();
  prefetchHost();
}

void boot();
