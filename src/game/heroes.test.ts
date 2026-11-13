import { expect, test } from "vitest";
import { EXTRA_TEXTURES } from "./assets";
import { HEROES } from "./combat";

// The hero images on disk (Vite lists them; nothing is loaded).
const files = Object.keys(import.meta.glob("/public/textures/hero-*.png")).map((path) => path.split("/").pop()!.replace(/\.png$/, ""));

test("every hero has a standing pose and two walking steps, drawn and loaded", () => {
  for (const hero of HEROES) {
    expect(hero.texture).toMatch(/^hero-.+-idle$/);
    for (const pose of ["idle", "walk1", "walk2"]) {
      const key = hero.texture.replace(/-idle$/, `-${pose}`);
      expect(EXTRA_TEXTURES as readonly string[]).toContain(key);
      expect(files).toContain(key);
    }
  }
});
