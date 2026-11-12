import { expect, test } from "vitest";
import { aiSummary, difficultyLabel } from "./AiPanel";
import { formatTime, hearts } from "./Hud";
import { passwordStrength } from "./passwordStrength";
import { achievementName } from "./ProgressPanel";
import { relativeTime } from "./ProjectList";
import { shortcutFor } from "./shortcuts";
import { resolveTheme } from "./theme";

test("passwords under 8 characters are very weak", () => {
  expect(passwordStrength("abc").score).toBe(0);
  expect(passwordStrength("abc").label).toBe("Muy débil");
});

test("length and character variety raise the score", () => {
  expect(passwordStrength("gatoverde").score).toBe(1);
  expect(passwordStrength("gatoverde12").score).toBe(2);
  expect(passwordStrength("Gatoverde12").score).toBe(3);
  expect(passwordStrength("Gatoverde12!largo").score).toBe(4);
});

test("repeated or common passwords stay weak", () => {
  expect(passwordStrength("aaaaaaaaaaaaaa").score).toBe(1);
  expect(passwordStrength("12345678Aa!xyz").score).toBe(1);
});

test("system theme follows the operating system", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
});

test("shortcuts map keys to editor actions", () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
    shortcutFor({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });
  expect(key("s", { ctrlKey: true })).toBe("save");
  expect(key("z", { metaKey: true })).toBe("undo");
  expect(key("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
  expect(key("y", { ctrlKey: true })).toBe("redo");
  expect(key("Delete")).toBe("remove");
  expect(key("p")).toBe("play");
  expect(key("Escape")).toBe("cancel");
  expect(key("s")).toBeNull();
});

test("HUD formats time and hearts", () => {
  expect(formatTime(75_000)).toBe("1:15");
  expect(formatTime(5_400)).toBe("0:05");
  expect(formatTime(-10)).toBe("0:00");
  expect(hearts(2)).toBe("♥♥♡");
  expect(hearts(9)).toBe("♥♥♥");
});

test("relativeTime describes how long ago a project changed", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  expect(relativeTime("2026-10-09T11:59:30Z", now)).toBe("hace un momento");
  expect(relativeTime("2026-10-09T11:40:00Z", now)).toBe("hace 20 min");
  expect(relativeTime("2026-10-09T07:00:00Z", now)).toBe("hace 5 h");
  expect(relativeTime("2026-10-08T12:00:00Z", now)).toBe("ayer");
  expect(relativeTime("2026-10-01T12:00:00Z", now)).toBe("hace 8 días");
});

test("difficulty labels and achievement names are in Spanish", () => {
  expect(difficultyLabel(0.1)).toBe("Fácil");
  expect(difficultyLabel(0.5)).toBe("Normal");
  expect(difficultyLabel(0.7)).toBe("Difícil");
  expect(difficultyLabel(0.95)).toBe("Muy difícil");
  expect(achievementName("untouchable")).toBe("Intocable");
  expect(achievementName("unknown")).toBe("unknown");
});

test("aiSummary says what the AI removed and added", () => {
  expect(aiSummary({ added: 3, removed: 12 })).toBe("La IA quitó 12 objetos y añadió 3 objetos.");
  expect(aiSummary({ added: 1, removed: 0 })).toBe("La IA añadió 1 objeto.");
  expect(aiSummary({ added: 0, removed: 0 })).toBe("La IA no encontró nada que cambiar con esa petición.");
  expect(aiSummary(undefined)).toBe("La IA actualizó la escena.");
});
