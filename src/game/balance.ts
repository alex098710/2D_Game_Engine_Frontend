import { isEnemy, type Kind } from "../model/GameObject";
import { enemyStats, heroById, HEROES, MEDKIT_HEAL, POTION_HEAL, BARREL_BLAST, WEAPONS, type EnemyStats, type Hero } from "./combat";

/**
 * The admin panel of the account applied to the game: the health and damage
 * it gave each hero and enemy, and its own creations (heroes, enemies and
 * objects built on a base kind). The game asks here instead of reading the
 * fixed tables, so every run uses this account's rules. Nothing here is
 * shared with other accounts: it is loaded after logging in.
 */

export interface Stats {
  health: number;
  damage: number;
}

export interface BalanceDto {
  heroes: Record<string, Stats>;
  enemies: Record<string, Stats>;
}

export type CreationCategory = "hero" | "enemy" | "object";

export interface CreationDto {
  id: number;
  category: CreationCategory;
  base_kind: string;
  name: string;
  tint: string;
  health: number;
  damage: number;
  speed: number;
  value: number;
}

/** A hero ready to play: its health and a bonus added to every weapon's damage. */
export interface PlayableHero extends Omit<Hero, "id"> {
  /** A built-in hero id, or "custom-12" for one of the account's own. */
  id: string;
  damage: number;
  damageBonus: number;
  tint: number | null;
  custom: boolean;
}

export interface PlayableEnemy extends EnemyStats {
  tint: number | null;
}

/** Same limits as the backend (app/admin/rules.py). */
export const LIMITS = {
  heroHealth: [1, 20],
  heroDamage: [1, 10],
  heroSpeed: [100, 300],
  enemyHealth: [1, 99],
  enemyDamage: [0, 10],
  enemySpeed: [0, 400],
  value: [0, 20],
} as const;

/** Objects a player can make their own version of, and what their value means. */
export const OBJECT_BASES: Record<string, "heal" | "damage" | null> = {
  potion: "heal", medkit: "heal", spike: "damage", explosive: "damage",
  chest: null, coin: null, box: null, barrel: null, rock: null, tree: null, bush: null,
};

const SPIKE_DAMAGE = 1;

let balance: BalanceDto = { heroes: {}, enemies: {} };
let creations: CreationDto[] = [];

export function setRules(next: BalanceDto, list: CreationDto[]): void {
  balance = { heroes: { ...next.heroes }, enemies: { ...next.enemies } };
  creations = [...list];
}

export function currentBalance(): BalanceDto {
  return { heroes: { ...balance.heroes }, enemies: { ...balance.enemies } };
}

export function currentCreations(): CreationDto[] {
  return [...creations];
}

export function creationById(id: number | undefined | null): CreationDto | undefined {
  return id == null ? undefined : creations.find((creation) => creation.id === id);
}

/** "#7fd4ff" -> 0x7fd4ff; white means no tint. */
export function tintValue(hex: string | undefined): number | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase() === "#ffffff") return null;
  return parseInt(hex.slice(1), 16);
}

/** The damage of a hero's own weapon: what the panel calls its attack. */
export function heroBaseDamage(hero: Hero): number {
  return WEAPONS[hero.weapon].damage;
}

/** The hero with this id (a built-in one or "custom-12"), with the account's numbers. */
export function playableHero(id: string | null | undefined): PlayableHero {
  const custom = id?.startsWith("custom-") ? creationById(Number(id.slice(7))) : undefined;
  if (custom && custom.category === "hero") {
    const base = heroById(custom.base_kind);
    return {
      ...base,
      id: `custom-${custom.id}`,
      name: custom.name,
      maxHealth: custom.health,
      speed: custom.speed || base.speed,
      damage: custom.damage,
      damageBonus: custom.damage - heroBaseDamage(base),
      tint: tintValue(custom.tint),
      custom: true,
      bars: { health: Math.min(10, custom.health), speed: Math.round((custom.speed || base.speed) / 25) - 2, power: Math.min(10, custom.damage * 3) },
    };
  }
  const base = heroById(id ?? null);
  const own = balance.heroes[base.id];
  const damage = own?.damage ?? heroBaseDamage(base);
  return {
    ...base,
    maxHealth: own?.health ?? base.maxHealth,
    damage,
    damageBonus: damage - heroBaseDamage(base),
    tint: null,
    custom: false,
  };
}

/** Every hero to choose from: the built-in ones, then the account's own. */
export function playableHeroes(): PlayableHero[] {
  return [
    ...HEROES.map((hero) => playableHero(hero.id)),
    ...creations.filter((creation) => creation.category === "hero").map((creation) => playableHero(`custom-${creation.id}`)),
  ];
}

/** An enemy as this account plays it: its own creation, or the base with the panel's numbers. */
export function playableEnemy(kind: Kind, variant?: number): PlayableEnemy {
  const base = enemyStats(kind);
  const custom = creationById(variant);
  if (custom && custom.category === "enemy" && custom.base_kind === kind) {
    return { ...base, name: custom.name, health: custom.health, damage: custom.damage, speed: custom.speed, tint: tintValue(custom.tint) };
  }
  const own = balance.enemies[kind];
  return { ...base, health: own?.health ?? base.health, damage: own?.damage ?? base.damage, tint: null };
}

/** What a potion heals, a spike hurts or a keg blasts, with the account's own objects. */
export function objectValue(kind: Kind, variant?: number): number {
  const custom = creationById(variant);
  if (custom && custom.category === "object" && custom.base_kind === kind && OBJECT_BASES[kind] !== null) return custom.value;
  if (kind === "medkit") return MEDKIT_HEAL;
  if (kind === "potion") return POTION_HEAL;
  if (kind === "explosive") return BARREL_BLAST.damage;
  if (kind === "spike") return SPIKE_DAMAGE;
  return 0;
}

/** The colour an object of the map is drawn with (its creation's tint), or null. */
export function variantTint(kind: Kind, variant?: number): number | null {
  const custom = creationById(variant);
  if (!custom || custom.base_kind !== kind || custom.category === "hero") return null;
  return tintValue(custom.tint);
}

/** The name an object of the map shows (its creation's), or null for the base name. */
export function variantName(kind: Kind, variant?: number): string | null {
  const custom = creationById(variant);
  return custom && custom.base_kind === kind && custom.category !== "hero" ? custom.name : null;
}

/** Bases a creation of each category can start from. */
export function baseKinds(category: CreationCategory): string[] {
  if (category === "hero") return HEROES.map((hero) => hero.id);
  if (category === "enemy") return Object.keys(enemyDefaults());
  return Object.keys(OBJECT_BASES);
}

/** The game's own numbers for every enemy, for the panel's "reset" and defaults. */
export function enemyDefaults(): Record<string, Stats & { name: string; texture: string; speed: number }> {
  const result: Record<string, Stats & { name: string; texture: string; speed: number }> = {};
  for (const kind of ENEMY_LIST) {
    const stats = enemyStats(kind);
    result[kind] = { name: stats.name, texture: stats.texture, health: stats.health, damage: stats.damage, speed: stats.speed };
  }
  return result;
}

const ENEMY_LIST: Kind[] = (
  ["enemy", "bat", "spider", "ghost", "brute", "rat", "mimic", "marksman", "necromancer", "legionary", "captain", "soldier", "grenadier", "artillery", "tank", "bandit", "demon"] as Kind[]
).filter((kind) => isEnemy(kind));
