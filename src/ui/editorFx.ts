/**
 * Small motion helpers for the editor chrome (no game logic here):
 *
 * - A pill that slides under the active tool and the active dock tab, so the
 *   eye follows the change instead of seeing a jump.
 * - Styled tooltips: a button's title becomes data-tip (the native tooltip
 *   would show twice) and the shortcut in brackets becomes data-key.
 */

/** "Borrar objetos (E)" -> { tip: "Borrar objetos", key: "E" }. */
export function splitShortcut(title: string): { tip: string; key: string } {
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(title);
  return match ? { tip: match[1], key: match[2] } : { tip: title, key: "" };
}

function trackActive(container: HTMLElement, pill: HTMLElement, activeSelector: string): void {
  const place = (): void => {
    const active = container.querySelector<HTMLElement>(activeSelector);
    if (active === null || active.offsetWidth === 0) {
      pill.style.opacity = "0";
      return;
    }
    pill.style.opacity = "1";
    pill.style.setProperty("--pill-x", `${active.offsetLeft}px`);
    pill.style.setProperty("--pill-w", `${active.offsetWidth}px`);
  };
  new MutationObserver(place).observe(container, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  new ResizeObserver(place).observe(container);
  place();
}

export function initEditorFx(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  for (const group of app.querySelectorAll<HTMLElement>(".toolgroup")) {
    const pill = group.querySelector<HTMLElement>(".tool-pill");
    if (pill !== null) {
      group.classList.add("has-pill");
      trackActive(group, pill, ".tool.is-active");
    }
  }
  for (const tabs of app.querySelectorAll<HTMLElement>(".dock-tabs")) {
    const pill = tabs.querySelector<HTMLElement>(".tab-pill");
    if (pill !== null) {
      tabs.classList.add("has-pill");
      trackActive(tabs, pill, ".dock-tab.is-active");
    }
  }
  for (const button of app.querySelectorAll<HTMLElement>(".topbar [title], .viewport-controls [title]")) {
    const { tip, key } = splitShortcut(button.title);
    button.dataset.tip = tip;
    if (key) button.dataset.key = key;
    if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", tip);
    button.removeAttribute("title");
  }
}
