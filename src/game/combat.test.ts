import { describe, expect, it, test } from "vitest";
import { ENEMY_KINDS } from "../model/GameObject";
import {
  aimAngle, chargePower, distanceToSegment, ENEMIES, enemyStats, healthColor, heroById, HEROES, inSwing, leadAngle, LOOT, rangedIntent,
  ringAngles, rollLoot, speedFor, WEAPONS, isFirearm, MEDKIT_HEAL, POTION_HEAL,
} from "./combat";

describe("heroes and weapons", () => {
  it("each hero carries a weapon that exists", () => {
    for (const hero of HEROES) expect(WEAPONS[hero.weapon].id).toBe(hero.weapon);
  });

  it("the wizard casts an exploding orb", () => {
    const wand = WEAPONS[heroById("wizard").weapon];
    expect(wand.style).toBe("projectile");
    expect(wand.projectile!.splash).toBeGreaterThan(0);
  });

  it("there are eleven heroes (three soldiers with firearms), each with its own texture and a weapon that flies or hits", () => {
    expect(HEROES).toHaveLength(11);
    expect(new Set(HEROES.map((h) => h.texture)).size).toBe(11);
    for (const hero of HEROES) {
      const weapon = WEAPONS[hero.weapon];
      expect(weapon.windupMs).toBeGreaterThan(0);
      expect(weapon.style === "melee" || weapon.projectile !== undefined).toBe(true);
    }
  });

  it("a held bow shoots harder than a tapped one", () => {
    const bow = WEAPONS.bow;
    expect(chargePower(bow, 0)).toBeCloseTo(0.55);
    expect(chargePower(bow, bow.windupMs + bow.chargeMs)).toBe(1);
    expect(chargePower(WEAPONS.sword, 0)).toBe(1);
  });

  it("an unknown hero falls back to the knight", () => {
    expect(heroById("nobody").id).toBe("knight");
    expect(heroById(null).id).toBe("knight");
  });
});

describe("enemies", () => {
  it("every enemy kind has stats with health", () => {
    for (const kind of ENEMY_KINDS) expect(enemyStats(kind).health).toBeGreaterThan(0);
  });

  it("the brute is the toughest and hits hardest", () => {
    expect(enemyStats("brute").health).toBeGreaterThan(enemyStats("enemy").health);
    expect(enemyStats("brute").damage).toBe(2);
  });

  it("enemies get faster with the AI difficulty", () => {
    const slime = enemyStats("enemy");
    expect(speedFor(slime, 0)).toBeLessThan(speedFor(slime, 1));
    expect(speedFor(slime, 5)).toBe(speedFor(slime, 1));
  });
});

describe("loot", () => {
  it("rolls every entry of the table", () => {
    expect(rollLoot(() => 0)).toBe(LOOT[0]);
    expect(rollLoot(() => 0.999)).toBe(LOOT[LOOT.length - 1]);
    expect(rollLoot(() => 1)).toBe(LOOT[LOOT.length - 1]);
  });
});

describe("hit tests", () => {
  const sword = WEAPONS.sword;

  it("a swing hits what is in front and close", () => {
    expect(inSwing(40, 0, 0, sword)).toBe(true);
    expect(inSwing(-40, 0, 0, sword)).toBe(false);
    expect(inSwing(200, 0, 0, sword)).toBe(false);
  });

  it("a swing always hits what is touching the hero", () => {
    expect(inSwing(-5, 0, 0, sword)).toBe(true);
  });

  it("measures the distance to the ray", () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distanceToSegment(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(distanceToSegment(1, 1, 0, 0, 0, 0)).toBeCloseTo(Math.SQRT2);
  });

  it("aims at an enemy close to where the hero faces, not at one behind", () => {
    const ahead = { x: 100, y: 20 };
    const behind = { x: -50, y: 0 };
    expect(aimAngle(0, 0, 0, [ahead, behind], 300)).toBeCloseTo(Math.atan2(20, 100));
    expect(aimAngle(0, 0, 0, [behind], 300)).toBe(0);
    expect(aimAngle(0, 0, 0, [{ x: 900, y: 0 }], 300)).toBe(0);
  });

  it("health bars go from green to red", () => {
    expect(healthColor(1)).toBe(0x33e0a1);
    expect(healthColor(0.5)).toBe(0xffc547);
    expect(healthColor(0.1)).toBe(0xff4d6d);
  });
});

