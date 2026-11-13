import type {
  AchievementDto, AiModelDto, DifficultyLevel, ProjectDto, RunResultDto, SettingsDto, StatsDto, TemplateDto, UserDto,
  VersionDto,
} from "../api/client";
import { ApiError } from "../api/http";
import { baseKinds, LIMITS, OBJECT_BASES, type BalanceDto, type CreationDto } from "../game/balance";
import { HEROES } from "../game/combat";
import type { SpriteDto } from "../game/sprites";
import { ENEMY_KINDS, isKind, type GameObject } from "../model/GameObject";
import { generate, MAX_TOTAL, obstacles, parseEdit } from "./demoAi";

/**
 * The demo's own server, inside the browser.
 *
 * While the demo is on, the HTTP client hands every request here instead of
 * the network (see HttpClient.request): nothing is sent to the real server,
 * no account exists, nothing is written to the database. The visitor can use
 * every option of the engine: projects and ready-made maps, the editor and its
 * history, the AI (the same rules as the AI service), playing with all the
 * heroes, achievements, settings and the admin panel.
 *
 * The data lives in memory and in this tab's sessionStorage (so a reload keeps
 * it), and is erased when the visitor leaves the demo. The same limits as the
 * real server apply (names, sizes, numbers), so the demo can never hold more
 * than a real account could. Account actions (password, sessions, activity)
 * answer with a clear message instead.
 */

export const DEMO_USER: UserDto = { id: 0, username: "Invitado", email: "" };

const STORAGE_KEY = "pixelforge-demo";
const PROJECT_NAME_MAX = 30;
const MAX_OBJECTS = 1500;
const MAX_PROJECTS = 8;
const MAX_VERSIONS = 20;
const MAX_CREATIONS = 60;
const PROMPT_MAX = 500;
const MAX_SPRITES = 10;
const MAX_SPRITE_BYTES = 300_000;
const LEVELS: Record<DifficultyLevel, number> = { easy: 0.2, medium: 0.45, hard: 0.7, extreme: 0.95 };
const ACHIEVEMENTS: Omit<AchievementDto, "unlocked_at">[] = [
  { code: "first-coin", name: "Primera moneda", description: "Recoge tu primera moneda", points: 5 },
  { code: "coin-hoarder", name: "Coleccionista", description: "Recoge todas las monedas de un nivel", points: 20 },
  { code: "first-win", name: "Primera victoria", description: "Termina un nivel", points: 15 },
  { code: "hunter", name: "Cazador", description: "Derrota 10 enemigos", points: 20 },
  { code: "untouchable", name: "Intocable", description: "Gana sin recibir dano", points: 30 },
];
const SETTINGS: SettingsDto = { theme: "dark", language: "es", show_grid: true, snap_to_grid: true, grid_size: 32, music_volume: 70, sfx_volume: 80 };
const ACCOUNT_ONLY = "Esta opción es de las cuentas. Crea una cuenta gratis para usarla.";

interface Project extends ProjectDto { versions: (VersionDto & { scene: GameObject[] })[]; difficulty: number; samples: number }

interface State {
  nextId: number;
  projects: Project[];
  stats: StatsDto;
  achievements: AchievementDto[];
  settings: SettingsDto;
  balance: BalanceDto;
  creations: CreationDto[];
  scores: Record<number, number>;
  openRuns: Record<number, number>;
  sprites: SpriteDto[];
}

/** Redraw a PNG from its pixels alone, as the server's clean copy does (the browser's decoder and canvas). */
export type Rebuild = (png: Uint8Array) => Promise<{ dataUrl: string; width: number; height: number }>;

const browserRebuild: Rebuild = async (png) => {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
};

function fresh(): State {
  return {
    nextId: 1,
    projects: [],
    stats: { games_played: 0, games_won: 0, total_score: 0, best_score: 0, coins_collected: 0, enemies_defeated: 0, deaths: 0, play_time_ms: 0 },
    achievements: [],
    settings: { ...SETTINGS },
    balance: { heroes: {}, enemies: {} },
    creations: [],
    scores: {},
    openRuns: {},
    sprites: [],
  };
}

