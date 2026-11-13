import { createCreation, deleteCreation, saveBalance, updateCreation, type CreationInput } from "../api/client";
import { iconUrl, TEXTURE_BASE } from "../game/assets";
import {
  baseKinds, currentBalance, currentCreations, enemyDefaults, heroBaseDamage, LIMITS, OBJECT_BASES, tintValue,
  type BalanceDto, type CreationCategory, type CreationDto, type Stats,
} from "../game/balance";
import { HEROES, heroById, WEAPONS } from "../game/combat";
import { KIND_INFO, type Kind } from "../model/GameObject";
import { byId, errorText, make } from "./dom";
import { trackActive } from "./editorFx";
import { toast } from "./toast";

type Section = "overview" | "heroes" | "enemies" | "creations";

/** Colours a creation can wear (white keeps the original look). */
export const TINTS = ["#ffffff", "#7fd4ff", "#33e0a1", "#ffd65c", "#ff8a3d", "#ff4d6d", "#c38bff", "#9aa7b8"];

const CATEGORY_NAME: Record<CreationCategory, string> = { hero: "Héroe", enemy: "Enemigo", object: "Objeto" };

/** True when a balance entry says the same as the game's default (so it is not stored). */
export function isDefault(stats: Stats, base: Stats): boolean {
  return stats.health === base.health && stats.damage === base.damage;
}

/** Keeps only the entries that differ from the defaults. */
export function compactBalance(draft: BalanceDto, heroBase: Record<string, Stats>, enemyBase: Record<string, Stats>): BalanceDto {
  const keep = (entries: Record<string, Stats>, base: Record<string, Stats>) =>
    Object.fromEntries(Object.entries(entries).filter(([id, stats]) => base[id] !== undefined && !isDefault(stats, base[id])));
  return { heroes: keep(draft.heroes, heroBase), enemies: keep(draft.enemies, enemyBase) };
}

function heroBase(): Record<string, Stats> {
  return Object.fromEntries(HEROES.map((hero) => [hero.id, { health: hero.maxHealth, damage: heroBaseDamage(hero) }]));
}

function enemyBase(): Record<string, Stats> {
  return Object.fromEntries(Object.entries(enemyDefaults()).map(([kind, e]) => [kind, { health: e.health, damage: e.damage }]));
}

/**
 * The admin panel of the account. Balance changes are a draft until "Guardar
 * cambios"; creations are saved one by one from their drawer. After every
 * save the app gets the new rules (onRules) so the game and the library use
 * them at once.
 */
export class AdminPanel {
  private readonly screen = byId("admin");
  private readonly onBack: () => void;
  private readonly onRules: (balance: BalanceDto, creations: CreationDto[]) => void;
  private saved: BalanceDto = { heroes: {}, enemies: {} };
  private draft: BalanceDto = { heroes: {}, enemies: {} };
  private creations: CreationDto[] = [];
  private filter: "all" | CreationCategory = "all";
  private editing: CreationDto | null = null;
  private form: CreationInput = blankCreation("enemy");

  constructor(onBack: () => void, onRules: (balance: BalanceDto, creations: CreationDto[]) => void) {
    this.onBack = onBack;
    this.onRules = onRules;
    byId("adm-back").addEventListener("click", () => this.leave());
    for (const item of this.screen.querySelectorAll<HTMLButtonElement>(".adm-nav-item")) {
      item.addEventListener("click", () => this.showSection(item.dataset.section as Section));
    }
    for (const kpi of this.screen.querySelectorAll<HTMLButtonElement>("[data-go-section]")) {
      kpi.addEventListener("click", () => this.showSection(kpi.dataset.goSection as Section));
    }
    byId("adm-save").addEventListener("click", () => void this.save());
    byId("adm-discard").addEventListener("click", () => {
      this.draft = structuredClone(this.saved);
      this.renderBalance();
    });
    for (const button of this.screen.querySelectorAll<HTMLButtonElement>("[data-reset]")) {
      button.addEventListener("click", () => {
        if (button.dataset.reset === "heroes") this.draft.heroes = {};
        else this.draft.enemies = {};
        this.renderBalance();
      });
    }
    byId<HTMLInputElement>("adm-enemy-search").addEventListener("input", () => this.renderEnemies());
    const filter = byId("adm-filter");
    for (const item of filter.querySelectorAll<HTMLButtonElement>(".adm-filter-item")) {
      item.addEventListener("click", () => {
        this.filter = item.dataset.filter as "all" | CreationCategory;
        for (const other of filter.querySelectorAll(".adm-filter-item")) other.classList.toggle("is-active", other === item);
        this.renderCreations();
      });
    }
    trackActive(filter, filter.querySelector<HTMLElement>(".tab-pill")!, ".adm-filter-item.is-active");
    this.wireDrawer();
  }

