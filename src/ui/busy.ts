/**
 * One request per button, with its loading wheel.
 *
 * Every button that talks to the server goes through once(): while its work
 * runs the button is disabled, marked aria-busy and shows its spinning wheel
 * (one is added if the button has none). Presses while it runs, and a press
 * right after it ends (a double click), are ignored, so a burst of clicks
 * sends one request. The wheel stays at least MIN_SPIN_MS, so even a quick
 * answer shows that something happened.
 */

/** The wheel shows at least this long, even if the server answers sooner. */
export const MIN_SPIN_MS = 450;
/** A press this soon after the work ends is taken as part of the same click. */
export const COOLDOWN_MS = 600;

const running = new WeakSet<Element>();
const endedAt = new WeakMap<Element, number>();

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Whether a press on this button now would start new work (false while it works or right after). */
export function canRun(button: Element, now = performance.now()): boolean {
  return !running.has(button) && now - (endedAt.get(button) ?? -Infinity) >= COOLDOWN_MS;
}

/**
 * Run `work` for this button unless it is already working (then nothing
 * happens and undefined is returned). `label` replaces the button's text
 * (.btn-label) while it works. Errors are passed on to the caller.
 */
export async function once<T>(button: HTMLButtonElement, work: () => Promise<T>, label?: string): Promise<T | undefined> {
  if (!canRun(button)) return undefined;
  running.add(button);
  if (button.querySelector(".btn-spinner") === null) {
    const spinner = document.createElement("span");
    spinner.className = "btn-spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.prepend(spinner);
  }
  const text = button.querySelector(".btn-label");
  const idle = text?.textContent ?? null;
  if (text && label) text.textContent = label;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  const started = performance.now();
  try {
    return await work();
  } finally {
    const left = MIN_SPIN_MS - (performance.now() - started);
    if (left > 0) await wait(left);
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    if (!wasDisabled) button.disabled = false;
    if (text && idle !== null) text.textContent = idle;
    running.delete(button);
    endedAt.set(button, performance.now());
  }
}
