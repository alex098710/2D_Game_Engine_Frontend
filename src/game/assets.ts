/**
 * Where the texture pack lives and which texture each kind uses.
 * No Phaser here, so the HTML panels (and their tests) can use it too.
 */
import { KINDS, type Kind } from "../model/GameObject";

export const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Texture key of each kind (the file is public/textures/<key>.png). */
export const KIND_TEXTURE: Record<Kind, { key: string }> = Object.fromEntries(
  KINDS.map((kind) => [kind, { key: kind === "enemy" ? "enemy-slime" : kind }]),
) as Record<Kind, { key: string }>;

/** Textures that are not a kind: heroes, their weapons, projectiles, the open chest and the ground. */
export const EXTRA_TEXTURES = [
  "hero-knight", "hero-wizard", "hero-archer", "hero-barbarian", "hero-rogue", "hero-viking", "hero-lancer", "hero-druid",
  "arrow", "dagger-flying", "orb", "spark", "fireball", "shadow", "bullet", "shell",
  "explosion-1", "explosion-2", "explosion-3", "explosion-4", "explosion-5",
  "chest-open", "grass", "path",
  // The heroes drawn by tools/make_heroes.py: standing and two walking steps.
  "hero-knight-idle", "hero-knight-walk1", "hero-knight-walk2",
  "hero-wizard-idle", "hero-wizard-walk1", "hero-wizard-walk2",
  "hero-archer-idle", "hero-archer-walk1", "hero-archer-walk2",
  "hero-barbarian-idle", "hero-barbarian-walk1", "hero-barbarian-walk2",
  "hero-rogue-idle", "hero-rogue-walk1", "hero-rogue-walk2",
  "hero-viking-idle", "hero-viking-walk1", "hero-viking-walk2",
  "hero-lancer-idle", "hero-lancer-walk1", "hero-lancer-walk2",
  "hero-druid-idle", "hero-druid-walk1", "hero-druid-walk2",
  "hero-soldier-idle", "hero-soldier-walk1", "hero-soldier-walk2",
  "hero-commando-idle", "hero-commando-walk1", "hero-commando-walk2",
  "hero-warrior-idle", "hero-warrior-walk1", "hero-warrior-walk2",
] as const;

/** Image for the HTML library cards. */
export function iconUrl(kind: Kind): string {
  return `${TEXTURE_BASE}${KIND_TEXTURE[kind].key}.png`;
}