  get visible(): boolean {
    return !this.screen.hidden;
  }

  show(): void {
    this.saved = currentBalance();
    this.draft = structuredClone(this.saved);
    this.creations = currentCreations();
    this.screen.hidden = false;
    this.screen.classList.remove("is-entering");
    void this.screen.offsetWidth;
    this.screen.classList.add("is-entering");
    this.renderBalance();
    this.renderCreations();
    this.showSection("overview");
  }

  hide(): void {
    this.closeDrawer();
    this.screen.hidden = true;
  }

  /** Unsaved numbers are lost only if the player says so. */
  private leave(): void {
    if (this.dirty() && !window.confirm("Tienes cambios sin guardar en el panel. ¿Salir igualmente?")) return;
    this.onBack();
  }

  private dirty(): boolean {
    const now = compactBalance(this.draft, heroBase(), enemyBase());
    return JSON.stringify(now) !== JSON.stringify(compactBalance(this.saved, heroBase(), enemyBase()));
  }

  private showSection(section: Section): void {
    for (const item of this.screen.querySelectorAll<HTMLElement>(".adm-nav-item")) {
      const active = item.dataset.section === section;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    }
    for (const panel of this.screen.querySelectorAll<HTMLElement>(".adm-section")) panel.hidden = panel.dataset.section !== section;
    this.screen.querySelector(".adm-main")?.scrollTo({ top: 0 });
  }

  // --- balance ---------------------------------------------------------------------------------

  private renderBalance(): void {
    this.renderHeroes();
    this.renderEnemies();
    this.renderCounts();
  }

  private renderCounts(): void {
    const compact = compactBalance(this.draft, heroBase(), enemyBase());
    const heroes = Object.keys(compact.heroes).length;
    const enemies = Object.keys(compact.enemies).length;
    byId("adm-count-heroes").textContent = String(heroes);
    byId("adm-count-enemies").textContent = String(enemies);
    byId("adm-count-creations").textContent = String(this.creations.length);
    byId("adm-kpi-heroes").textContent = String(heroes);
    byId("adm-kpi-enemies").textContent = String(enemies);
    byId("adm-kpi-creations").textContent = String(this.creations.length);
    const dirty = this.dirty();
    byId<HTMLButtonElement>("adm-save").disabled = !dirty;
    byId<HTMLButtonElement>("adm-discard").disabled = !dirty;
    const state = byId("adm-save-state");
    state.dataset.state = dirty ? "dirty" : "clean";
    state.textContent = dirty ? "Cambios sin guardar" : "Todo guardado";
  }

  private renderHeroes(): void {
    const base = heroBase();
    byId("adm-heroes").replaceChildren(...HEROES.map((hero) => {
      const stats = this.draft.heroes[hero.id] ?? base[hero.id];
      return this.statCard({
        id: hero.id, name: hero.name, texture: hero.texture, meta: `${WEAPONS[hero.weapon].name} · ${hero.maxHealth} de vida base`,
        tone: "blue", stats, base: base[hero.id], healthLimits: LIMITS.heroHealth, damageLimits: LIMITS.heroDamage,
        damageLabel: "Daño de ataque",
        onChange: (next) => {
          this.draft.heroes[hero.id] = next;
          this.renderCounts();
        },
        onReset: () => {
          delete this.draft.heroes[hero.id];
          this.renderHeroes();
          this.renderCounts();
        },
      });
    }));
  }

  private renderEnemies(): void {
    const defaults = enemyDefaults();
    const base = enemyBase();
    const query = byId<HTMLInputElement>("adm-enemy-search").value.trim().toLowerCase();
    const cards = Object.entries(defaults)
      .filter(([, e]) => query === "" || e.name.toLowerCase().includes(query))
      .map(([kind, e]) => this.statCard({
        id: kind, name: e.name, texture: e.texture, meta: `${e.health} de vida · ${e.damage} de daño base`,
        tone: "red", stats: this.draft.enemies[kind] ?? base[kind], base: base[kind],
        healthLimits: LIMITS.enemyHealth, damageLimits: LIMITS.enemyDamage, damageLabel: "Daño que hace",
        onChange: (next) => {
          this.draft.enemies[kind] = next;
          this.renderCounts();
        },
        onReset: () => {
          delete this.draft.enemies[kind];
          this.renderEnemies();
          this.renderCounts();
        },
      }));
    byId("adm-enemies").replaceChildren(...(cards.length > 0 ? cards : [make("p", "adm-empty", "Ningún enemigo coincide con la búsqueda.")]));
  }