const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const inRange = (value: unknown, [low, high]: readonly [number, number]) => Number.isInteger(value) && (value as number) >= low && (value as number) <= high;

/** A scene from outside is accepted only if every object is well formed (like the server's checks). */
function checkScene(scene: unknown): GameObject[] {
  if (!Array.isArray(scene)) fail(422, "La escena no es válida");
  const list = scene as unknown[];
  if (list.length > MAX_OBJECTS) fail(422, `Una escena puede tener como mucho ${MAX_OBJECTS} objetos`);
  return list.map((item) => {
    const object = item as Partial<GameObject>;
    if (typeof object?.id !== "string" || object.id.length === 0 || object.id.length > 64 || !isKind(object.kind)
      || typeof object.x !== "number" || typeof object.y !== "number" || !Number.isFinite(object.x) || !Number.isFinite(object.y)) {
      fail(422, "La escena tiene un objeto que no es válido");
    }
    const clean: GameObject = { id: object.id!, kind: object.kind!, x: object.x!, y: object.y! };
    if (typeof object.variant === "number") clean.variant = object.variant;
    return clean;
  });
}

function checkName(name: unknown): string {
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (clean.length === 0 || clean.length > PROJECT_NAME_MAX) fail(422, `El nombre debe tener entre 1 y ${PROJECT_NAME_MAX} caracteres`);
  return clean;
}

export class DemoServer {
  private state: State;
  private templates: Promise<TemplateDto[]> | null = null;

  private readonly storage: Storage | null;
  private readonly rebuild: Rebuild;

  constructor(storage: Storage | null = typeof sessionStorage === "undefined" ? null : sessionStorage, rebuild: Rebuild = browserRebuild) {
    this.storage = storage;
    this.rebuild = rebuild;
    this.state = this.load() ?? fresh();
  }

  /** Whether a demo is running in this tab (it survives a reload of the page). */
  static saved(storage: Storage | null = typeof sessionStorage === "undefined" ? null : sessionStorage): boolean {
    try {
      return storage?.getItem(STORAGE_KEY) !== null && storage?.getItem(STORAGE_KEY) !== undefined;
    } catch {
      return false;
    }
  }