describe("enemies that shoot", () => {
  it("every enemy kind has its own stats, and shooters have an attack", () => {
    for (const kind of ENEMY_KINDS) {
      const stats = ENEMIES[kind];
      expect(stats).toBeDefined();
      if (stats!.behavior === "ranged" || stats!.behavior === "boss") expect(stats!.attack).toBeDefined();
    }
  });

  it("the demon is the boss: by far the most health and points", () => {
    const demon = enemyStats("demon");
    expect(demon.behavior).toBe("boss");
    for (const kind of ENEMY_KINDS) if (kind !== "demon") expect(enemyStats(kind).health).toBeLessThan(demon.health);
  });

  it("a ranged enemy backs off, strafes or closes in to keep its distance", () => {
    expect(rangedIntent(100, 210)).toBe(-1);
    expect(rangedIntent(210, 210)).toBe(0);
    expect(rangedIntent(400, 210)).toBe(1);
  });

  it("enemy shots lead a moving player, but only partly", () => {
    const still = leadAngle(0, 0, 100, 0, 0, 0, 400);
    expect(still).toBeCloseTo(0);
    const moving = leadAngle(0, 0, 100, 0, 0, 200, 400);
    expect(moving).toBeGreaterThan(0);
    expect(moving).toBeLessThan(Math.atan2(200 * 0.25, 100) + 0.001);
  });

  it("a ring of fire covers every direction evenly", () => {
    const ring = ringAngles(4);
    expect(ring).toHaveLength(4);
    expect(ring[1] - ring[0]).toBeCloseTo(Math.PI / 2);
  });
});

test("every firearm shoots something and the guns are told apart from the old weapons", () => {
  for (const id of ["pistol", "rifle", "shotgun", "smg", "sniper", "launcher", "grenade"] as const) {
    expect(isFirearm(id)).toBe(true);
    expect(WEAPONS[id].style).toBe("projectile");
    expect(WEAPONS[id].projectile).toBeDefined();
  }
  expect(isFirearm("sword")).toBe(false);
  expect(isFirearm("bow")).toBe(false);
  // The shotgun spreads, the sniper pierces, the explosives hurt an area.
  expect(WEAPONS.shotgun.projectile!.count).toBeGreaterThan(1);
  expect(WEAPONS.sniper.projectile!.pierce).toBeGreaterThan(0);
  expect(WEAPONS.launcher.projectile!.splash).toBeGreaterThan(0);
  expect(WEAPONS.grenade.projectile!.gravity).toBeGreaterThan(0);
});

test("chests can drop guns, potions and medkits", () => {
  for (const kind of ["pistol", "rifle", "grenade", "potion", "medkit"] as const) expect(LOOT).toContain(kind);
  expect(rollLoot(() => 0)).toBe(LOOT[0]);
  expect(rollLoot(() => 0.9999)).toBe(LOOT[LOOT.length - 1]);
  expect(MEDKIT_HEAL).toBeGreaterThan(POTION_HEAL);
});

test("war enemies: artillery never moves, the tank is a boss, soldiers shoot", () => {
  expect(enemyStats("artillery").speed).toBe(0);
  expect(enemyStats("tank").behavior).toBe("boss");
  expect(enemyStats("soldier").attack?.projectile.texture).toBe("bullet");
  expect(enemyStats("grenadier").attack?.projectile.splash).toBeGreaterThan(0);
  expect(enemyStats("legionary").behavior).toBe("chase");
});
