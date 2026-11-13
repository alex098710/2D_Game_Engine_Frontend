import { iconUrl } from "../game/assets";
import { tintValue, type CreationDto } from "../game/balance";
import { CATEGORIES, isKind, KIND_INFO, type Kind } from "../model/GameObject";
import { byId, make } from "./dom";
import { trackActive } from "./editorFx";

/** MIME type used when a library card is dragged onto the map. */
export const DRAG_TYPE = "application/x-motor2d-kind";
/** The creation id travels with the kind when a card of "Mis creaciones" is dragged. */
export const VARIANT_TYPE = "application/x-motor2d-variant";

/** Id of the library group with the account's own creations. */
export const MINE = "mine";

/** The picture that stands for each category in the filter and the headers. */
const CATEGORY_ICON: Record<string, Kind> = {
  characters: "player",
  enemies: "enemy",
  building: "house",
  terrain: "water",
  obstacles: "barrel",
  items: "chest",
  firearms: "rifle",
  war: "tank",
};

export function iconElement(kind: Kind, tint?: string): HTMLElement {
  const icon = make("span", "palette-icon");
  icon.style.backgroundImage = `url("${iconUrl(kind)}")`;
  // A creation's colour is laid over the sprite, masked by it (like Phaser's tint).
  if (tintValue(tint) !== null) {
    icon.classList.add("is-tinted");
    icon.style.setProperty("--icon", `url("${iconUrl(kind)}")`);
    icon.style.setProperty("--tint", tint!);
  }
  return icon;
}

/** Lower case and without accents, so "arbol" finds "Árbol". */
export function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** True when a kind matches the search box (name, hint or code). */
export function matchesSearch(kind: Kind, query: string): boolean {
  const q = normalise(query);
  if (q === "") return true;
  const info = KIND_INFO[kind];
  return [info.name, info.hint, kind].some((text) => normalise(text).includes(q));
}

/** "1 objeto" / "12 objetos". */
export function countLabel(count: number): string {
  return `${count} ${count === 1 ? "objeto" : "objetos"}`;
}

/**
 * The asset library of the engine: every kind grouped by category, with a
 * search box and a category filter. Each category can be folded. A card can
 * be dragged onto the map, or clicked to paint with it.
 */
export class Library {
  private active: Kind | null = null;
  private activeVariant: number | undefined;
  private category = "all";
  private query = "";
  private readonly cards = new Map<string, HTMLButtonElement>();
  private readonly groups: HTMLElement[] = [];
  private readonly onPick: (kind: Kind | null) => void;

  constructor(onPick: (kind: Kind | null) => void) {
    this.onPick = onPick;
    const root = byId("library");
    const mine = this.group({ id: MINE, name: "Mis creaciones", kinds: [] });
    mine.hidden = true;
    root.append(mine);
    for (const category of CATEGORIES) root.append(this.group(category));
    this.buildFilter();
    this.setCreations([]);

    const search = byId<HTMLInputElement>("library-search");
    const clear = byId<HTMLButtonElement>("library-clear");
    search.addEventListener("input", () => {
      clear.hidden = search.value === "";
      this.filter(search.value);
    });
    clear.addEventListener("click", () => {
      search.value = "";
      clear.hidden = true;
      this.filter("");
      search.focus();
    });
  }

  private group(category: (typeof CATEGORIES)[number]): HTMLElement {
    const group = make("section", "library-group");
    group.dataset.category = category.id;
    const head = make("button", "library-title");
    head.type = "button";
    head.setAttribute("aria-expanded", "true");
    const icon = make("img", "library-title-icon");
    icon.src = iconUrl(CATEGORY_ICON[category.id] ?? category.kinds[0] ?? "chest");
    icon.alt = "";
    const count = make("span", "library-title-count", String(category.kinds.length));
    const caret = make("span", "library-caret", "▾");
    caret.setAttribute("aria-hidden", "true");
    head.append(icon, make("span", "library-title-name", category.name), count, caret);
    head.addEventListener("click", () => {
      const collapsed = group.classList.toggle("is-collapsed");
      head.setAttribute("aria-expanded", String(!collapsed));
    });
    const body = make("div", "library-body");
    const grid = make("div", "library-grid");
    for (const kind of category.kinds) grid.append(this.card(kind));
    body.append(grid);
    group.append(head, body);
    this.groups.push(group);
    return group;
  }

  private buildFilter(): void {
    const bar = byId("library-filter");
    const chip = (id: string, label: string, kind: Kind | null): HTMLButtonElement => {
      const button = make("button", "filter-chip");
      button.type = "button";
      button.dataset.category = id;
      button.classList.toggle("is-active", id === this.category);
      // Icon-only chips fit in one row; the name is in the tooltip and the count line.
      button.setAttribute("aria-label", label);
      button.dataset.tip = label;
      button.dataset.name = label;
      if (kind !== null) {
        const icon = make("img");
        icon.src = iconUrl(kind);
        icon.alt = "";
        button.append(icon);
      } else {
        button.append(make("span", "filter-all", "▦"));
      }
      button.addEventListener("click", () => {
        this.category = id;
        for (const other of bar.querySelectorAll<HTMLElement>(".filter-chip")) other.classList.toggle("is-active", other === button);
        button.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        this.apply();
      });
      return button;
    };
    bar.append(chip("all", "Todos", null), chip(MINE, "Mis creaciones", "chest"), ...CATEGORIES.map((category) => chip(category.id, category.name, CATEGORY_ICON[category.id] ?? null)));
    trackActive(bar, bar.querySelector<HTMLElement>(".filter-pill")!, ".filter-chip.is-active");
    this.apply();
  }