  private statCard(options: {
    id: string; name: string; texture: string; meta: string; tone: "blue" | "red"; stats: Stats; base: Stats;
    healthLimits: readonly [number, number]; damageLimits: readonly [number, number]; damageLabel: string;
    onChange: (stats: Stats) => void; onReset: () => void;
  }): HTMLElement {
    const card = make("article", `adm-card tone-${options.tone}`);
    const current: Stats = { ...options.stats };
    const head = make("header", "adm-card-head");
    const portrait = make("span", "adm-portrait");
    const img = make("img");
    img.src = `${TEXTURE_BASE}${options.texture}.png`;
    img.alt = "";
    portrait.append(img);
    const title = make("div", "adm-card-title");
    const name = make("b", "", options.name);
    name.title = options.name;
    title.append(name, make("small", "", options.meta));
    const badge = make("span", "adm-badge", "Modificado");
    const reset = make("button", "adm-icon-btn", "↺");
    reset.type = "button";
    reset.title = "Volver a los valores del juego";
    reset.setAttribute("aria-label", `Restablecer ${options.name}`);
    reset.addEventListener("click", options.onReset);
    head.append(portrait, title, badge, reset);
    const mark = () => {
      const changed = !isDefault(current, options.base);
      card.classList.toggle("is-changed", changed);
      reset.disabled = !changed;
    };
    const health = statControl("Vida", "♥", current.health, options.healthLimits, options.base.health, (value) => {
      current.health = value;
      mark();
      options.onChange({ ...current });
    });
    const damage = statControl(options.damageLabel, "⚔", current.damage, options.damageLimits, options.base.damage, (value) => {
      current.damage = value;
      mark();
      options.onChange({ ...current });
    });
    card.append(head, health, damage);
    mark();
    return card;
  }

  private async save(): Promise<void> {
    const button = byId<HTMLButtonElement>("adm-save");
    button.classList.add("is-loading");
    button.disabled = true;
    try {
      const saved = await saveBalance(compactBalance(this.draft, heroBase(), enemyBase()));
      this.saved = saved;
      this.draft = structuredClone(saved);
      this.onRules(saved, this.creations);
      this.renderBalance();
      toast("Cambios guardados. Se aplican desde tu próxima partida.", "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      button.classList.remove("is-loading");
      this.renderCounts();
    }
  }

  // --- creations -------------------------------------------------------------------------------

  private renderCreations(): void {
    const list = this.creations.filter((c) => this.filter === "all" || c.category === this.filter);
    const root = byId("adm-creations");
    if (list.length === 0) {
      const empty = make("div", "adm-empty-card");
      const art = make("img");
      art.src = iconUrl("chest");
      art.alt = "";
      const go = make("button", "btn btn-primary", "＋ Crear la primera");
      go.type = "button";
      go.addEventListener("click", () => this.openDrawer(null));
      empty.append(art, make("b", "", this.creations.length === 0 ? "Aún no tienes creaciones" : "Nada en este filtro"), make("span", "", "Crea un héroe, un enemigo o un objeto con tu nombre, color y números."), go);
      root.replaceChildren(empty);
    } else {
      root.replaceChildren(...list.map((creation) => this.creationCard(creation)));
    }
    this.renderCounts();
  }

  private creationCard(creation: CreationDto): HTMLElement {
    const card = make("article", `adm-card adm-creation tone-${creation.category === "hero" ? "blue" : creation.category === "enemy" ? "red" : "gold"}`);
    const head = make("header", "adm-card-head");
    head.append(spriteOf(creation), titleOf(creation.name, `${CATEGORY_NAME[creation.category]} · basado en ${baseName(creation.category, creation.base_kind)}`));
    const facts = make("div", "adm-facts");
    for (const [label, value] of factsOf(creation)) {
      const fact = make("span", "adm-fact");
      fact.append(make("small", "", label), make("b", "", value));
      facts.append(fact);
    }
    const edit = make("button", "btn btn-ghost adm-edit", "Editar");
    edit.type = "button";
    edit.addEventListener("click", () => this.openDrawer(creation));
    card.append(head, facts, edit);
    return card;
  }

  private wireDrawer(): void {
    byId("adm-new").addEventListener("click", () => this.openDrawer(null));
    byId("adm-close").addEventListener("click", () => this.closeDrawer());
    byId("adm-cancel").addEventListener("click", () => this.closeDrawer());
    byId("adm-drawer-backdrop").addEventListener("click", () => this.closeDrawer());
    const type = byId("adm-type");
    for (const item of type.querySelectorAll<HTMLButtonElement>(".adm-type-item")) {
      item.addEventListener("click", () => {
        if (this.editing !== null) return; // the type of an existing creation stays
        const category = item.dataset.type as CreationCategory;
        this.form = { ...blankCreation(category), name: this.form.name, tint: this.form.tint };
        this.paintForm();
      });
    }
    trackActive(type, type.querySelector<HTMLElement>(".tab-pill")!, ".adm-type-item.is-active");
    const name = byId<HTMLInputElement>("adm-name");
    name.addEventListener("input", () => {
      this.form.name = name.value;
      byId("adm-name-count").textContent = `${name.value.length}/24`;
      this.paintPreview();
    });
    byId<HTMLFormElement>("adm-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    byId("adm-delete").addEventListener("click", () => void this.remove());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("adm-drawer").hidden) this.closeDrawer();
    });
  }

