import { iconUrl } from "../game/assets";
import { CATEGORIES, KIND_INFO, type Kind } from "../model/GameObject";
import { byId, make } from "./dom";
import { trackActive } from "./editorFx";

/** MIME type used when a library card is dragged onto the map. */
export const DRAG_TYPE = "application/x-motor2d-kind";

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

export function iconElement(kind: Kind): HTMLElement {
  const icon = make("span", "palette-icon");
  icon.style.backgroundImage = `url("${iconUrl(kind)}")`;
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
  private category = "all";
  private query = "";
  private readonly cards = new Map<Kind, HTMLButtonElement>();
  private readonly groups: HTMLElement[] = [];
  private readonly onPick: (kind: Kind | null) => void;

  constructor(onPick: (kind: Kind | null) => void) {
    this.onPick = onPick;
    const root = byId("library");
    for (const category of CATEGORIES) root.append(this.group(category));
    this.buildFilter();

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
    icon.src = iconUrl(CATEGORY_ICON[category.id] ?? category.kinds[0]);
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
    bar.append(chip("all", "Todos", null), ...CATEGORIES.map((category) => chip(category.id, category.name, CATEGORY_ICON[category.id] ?? null)));
    trackActive(bar, bar.querySelector<HTMLElement>(".filter-pill")!, ".filter-chip.is-active");
    this.apply();
  }

  private card(kind: Kind): HTMLButtonElement {
    const card = make("button", "palette-item");
    card.type = "button";
    card.draggable = true;
    card.title = `${KIND_INFO[kind].name}: ${KIND_INFO[kind].hint}`;
    card.dataset.kind = kind;
    const grip = make("span", "palette-grip", "⠿");
    grip.setAttribute("aria-hidden", "true");
    card.append(grip, iconElement(kind), make("span", "palette-name", KIND_INFO[kind].name));
    card.addEventListener("click", () => this.pick(this.active === kind ? null : kind));
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(DRAG_TYPE, kind);
      event.dataTransfer?.setData("text/plain", kind);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
    this.cards.set(kind, card);
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
    for (const [kind, card] of this.cards) {
      card.hidden = !matchesSearch(kind, this.query);
      if (!card.hidden && (this.category === "all" || card.closest<HTMLElement>(".library-group")?.dataset.category === this.category)) shown += 1;
    }
    for (const group of this.groups) {
      const outside = this.category !== "all" && group.dataset.category !== this.category;
      group.hidden = outside || [...group.querySelectorAll<HTMLElement>(".palette-item")].every((card) => card.hidden);
      const visible = [...group.querySelectorAll<HTMLElement>(".palette-item")].filter((card) => !card.hidden).length;
      group.querySelector(".library-title-count")!.textContent = String(visible);
      // A search or a single category always opens its sections.
      if (this.query !== "" || this.category !== "all") {
        group.classList.remove("is-collapsed");
        group.querySelector(".library-title")!.setAttribute("aria-expanded", "true");
      }
    }
    const count = document.getElementById("library-count");
    const name = CATEGORIES.find((category) => category.id === this.category)?.name ?? "Todos";
    if (count !== null) count.textContent = `${name} · ${shown === 0 ? "sin resultados" : countLabel(shown)}`;
  }

  /** Highlight the kind the brush paints with (null: none). */
  pick(kind: Kind | null): void {
    this.active = kind;
    for (const [k, card] of this.cards) card.classList.toggle("is-active", k === kind);
    this.onPick(kind);
  }

  /** Show the active kind without telling the app again (when the tool changes). */
  highlight(kind: Kind | null): void {
    this.active = kind;
    for (const [k, card] of this.cards) card.classList.toggle("is-active", k === kind);
  }

  get current(): Kind | null {
    return this.active;
  }

  /** A scene has only one player: its card is disabled once one is placed. */
  setPlayerAvailable(available: boolean): void {
    const card = this.cards.get("player")!;
    card.disabled = !available;
    card.draggable = available;
    if (!available && this.active === "player") this.pick(null);
  }
}