  private card(kind: Kind, creation?: CreationDto): HTMLButtonElement {
    const card = make("button", "palette-item");
    card.type = "button";
    card.draggable = true;
    const name = creation?.name ?? KIND_INFO[kind].name;
    card.title = creation ? `${name}: tu versión de ${KIND_INFO[kind].name.toLowerCase()}` : `${name}: ${KIND_INFO[kind].hint}`;
    card.dataset.kind = kind;
    if (creation) {
      card.dataset.variant = String(creation.id);
      card.classList.add("is-mine");
    }
    const grip = make("span", "palette-grip", "⠿");
    grip.setAttribute("aria-hidden", "true");
    card.append(grip, iconElement(kind, creation?.tint), make("span", "palette-name", name));
    card.addEventListener("click", () => {
      const same = this.active === kind && this.activeVariant === creation?.id;
      this.pick(same ? null : kind, same ? undefined : creation?.id);
    });
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(DRAG_TYPE, kind);
      if (creation) event.dataTransfer?.setData(VARIANT_TYPE, String(creation.id));
      event.dataTransfer?.setData("text/plain", kind);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
    this.cards.set(creation ? `${kind}#${creation.id}` : kind, card);
    return card;
  }

  /** Show only the cards that match the search, hiding empty categories. */
  filter(query: string): void {
    this.query = query;
    this.apply();
  }

  /** Search and category together decide what is shown; the count follows. */
  private apply(): void {
    let shown = 0;
    for (const card of this.cards.values()) {
      const kind = card.dataset.kind as Kind;
      const text = card.querySelector(".palette-name")?.textContent ?? "";
      card.hidden = !(matchesSearch(kind, this.query) || normalise(text).includes(normalise(this.query)));
      if (!card.hidden && (this.category === "all" || card.closest<HTMLElement>(".library-group")?.dataset.category === this.category)) shown += 1;
    }
    for (const group of this.groups) {
      const outside = this.category !== "all" && group.dataset.category !== this.category;
      const empty = group.querySelectorAll(".palette-item").length === 0;
      // "Mis creaciones" with nothing yet: shown (with a hint) only when it is the chosen filter.
      group.hidden = outside || (empty ? !(group.dataset.category === MINE && this.category === MINE) : [...group.querySelectorAll<HTMLElement>(".palette-item")].every((card) => card.hidden));
      const visible = [...group.querySelectorAll<HTMLElement>(".palette-item")].filter((card) => !card.hidden).length;
      group.querySelector(".library-title-count")!.textContent = String(visible);
      // A search or a single category always opens its sections.
      if (this.query !== "" || this.category !== "all") {
        group.classList.remove("is-collapsed");
        group.querySelector(".library-title")!.setAttribute("aria-expanded", "true");
      }
    }
    const count = document.getElementById("library-count");
    const name = this.category === MINE ? "Mis creaciones" : CATEGORIES.find((category) => category.id === this.category)?.name ?? "Todos";
    if (count !== null) count.textContent = `${name} · ${shown === 0 ? "sin resultados" : countLabel(shown)}`;
  }

  /** Highlight the kind the brush paints with (null: none), and which creation it is. */
  pick(kind: Kind | null, variant?: number): void {
    this.highlight(kind, variant);
    this.onPick(kind);
  }

  /** Show the active kind without telling the app again (when the tool changes). */
  highlight(kind: Kind | null, variant: number | undefined = kind === this.active ? this.activeVariant : undefined): void {
    this.active = kind;
    this.activeVariant = kind === null ? undefined : variant;
    const key = kind === null ? null : variant === undefined ? kind : `${kind}#${variant}`;
    for (const [k, card] of this.cards) card.classList.toggle("is-active", k === key);
  }

  get current(): Kind | null {
    return this.active;
  }

  /** The creation the brush paints with, if the chosen card is one of "Mis creaciones". */
  get currentVariant(): number | undefined {
    return this.activeVariant;
  }

  /** Fill "Mis creaciones" with the account's enemies and objects (heroes are chosen when playing). */
  setCreations(creations: readonly CreationDto[]): void {
    const group = this.groups.find((g) => g.dataset.category === MINE)!;
    const grid = group.querySelector(".library-grid")!;
    for (const [key, card] of [...this.cards]) if (card.classList.contains("is-mine")) this.cards.delete(key);
    const placeable = creations.filter((c) => c.category !== "hero" && isKind(c.base_kind));
    grid.replaceChildren(...placeable.map((c) => this.card(c.base_kind as Kind, c)));
    group.querySelector(".library-empty")?.remove();
    if (placeable.length === 0) {
      grid.after(make("p", "library-empty", "Aún no tienes creaciones. Crea enemigos y objetos propios en el Panel de administración."));
    }
    if (this.activeVariant !== undefined && !placeable.some((c) => c.id === this.activeVariant)) this.pick(null);
    this.apply();
  }

  /** A scene has only one player: its card is disabled once one is placed. */
  setPlayerAvailable(available: boolean): void {
    const card = this.cards.get("player")!;
    card.disabled = !available;
    card.draggable = available;
    if (!available && this.active === "player") this.pick(null);
  }
}