  private openDrawer(creation: CreationDto | null): void {
    this.editing = creation;
    const fallback = this.filter === "all" ? "enemy" : this.filter;
    this.form = creation ? { ...creation } : blankCreation(fallback);
    byId("adm-form-title").textContent = creation ? "Editar creación" : "Nueva creación";
    byId("adm-submit").querySelector(".btn-label")!.textContent = creation ? "Guardar" : "Crear";
    byId("adm-delete").hidden = creation === null;
    byId("adm-form-error").textContent = "";
    const name = byId<HTMLInputElement>("adm-name");
    name.value = this.form.name;
    byId("adm-name-count").textContent = `${name.value.length}/24`;
    byId("adm-drawer").hidden = false;
    byId("adm-drawer-backdrop").hidden = false;
    this.paintForm();
    window.setTimeout(() => name.focus({ preventScroll: true }), 50);
    byId("adm-drawer").querySelector(".adm-form-body")!.scrollTop = 0;
  }

  private closeDrawer(): void {
    byId("adm-drawer").hidden = true;
    byId("adm-drawer-backdrop").hidden = true;
    this.editing = null;
  }

  /** Draw the whole form for the current values (type, bases, colours, numbers, preview). */
  private paintForm(): void {
    const type = byId("adm-type");
    for (const item of type.querySelectorAll<HTMLButtonElement>(".adm-type-item")) {
      item.classList.toggle("is-active", item.dataset.type === this.form.category);
      item.setAttribute("aria-checked", String(item.dataset.type === this.form.category));
      item.disabled = this.editing !== null && item.dataset.type !== this.form.category;
    }
    const bases = byId("adm-bases");
    bases.replaceChildren(...baseKinds(this.form.category).map((kind) => {
      const button = make("button", "adm-base");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(kind === this.form.base_kind));
      button.classList.toggle("is-active", kind === this.form.base_kind);
      const img = make("img");
      img.src = textureOf(this.form.category, kind);
      img.alt = "";
      const label = baseName(this.form.category, kind);
      button.title = label;
      button.append(img, make("span", "", label));
      button.addEventListener("click", () => {
        this.form = { ...blankCreation(this.form.category, kind), name: this.form.name, tint: this.form.tint };
        this.paintForm();
      });
      return button;
    }));
    const colors = byId("adm-colors");
    colors.replaceChildren(...TINTS.map((tint) => {
      const swatch = make("button", "adm-swatch");
      swatch.type = "button";
      swatch.style.setProperty("--swatch", tint);
      swatch.setAttribute("aria-label", tint === "#ffffff" ? "Sin color (original)" : `Color ${tint}`);
      swatch.setAttribute("aria-pressed", String(tint === this.form.tint));
      swatch.classList.toggle("is-active", tint === this.form.tint);
      swatch.addEventListener("click", () => {
        this.form.tint = tint;
        this.paintForm();
      });
      return swatch;
    }));
    this.paintStats();
    this.paintPreview();
  }

  private paintStats(): void {
    const root = byId("adm-stats");
    const controls: HTMLElement[] = [];
    const f = this.form;
    if (f.category === "hero") {
      controls.push(statControl("Vida", "♥", f.health, LIMITS.heroHealth, null, (v) => { f.health = v; this.paintPreview(); }));
      controls.push(statControl("Daño de ataque", "⚔", f.damage, LIMITS.heroDamage, null, (v) => { f.damage = v; this.paintPreview(); }));
      controls.push(statControl("Velocidad", "»", f.speed, LIMITS.heroSpeed, null, (v) => { f.speed = v; this.paintPreview(); }, 5));
    } else if (f.category === "enemy") {
      controls.push(statControl("Vida", "♥", f.health, LIMITS.enemyHealth, null, (v) => { f.health = v; this.paintPreview(); }));
      controls.push(statControl("Daño que hace", "⚔", f.damage, LIMITS.enemyDamage, null, (v) => { f.damage = v; this.paintPreview(); }));
      controls.push(statControl("Velocidad", "»", f.speed, LIMITS.enemySpeed, null, (v) => { f.speed = v; this.paintPreview(); }, 5));
    } else {
      const effect = OBJECT_BASES[f.base_kind];
      if (effect === "heal") controls.push(statControl("Vida que cura", "♥", f.value, LIMITS.value, null, (v) => { f.value = v; this.paintPreview(); }));
      else if (effect === "damage") controls.push(statControl("Daño que hace", "⚔", f.value, LIMITS.value, null, (v) => { f.value = v; this.paintPreview(); }));
      else controls.push(make("p", "adm-note", "Este objeto cambia de nombre y color; su efecto es el del original."));
    }
    root.replaceChildren(make("span", "adm-label", "Números"), ...controls);
  }

  private paintPreview(): void {
    const sprite = byId("adm-preview-sprite");
    const creation = { ...this.form, id: 0 } as CreationDto;
    sprite.replaceChildren(spriteOf(creation, true));
    byId("adm-preview-name").textContent = this.form.name.trim() || "Sin nombre";
    byId("adm-preview-meta").textContent = `${CATEGORY_NAME[this.form.category]} · ${factsOf(creation).map(([label, value]) => `${label} ${value}`).join(" · ") || baseName(this.form.category, this.form.base_kind)}`;
    byId("adm-drawer").dataset.category = this.form.category;
  }

  private async submit(): Promise<void> {
    const name = this.form.name.trim();
    if (name === "") {
      byId("adm-form-error").textContent = "Ponle un nombre a tu creación.";
      byId("adm-name").focus();
      return;
    }
    const button = byId<HTMLButtonElement>("adm-submit");
    button.classList.add("is-loading");
    button.disabled = true;
    try {
      const input: CreationInput = { category: this.form.category, base_kind: this.form.base_kind, name, tint: this.form.tint, health: this.form.health, damage: this.form.damage, speed: this.form.speed, value: this.form.value };
      const saved = this.editing ? await updateCreation(this.editing.id, input) : await createCreation(input);
      this.creations = this.editing ? this.creations.map((c) => (c.id === saved.id ? saved : c)) : [...this.creations, saved];
      toast(this.editing ? `«${saved.name}» actualizado.` : `«${saved.name}» creado. Ya lo tienes en ${saved.category === "hero" ? "la elección de héroe" : "la Biblioteca"}.`, "success");
      this.closeDrawer();
      this.onRules(this.saved, this.creations);
      this.renderCreations();
    } catch (error) {
      byId("adm-form-error").textContent = errorText(error);
    } finally {
      button.classList.remove("is-loading");
      button.disabled = false;
    }
  }

  private async remove(): Promise<void> {
    const creation = this.editing;
    if (creation === null) return;
    if (!window.confirm(`¿Eliminar «${creation.name}»? Los mapas que lo usan mostrarán el ${baseName(creation.category, creation.base_kind).toLowerCase()} original.`)) return;
    try {
      await deleteCreation(creation.id);
      this.creations = this.creations.filter((c) => c.id !== creation.id);
      this.closeDrawer();
      this.onRules(this.saved, this.creations);
      this.renderCreations();
      toast(`«${creation.name}» eliminado.`, "success");
    } catch (error) {
      byId("adm-form-error").textContent = errorText(error);
    }
  }
}

