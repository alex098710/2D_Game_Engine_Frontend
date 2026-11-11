/**
 * The numbers of the fight: heroes, weapons, enemies and chest loot.
 * No Phaser here, so every rule can be tested on its own.
 */
import type { Kind } from "../model/GameObject";

export type WeaponId =
  | "sword" | "axe" | "wand" | "bow" | "dagger" | "hammer" | "spear" | "staff"
  | "pistol" | "rifle" | "shotgun" | "smg" | "sniper" | "launcher" | "grenade";
export type HeroId = "knight" | "wizard" | "archer" | "barbarian" | "rogue" | "viking" | "lancer" | "druid";

/** How a thrown or shot thing flies (see projectiles.ts for the physics). */
export interface ProjectileSpec {
  /** Texture key of the projectile. */
  texture: "arrow" | "orb" | "dagger-flying" | "spark" | "fireball" | "bullet" | "shell" | "rocket" | "grenade";
  /** Launch speed along the ground, in px/s (at full charge for the bow). */
  speed: number;
  /** Pull towards the ground, px/s²: arrows and daggers fly in a low arc; magic floats. */
  gravity: number;
  /** Height the projectile starts at, above the hero's feet. */
  height: number;
  /** How many are fired at once, and the angle between them in degrees. */
  count: number;
  fanDeg: number;
  /** Spin in turns per second (daggers); 0 keeps it pointing where it flies. */
  spin: number;
  /** Enemies it goes through before stopping. */
  pierce: number;
  /** Times it bounces off walls before vanishing. */
  bounces: number;
  /** Radius of the explosion when it lands or hits (0: no explosion). */
  splash: number;
  /** Ground speed it gains per second (magic orbs speed up). */
  accel: number;
  /** Colour of the trail and the impact sparks. */
  color: number;
}

export interface Weapon {
  id: WeaponId;
  name: string;
  /** melee: a hit in front of the hero; projectile: something that flies. */
  style: "melee" | "projectile";
  damage: number;
  cooldownMs: number;
  /** Melee reach, or how far a projectile flies before it lands, in pixels. */
  range: number;
  /** Melee arc in degrees. */
  spread: number;
  knockback: number;
  /** Time the hero needs to get ready (raise the axe, draw the bow) before the hit or the shot. */
  windupMs: number;
  /** Holding the attack key longer than the windup charges the shot, up to this time (0: no charge). */
  chargeMs: number;
  /** Melee: speed of the step forward that goes with the hit (the lancer's thrust is long). */
  lunge: number;
  /** Melee: a ground slam that hits everything around the hero within this radius (the hammer). */
  shockwave: number;
  projectile?: ProjectileSpec;
  summary: string;
}

const ARROW: ProjectileSpec = { texture: "arrow", speed: 640, gravity: 240, height: 12, count: 1, fanDeg: 0, spin: 0, pierce: 0, bounces: 0, splash: 0, accel: 0, color: 0xd6ecff };
/** A bullet of the hero's firearms: straight and fast. Each gun changes speed, count and pierce. */
const SHOT: ProjectileSpec = { texture: "bullet", speed: 760, gravity: 0, height: 14, count: 1, fanDeg: 0, spin: 0, pierce: 0, bounces: 0, splash: 0, accel: 0, color: 0xffe7a3 };

