import { byId, make } from "./dom";

export type ToastKind = "info" | "success" | "error";

/** Never more than this many messages on screen: the oldest makes room for a new one. */
export const MAX_TOASTS = 3;

const timers = new WeakMap<Element, number>();

/**
 * Show a short message in the corner; it disappears by itself.
 *
 * The same message is never stacked: if it is already on screen it stays
 * where it is, pulses once and its time starts again (pressing a button
 * five times gives one message, not five).
 */
export function toast(message: string, kind: ToastKind = "info", ms = 3200): void {
  const box = byId("toasts");
  const same = [...box.children].find((item) => item.textContent === message && item.classList.contains(`is-${kind}`));
  if (same !== undefined) {
    window.clearTimeout(timers.get(same));
    same.classList.remove("is-repeated");
    void (same as HTMLElement).offsetWidth;
    same.classList.add("is-repeated");
    timers.set(same, window.setTimeout(() => same.remove(), ms));
    return;
  }
  while (box.children.length >= MAX_TOASTS) box.firstElementChild?.remove();
  const item = make("div", `toast is-${kind}`, message);
  item.setAttribute("role", kind === "error" ? "alert" : "status");
  box.append(item);
  timers.set(item, window.setTimeout(() => item.remove(), ms));
}
