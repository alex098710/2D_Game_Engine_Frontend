import { expect, test } from "vitest";
import type { ProjectDto } from "../api/client";
import { jagged } from "./fx";
import { objectCount, projectIcon } from "./HomeScreen";

function project(kinds: ProjectDto["scene"][number]["kind"][]): ProjectDto {
  return { id: 1, owner_id: 1, name: "p", updated_at: "2026-10-26T00:00:00Z", scene: kinds.map((kind, i) => ({ id: `o${i}`, kind, x: 0, y: 0 })) };
}

test("a recent project is shown with its most telling object", () => {
  expect(projectIcon(project(["wall", "house", "brute"]))).toBe("house");
  expect(projectIcon(project(["spider", "coin"]))).toBe("spider");
  expect(projectIcon(project([]))).toBe("tree");
});

test("object counts read naturally in Spanish", () => {
  expect(objectCount(1)).toBe("1 objeto");
  expect(objectCount(24)).toBe("24 objetos");
});

test("a lightning bolt starts and ends where asked", () => {
  const points = jagged(0, 0, 100, 0, 30, () => 1);
  expect(points[0]).toEqual([0, 0]);
  expect(points[points.length - 1]).toEqual([100, 0]);
  expect(points).toHaveLength(9);
  expect(Math.abs(points[4][1])).toBeCloseTo(15);
});

test("the greeting follows the hour of the day", async () => {
  const { greeting } = await import("./HomeScreen");
  expect(greeting(8)).toBe("Buenos días");
  expect(greeting(15)).toBe("Buenas tardes");
  expect(greeting(22)).toBe("Buenas noches");
  expect(greeting(2)).toBe("Buenas noches");
});

test("the forge rank only grows with the games played", async () => {
  const { forgeRank } = await import("./HomeScreen");
  expect(forgeRank(0)).toBe("Aprendiz de la forja");
  expect(forgeRank(1)).toBe("Herrero novato");
  expect(forgeRank(22)).toBe("Forjador");
  expect(forgeRank(30)).toBe("Maestro forjador");
  expect(forgeRank(250)).toBe("Leyenda de la forja");
});
