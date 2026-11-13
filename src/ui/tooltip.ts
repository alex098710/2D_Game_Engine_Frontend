/**
 * Real tooltips for the whole app (the icon-buttons skill: a native `title`
 * is not a tooltip).
 *
 * Any element with a `title` (or `data-tip`) gets one tooltip surface instead:
 * it shows after a short pause on hover, and at once on keyboard focus, with
 * the shortcut in a <kbd> when the label ends with one ("Deshacer (Ctrl+Z)"),
 * written for the platform (⌘ on a Mac). It is placed under the element (or
 * above it when there is no room) and always kept inside the window. The
 * element keeps its accessible name; the tooltip is linked with
 * aria-describedby while it shows. Escape, scrolling or leaving hides it.
 */

const HOVER_DELAY_MS = 350;
const GAP = 8;
const MARGIN = 8;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "Deshacer (Ctrl+Z)" -> { label: "Deshacer", keys: "Ctrl+Z" } (keys only when they look like a shortcut). */
export function splitShortcut(text: string): { label: string; keys: string | null } {
  const match = /^(.*?)\s*\(((?:Ctrl|Shift|Alt|⌘|Esc|Supr|Del|[A-Z0-9])(?:\+[A-Za-z0-9]+)*)\)\s*$/.exec(text.trim());
  if (match === null) return { label: text.trim(), keys: null };
  return { label: match[1], keys: match[2] };
}

/** The shortcut as this platform writes it. */
export function platformKeys(keys: string, mac = isMac): string {
  return mac ? keys.replace(/Ctrl\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧") : keys;
}

let tip: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let timer = 0;

function surface(): HTMLElement {
  if (tip === null) {
    tip = document.createElement("div");
    tip.id = "app-tooltip";
    tip.className = "tooltip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.append(tip);
  }
  return tip;
}

/** Move a native title into data-tip, so the browser's slow tooltip never doubles ours. */
function adopt(element: HTMLElement): string | null {
  const title = element.getAttribute("title");
  if (title) {
    element.dataset.tip = title;
    element.removeAttribute("title");
    if (!element.hasAttribute("aria-label") && (element.textContent ?? "").trim() === "") element.setAttribute("aria-label", splitShortcut(title).label);
  }
  return element.dataset.tip ?? null;
}

function show(element: HTMLElement): void {
  const text = adopt(element);
  if (!text) return;
  const box = surface();
  const parsed = splitShortcut(text);
  const label = parsed.label;
  // The editor bar keeps its shortcut apart (editorFx.ts puts it in data-key).
  const keys = parsed.keys ?? element.dataset.key ?? null;
  box.replaceChildren(document.createTextNode(label));
  if (keys) {
    const kbd = document.createElement("kbd");
    kbd.textContent = platformKeys(keys);
    box.append(kbd);
  }
  box.hidden = false;
  box.classList.remove("is-shown");
  owner = element;
  element.setAttribute("aria-describedby", box.id);
  // Under the element, centred; above it if there is no room; always inside the window.
  const anchor = element.getBoundingClientRect();
  const size = box.getBoundingClientRect();
  let top = anchor.bottom + GAP;
  if (top + size.height > window.innerHeight - MARGIN) top = anchor.top - GAP - size.height;
  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - size.width / 2, MARGIN), window.innerWidth - size.width - MARGIN);
  box.style.setProperty("--tip-x", `${Math.round(left)}px`);
  box.style.setProperty("--tip-y", `${Math.round(Math.max(MARGIN, top))}px`);
  void box.offsetWidth;
  box.classList.add("is-shown");
}

function hide(): void {
  window.clearTimeout(timer);
  if (owner !== null) owner.removeAttribute("aria-describedby");
  owner = null;
  if (tip !== null) {
    tip.hidden = true;
    tip.classList.remove("is-shown");
  }
}

const target = (event: Event) => (event.target instanceof Element ? event.target.closest<HTMLElement>("[title], [data-tip]") : null);

/** Start the tooltips for every element with a title, now and later (cards made by code too). */
export function initTooltips(): void {
  document.addEventListener("pointerover", (event) => {
    if ((event as PointerEvent).pointerType === "touch") return; // a tap is not a hover
    const element = target(event);
    if (element === null) return;
    adopt(element);
    if (element === owner) return;
    hide();
    timer = window.setTimeout(() => show(element), HOVER_DELAY_MS);
  });
  document.addEventListener("pointerout", (event) => {
    const element = target(event);
    if (element !== null && !element.contains((event as PointerEvent).relatedTarget as Node | null)) hide();
  });
  document.addEventListener("focusin", (event) => {
    const element = target(event);
    // Keyboard focus only: a click focuses too, and that one should not pop a tooltip.
    if (element !== null && element.matches(":focus-visible")) show(element);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