/** True for the guns, which fire bullets, rockets or grenades instead of swinging or casting. */
export function isFirearm(id: WeaponId): boolean {
  return ["pistol", "rifle", "shotgun", "smg", "sniper", "launcher", "grenade"].includes(id);
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  sword: { id: "sword", name: "Espada", style: "melee", damage: 1, cooldownMs: 340, range: 52, spread: 120, knockback: 320, windupMs: 70, chargeMs: 0, lunge: 220, shockwave: 0, summary: "Golpe en arco · 1 de daño" },
  axe: { id: "axe", name: "Hacha", style: "melee", damage: 2, cooldownMs: 640, range: 58, spread: 150, knockback: 520, windupMs: 170, chargeMs: 0, lunge: 160, shockwave: 0, summary: "Golpe pesado · 2 de daño" },
  hammer: { id: "hammer", name: "Martillo", style: "melee", damage: 2, cooldownMs: 900, range: 44, spread: 160, knockback: 640, windupMs: 260, chargeMs: 0, lunge: 0, shockwave: 92, summary: "Golpe al suelo · 2 de daño en círculo" },
  spear: { id: "spear", name: "Lanza", style: "melee", damage: 2, cooldownMs: 520, range: 84, spread: 34, knockback: 380, windupMs: 110, chargeMs: 0, lunge: 430, shockwave: 0, summary: "Estocada larga · 2 de daño" },
  bow: { id: "bow", name: "Arco", style: "projectile", damage: 1, cooldownMs: 420, range: 520, spread: 0, knockback: 200, windupMs: 140, chargeMs: 520, lunge: 0, shockwave: 0, projectile: ARROW, summary: "Flechas · mantén para tensar" },
  wand: {
    id: "wand", name: "Varita", style: "projectile", damage: 2, cooldownMs: 620, range: 380, spread: 0, knockback: 260, windupMs: 230, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { texture: "orb", speed: 300, gravity: 0, height: 16, count: 1, fanDeg: 0, spin: 0, pierce: 0, bounces: 0, splash: 46, accel: 420, color: 0x5aa9ff },
    summary: "Orbe mágico · explota · 2 de daño",
  },
  dagger: {
    id: "dagger", name: "Dagas", style: "projectile", damage: 1, cooldownMs: 360, range: 300, spread: 0, knockback: 140, windupMs: 80, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { texture: "dagger-flying", speed: 520, gravity: 180, height: 10, count: 3, fanDeg: 13, spin: 3.5, pierce: 0, bounces: 0, splash: 0, accel: 0, color: 0xffffff },
    summary: "Tres dagas en abanico · 1 de daño",
  },
  staff: {
    id: "staff", name: "Bastón", style: "projectile", damage: 1, cooldownMs: 480, range: 620, spread: 0, knockback: 200, windupMs: 180, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { texture: "spark", speed: 420, gravity: 0, height: 14, count: 1, fanDeg: 0, spin: 0, pierce: 1, bounces: 3, splash: 0, accel: 0, color: 0x6ee7b7 },
    summary: "Chispa que rebota en paredes · 1 de daño",
  },
  pistol: {
    id: "pistol", name: "Pistola", style: "projectile", damage: 1, cooldownMs: 250, range: 440, spread: 0, knockback: 160, windupMs: 30, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: SHOT, summary: "Disparo rápido · 1 de daño",
  },
  rifle: {
    id: "rifle", name: "Fusil", style: "projectile", damage: 2, cooldownMs: 480, range: 640, spread: 0, knockback: 240, windupMs: 70, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { ...SHOT, speed: 920, pierce: 1 }, summary: "Bala perforante · 2 de daño",
  },
  shotgun: {
    id: "shotgun", name: "Escopeta", style: "projectile", damage: 1, cooldownMs: 720, range: 250, spread: 0, knockback: 380, windupMs: 60, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { ...SHOT, speed: 640, count: 5, fanDeg: 9 }, summary: "5 perdigones en abanico · 1 de daño cada uno",
  },
  smg: {
    id: "smg", name: "Subfusil", style: "projectile", damage: 1, cooldownMs: 110, range: 360, spread: 0, knockback: 90, windupMs: 0, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { ...SHOT, speed: 700 }, summary: "Ráfaga continua · 1 de daño",
  },
  sniper: {
    id: "sniper", name: "Francotirador", style: "projectile", damage: 4, cooldownMs: 1150, range: 900, spread: 0, knockback: 420, windupMs: 220, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { ...SHOT, speed: 1300, pierce: 2 }, summary: "Disparo perforante de largo alcance · 4 de daño",
  },
  launcher: {
    id: "launcher", name: "Lanzacohetes", style: "projectile", damage: 3, cooldownMs: 1250, range: 620, spread: 0, knockback: 520, windupMs: 180, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { texture: "rocket", speed: 260, gravity: 0, height: 16, count: 1, fanDeg: 0, spin: 0, pierce: 0, bounces: 0, splash: 66, accel: 620, color: 0xff7a2a },
    summary: "Cohete explosivo · 3 de daño en área",
  },
  grenade: {
    id: "grenade", name: "Granadas", style: "projectile", damage: 3, cooldownMs: 850, range: 320, spread: 0, knockback: 480, windupMs: 120, chargeMs: 0, lunge: 0, shockwave: 0,
    projectile: { texture: "grenade", speed: 300, gravity: 420, height: 18, count: 1, fanDeg: 0, spin: 2, pierce: 0, bounces: 0, splash: 60, accel: 0, color: 0xff9a3c },
    summary: "Granada en parábola · 3 de daño en área",
  },
};

export interface Hero {
  id: HeroId;
  name: string;
  texture: string;
  maxHealth: number;
  speed: number;
  /** How quickly the hero reaches full speed and stops, per second (higher: snappier). */
  agility: number;
  weapon: WeaponId;
  description: string;
  /** 1-10 bars for the selection screen. */
  bars: { health: number; speed: number; power: number };
}