  /** Erase everything the demo created. */
  wipe(): void {
    this.state = fresh();
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // private mode: nothing was stored
    }
  }

  private load(): State | null {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      return text ? { ...fresh(), ...(JSON.parse(text) as State) } : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // full or blocked storage: the demo keeps working in memory
    }
  }

  private listTemplates(): Promise<TemplateDto[]> {
    this.templates ??= fetch("/demo/templates.json").then((response) => {
      if (!response.ok) throw new ApiError(503, "No se pudieron cargar los mapas de la demo");
      return response.json() as Promise<TemplateDto[]>;
    });
    return this.templates;
  }

  private project(id: number): Project {
    return this.state.projects.find((project) => project.id === id) ?? fail(404, "No se encontró el proyecto");
  }

  private dto(project: Project): ProjectDto {
    const { versions: _versions, difficulty: _difficulty, samples: _samples, ...rest } = project;
    return clone(rest);
  }

  private model(project: Project): AiModelDto {
    const level = (Object.keys(LEVELS) as DifficultyLevel[]).reduce((best, key) =>
      Math.abs(LEVELS[key] - project.difficulty) < Math.abs(LEVELS[best] - project.difficulty) ? key : best, "medium" as DifficultyLevel);
    return { samples_seen: project.samples, version: project.samples, difficulty: project.difficulty, level, parameters: {} };
  }

  private remember(project: Project, note: string): void {
    const number = (project.versions[0]?.version_number ?? 0) + 1;
    project.versions.unshift({ version_number: number, note, created_at: now(), object_count: project.scene.length, scene: clone(project.scene) });
    project.versions.length = Math.min(project.versions.length, MAX_VERSIONS);
  }

  private create(name: string, scene: GameObject[]): Project {
    if (this.state.projects.length >= MAX_PROJECTS) fail(422, `En la demo puedes tener hasta ${MAX_PROJECTS} proyectos. Borra uno o crea una cuenta.`);
    const project: Project = { id: this.state.nextId++, owner_id: 0, name, scene, updated_at: now(), versions: [], difficulty: 0.5, samples: 0 };
    this.state.projects.unshift(project);
    return project;
  }

  private touch(project: Project): void {
    project.updated_at = now();
    this.state.projects = [project, ...this.state.projects.filter((other) => other !== project)];
  }

  /** Answer one request of the app, exactly as the server would (status codes and shapes). */
  async handle(path: string, method: string, body: unknown): Promise<unknown> {
    const answer = await this.route(path.split("?")[0], method.toUpperCase(), (body ?? {}) as Record<string, unknown>);
    this.persist();
    return answer === undefined ? undefined : clone(answer);
  }

  private async route(path: string, method: string, body: Record<string, unknown>): Promise<unknown> {
    const parts = path.split("/").filter(Boolean);
    const [root, second, third, fourth, fifth] = parts;
    const id = Number(second);

    if (root === "auth") {
      if (second === "me") return DEMO_USER;
      if (second === "logout") return undefined;
      return fail(403, ACCOUNT_ONLY);
    }
    if (root === "catalog") return {};
    if (root === "me") {
      if (second === "stats") return this.state.stats;
      if (second === "achievements") return this.state.achievements;
      if (second === "activity") return [];
      if (second === "settings") return method === "PUT" ? this.saveSettings(body) : this.state.settings;
      if (second === "balance") return method === "PUT" ? this.saveBalance(body) : this.state.balance;
      if (second === "creations") return this.creations(method, Number(third), body);
      if (second === "sprites") return this.sprites(method, Number(third), body);
      return fail(404, "No encontrado");
    }
    if (root !== "projects") return fail(404, "No encontrado");

    if (second === undefined) {
      if (method === "GET") return this.state.projects.map((project) => this.dto(project));
      const name = checkName(body.name);
      let scene: GameObject[] = [];
      if (typeof body.template === "string" && body.template !== "") {
        const template = (await this.listTemplates()).find((item) => item.code === body.template);
        if (template === undefined) fail(422, "Plantilla desconocida");
        scene = clone(template!.scene ?? []);
      }
      return this.dto(this.create(name, scene));
    }
    if (second === "templates") return this.listTemplates();
    const project = this.project(id);

    if (third === undefined) {
      if (method === "GET") return this.dto(project);
      if (method === "PATCH") {
        project.name = checkName(body.name);
        this.touch(project);
        return this.dto(project);
      }
      if (method === "DELETE") {
        this.state.projects = this.state.projects.filter((other) => other !== project);
        return undefined;
      }
    }
    if (third === "duplicate") {
      const suffix = " (copia)";
      const copy = this.create(`${project.name.slice(0, PROJECT_NAME_MAX - suffix.length).trimEnd()}${suffix}`, clone(project.scene));
      return this.dto(copy);
    }
    if (third === "scene" && method === "PUT") {
      project.scene = checkScene(body.scene);
      const note = typeof body.note === "string" ? body.note.slice(0, 200) : "";
      this.remember(project, note);
      this.touch(project);
      return this.dto(project);
    }
    if (third === "versions") {
      if (fourth === undefined) return project.versions.map(({ scene: _scene, ...version }) => version);
      const version = project.versions.find((item) => item.version_number === Number(fourth)) ?? fail(404, "No se encontró la versión");
      if (fifth === "restore") {
        project.scene = clone(version.scene);
        this.remember(project, `Restaurada la version ${version.version_number}`);
        this.touch(project);
        return this.dto(project);
      }
    }
    if (third === "ai") return this.ai(project, fourth, method, body);
    if (third === "plays") return this.plays(project, fourth, fifth, body);
    if (third === "leaderboard") {
      const best = this.state.scores[project.id];
      return best === undefined ? [] : [{ username: DEMO_USER.username, score: best }];
    }
    return fail(404, "No encontrado");
  }

  // ---------------------------------------------------------------- AI

  private ai(project: Project, action: string | undefined, method: string, body: Record<string, unknown>): unknown {
    if (action === "model") return this.model(project);
    if (action === "difficulty" && method === "PUT") {
      const level = body.level as DifficultyLevel;
      if (!(level in LEVELS)) fail(422, "Nivel desconocido");
      project.difficulty = LEVELS[level];
      return this.model(project);
    }
    if (action === "obstacles") {
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > 20) fail(422, "Pide entre 1 y 20 obstáculos");
      const added = obstacles(project.scene, count, project.difficulty);
      this.append(project, added);
      return { ...this.dto(project), added: added.length, difficulty: project.difficulty };
    }
    if (action !== undefined) return fail(404, "No encontrado");
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length === 0 || prompt.length > PROMPT_MAX) fail(422, `Escribe una petición de 1 a ${PROMPT_MAX} caracteres`);
    const edit = parseEdit(prompt);
    const gone = project.scene.filter((object) => edit.removeKinds.has(object.kind)).map((object) => object.id);
    if (gone.length > 0) this.remember(project, "Antes de que la IA borrara objetos");
    const kept = project.scene.filter((object) => !gone.includes(object.id));
    const added = edit.addRequest === "" ? [] : generate(edit.addRequest).slice(0, MAX_TOTAL);
    project.scene = kept;
    this.append(project, added);
    return { ...this.dto(project), ai: { added: added.length, removed: gone.length } };
  }

  /** Add objects with ids not used yet, within the scene limit. */
  private append(project: Project, objects: GameObject[]): void {
    const used = new Set(project.scene.map((object) => object.id));
    const unique = objects.map((object) => {
      let candidate = object.id;
      for (let n = 2; used.has(candidate); n++) candidate = `${object.id}-${n}`;
      used.add(candidate);
      return { ...object, id: candidate };
    });
    if (project.scene.length + unique.length > MAX_OBJECTS) fail(422, `Una escena puede tener como mucho ${MAX_OBJECTS} objetos`);
    project.scene = [...project.scene, ...unique];
    this.touch(project);
  }

  // ---------------------------------------------------------------- playing

  private plays(project: Project, runId: string | undefined, action: string | undefined, body: Record<string, unknown>): unknown {
    if (runId === undefined) {
      const id = Date.now();
      this.state.openRuns[id] = project.id;
      return { id, difficulty: project.difficulty };
    }
    if (action !== "finish" || this.state.openRuns[Number(runId)] !== project.id) return fail(404, "Partida no encontrada o ya terminada");
    delete this.state.openRuns[Number(runId)];
    const run = body as unknown as RunResultDto;
    const number = (value: unknown) => (Number.isFinite(value) && (value as number) >= 0 ? Math.min(value as number, 1e7) : 0);
    const stats = this.state.stats;
    stats.games_played += 1;
    if (run.outcome === "won") stats.games_won += 1;
    stats.total_score += number(run.score);
    stats.best_score = Math.max(stats.best_score, number(run.score));
    stats.coins_collected += number(run.coins_collected);
    stats.enemies_defeated += number(run.enemies_defeated);
    stats.deaths += number(run.deaths);
    stats.play_time_ms += number(run.duration_ms);
    this.state.scores[project.id] = Math.max(this.state.scores[project.id] ?? 0, number(run.score));

    const earned: string[] = [];
    if (number(run.coins_collected) > 0) earned.push("first-coin");
    if (number(run.coins_total) > 0 && run.coins_collected === run.coins_total) earned.push("coin-hoarder");
    if (run.outcome === "won") {
      earned.push("first-win");
      if (number(run.damage_taken) === 0) earned.push("untouchable");
    }
    if (stats.enemies_defeated >= 10) earned.push("hunter");
    const owned = new Set(this.state.achievements.map((item) => item.code));
    const unlocked = ACHIEVEMENTS.filter((item) => earned.includes(item.code) && !owned.has(item.code)).map((item) => ({ ...item, unlocked_at: now() }));
    this.state.achievements.push(...unlocked);

    // The AI learns a little from each run: winning easily makes it harder, losing makes it easier.
    const step = run.outcome === "won" ? 0.04 : run.outcome === "lost" ? -0.04 : 0;
    project.difficulty = Math.min(0.95, Math.max(0.05, project.difficulty + step));
    project.samples += 1;
    return { learned: true, difficulty: project.difficulty, reward: step, achievements: unlocked.map((item) => item.code) };
  }

  // ---------------------------------------------------------------- settings and admin

  private saveSettings(body: Record<string, unknown>): SettingsDto {
    const next = { ...this.state.settings };
    if (["light", "dark", "system"].includes(body.theme as string)) next.theme = body.theme as SettingsDto["theme"];
    if (["es", "en"].includes(body.language as string)) next.language = body.language as SettingsDto["language"];
    if (typeof body.show_grid === "boolean") next.show_grid = body.show_grid;
    if (typeof body.snap_to_grid === "boolean") next.snap_to_grid = body.snap_to_grid;
    if (inRange(body.grid_size, [8, 128])) next.grid_size = body.grid_size as number;
    if (inRange(body.music_volume, [0, 100])) next.music_volume = body.music_volume as number;
    if (inRange(body.sfx_volume, [0, 100])) next.sfx_volume = body.sfx_volume as number;
    this.state.settings = next;
    return next;
  }

  private saveBalance(body: Record<string, unknown>): BalanceDto {
    const heroIds = new Set(HEROES.map((hero) => hero.id as string));
    const balance: BalanceDto = { heroes: {}, enemies: {} };
    for (const [id, stats] of Object.entries((body.heroes ?? {}) as BalanceDto["heroes"])) {
      if (!heroIds.has(id) || !inRange(stats?.health, LIMITS.heroHealth) || !inRange(stats?.damage, LIMITS.heroDamage)) fail(422, "Un héroe tiene valores fuera de rango");
      balance.heroes[id] = { health: stats.health, damage: stats.damage };
    }
    for (const [kind, stats] of Object.entries((body.enemies ?? {}) as BalanceDto["enemies"])) {
      if (!(ENEMY_KINDS as readonly string[]).includes(kind) || !inRange(stats?.health, LIMITS.enemyHealth) || !inRange(stats?.damage, LIMITS.enemyDamage)) fail(422, "Un enemigo tiene valores fuera de rango");
      balance.enemies[kind] = { health: stats.health, damage: stats.damage };
    }
    this.state.balance = balance;
    return balance;
  }

  private creations(method: string, id: number, body: Record<string, unknown>): unknown {
    if (method === "GET") return this.state.creations;
    if (method === "DELETE") {
      this.state.creations = this.state.creations.filter((item) => item.id !== id);
      return undefined;
    }
    if (body.sprite_id !== undefined && body.sprite_id !== null && !this.state.sprites.some((sprite) => sprite.id === body.sprite_id)) {
      fail(422, "Esa imagen no existe o no es tuya");
    }
    const input = this.checkCreation(body);
    if (method === "POST") {
      if (this.state.creations.length >= MAX_CREATIONS) fail(422, `Puedes tener hasta ${MAX_CREATIONS} creaciones`);
      const creation = { ...input, id: this.state.nextId++ };
      this.state.creations.push(creation);
      return creation;
    }
    const index = this.state.creations.findIndex((item) => item.id === id);
    if (index < 0) fail(404, "No se encontró la creación");
    this.state.creations[index] = { ...input, id };
    return this.state.creations[index];
  }

  /** The demo's pictures: the same first checks as the server, then a clean redraw in the browser. */
  private async sprites(method: string, id: number, body: Record<string, unknown>): Promise<unknown> {
    if (method === "GET") return this.state.sprites;
    if (method === "DELETE") {
      if (!this.state.sprites.some((sprite) => sprite.id === id)) fail(404, "No se encontró la imagen");
      this.state.sprites = this.state.sprites.filter((sprite) => sprite.id !== id);
      this.state.creations = this.state.creations.map((creation) => (creation.sprite_id === id ? { ...creation, sprite_id: null } : creation));
      return undefined;
    }
    if (this.state.sprites.length >= MAX_SPRITES) fail(422, `En la demo puedes tener hasta ${MAX_SPRITES} imágenes`);
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (name.length === 0 || name.length > 24) fail(422, "El nombre debe tener entre 1 y 24 caracteres");
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(String(body.data ?? "")), (ch) => ch.charCodeAt(0));
    } catch {
      return fail(422, "El archivo no llegó bien; vuelve a subirlo");
    }
    if (bytes.length === 0) fail(422, "El archivo está vacío");
    if (bytes.length > MAX_SPRITE_BYTES) fail(422, "La imagen pesa demasiado (máximo 300 KB)");
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!signature.every((value, i) => bytes[i] === value)) fail(422, "El archivo no es una imagen PNG válida");
    let clean: Awaited<ReturnType<Rebuild>>;
    try {
      clean = await this.rebuild(bytes);
    } catch {
      return fail(422, "Los píxeles de la imagen están dañados");
    }
    if (clean.width < 8 || clean.height < 8 || clean.width > 256 || clean.height > 256) fail(422, "La imagen debe medir entre 8 y 256 píxeles por lado");
    const sprite: SpriteDto = { id: this.state.nextId++, name, width: clean.width, height: clean.height, data_url: clean.dataUrl, created_at: now() };
    this.state.sprites.push(sprite);
    return { ...sprite, checks: ["size", "type", "structure", "pixels", "rebuilt"] };
  }

  private checkCreation(body: Record<string, unknown>): Omit<CreationDto, "id"> {
    const category = body.category as CreationDto["category"];
    if (!["hero", "enemy", "object"].includes(category)) fail(422, "Tipo desconocido");
    const base = String(body.base_kind ?? "");
    if (!baseKinds(category).includes(base)) fail(422, "Esa base no sirve para este tipo");
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (name.length === 0 || name.length > 24) fail(422, "El nombre debe tener entre 1 y 24 caracteres");
    const tint = typeof body.tint === "string" ? body.tint.toLowerCase() : "#ffffff";
    if (!/^#[0-9a-f]{6}$/.test(tint)) fail(422, "El color no es válido");
    const value = (key: string) => Number(body[key] ?? 0);
    const spriteId = typeof body.sprite_id === "number" ? body.sprite_id : null;
    const creation = { category, base_kind: base, name, tint, health: 0, damage: 0, speed: 0, value: 0, sprite_id: spriteId };
    if (category === "hero") {
      if (!inRange(value("health"), LIMITS.heroHealth) || !inRange(value("damage"), LIMITS.heroDamage) || !inRange(value("speed"), LIMITS.heroSpeed)) fail(422, "Valores fuera de rango");
      Object.assign(creation, { health: value("health"), damage: value("damage"), speed: value("speed") });
    } else if (category === "enemy") {
      if (!inRange(value("health"), LIMITS.enemyHealth) || !inRange(value("damage"), LIMITS.enemyDamage) || !inRange(value("speed"), LIMITS.enemySpeed)) fail(422, "Valores fuera de rango");
      Object.assign(creation, { health: value("health"), damage: value("damage"), speed: value("speed") });
    } else {
      if (!inRange(value("value"), LIMITS.value)) fail(422, "Valor fuera de rango");
      creation.value = OBJECT_BASES[base] === null ? 0 : value("value");
    }
    return creation;
  }
}
