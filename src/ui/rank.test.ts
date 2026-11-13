import { expect, test } from "vitest";
import { forgeRank, rankProgress } from "./HomeScreen";

test("the rank card says the level, how far the next rank is and what is left", () => {
  expect(rankProgress(0)).toEqual({ level: 1, name: "Aprendiz de la forja", progress: 0, next: "Te falta 1 partida para ser Herrero novato." });
  const one = rankProgress(1);
  expect(one.level).toBe(2);
  expect(one.next).toBe("Te faltan 9 partidas para ser Forjador.");
  expect(rankProgress(20).progress).toBe(0.5);
  expect(rankProgress(150)).toMatchObject({ level: 5, progress: 1 });
  // The same names as the title earned by playing.
  for (const games of [0, 1, 9, 10, 29, 30, 99, 100]) expect(rankProgress(games).name).toBe(forgeRank(games));
});