export const HEROES: readonly Hero[] = [
  { id: "knight", name: "Caballero", texture: "hero-knight", maxHealth: 6, speed: 175, agility: 12, weapon: "sword", description: "Resistente y equilibrado. Da un paso al frente y corta en arco.", bars: { health: 6, speed: 5, power: 4 } },
  { id: "wizard", name: "Mago", texture: "hero-wizard", maxHealth: 4, speed: 180, agility: 10, weapon: "wand", description: "Frágil pero letal. Concentra un orbe que acelera y explota al chocar.", bars: { health: 4, speed: 5, power: 8 } },
  { id: "archer", name: "Arquero", texture: "hero-archer", maxHealth: 5, speed: 200, agility: 14, weapon: "bow", description: "El más rápido. Tensa el arco: mantén Espacio y la flecha llega más lejos.", bars: { health: 5, speed: 8, power: 4 } },
  { id: "barbarian", name: "Bárbaro", texture: "hero-barbarian", maxHealth: 7, speed: 160, agility: 8, weapon: "axe", description: "Lento y muy duro. Levanta el hacha y derriba a lo que tenga delante.", bars: { health: 7, speed: 4, power: 9 } },
  { id: "rogue", name: "Pícaro", texture: "hero-rogue", maxHealth: 4, speed: 215, agility: 18, weapon: "dagger", description: "Ágil y escurridizo. Lanza tres dagas que giran en el aire.", bars: { health: 4, speed: 9, power: 5 } },
  { id: "viking", name: "Vikingo", texture: "hero-viking", maxHealth: 8, speed: 150, agility: 7, weapon: "hammer", description: "Una muralla. Golpea el suelo con el martillo y empuja a todos a su alrededor.", bars: { health: 8, speed: 3, power: 9 } },
  { id: "lancer", name: "Lancero", texture: "hero-lancer", maxHealth: 6, speed: 185, agility: 12, weapon: "spear", description: "Alcance largo. Se lanza hacia delante con una estocada que atraviesa.", bars: { health: 6, speed: 6, power: 6 } },
  { id: "druid", name: "Druida", texture: "hero-druid", maxHealth: 5, speed: 180, agility: 11, weapon: "staff", description: "Juega con los rebotes: su chispa salta en las paredes y atraviesa enemigos.", bars: { health: 5, speed: 5, power: 6 } },
];

export function heroById(id: string | null | undefined): Hero {
  return HEROES.find((hero) => hero.id === id) ?? HEROES[0];
}

export interface EnemyStats {
  name: string;
  texture: string;
  health: number;
  speed: number;
  damage: number;
  points: number;
  /** Flies over walls (bats) or floats through them (ghosts). */
  passesWalls: boolean;
  /**
   * How it moves: chase, zigzag, flutter and drift go for the player; ranged
   * keeps its distance and shoots; ambush waits disguised as a chest; boss
   * mixes chasing with volleys and rings of fire.
   */
  behavior: "chase" | "zigzag" | "flutter" | "drift" | "ranged" | "ambush" | "boss";
  scale: number;
  /** What it shoots, for ranged enemies and bosses. */
  attack?: EnemyAttack;
}

/** A ranged enemy's attack: it stops, telegraphs it for `windupMs`, then shoots. */
export interface EnemyAttack {
  projectile: ProjectileSpec;
  /** How far it shoots and the distance it tries to keep from the player. */
  range: number;
  keepAway: number;
  cooldownMs: number;
  windupMs: number;
  /** Tint of the projectile, so enemy shots never look like the player's. */
  tint: number;
}

const DARK_ARROW: ProjectileSpec = { ...ARROW, speed: 430, gravity: 200, color: 0xff6b6b };
const CURSED_ORB: ProjectileSpec = { texture: "orb", speed: 170, gravity: 0, height: 16, count: 3, fanDeg: 18, spin: 0, pierce: 0, bounces: 0, splash: 0, accel: 120, color: 0x9dff7a };
const FIREBALL: ProjectileSpec = { texture: "fireball", speed: 210, gravity: 0, height: 20, count: 3, fanDeg: 14, spin: 0, pierce: 0, bounces: 0, splash: 0, accel: 60, color: 0xff9a3c };
/** A short burst of two rifle bullets: fast and straight, easy to read, hard to outrun. */
const BULLETS: ProjectileSpec = { texture: "bullet", speed: 470, gravity: 0, height: 14, count: 2, fanDeg: 5, spin: 0, pierce: 0, bounces: 0, splash: 0, accel: 0, color: 0xffe7a3 };
/** A hand grenade: thrown high, it lands and explodes. */
const GRENADE: ProjectileSpec = { texture: "shell", speed: 250, gravity: 430, height: 18, count: 1, fanDeg: 0, spin: 2, pierce: 0, bounces: 0, splash: 46, accel: 0, color: 0xff9a3c };
/** An artillery shell: a long, slow arc that explodes where it lands. */
const SHELL: ProjectileSpec = { texture: "shell", speed: 300, gravity: 210, height: 22, count: 1, fanDeg: 0, spin: 0, pierce: 0, bounces: 0, splash: 58, accel: 0, color: 0xff7a2a };
/** The tank's cannon: three shells in a fan that burst on impact. */
const TANK_SHELLS: ProjectileSpec = { texture: "shell", speed: 260, gravity: 0, height: 20, count: 3, fanDeg: 16, spin: 0, pierce: 0, bounces: 0, splash: 36, accel: 40, color: 0xff7a2a };