/** A creation that starts from a base: the base's own numbers. */
export function blankCreation(category: CreationCategory, base?: string): CreationInput {
  const kind = base ?? baseKinds(category)[0];
  if (category === "hero") {
    const hero = heroById(kind);
    return { category, base_kind: kind, name: "", tint: "#ffffff", health: hero.maxHealth, damage: heroBaseDamage(hero), speed: hero.speed, value: 0 };
  }
  if (category === "enemy") {
    const enemy = enemyDefaults()[kind];
    return { category, base_kind: kind, name: "", tint: "#ffffff", health: enemy.health, damage: enemy.damage, speed: enemy.speed, value: 0 };
  }
  const effect = OBJECT_BASES[kind];
  const value = effect === "heal" ? (kind === "medkit" ? 3 : 2) : effect === "damage" ? (kind === "explosive" ? 3 : 1) : 0;
  return { category, base_kind: kind, name: "", tint: "#ffffff", health: 0, damage: 0, speed: 0, value };
}

function baseName(category: CreationCategory, kind: string): string {
  if (category === "hero") return heroById(kind).name;
  if (category === "enemy") return enemyDefaults()[kind]?.name ?? kind;
  return KIND_INFO[kind as Kind]?.name ?? kind;
}

function textureOf(category: CreationCategory, kind: string): string {
  if (category === "hero") return `${TEXTURE_BASE}${heroById(kind).texture}.png`;
  if (category === "enemy") return `${TEXTURE_BASE}${enemyDefaults()[kind]?.texture ?? kind}.png`;
  return iconUrl(kind as Kind);
}

