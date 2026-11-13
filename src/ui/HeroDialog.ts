import { TEXTURE_BASE } from "../game/assets";
import { playableHero, playableHeroes, type PlayableHero } from "../game/balance";
import { WEAPONS } from "../game/combat";
import { spriteUrl } from "../game/sprites";
import { byId, make } from "./dom";

const STORAGE_KEY = "pixelforge-hero";

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // only a convenience
  }
}

function bar(label: string, value: number): HTMLElement {
  const row = make("div", "stat-row");
  const track = make("i");
  const fill = make("b");
  fill.style.width = `${value * 10}%`;
  track.append(fill);
  row.append(make("span", "", label), track, make("span", "stat-value", String(value)));
  return row;
}

function card(hero: PlayableHero): HTMLButtonElement {
  const weapon = WEAPONS[hero.weapon];
  const button = make("button", "hero");
  button.type = "button";
  button.dataset.hero = hero.id;
  button.setAttribute("role", "radio");
  const portrait = make("div", "portrait");
  const body = make("img");
  body.src = spriteUrl(hero.spriteId) ?? `${TEXTURE_BASE}${hero.texture}.png`;
  body.alt = "";
  if (hero.tint !== null) {
    // The hero's own colour over the sprite, masked by it.
    portrait.classList.add("is-tinted");
    portrait.style.setProperty("--icon", `url("${body.src}")`);
    portrait.style.setProperty("--tint", `#${hero.tint.toString(16).padStart(6, "0")}`);
  }
  const tool = make("img", "portrait-weapon");
  tool.src = `${TEXTURE_BASE}${weapon.id}.png`;
  tool.alt = "";
  portrait.append(body, tool);
  const skill = make("div", "skill");
  const icon = make("img");
  icon.src = tool.src;
  icon.alt = "";
  skill.append(icon, make("span", "", `${weapon.name} · ${weapon.summary.split(" · ")[0].toLowerCase()}`), make("kbd", "", "Espacio"));
  const title = make("h4", "", hero.name);
  if (hero.custom) title.append(make("span", "hero-mine", "Tuyo"));
  // Health and attack as this account set them in the admin panel.
  const power = hero.custom ? hero.bars.power : Math.max(1, Math.min(10, hero.bars.power + hero.damageBonus * 2));
  button.append(portrait, title, make("p", "", hero.custom ? `Tu héroe basado en ${WEAPONS[hero.weapon].name.toLowerCase()}. Vida ${hero.maxHealth} · daño ${hero.damage}.` : hero.description),
    bar("Vida", Math.min(10, hero.maxHealth)), bar("Velocidad", Math.max(1, Math.min(10, hero.bars.speed))), bar("Poder", power), skill);
  return button;
}

/** Asks which hero to play with. Resolves with its id, or null when cancelled. */
export function chooseHero(): Promise<string | null> {
  const dialog = byId<HTMLDialogElement>("hero-dialog");
  const list = byId("hero-list");
  const heroes = playableHeroes();
  const saved = remembered();
  let chosen: string = heroes.some((hero) => hero.id === saved) ? saved! : playableHero(null).id;
  // Rebuilt every time: the account may have changed its heroes in the admin panel.
  list.replaceChildren(...heroes.map(card));
  const paint = () => {
    for (const button of list.querySelectorAll<HTMLButtonElement>(".hero")) {
      const on = button.dataset.hero === chosen;
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    }
  };
  list.onclick = (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".hero");
    if (button === null) return;
    chosen = button.dataset.hero!;
    paint();
  };
  list.ondblclick = () => dialog.close("play");
  paint();
  dialog.returnValue = "";
  dialog.showModal();
  list.querySelector<HTMLButtonElement>(`[data-hero="${chosen}"]`)?.focus();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      if (dialog.returnValue !== "play") return resolve(null);
      remember(chosen);
      resolve(chosen);
    }, { once: true });
  });
}