export const ENEMIES: Partial<Record<Kind, EnemyStats>> = {
  enemy: { name: "Slime", texture: "enemy-slime", health: 3, speed: 70, damage: 1, points: 5, passesWalls: false, behavior: "chase", scale: 1 },
  bat: { name: "Murciélago", texture: "bat", health: 1, speed: 135, damage: 1, points: 3, passesWalls: true, behavior: "flutter", scale: 0.9 },
  spider: { name: "Araña", texture: "spider", health: 2, speed: 115, damage: 1, points: 4, passesWalls: false, behavior: "zigzag", scale: 1 },
  ghost: { name: "Fantasma", texture: "ghost", health: 3, speed: 55, damage: 1, points: 6, passesWalls: true, behavior: "drift", scale: 1 },
  brute: { name: "Ogro", texture: "brute", health: 8, speed: 45, damage: 2, points: 15, passesWalls: false, behavior: "chase", scale: 1.3 },
  rat: { name: "Rata", texture: "rat", health: 1, speed: 150, damage: 1, points: 2, passesWalls: false, behavior: "zigzag", scale: 0.85 },
  mimic: { name: "Mímico", texture: "mimic", health: 5, speed: 140, damage: 2, points: 8, passesWalls: false, behavior: "ambush", scale: 1 },
  marksman: {
    name: "Arquero oscuro", texture: "marksman", health: 3, speed: 75, damage: 1, points: 7, passesWalls: false, behavior: "ranged", scale: 1,
    attack: { projectile: DARK_ARROW, range: 360, keepAway: 210, cooldownMs: 1800, windupMs: 480, tint: 0xff6b6b },
  },
  necromancer: {
    name: "Nigromante", texture: "necromancer", health: 4, speed: 55, damage: 1, points: 9, passesWalls: false, behavior: "ranged", scale: 1,
    attack: { projectile: CURSED_ORB, range: 320, keepAway: 180, cooldownMs: 2400, windupMs: 700, tint: 0x9dff7a },
  },
  legionary: { name: "Legionario", texture: "legionary", health: 4, speed: 88, damage: 1, points: 6, passesWalls: false, behavior: "chase", scale: 1 },
  captain: { name: "Capitán", texture: "captain", health: 9, speed: 52, damage: 2, points: 16, passesWalls: false, behavior: "chase", scale: 1.2 },
  soldier: {
    name: "Fusilero", texture: "soldier", health: 3, speed: 70, damage: 1, points: 7, passesWalls: false, behavior: "ranged", scale: 1,
    attack: { projectile: BULLETS, range: 380, keepAway: 230, cooldownMs: 1500, windupMs: 420, tint: 0xffe7a3 },
  },
  grenadier: {
    name: "Granadero", texture: "grenadier", health: 3, speed: 62, damage: 1, points: 8, passesWalls: false, behavior: "ranged", scale: 1,
    attack: { projectile: GRENADE, range: 300, keepAway: 200, cooldownMs: 2600, windupMs: 600, tint: 0xff9a3c },
  },
  artillery: {
    name: "Artillería", texture: "artillery", health: 6, speed: 0, damage: 1, points: 10, passesWalls: false, behavior: "ranged", scale: 1.1,
    attack: { projectile: SHELL, range: 560, keepAway: 0, cooldownMs: 2900, windupMs: 850, tint: 0xff7a2a },
  },
  tank: {
    name: "Tanque", texture: "tank", health: 25, speed: 40, damage: 2, points: 35, passesWalls: false, behavior: "boss", scale: 1.7,
    attack: { projectile: TANK_SHELLS, range: 440, keepAway: 0, cooldownMs: 2500, windupMs: 700, tint: 0xffffff },
  },
  demon: {
    name: "Demonio", texture: "demon", health: 30, speed: 55, damage: 2, points: 40, passesWalls: false, behavior: "boss", scale: 2,
    attack: { projectile: FIREBALL, range: 420, keepAway: 0, cooldownMs: 2600, windupMs: 650, tint: 0xffffff },
  },
};