function spriteOf(creation: Pick<CreationDto, "category" | "base_kind" | "tint">, big = false): HTMLElement {
  const portrait = make("span", big ? "adm-portrait is-big" : "adm-portrait");
  const img = make("img");
  img.src = textureOf(creation.category, creation.base_kind);
  img.alt = "";
  portrait.append(img);
  if (tintValue(creation.tint) !== null) {
    portrait.classList.add("is-tinted");
    portrait.style.setProperty("--icon", `url("${img.src}")`);
    portrait.style.setProperty("--tint", creation.tint);
  }
  return portrait;
}

function titleOf(name: string, meta: string): HTMLElement {
  const title = make("div", "adm-card-title");
  const b = make("b", "", name);
  b.title = name;
  title.append(b, make("small", "", meta));
  return title;
}

function factsOf(creation: CreationDto): [string, string][] {
  if (creation.category === "object") {
    const effect = OBJECT_BASES[creation.base_kind];
    return effect === "heal" ? [["Cura", `${creation.value}`]] : effect === "damage" ? [["Daño", `${creation.value}`]] : [];
  }
  return [["Vida", `${creation.health}`], ["Daño", `${creation.damage}`], ["Velocidad", `${creation.speed}`]];
}

/**
 * A number with a slider and − / + buttons. The track fills to the value and
 * marks where the game's default is, so the change reads at a glance.
 */
function statControl(label: string, icon: string, value: number, limits: readonly [number, number], base: number | null,
                     onChange: (value: number) => void, step = 1): HTMLElement {
  const [min, max] = limits;
  const row = make("div", "adm-stat");
  const head = make("div", "adm-stat-head");
  const output = make("output", "adm-stat-value", String(value));
  head.append(make("span", "adm-stat-icon", icon), make("span", "adm-stat-label", label), output);
  const controls = make("div", "adm-stat-controls");
  const minus = make("button", "adm-stepper", "−");
  const plus = make("button", "adm-stepper", "+");
  minus.type = plus.type = "button";
  minus.setAttribute("aria-label", `Menos ${label.toLowerCase()}`);
  plus.setAttribute("aria-label", `Más ${label.toLowerCase()}`);
  const range = make("input", "adm-range");
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.setAttribute("aria-label", label);
  const paint = (v: number) => {
    output.textContent = String(v);
    range.value = String(v);
    range.style.setProperty("--pct", `${((v - min) / (max - min)) * 100}%`);
    if (base !== null) {
      range.style.setProperty("--base", `${((base - min) / (max - min)) * 100}%`);
      row.dataset.trend = v > base ? "up" : v < base ? "down" : "";
    }
    minus.disabled = v <= min;
    plus.disabled = v >= max;
  };
  const set = (v: number) => {
    const next = Math.max(min, Math.min(max, v));
    paint(next);
    onChange(next);
  };
  range.addEventListener("input", () => set(Number(range.value)));
  minus.addEventListener("click", () => set(Number(range.value) - step));
  plus.addEventListener("click", () => set(Number(range.value) + step));
  controls.append(minus, range, plus);
  row.append(head, controls);
  if (base !== null) row.classList.add("has-base");
  paint(value);
  return row;
}
