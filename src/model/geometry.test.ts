import { expect, test } from "vitest";
import { KINDS, SIZES, isKind } from "./GameObject";
import { clampToWorld, coverZoom, fitZoom, overlaps, snap } from "./geometry";

test("snap puts tile-sized objects exactly on a cell", () => {
  expect(snap(50, "wall", 32)).toBe(48);
  expect(snap(63, "wall", 32)).toBe(48);
  expect(snap(65, "wall", 32)).toBe(80);
});

test("snap aligns houses by their edges and coins by their centre", () => {
  expect(snap(150, "house", 32)).toBe(144); // 96 px: edges on the grid
  expect(snap(30, "coin", 32)).toBe(16);
  expect(snap(30, "wall", 16)).toBe(32);
});

test("clampToWorld keeps the whole object inside", () => {
  expect(clampToWorld(0, 0, "house")).toEqual([48, 48]);
  expect(clampToWorld(5000, 5000, "coin")).toEqual([1592, 952]);
  expect(clampToWorld(400, 300, "box")).toEqual([400, 300]);
});

test("coverZoom fills the view with the world, whatever its shape", () => {
  expect(coverZoom(1600, 960)).toBe(1);
  expect(coverZoom(800, 800)).toBe(0.84); // a square view: the height decides
  expect(coverZoom(1200, 400)).toBe(0.75); // a wide view: the width decides
});

test("fitZoom shows the whole world", () => {
  expect(fitZoom(1648, 1008)).toBe(1);
  expect(fitZoom(848, 528)).toBe(0.5);
  expect(fitZoom(10, 10)).toBe(0.1);
});

test("overlaps uses each kind's size", () => {
  expect(overlaps({ kind: "wall", x: 0, y: 0 }, { kind: "wall", x: 31, y: 0 })).toBe(true);
  expect(overlaps({ kind: "wall", x: 0, y: 0 }, { kind: "wall", x: 32, y: 0 })).toBe(false);
  expect(overlaps({ kind: "house", x: 100, y: 100 }, { kind: "coin", x: 150, y: 100 })).toBe(true);
});

test("every kind has a size and isKind rejects unknown values", () => {
  for (const kind of KINDS) expect(SIZES[kind]).toHaveLength(2);
  expect(isKind("house")).toBe(true);
  expect(isKind("dragon")).toBe(false);
  expect(isKind(3)).toBe(false);
});