/** Ring of `count` angles all around, for the boss's ring of fire. */
export function ringAngles(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => offset + (i / count) * Math.PI * 2);
}

/**
 * Where a ranged enemy wants to move: away when the player is too close, closer
 * when too far, and sideways (strafing) in between. Returns -1, 0 or 1 for
 * "away", "sideways" and "closer".
 */
export function rangedIntent(distance: number, keepAway: number): -1 | 0 | 1 {
  if (distance < keepAway - 50) return -1;
  if (distance > keepAway + 70) return 1;
  return 0;
}

/** Aim a shot at where a target moving at (vx, vy) will be when the shot arrives. */
export function leadAngle(fromX: number, fromY: number, x: number, y: number, vx: number, vy: number, speed: number): number {
  const time = Math.hypot(x - fromX, y - fromY) / Math.max(1, speed);
  const lead = Math.min(time, 0.6) * 0.7; // only partly: the player can still dodge
  return Math.atan2(y + vy * lead - fromY, x + vx * lead - fromX);
}

export function enemyStats(kind: Kind): EnemyStats {
  return ENEMIES[kind] ?? ENEMIES.enemy!;
}

/** Enemies move faster as the AI difficulty grows (0.8x at 0, 1.4x at 1). */
export function speedFor(stats: EnemyStats, difficulty: number): number {
  return stats.speed * (0.8 + 0.6 * Math.max(0, Math.min(1, difficulty)));
}

/** What a chest drops. `random` returns 0..1 (Math.random in the game, fixed in tests). */
export const LOOT: readonly Kind[] = [
  "sword", "axe", "wand", "bow", "dagger", "hammer", "spear", "staff",
  "pistol", "pistol", "rifle", "shotgun", "smg", "sniper", "launcher", "grenade", "grenade",
  "potion", "potion", "potion", "potion", "potion", "medkit", "medkit", "medkit",
];

/** Damage and reach of an exploding powder keg. */
export const BARREL_BLAST = { damage: 3, radius: 78 };

export function rollLoot(random: () => number = Math.random): Kind {
  return LOOT[Math.min(LOOT.length - 1, Math.floor(random() * LOOT.length))];
}

export const POTION_HEAL = 2;
export const MEDKIT_HEAL = 3;

/** True when a target is inside a melee swing: close enough and within the arc in front. */
export function inSwing(dx: number, dy: number, facing: number, weapon: Weapon, targetRadius = 14): boolean {
  const distance = Math.hypot(dx, dy);
  if (distance > weapon.range + targetRadius) return false;
  if (distance < targetRadius) return true;
  let delta = Math.atan2(dy, dx) - facing;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  return Math.abs(delta) <= ((weapon.spread / 2) * Math.PI) / 180;
}

/** Distance from a point to the segment a-b (used by the wand's ray). */
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const length2 = vx * vx + vy * vy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / length2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Colour of a health bar: green when healthy, yellow, then red. */
export function healthColor(ratio: number): number {
  if (ratio > 0.6) return 0x33e0a1;
  if (ratio > 0.3) return 0xffc547;
  return 0xff4d6d;
}

/**
 * How strong a charged shot is, from 0.55 (a quick tap) to 1 (fully drawn).
 * heldMs counts from when the key went down; the windup is always paid.
 */
export function chargePower(weapon: Weapon, heldMs: number): number {
  if (weapon.chargeMs <= 0) return 1;
  const t = Math.max(0, Math.min(1, (heldMs - weapon.windupMs) / weapon.chargeMs));
  return 0.55 + 0.45 * t;
}

/**
 * Soft aim: the closest target within `coneDeg` of where the hero faces and
 * within range, or the facing itself when nobody is there. Returns an angle.
 */
export function aimAngle(facing: number, fromX: number, fromY: number, targets: Iterable<{ x: number; y: number }>, range: number, coneDeg = 28): number {
  let best = facing;
  let bestDistance = Infinity;
  const cone = (coneDeg * Math.PI) / 180;
  for (const target of targets) {
    const dx = target.x - fromX;
    const dy = target.y - fromY;
    const distance = Math.hypot(dx, dy);
    if (distance > range || distance < 1) continue;
    let delta = Math.atan2(dy, dx) - facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) <= cone && distance < bestDistance) {
      bestDistance = distance;
      best = Math.atan2(dy, dx);
    }
  }
  return best;
}
