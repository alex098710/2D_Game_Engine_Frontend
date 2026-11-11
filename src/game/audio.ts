/**
 * Sound effects and jingles (Kenney's RPG Audio, Impact Sounds, Interface
 * Sounds, Digital Audio and Music Jingles packs, CC0; see assets-src/kenney/audio).
 *
 * Every sound is in public/audio as OGG and MP3: browsers that cannot play OGG
 * (older Safari) take the MP3. The volumes follow the settings drawer.
 */
import type Phaser from "phaser";

export const SOUND_BASE = `${import.meta.env.BASE_URL}audio/`;

/** Short effects, played at the effects volume. */
export const EFFECTS = [
  "swing", "bow-draw", "bow-release", "arrow-hit", "hit", "defeat", "slam", "thrust", "throw", "cast", "explode",
  "bounce", "coin", "potion", "pickup", "chest", "mimic", "hurt", "dash", "enemy-shot", "enemy-cast", "boss",
  "fireball", "splash", "block", "step-0", "step-1", "step-2",
] as const;
/**
 * Effects of the firearms and explosions, made by tools/make_sounds.py (our own
 * synthesis, no third-party audio). They are WAV, which every browser plays.
 */
export const SYNTH_EFFECTS = [
  "gun-pistol", "gun-rifle", "gun-shotgun", "gun-smg", "gun-sniper", "rocket", "cannon", "explosion", "reload",
] as const;
/** Jingles at the end of a run, played at the music volume. */
export const JINGLES = ["win", "lose"] as const;

export type Effect = (typeof EFFECTS)[number] | (typeof SYNTH_EFFECTS)[number];
export type Jingle = (typeof JINGLES)[number];

const volumes = { effects: 0.8, music: 0.7 };
const lastPlayed = new Map<string, number>();
/** The same effect is not repeated closer than this (ten hits in one frame sound like one). */
const MIN_GAP_MS = 45;

/** Settings give 0-100. */
export function setVolumes(effects: number, music: number): void {
  volumes.effects = clamp01(effects / 100);
  volumes.music = clamp01(music / 100);
}

export function currentVolumes(): { effects: number; music: number } {
  return { ...volumes };
}

export function loadSounds(scene: Phaser.Scene): void {
  for (const key of [...EFFECTS, ...JINGLES]) {
    if (!scene.cache.audio.exists(key)) scene.load.audio(key, [`${SOUND_BASE}${key}.ogg`, `${SOUND_BASE}${key}.mp3`]);
  }
  for (const key of SYNTH_EFFECTS) {
    if (!scene.cache.audio.exists(key)) scene.load.audio(key, `${SOUND_BASE}${key}.wav`);
  }
}

/**
 * Play an effect. `volume` scales the effects volume; `vary` detunes it a little
 * at random so repeated hits don't sound like a machine gun.
 */
export function playEffect(scene: Phaser.Scene, key: Effect, options: { volume?: number; rate?: number; vary?: boolean } = {}): void {
  const volume = volumes.effects * (options.volume ?? 1);
  if (volume <= 0 || !shouldPlay(key, scene.time.now)) return;
  play(scene, key, { volume, rate: options.rate ?? 1, detune: options.vary === false ? 0 : (Math.random() - 0.5) * 300 });
}

export function playJingle(scene: Phaser.Scene, key: Jingle): void {
  if (volumes.music <= 0) return;
  play(scene, key, { volume: volumes.music });
}

/** False when the same sound just played; records the time when it may play. */
export function shouldPlay(key: string, now: number): boolean {
  const last = lastPlayed.get(key);
  if (last !== undefined && now - last < MIN_GAP_MS && now >= last) return false;
  lastPlayed.set(key, now);
  return true;
}

function play(scene: Phaser.Scene, key: string, config: Phaser.Types.Sound.SoundConfig): void {
  if (!scene.cache.audio.exists(key)) return; // still loading, or the browser has no audio
  try {
    scene.sound.play(key, config);
  } catch {
    // sound is a nicety: never break the game for it
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
