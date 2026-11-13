import { expect, test } from "vitest";
import { CATEGORIES, categoryOf, CHARACTER_KINDS, isCharacter, KINDS, SIZES } from "../model/GameObject";
import { matchesSearch, normalise } from "./Library";
import { groupByKind } from "./SceneTree";
import { shortcutFor } from "./shortcuts";

test("every kind is in exactly one library category", () => {
  const listed = CATEGORIES.flatMap((category) => category.kinds);
  expect([...listed].sort()).toEqual([...KINDS].sort());
  expect(categoryOf("wizard")).toBe("characters");
  expect(categoryOf("house")).toBe("building");
});

test("2D characters are friendly kinds with a size", () => {
  expect(CHARACTER_KINDS).toEqual(["villager", "knight", "wizard", "ally", "guard"]);
  expect(isCharacter("knight")).toBe(true);
  expect(isCharacter("enemy")).toBe(false);
  for (const kind of CHARACTER_KINDS) expect(SIZES[kind]).toEqual([24, 28]);
});

test("the library search ignores case and accents", () => {
  expect(normalise("  Árbol ")).toBe("arbol");
  expect(matchesSearch("tree", "ARBOL")).toBe(true);
  expect(matchesSearch("wizard", "mago")).toBe(true);
  expect(matchesSearch("wizard", "amistoso")).toBe(true);
  expect(matchesSearch("wall", "mago")).toBe(false);
  expect(matchesSearch("wall", "")).toBe(true);
});

test("the scene tree groups objects by kind in library order", () => {
  const groups = groupByKind([
    { id: "c1", kind: "coin", x: 0, y: 0 },
    { id: "w1", kind: "wizard", x: 0, y: 0 },
    { id: "h1", kind: "house", x: 0, y: 0 },
    { id: "c2", kind: "coin", x: 0, y: 0 },
  ]);
  expect(groups.map((g) => g.kind)).toEqual(["wizard", "house", "coin"]);
  expect(groups[2].objects.map((o) => o.id)).toEqual(["c1", "c2"]);
  expect(groupByKind([])).toEqual([]);
});

test("one-letter keys pick the editor tools", () => {
  const key = (k: string, ctrlKey = false) => shortcutFor({ key: k, ctrlKey, metaKey: false, shiftKey: false });
  expect(key("v")).toBe("toolSelect");
  expect(key("H")).toBe("toolHand");
  expect(key("b")).toBe("toolBrush");
  expect(key("e")).toBe("toolErase");
  expect(key("f")).toBe("focus");
  expect(key("e", true)).toBeNull();
});

test("a button title is split into its tip and its shortcut", async () => {
  const { splitShortcut } = await import("./editorFx");
  expect(splitShortcut("Borrar objetos (E)")).toEqual({ tip: "Borrar objetos", key: "E" });
  expect(splitShortcut("Deshacer (Ctrl+Z)")).toEqual({ tip: "Deshacer", key: "Ctrl+Z" });
  expect(splitShortcut("Ajustes")).toEqual({ tip: "Ajustes", key: "" });
});
