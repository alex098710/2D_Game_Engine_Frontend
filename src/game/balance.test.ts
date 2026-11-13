import { afterEach, describe, expect, it } from "vitest";
import { objectValue, playableEnemy, playableHero, playableHeroes, setRules, tintValue, variantTint, type CreationDto } from "./balance";
import { compactBalance, isDefault } from "../ui/AdminPanel";

const orc: CreationDto = { id: 7, category: "enemy", base_kind: "brute", name: "Ogro de hielo", tint: "#7fd4ff", health: 12, damage: 3, speed: 50, value: 0 };
const sergeant: CreationDto = { id: 8, category: "hero", base_kind: "soldier", name: "Sargento", tint: "#33e0a1", health: 9, damage: 4, speed: 190, value: 0 };
const elixir: CreationDto = { id: 9, category: "object", base_kind: "potion", name: "Elixir", tint: "#c38bff", health: 0, damage: 0, speed: 0, value: 6 };

afterEach(() => setRules({ heroes: {}, enemies: {} }, []));

describe("the account's rules in the game", () => {
  it("heroes and enemies keep the game's numbers until the panel changes them", () => {
    expect(playableHero("knight").maxHealth).toBe(6);
    expect(playableHero("knight").damageBonus).toBe(0);
    expect(playableEnemy("brute").health).toBe(8);
    setRules({ heroes: { knight: { health: 10, damage: 3 } }, enemies: { brute: { health: 20, damage: 5 } } }, []);
    expect(playableHero("knight").maxHealth).toBe(10);
    expect(playableHero("knight").damageBonus).toBe(2); // sword 1 -> 3
    expect(playableEnemy("brute")).toMatchObject({ health: 20, damage: 5 });
  });

  it("own creations: an enemy, a hero and a potion with their numbers and colour", () => {
    setRules({ heroes: {}, enemies: {} }, [orc, sergeant, elixir]);
    expect(playableEnemy("brute", 7)).toMatchObject({ name: "Ogro de hielo", health: 12, damage: 3, tint: 0x7fd4ff });
    expect(playableEnemy("ghost", 7).name).toBe("Fantasma"); // a creation only applies to its own kind
    const hero = playableHero("custom-8");
    expect(hero).toMatchObject({ name: "Sargento", maxHealth: 9, damage: 4, damageBonus: 2, custom: true, texture: "hero-soldier-idle" });
    expect(playableHeroes().map((h) => h.id)).toContain("custom-8");
    expect(objectValue("potion", 9)).toBe(6);
    expect(objectValue("potion")).toBe(2);
    expect(variantTint("potion", 9)).toBe(0xc38bff);
    expect(variantTint("medkit", 9)).toBeNull();
  });

  it("the three soldier heroes fight with firearms", () => {
    expect(["soldier", "commando", "warrior"].map((id) => playableHero(id).weapon)).toEqual(["rifle", "shotgun", "grenade"]);
  });

  it("white means no colour", () => {
    expect(tintValue("#ffffff")).toBeNull();
    expect(tintValue("#FF4D6D")).toBe(0xff4d6d);
    expect(tintValue("rojo")).toBeNull();
  });
});

describe("the admin panel only stores what changed", () => {
  it("drops entries equal to the game's defaults", () => {
    const base = { knight: { health: 6, damage: 1 } };
    expect(isDefault({ health: 6, damage: 1 }, base.knight)).toBe(true);
    const draft = { heroes: { knight: { health: 6, damage: 1 }, wizard: { health: 9, damage: 2 } }, enemies: {} };
    expect(compactBalance(draft, { ...base, wizard: { health: 4, damage: 2 } }, {})).toEqual({ heroes: { wizard: { health: 9, damage: 2 } }, enemies: {} });
  });
});
