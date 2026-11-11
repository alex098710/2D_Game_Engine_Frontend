import Phaser from "phaser";
import type { RunResultDto } from "../api/client";
import { isCharacter, isEnemy, isGround, isWeapon, WORLD_HEIGHT, WORLD_WIDTH, type GameObject, type Kind } from "../model/GameObject";
import type { SceneModel } from "../model/SceneModel";
import {
  aimAngle, BARREL_BLAST, chargePower, enemyStats, healthColor, heroById, inSwing, isFirearm, leadAngle, MEDKIT_HEAL, POTION_HEAL, rangedIntent, ringAngles,
  rollLoot, speedFor, WEAPONS,
  type EnemyStats, type Hero, type ProjectileSpec, type Weapon, type WeaponId,
} from "./combat";
import { loadSounds, playEffect, playJingle, type Effect } from "./audio";
import { touch } from "./touchInput";
import { approach, fanAngles, launch, screenAngle, step, type Flight } from "./projectiles";
import { RunTracker } from "./RunTracker";
import { bob, KIND_TEXTURE, loadTextures } from "./textures";

export const INVULNERABLE_MS = 1000;
export const DASH_SPEED = 470;
/** The jump (dash): a quick hop forward, untouchable while in the air. */
export const DASH_MS = 210;
export const DASH_COOLDOWN_MS = 900;
const DEFAULT_SPAWN = { x: 64, y: WORLD_HEIGHT / 2 };
const SWING_MS = 170;
/** Longest a drawn bow can be held before the arrow goes by itself. */
const MAX_HOLD_MS = 1600;
/** Projectiles only hit what is on the ground if they fly lower than this. */
const HIT_HEIGHT = 34;
/** Walking speed while drawing a bow or casting, as a share of the normal speed. */
const AIMING_SPEED = 0.45;

/** An attack being prepared: the bow being drawn, the axe going up. */
interface Windup {
  weapon: Weapon;
  startedAt: number;
  /** When the hit or the shot happens (for a charged bow: when the key is released). */
  readyAt: number;
  released: boolean;
  aim: number;
}

/** Something flying: the shadow carries the physics body, the sprite is drawn above it. */
interface Shot {
  sprite: Phaser.GameObjects.Image;
  shadow: Sprite;
  flight: Flight;
  spec: ProjectileSpec;
  damage: number;
  knockback: number;
  range: number;
  travelled: number;
  pierceLeft: number;
  bouncesLeft: number;
  hit: Set<Sprite>;
  trailAt: number;
  /** Shot by an enemy: it hurts the player instead of the enemies. */
  hostile: boolean;
  /** Who shot it (the damage source the run records). */
  source: string;
}

/** Everything spawnProjectile needs to know. */
interface Launch {
  spec: ProjectileSpec;
  x: number;
  y: number;
  angle: number;
  range: number;
  power: number;
  damage: number;
  knockback: number;
  hostile: boolean;
  source: string;
  tint?: number;
}

const TILE = 32;
const tileKey = (x: number, y: number) => `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`;

/** What the HUD shows; sent to the page a few times per second. */
export interface HudState {
  score: number;
  health: number;
  maxHealth: number;
  coins: number;
  coinsTotal: number;
  enemies: number;
  enemiesTotal: number;
  elapsedMs: number;
  difficulty: number;
  hero: string;
  /** Texture of the hero (its portrait in the HUD). */
  heroTexture: string;
  weapon: WeaponId;
  /** 0..1: how ready the weapon and the dash are. */
  attackReady: number;
  dashReady: number;
  /** 0..1 while an attack is being prepared (how far the bow is drawn); 0 otherwise. */
  charge: number;
}

export interface PlayHooks {
  onHud: (state: HudState) => void;
  onFinish: (result: RunResultDto) => void;
  /** What a 2D character can say in its speech bubble. */
  linesFor: (kind: Kind) => readonly string[];
  /** Something worth a toast ("Has recogido un hacha"). */
  onNotice?: (text: string) => void;
}

/** 2D characters: how close the player must be to hear them, and how they walk. */
export const TALK_RADIUS = 72;
export const CHARACTER_SPEED = 42;
const TALK_COOLDOWN_MS = 6000;
const BUBBLE_MS = 2800;

type Body = Phaser.Physics.Arcade.Body;
type Sprite = Phaser.Physics.Arcade.Sprite;

const ITEM_NAMES: Partial<Record<Kind, string>> = {
  sword: "una espada", axe: "un hacha", wand: "una varita", bow: "un arco", potion: "una poción",
  dagger: "unas dagas", hammer: "un martillo", spear: "una lanza", staff: "un báculo",
  medkit: "un botiquín", pistol: "una pistola", rifle: "un fusil", shotgun: "una escopeta", smg: "un subfusil",
  sniper: "un rifle de francotirador", launcher: "un lanzacohetes", grenade: "granadas",
};

/** Sound of each firearm when it shoots. */
const GUN_SOUNDS: Partial<Record<WeaponId, Effect>> = {
  pistol: "gun-pistol", rifle: "gun-rifle", shotgun: "gun-shotgun", smg: "gun-smg", sniper: "gun-sniper", launcher: "rocket", grenade: "throw",
};
/** How hard each gun kicks: the push back on the hero and the camera shake. */
const RECOIL: Partial<Record<WeaponId, { push: number; shake: number }>> = {
  pistol: { push: 50, shake: 0.002 }, smg: { push: 28, shake: 0.0015 }, rifle: { push: 90, shake: 0.004 },
  shotgun: { push: 230, shake: 0.008 }, sniper: { push: 200, shake: 0.007 }, launcher: { push: 260, shake: 0.006 },
};

/**
 * Plays the edited scene with Arcade Physics.
 *
 * Walls, houses, trees, bushes and fences are static bodies; boxes and barrels
 * are dynamic and can be pushed; enemies chase the player (bats and ghosts
 * pass over walls); chests drop loot, and weapons and potions are picked up.
 * The hero fights with its weapon. Every attack has a windup (the bow is drawn,
 * the hammer goes up) and then a melee hit or a projectile; projectiles fly
 * with the physics of projectiles.ts (arcs, spin, bounces, explosions).
 * RunTracker turns every contact into score and health.
 */
export class PlayScene extends Phaser.Scene {
  private readonly model: SceneModel;
  private readonly hooks: PlayHooks;
  private tracker!: RunTracker;
  private difficulty = 0.5;
  private hero: Hero = heroById(null);
  private weapon: Weapon = WEAPONS.sword;
  private player!: Sprite;
  private held!: Phaser.GameObjects.Image;
  private playerBar!: Phaser.GameObjects.Graphics;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  /** Water blocks walking (not flying, not projectiles). */
  private water!: Phaser.Physics.Arcade.StaticGroup;
  private waterTiles = new Set<string>();
  private bossSeen = false;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private chests!: Phaser.Physics.Arcade.StaticGroup;
  /** Powder kegs: solid until something hits them, then they blow up. */
  private explosives!: Phaser.Physics.Arcade.StaticGroup;
  private items!: Phaser.Physics.Arcade.Group;
  private boxes!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private characters!: Phaser.Physics.Arcade.Group;
  private arrows!: Phaser.Physics.Arcade.Group;
  private shots: Shot[] = [];
  private windup: Windup | null = null;
  private bowString!: Phaser.GameObjects.Graphics;
  private chargeGlow!: Phaser.GameObjects.Image;
  private lungeUntil = 0;
  private lungeAngle = 0;
  private lungeSpeed = 0;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d" | "space" | "shift" | "esc", Phaser.Input.Keyboard.Key>;
  private facing = 0;
  private invulnerableUntil = 0;
  private stunnedUntil = 0;
  private nextAttackAt = 0;
  private dashUntil = 0;
  private nextDashAt = 0;
  private swingUntil = 0;
  private lastHud = 0;
  private nextStepAt = 0;
  private dashStartedAt = 0;
  private touchAttackWasHeld = false;
  private playerShadow!: Phaser.GameObjects.Image;
  private stepIndex = 0;
  private finished = false;

  constructor(model: SceneModel, hooks: PlayHooks) {
    super("play");
    this.model = model;
    this.hooks = hooks;
  }

  init(data: { difficulty?: number; hero?: string }): void {
    this.difficulty = data.difficulty ?? 0.5;
    this.hero = heroById(data.hero);
    this.weapon = WEAPONS[this.hero.weapon];
    this.finished = false;
    this.facing = 0;
    this.invulnerableUntil = 0;
    this.stunnedUntil = 0;
    this.nextAttackAt = 0;
    this.dashUntil = 0;
    this.nextDashAt = 0;
    this.swingUntil = 0;
    this.windup = null;
    this.shots = [];
    this.waterTiles = new Set();
    this.touchAttackWasHeld = false;
    this.dashStartedAt = 0;
    this.bossSeen = false;
    this.lungeUntil = 0;
  }

  preload(): void {
    loadTextures(this);
    loadSounds(this);
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, "grass").setDepth(-10);
    this.water = this.physics.add.staticGroup();
    this.solids = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.chests = this.physics.add.staticGroup();
    this.explosives = this.physics.add.staticGroup();
    if (!this.anims.exists("explode")) {
      this.anims.create({ key: "explode", frames: [1, 2, 3, 4, 5].map((n) => ({ key: `explosion-${n}` })), frameRate: 18, hideOnComplete: true });
    }
    this.items = this.physics.add.group();
    this.boxes = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.characters = this.physics.add.group();
    this.arrows = this.physics.add.group();

    const scene: GameObject[] = [];
    for (const object of this.model) scene.push({ ...object });
    this.tracker = new RunTracker(scene, undefined, this.hero.maxHealth);
    for (const object of scene) this.spawn(object);
    // The water glitters: every tile breathes a little, out of step with its neighbours.
    for (const child of this.water.getChildren()) {
      this.tweens.add({ targets: child, alpha: 0.82, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: Math.random() * 1300 });
    }
    this.createPlayer(scene.find((o) => o.kind === "player") ?? DEFAULT_SPAWN);
    this.addColliders();
    this.setupKeys();
    this.setupCamera();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.releaseKeys());
  }

  private spawn(object: GameObject): void {
    const depth = object.y / WORLD_HEIGHT;
    const key = KIND_TEXTURE[object.kind].key;
    if (isGround(object.kind)) {
      // Roads, sand and bridges: under everything, no body. Bridges go over the water.
      this.add.image(object.x, object.y, key).setDepth(object.kind === "bridge" ? -4 : -5);
      return;
    }
    if (object.kind === "water") {
      this.water.create(object.x, object.y, key).setDepth(-6);
      this.waterTiles.add(tileKey(object.x, object.y));
      return;
    }
    if (isEnemy(object.kind)) {
      this.spawnEnemy(object.kind, object.x, object.y);
      return;
    }
    if (isCharacter(object.kind)) {
      const character = this.characters.create(object.x, object.y, key) as Sprite;
      character.setDepth(depth).setCollideWorldBounds(true).setBounce(0.1).setDrag(300).setPushable(false);
      (character.body as Body).setSize(18, 20).setOffset(7, 11);
      character.setData("kind", object.kind);
      character.setData("nextTurnAt", 0);
      character.setData("nextTalkAt", 0);
      bob(this, character);
      return;
    }
    if (isWeapon(object.kind) || object.kind === "potion" || object.kind === "medkit") {
      this.spawnItem(object.kind, object.x, object.y);
      return;
    }
    switch (object.kind) {
      case "wall":
      case "house":
      case "tree":
      case "bush":
      case "fence":
      case "sandbag":
      case "barricade":
      case "hedgehog":
      case "bunker":
      case "tower":
      case "flag":
      case "banner":
      case "rock":
        this.solids.create(object.x, object.y, key).setDepth(depth);
        break;
      case "explosive": {
        const keg = this.explosives.create(object.x, object.y, key) as Sprite;
        keg.setDepth(depth).setData("kind", "explosive");
        break;
      }
      case "spike":
        this.spikes.create(object.x, object.y, key).setDepth(-1);
        break;
      case "coin": {
        const coin = this.coins.create(object.x, object.y, key) as Sprite;
        (coin.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16);
        this.tweens.add({ targets: coin, scaleX: { from: 1, to: 0.25 }, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        break;
      }
      case "chest":
        this.chests.create(object.x, object.y, key).setDepth(depth);
        break;
      case "box":
      case "barrel": {
        const heavy = object.kind === "barrel";
        const box = this.boxes.create(object.x, object.y, key) as Sprite;
        box.setDepth(depth).setDrag(heavy ? 700 : 400).setBounce(0.1).setCollideWorldBounds(true).setMass(heavy ? 4 : 2).setPushable(true);
        break;
      }
      default:
        break; // the player is created separately
    }
  }

  private spawnEnemy(kind: Kind, x: number, y: number): void {
    const stats = enemyStats(kind);
    const enemy = this.enemies.create(x, y, stats.texture) as Sprite;
    const mass = { brute: 4, demon: 12, tank: 14, captain: 4 }[kind as string] ?? 1.5;
    enemy.setDepth(y / WORLD_HEIGHT).setBounce(0.2).setCollideWorldBounds(true).setMass(mass).setScale(stats.scale);
    (enemy.body as Body).setSize(22, 20).setOffset(5, 10);
    enemy.setData("kind", kind);
    enemy.setData("stats", stats);
    enemy.setData("hp", stats.health);
    enemy.setData("phase", Math.random() * Math.PI * 2);
    enemy.setData("bar", this.add.graphics().setDepth(35));
    enemy.setData("aim", this.add.graphics().setDepth(34));
    enemy.setData("nextShotAt", this.time.now + 900 + Math.random() * 900);
    enemy.setData("volleys", 0);
    if (stats.speed === 0) (enemy.body as Body).setImmovable(true); // artillery is bolted to the ground
    if (kind === "tank") (enemy.body as Body).setSize(28, 22).setOffset(2, 6);
    if (stats.behavior === "ambush") {
      // A mimic sleeps disguised as a chest until the player comes close.
      enemy.setTexture("chest").setData("awake", false);
      (enemy.body as Body).setImmovable(true);
    }
  }

  private spawnItem(kind: Kind, x: number, y: number, float = true): Sprite {
    const item = this.items.create(x, y, KIND_TEXTURE[kind].key) as Sprite;
    item.setData("kind", kind).setDepth(y / WORLD_HEIGHT);
    (item.body as Body).setImmovable(true);
    if (float) this.tweens.add({ targets: item, y: y - 4, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return item;
  }

  private createPlayer(spawn: { x: number; y: number }): void {
    this.player = this.physics.add.sprite(spawn.x, spawn.y, this.hero.texture);
    this.playerShadow = this.add.image(spawn.x, spawn.y + 13, "shadow").setDepth(-1).setScale(2.4, 2).setAlpha(0.55);
    this.player.setCollideWorldBounds(true).setDepth(spawn.y / WORLD_HEIGHT);
    (this.player.body as Body).setSize(18, 20).setOffset(7, 11);
    this.held = this.add.image(spawn.x, spawn.y, this.weapon.id).setOrigin(0.5, 0.85).setScale(0.7);
    this.playerBar = this.add.graphics().setDepth(36);
    this.bowString = this.add.graphics();
    this.chargeGlow = this.add.image(spawn.x, spawn.y, "orb").setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  private addColliders(): void {
    const physics = this.physics.add;
    const blocksEnemy = (enemy: unknown) => !((enemy as Sprite).getData("stats") as EnemyStats).passesWalls;
    physics.collider(this.player, this.solids);
    physics.collider(this.player, this.boxes);
    physics.collider(this.player, this.chests, (_p, chest) => this.openChest(chest as Sprite));
    physics.collider(this.boxes, this.solids);
    physics.collider(this.boxes, this.boxes);
    physics.collider(this.boxes, this.chests);
    physics.collider(this.enemies, this.solids, undefined, blocksEnemy);
    physics.collider(this.enemies, this.boxes, undefined, blocksEnemy);
    physics.collider(this.enemies, this.chests, undefined, blocksEnemy);
    physics.collider(this.enemies, this.enemies);
    physics.collider(this.player, this.water);
    physics.collider(this.boxes, this.water);
    physics.collider(this.characters, this.water);
    physics.collider(this.enemies, this.water, undefined, blocksEnemy);
    physics.collider(this.player, this.explosives);
    physics.collider(this.enemies, this.explosives, undefined, blocksEnemy);
    physics.collider(this.characters, this.explosives);
    physics.collider(this.boxes, this.explosives);
    physics.collider(this.arrows, this.explosives, (shadow, keg) => {
      const shot = this.shotOf(shadow as Sprite);
      if (shot) this.endShot(shot, true);
      this.detonate(keg as Sprite);
    });
    // 2D characters are solid people: nobody walks through them, they cannot be pushed.
    physics.collider(this.characters, this.solids);
    physics.collider(this.characters, this.boxes);
    physics.collider(this.characters, this.characters);
    physics.collider(this.characters, this.enemies, undefined, (_c, enemy) => blocksEnemy(enemy));
    physics.collider(this.player, this.characters);
    // Projectiles: the shadow on the ground carries the body. Sparks bounce off
    // walls (Arcade does the bounce); everything else sticks or explodes.
    physics.collider(this.arrows, this.solids, (shadow) => this.shotHitWall(shadow as Sprite));
    physics.collider(this.arrows, this.chests, (shadow) => this.shotHitWall(shadow as Sprite));
    physics.collider(this.arrows, this.boxes, (shadow, box) => {
      const b = box as Sprite;
      const shot = this.shotOf(shadow as Sprite);
      if (shot) b.setVelocity(shot.flight.vx * 0.25, shot.flight.vy * 0.25);
      this.shotHitWall(shadow as Sprite);
    });
    physics.overlap(this.arrows, this.enemies, (shadow, enemy) => this.shotHitEnemy(shadow as Sprite, enemy as Sprite));
    physics.overlap(this.player, this.arrows, (_player, shadow) => this.shotHitPlayer(shadow as Sprite));
    physics.overlap(this.player, this.coins, (_player, coin) => this.collect(coin as Sprite));
    physics.overlap(this.player, this.items, (_player, item) => this.pickUp(item as Sprite));
    physics.overlap(this.player, this.spikes, (_player, spike) => this.hurt("spike", spike as Sprite, 1));
    physics.overlap(this.player, this.enemies, (_player, enemy) => {
      const e = enemy as Sprite;
      if (!e.body?.enable) return;
      if (e.getData("awake") === false) return this.wake(e); // a sleeping mimic bites when touched
      this.hurt(e.getData("kind") as string, e, (e.getData("stats") as EnemyStats).damage);
    });
  }

  private setupKeys(): void {
    const keyboard = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: keyboard.addKey(K.UP), down: keyboard.addKey(K.DOWN), left: keyboard.addKey(K.LEFT), right: keyboard.addKey(K.RIGHT),
      w: keyboard.addKey(K.W), a: keyboard.addKey(K.A), s: keyboard.addKey(K.S), d: keyboard.addKey(K.D),
      space: keyboard.addKey(K.SPACE), shift: keyboard.addKey(K.SHIFT), esc: keyboard.addKey(K.ESC),
    };
  }

  /** Phaser captures keys for the whole page; give them back or text inputs stop working. */
  private releaseKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    keyboard.removeCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.W, K.A, K.S, K.D, K.SPACE, K.SHIFT, K.ESC]);
    keyboard.removeAllKeys(true);
  }

  private setupCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const zoomFor = () => {
      const fit = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT);
      // On a phone the short side decides, so portrait and landscape both show a fair piece of the map.
      const near = touch.enabled ? Math.min(this.scale.width, this.scale.height) / 330 : this.scale.height / 420;
      return Math.max(fit, Math.min(2, near));
    };
    camera.setZoom(zoomFor());
    camera.startFollow(this.player, true, 0.12, 0.12);
    camera.fadeIn(350, 3, 6, 13);
    const onResize = () => camera.setZoom(zoomFor());
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  update(time: number, delta: number): void {
    if (this.finished) return;
    const dt = Math.min(delta, 50) / 1000;
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.end("quit");
      return;
    }
    const k = this.keys;
    let x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    let length = Math.hypot(x, y) || 1;
    // The on-screen joystick is analog: a light push walks slowly.
    let throttle = 1;
    if (touch.enabled && x === 0 && y === 0 && (touch.x !== 0 || touch.y !== 0)) {
      x = touch.x;
      y = touch.y;
      length = Math.hypot(x, y) || 1;
      throttle = Math.max(0.35, Math.min(1, length));
    }
    if (x !== 0 || y !== 0) this.facing = Math.atan2(y, x);
    const jumpTapped = touch.enabled && touch.jumpQueued;
    if (jumpTapped) touch.jumpQueued = false;
    if (Phaser.Input.Keyboard.JustDown(k.shift) || jumpTapped) this.dash(time);
    const body = this.player.body as Body;
    if (time < this.dashUntil) {
      this.player.setVelocity(Math.cos(this.facing) * DASH_SPEED, Math.sin(this.facing) * DASH_SPEED);
      if (Math.floor(time / 30) % 2 === 0) this.afterimage();
    } else if (time < this.lungeUntil) {
      // The step forward of a melee hit (long for the lancer's thrust).
      this.player.setVelocity(Math.cos(this.lungeAngle) * this.lungeSpeed, Math.sin(this.lungeAngle) * this.lungeSpeed);
    } else if (time >= this.stunnedUntil) {
      // Walking has some weight: the hero speeds up and slows down over a few frames.
      // While knocked back the player cannot steer, so the push is visible.
      const slow = this.windup && !this.windup.released ? AIMING_SPEED : 1;
      const speed = this.hero.speed * slow * throttle;
      body.setVelocity(
        approach(body.velocity.x, (x / length) * speed, this.hero.agility, dt),
        approach(body.velocity.y, (y / length) * speed, this.hero.agility, dt),
      );
    }
    if (this.windup) this.player.setFlipX(Math.cos(this.windup.aim) < 0);
    else if (Math.abs(x) > 0.15) this.player.setFlipX(x < 0);
    // Walking: a small hop on every step; standing: a slow breath.
    const moving = x !== 0 || y !== 0;
    if (moving && time >= this.nextStepAt && time >= this.dashUntil) {
      this.nextStepAt = time + 290;
      this.stepIndex = (this.stepIndex + 1) % 3;
      playEffect(this, `step-${this.stepIndex}` as "step-0", { volume: 0.25 });
    }
    if (this.windup && !this.windup.released) {
      // Getting ready: the hero leans back and tenses up.
      const t = Phaser.Math.Clamp((time - this.windup.startedAt) / Math.max(1, this.windup.weapon.windupMs), 0, 1);
      this.player.setScale(1 + 0.08 * t, 1 - 0.07 * t);
    } else {
      this.player.setScale(1, moving ? 1 - 0.06 * Math.abs(Math.sin(time / 70)) : 1 - 0.03 * Math.sin(time / 300));
    }
    // The jump: the hero grows as it rises towards the camera and its shadow shrinks on the ground.
    const air = time < this.dashUntil ? Math.sin(Math.PI * Phaser.Math.Clamp((time - this.dashStartedAt) / DASH_MS, 0, 1)) : 0;
    if (air > 0) this.player.setScale(1 + 0.32 * air);
    this.playerShadow.setPosition(this.player.x, this.player.y + 13).setScale(2.4 * (1 - 0.4 * air), 2 * (1 - 0.4 * air)).setAlpha(0.55 - 0.25 * air);
    this.player.setDepth(this.player.y / WORLD_HEIGHT);
    this.player.setAlpha(time < this.invulnerableUntil ? 0.45 + 0.4 * Math.sin(time / 40) : 1);
    // The attack button on screen works like the space bar: press to attack, hold to draw the bow.
    const touchAttack = touch.enabled && touch.attackHeld;
    if (Phaser.Input.Keyboard.JustDown(k.space) || (touchAttack && !this.touchAttackWasHeld)) this.startAttack(time);
    this.touchAttackWasHeld = touchAttack;
    this.updateWindup(time, k.space.isDown || touchAttack);
    this.placeWeapon(time);
    this.updateShots(time, dt);
    this.drawBar(this.playerBar, this.player, this.tracker.health(), this.tracker.maxHealth(), 30);
    this.moveEnemies(time);
    this.moveCharacters(time);
    this.reportHud(time);
  }

  private dash(time: number): void {
    if (time < this.nextDashAt) return;
    this.nextDashAt = time + DASH_COOLDOWN_MS;
    this.dashUntil = time + DASH_MS;
    this.dashStartedAt = time;
    this.buzz(12);
    this.invulnerableUntil = Math.max(this.invulnerableUntil, time + DASH_MS + 60);
    playEffect(this, "dash", { volume: 0.7 });
  }

  /** A short vibration on phones (when the browser allows it). */
  private buzz(ms: number): void {
    if (!touch.enabled) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      // not supported: no matter
    }
  }

  /** A fading blue copy of the hero: the trail of the dash. */
  private afterimage(): void {
    const ghost = this.add.image(this.player.x, this.player.y, this.hero.texture).setFlipX(this.player.flipX).setTint(0x2d8cff).setAlpha(0.55).setDepth(this.player.depth - 0.001);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  /** The weapon sits in the hero's hand; it moves with every stage of an attack. */
  private placeWeapon(time: number): void {
    const side = this.player.flipX ? -1 : 1;
    this.held.setDepth(this.player.depth + 0.0001).setVisible(true);
    this.bowString.clear();
    this.chargeGlow.setVisible(false);
    const windup = this.windup;
    if (windup && !windup.released) {
      this.poseWindup(windup, time);
      return;
    }
    if (time < this.swingUntil) {
      const t = 1 - (this.swingUntil - time) / SWING_MS;
      const half = Phaser.Math.DegToRad(this.weapon.spread / 2);
      this.held.setFlipX(false).setScale(0.9);
      this.held.setRotation(this.facing + Math.PI / 2 - half + 2 * half * t);
      this.held.setPosition(this.player.x + Math.cos(this.facing) * 8, this.player.y + Math.sin(this.facing) * 8);
    } else {
      this.held.setScale(0.7).setFlipX(side < 0).setRotation(0.35 * side);
      this.held.setPosition(this.player.x + 9 * side, this.player.y + 6);
    }
  }

  /** How the hero holds the weapon while getting ready to hit or shoot. */
  private poseWindup(windup: Windup, time: number): void {
    const weapon = windup.weapon;
    const aim = windup.aim;
    const ax = Math.cos(aim);
    const ay = Math.sin(aim);
    const t = Phaser.Math.Clamp((time - windup.startedAt) / Math.max(1, weapon.windupMs), 0, 1);
    const { x, y } = this.player;
    this.held.setFlipX(false);
    if (weapon.id === "bow") {
      // The bow points at the target; the string comes back as it is drawn.
      const power = chargePower(weapon, time - windup.startedAt);
      this.drawBow(x + ax * 10, y + ay * 10 + 2, aim, Math.max(t, (power - 0.55) / 0.45) * 0.999);
      this.held.setVisible(false);
    } else if (weapon.style === "projectile" && weapon.id !== "dagger") {
      // Wand and staff: raised above the head while the magic gathers at the tip.
      this.held.setScale(0.85).setRotation(aim + Math.PI / 2 - 0.25 * (1 - t));
      this.held.setPosition(x + ax * 6, y - 6 - 6 * t);
      const tipX = x + ax * 14;
      const tipY = y - 18 - 6 * t;
      const tint = weapon.projectile!.color;
      this.chargeGlow.setVisible(true).setPosition(tipX, tipY).setScale(0.3 + 0.9 * t).setTint(tint).setAlpha(0.6 + 0.4 * Math.sin(time / 40));
      this.chargeGlow.setDepth(this.player.depth + 0.0002);
      if (Math.random() < 0.5) this.gatherSpark(tipX, tipY, tint);
    } else if (weapon.id === "dagger") {
      // The arm goes back before the throw.
      this.held.setScale(0.8).setRotation(aim + Math.PI / 2 + 1.6 * t);
      this.held.setPosition(x - ax * 8 * t, y - ay * 8 * t - 4);
    } else if (weapon.id === "hammer") {
      // Raised high overhead.
      this.held.setScale(0.8 + 0.25 * t).setRotation(-0.4 * Math.sign(ax || 1) - 0.6 * t * Math.sign(ax || 1));
      this.held.setPosition(x + ax * 4, y - 6 - 14 * t);
    } else if (weapon.id === "spear") {
      // Pulled back along the line of the thrust.
      this.held.setScale(0.9).setRotation(aim + Math.PI / 2);
      this.held.setPosition(x - ax * 10 * t, y - ay * 10 * t);
    } else {
      // Sword and axe: brought back behind the shoulder.
      const half = Phaser.Math.DegToRad(weapon.spread / 2);
      this.held.setScale(0.9).setRotation(aim + Math.PI / 2 - half - 0.7 * t);
      this.held.setPosition(x - ax * 4 * t, y - ay * 4 * t);
    }
  }

  /** A bow drawn with lines: the limbs, the string pulled back by `pull` (0..1), and the arrow on it. */
  private drawBow(cx: number, cy: number, aim: number, pull: number): void {
    const g = this.bowString.setDepth(this.player.depth + 0.0003);
    const nx = -Math.sin(aim);
    const ny = Math.cos(aim);
    const ax = Math.cos(aim);
    const ay = Math.sin(aim);
    const half = 12;
    const bend = 5 + 3 * pull;
    const topX = cx + nx * half - ax * 2;
    const topY = cy + ny * half - ay * 2;
    const botX = cx - nx * half - ax * 2;
    const botY = cy - ny * half - ay * 2;
    const gripX = cx + ax * bend;
    const gripY = cy + ay * bend;
    const nockX = cx - ax * (2 + 12 * pull);
    const nockY = cy - ay * (2 + 12 * pull);
    g.lineStyle(3, 0x6b3f25, 1).beginPath().moveTo(topX, topY).lineTo(gripX, gripY).lineTo(botX, botY).strokePath();
    g.lineStyle(1, 0xf2f2f2, 0.95).beginPath().moveTo(topX, topY).lineTo(nockX, nockY).lineTo(botX, botY).strokePath();
    // The arrow rests on the string and the bow.
    g.lineStyle(2, 0xa0693a, 1).beginPath().moveTo(nockX, nockY).lineTo(gripX + ax * 6, gripY + ay * 6).strokePath();
    g.fillStyle(0xe8eef6, 1).fillTriangle(
      gripX + ax * 10, gripY + ay * 10,
      gripX + ax * 5 + nx * 3, gripY + ay * 5 + ny * 3,
      gripX + ax * 5 - nx * 3, gripY + ay * 5 - ny * 3,
    );
    if (pull >= 0.99) g.lineStyle(1, 0xffc547, 0.8).strokeCircle(cx, cy, 15); // fully drawn
  }

  /** A dot of light flying into the tip of a staff while a spell gathers. */
  private gatherSpark(x: number, y: number, color: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dot = this.add.rectangle(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, 2, 2, color).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: dot, x, y, alpha: 0.2, duration: 180, ease: "Quad.easeIn", onComplete: () => dot.destroy() });
  }

  private moveEnemies(time: number): void {
    const range = 220 + 220 * this.difficulty;
    const playerBody = this.player.body as Body;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Sprite;
      if (!enemy.body?.enable) continue;
      const bar = enemy.getData("bar") as Phaser.GameObjects.Graphics;
      const aim = enemy.getData("aim") as Phaser.GameObjects.Graphics;
      const stats = enemy.getData("stats") as EnemyStats;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const knocked = time < ((enemy.getData("knockedUntil") as number | undefined) ?? 0);
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const phase = enemy.getData("phase") as number;
      aim.clear();
      enemy.setDepth(stats.passesWalls ? 2 : enemy.y / WORLD_HEIGHT);
      if (enemy.getData("awake") === false) {
        // Disguised mimic: a still chest with no health bar, until the player is close.
        bar.clear();
        enemy.setVelocity(0, 0);
        if (distance < 70) this.wake(enemy);
        continue;
      }
      const enraged = stats.behavior === "boss" && (enemy.getData("hp") as number) <= stats.health / 2;
      const speed = speedFor(stats, this.difficulty) * (enraged ? 1.4 : 1);
      const aimingUntil = (enemy.getData("aimUntil") as number | undefined) ?? 0;
      if (stats.attack && aimingUntil > 0) {
        // Telegraphing the shot: it stands still (the boss crawls) and shows where it aims.
        this.telegraph(enemy, stats, aim, time, aimingUntil);
        if (!knocked) enemy.setVelocity(stats.behavior === "boss" ? Math.cos(angle) * speed * 0.3 : 0, stats.behavior === "boss" ? Math.sin(angle) * speed * 0.3 : 0);
        if (time >= aimingUntil) {
          enemy.setData("aimUntil", 0);
          this.enemyShoot(enemy, stats, playerBody, distance, enraged);
          const pace = 0.8 + 0.4 * this.difficulty;
          enemy.setData("nextShotAt", time + (stats.attack.cooldownMs * (0.85 + Math.random() * 0.3)) / pace / (enraged ? 1.3 : 1));
        }
      } else if (!knocked && distance < range + (stats.attack ? 120 : 0)) {
        if (stats.behavior === "boss" && !this.bossSeen) {
          this.bossSeen = true;
          this.cameras.main.shake(300, 0.012);
          this.floatText(enemy.x, enemy.y - 50, "¡JEFE!", "#ff6b6b");
          playEffect(this, "boss", { vary: false });
          this.hooks.onNotice?.(`¡Cuidado! ${stats.name}: salta para esquivar sus bolas de fuego (${touch.enabled ? "botón Saltar" : "Shift"})`);
        }
        if (stats.attack && time >= (enemy.getData("nextShotAt") as number) && distance < stats.attack.range) {
          enemy.setData("aimUntil", time + stats.attack.windupMs);
        }
        let heading = angle;
        let move = speed;
        if (stats.behavior === "ranged") {
          // Keep the distance: back off, close in, or strafe around the player.
          const intent = rangedIntent(distance, stats.attack!.keepAway);
          if (intent === -1) heading = angle + Math.PI;
          else if (intent === 0) {
            heading = angle + (Math.sin(time / 1100 + phase) > 0 ? 1 : -1) * Math.PI / 2;
            move = speed * 0.6;
          }
        }
        let turn = 0;
        if (stats.behavior === "zigzag") turn = 0.9 * Math.sin(time / 160 + phase);
        if (stats.behavior === "flutter") turn = 0.6 * Math.sin(time / 90 + phase);
        if (stats.behavior === "drift") turn = 0.3 * Math.sin(time / 600 + phase);
        enemy.setVelocity(Math.cos(heading + turn) * move, Math.sin(heading + turn) * move);
      } else if (!knocked) {
        enemy.setVelocity(enemy.body.velocity.x * 0.9, enemy.body.velocity.y * 0.9);
      }
      // Each kind moves in its own way: bats flap, ghosts fade, the rest squash and stretch.
      if (stats.behavior === "flutter") enemy.setScale(stats.scale, stats.scale * (0.8 + 0.2 * Math.abs(Math.sin(time / 60))));
      else if (stats.behavior === "drift") enemy.setAlpha(0.5 + 0.3 * Math.sin(time / 300 + phase));
      else if (aimingUntil === 0 || stats.behavior === "ranged") {
        enemy.setScale(stats.scale * (1 + 0.06 * Math.sin(time / 120)), stats.scale * (1 - 0.06 * Math.sin(time / 120)));
      }
      if (enraged && Math.floor(time / 120) % 2 === 0) enemy.setTint(0xff8a7a);
      else if (enraged) enemy.clearTint();
      enemy.setFlipX(this.player.x < enemy.x);
      this.drawBar(bar, enemy, enemy.getData("hp") as number, stats.health, 26 * Math.min(stats.scale, 1.6));
    }
  }

  /** The warning before an enemy shoots: a red aiming line, or magic gathering. */
  private telegraph(enemy: Sprite, stats: EnemyStats, aim: Phaser.GameObjects.Graphics, time: number, until: number): void {
    const attack = stats.attack!;
    const t = Phaser.Math.Clamp(1 - (until - time) / attack.windupMs, 0, 1);
    if (stats.attack!.projectile.texture === "arrow" || stats.attack!.projectile.texture === "bullet") {
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const length = Math.min(attack.range, Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y));
      aim.lineStyle(1, 0xff4d6d, 0.25 + 0.6 * t).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(angle) * length, enemy.y + Math.sin(angle) * length);
      enemy.setScale(stats.scale * (1 + 0.08 * t), stats.scale * (1 - 0.06 * t)); // leaning back to draw
    } else {
      const color = stats.behavior === "boss" ? 0xff7a2a : attack.tint;
      aim.fillStyle(color, 0.15 + 0.25 * t).fillCircle(enemy.x, enemy.y, (10 + 26 * t) * Math.min(stats.scale, 1.6));
      aim.lineStyle(2, color, 0.4 + 0.5 * t).strokeCircle(enemy.x, enemy.y, (14 + 30 * (1 - t)) * Math.min(stats.scale, 1.6));
      enemy.setScale(stats.scale * (1 + 0.1 * t));
    }
  }

  /** The enemy lets go: an aimed arrow, a fan of orbs, or the boss's volley or ring of fire. */
  private enemyShoot(enemy: Sprite, stats: EnemyStats, target: Body, distance: number, enraged: boolean): void {
    const attack = stats.attack!;
    const spec = attack.projectile;
    const kind = enemy.getData("kind") as string;
    let angles: number[];
    if (stats.behavior === "boss") {
      const volleys = (enemy.getData("volleys") as number) + 1;
      enemy.setData("volleys", volleys);
      if (volleys % 2 === 0) {
        angles = ringAngles(enraged ? 14 : 10, Math.random());
        this.cameras.main.shake(160, 0.008);
      } else {
        const aimed = leadAngle(enemy.x, enemy.y, this.player.x, this.player.y, target.velocity.x, target.velocity.y, spec.speed);
        angles = fanAngles(aimed, enraged ? 5 : spec.count, spec.fanDeg);
      }
    } else {
      const aimed = leadAngle(enemy.x, enemy.y, this.player.x, this.player.y, target.velocity.x, target.velocity.y, spec.speed);
      angles = fanAngles(aimed, spec.count, spec.fanDeg);
    }
    // Arrows are aimed to come down just past the player; magic flies its full range.
    const reach = spec.gravity > 0 ? Math.min(attack.range, distance + 60) : attack.range;
    const radius = 12 * Math.min(stats.scale, 1.6);
    for (const angle of angles) {
      this.spawnProjectile({
        spec, x: enemy.x + Math.cos(angle) * radius, y: enemy.y + Math.sin(angle) * radius, angle,
        range: reach, power: 1, damage: 1, knockback: 0, hostile: true, source: kind, tint: attack.tint,
      });
    }
    this.tweens.add({ targets: enemy, scaleX: stats.scale * 0.9, scaleY: stats.scale * 1.08, duration: 80, yoyo: true });
    const sound: Effect = spec.texture === "bullet" ? "gun-smg" : spec.texture === "shell" ? (kind === "grenadier" ? "throw" : "cannon")
      : stats.behavior === "boss" ? "fireball" : spec.texture === "arrow" ? "enemy-shot" : "enemy-cast";
    playEffect(this, sound, { volume: 0.6 });
    if (spec.texture === "bullet" || (spec.texture === "shell" && kind !== "grenadier")) {
      this.muzzleFlash(enemy.x, enemy.y, angles[0], 12 * Math.min(stats.scale, 1.6), spec.texture === "shell");
    }
  }

  /** A mimic stops pretending: it jumps up, shows its teeth and gives chase. */
  private wake(enemy: Sprite): void {
    if (enemy.getData("awake") !== false) return;
    enemy.setData("awake", true);
    enemy.setTexture("mimic");
    (enemy.body as Body).setImmovable(false);
    this.floatText(enemy.x, enemy.y - 24, "¡Un mímico!", "#ff6b6b");
    playEffect(this, "mimic");
    this.tweens.add({ targets: enemy, y: enemy.y - 14, duration: 120, yoyo: true, ease: "Quad.easeOut" });
    this.cameras.main.shake(120, 0.006);
  }

  /** A small health bar above a sprite, coloured by how much is left. */
  private drawBar(bar: Phaser.GameObjects.Graphics, owner: Sprite, value: number, max: number, width: number): void {
    const ratio = Math.max(0, value / max);
    const x = owner.x - width / 2;
    const y = owner.y - owner.displayHeight / 2 - 8;
    bar.clear();
    bar.fillStyle(0x03060d, 0.75).fillRect(x - 1, y - 1, width + 2, 6);
    bar.fillStyle(healthColor(ratio), 1).fillRect(x, y, width * ratio, 4);
    bar.fillStyle(0xffffff, 0.35).fillRect(x, y, width * ratio, 1);
  }

  /** Characters wander around; when the player comes close they stop, turn and talk. */
  private moveCharacters(time: number): void {
    for (const child of this.characters.getChildren()) {
      const character = child as Sprite;
      const kind = character.getData("kind") as Kind;
      const distance = Phaser.Math.Distance.Between(character.x, character.y, this.player.x, this.player.y);
      if (distance < TALK_RADIUS) {
        character.setVelocity(0, 0);
        character.setFlipX(this.player.x < character.x);
        if (time >= (character.getData("nextTalkAt") as number)) {
          character.setData("nextTalkAt", time + TALK_COOLDOWN_MS);
          this.say(character, kind);
        }
      } else if (time >= (character.getData("nextTurnAt") as number)) {
        character.setData("nextTurnAt", time + Phaser.Math.Between(1200, 2800));
        if (Math.random() < 0.35) {
          character.setVelocity(0, 0);
        } else {
          const angle = Math.random() * Math.PI * 2;
          character.setVelocity(Math.cos(angle) * CHARACTER_SPEED, Math.sin(angle) * CHARACTER_SPEED);
        }
      }
      const body = character.body as Body;
      if (Math.abs(body.velocity.x) > 1) character.setFlipX(body.velocity.x < 0);
      character.setDepth(character.y / WORLD_HEIGHT);
      const bubble = character.getData("bubble") as Phaser.GameObjects.Container | undefined;
      bubble?.setPosition(character.x, character.y - 26);
    }
  }

  /** A speech bubble with one of the character's lines, above its head. */
  private say(character: Sprite, kind: Kind): void {
    const lines = this.hooks.linesFor(kind);
    if (lines.length === 0) return;
    (character.getData("bubble") as Phaser.GameObjects.Container | undefined)?.destroy();
    const text = this.add.text(0, 0, Phaser.Utils.Array.GetRandom(lines as string[]), {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "11px",
      color: "#0b1530",
      wordWrap: { width: 150 },
      align: "center",
      resolution: 2,
    }).setOrigin(0.5, 1);
    const width = text.width + 14;
    const height = text.height + 10;
    const box = this.add.graphics();
    box.fillStyle(0xffffff, 0.96).fillRoundedRect(-width / 2, -height - 4, width, height, 6);
    box.fillTriangle(-5, -5, 5, -5, 0, 2);
    box.lineStyle(1, 0x2d8cff, 0.6).strokeRoundedRect(-width / 2, -height - 4, width, height, 6);
    text.setPosition(0, -9);
    const bubble = this.add.container(character.x, character.y - 26, [box, text]).setDepth(30);
    character.setData("bubble", bubble);
    this.tracker.talk(kind);
    this.time.delayedCall(BUBBLE_MS, () => {
      if (character.getData("bubble") === bubble) character.setData("bubble", undefined);
      bubble.destroy();
    });
  }

  private collect(coin: Sprite): void {
    if (!coin.active || !coin.body?.enable) return;
    this.tracker.collectCoin(coin.x, coin.y);
    playEffect(this, "coin", { volume: 0.7 });
    this.sparkle(coin.x, coin.y, 0xffc547);
    this.floatText(coin.x, coin.y - 10, "+1", "#ffc547");
    this.tweens.killTweensOf(coin);
    this.tweens.add({ targets: coin, y: coin.y - 24, alpha: 0, scale: 1.4, duration: 220, onComplete: () => coin.destroy() });
    coin.disableBody(false, false);
    if (this.tracker.isOver()) this.end(this.tracker.outcome()!);
  }

  /** Touching a closed chest opens it and throws out an item. */
  private openChest(chest: Sprite): void {
    if (chest.getData("open")) return;
    chest.setData("open", true);
    chest.setTexture("chest-open");
    playEffect(this, "chest", { volume: 0.7 });
    const loot = rollLoot();
    this.tracker.openChest(loot, chest.x, chest.y);
    this.sparkle(chest.x, chest.y - 8, 0xffc547, 12);
    this.tweens.add({ targets: chest, scaleX: 1.15, scaleY: 0.9, duration: 90, yoyo: true });
    // The item jumps out of the chest and lands in front of it.
    const landX = chest.x + Phaser.Math.Between(-20, 20);
    const landY = chest.y + 34;
    const item = this.spawnItem(loot, chest.x, chest.y - 4, false);
    item.disableBody(false, false);
    this.tweens.add({ targets: item, x: landX, duration: 460, ease: "Quad.easeOut" });
    this.tweens.add({
      targets: item, y: { from: chest.y - 30, to: landY }, duration: 460, ease: "Bounce.easeOut",
      onComplete: () => {
        if (!item.active) return;
        item.enableBody(true, landX, landY, true, true);
        this.tweens.add({ targets: item, y: landY - 4, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      },
    });
    this.hooks.onNotice?.(`El cofre tenía ${ITEM_NAMES[loot] ?? loot}`);
  }

  private pickUp(item: Sprite): void {
    if (!item.active || !item.body?.enable) return;
    const kind = item.getData("kind") as Kind;
    if (kind === "potion" || kind === "medkit") {
      const heal = kind === "medkit" ? MEDKIT_HEAL : POTION_HEAL;
      this.tracker.pickUp(kind, heal);
      playEffect(this, "potion", { volume: 0.7 });
      this.floatText(this.player.x, this.player.y - 20, `+${heal} ♥`, "#33e0a1");
      this.sparkle(item.x, item.y, 0x33e0a1, kind === "medkit" ? 14 : 8);
    } else if (isWeapon(kind)) {
      this.weapon = WEAPONS[kind as WeaponId];
      this.held.setTexture(this.weapon.id);
      this.tracker.pickUp(kind);
      playEffect(this, isFirearm(this.weapon.id) ? "reload" : "pickup");
      this.sparkle(item.x, item.y, 0x2d8cff);
      this.floatText(this.player.x, this.player.y - 20, this.weapon.name, "#7cc4ff");
    }
    this.hooks.onNotice?.(`Has recogido ${ITEM_NAMES[kind] ?? kind}`);
    this.tweens.killTweensOf(item);
    item.disableBody(false, false);
    this.tweens.add({ targets: item, y: item.y - 18, alpha: 0, duration: 200, onComplete: () => item.destroy() });
  }

  private hurt(source: string, from: Sprite, amount: number): void {
    const now = this.time.now;
    if (now < this.invulnerableUntil || this.finished) return;
    this.invulnerableUntil = now + INVULNERABLE_MS;
    this.stunnedUntil = now + 160;
    const angle = Phaser.Math.Angle.Between(from.x, from.y, this.player.x, this.player.y);
    this.player.setVelocity(Math.cos(angle) * 420, Math.sin(angle) * 420);
    this.flash(this.player, 0xff4d6d, 90);
    playEffect(this, "hurt");
    this.buzz(40);
    this.cameras.main.shake(140, 0.007);
    this.floatText(this.player.x, this.player.y - 20, `-${amount}`, "#ff4d6d");
    if (this.tracker.takeDamage(source, this.player.x, this.player.y, amount)) this.end("lost");
  }

  /** Space pressed: start getting ready. The hit or the shot comes after the windup. */
  private startAttack(now: number): void {
    if (now < this.nextAttackAt || this.windup) return;
    const weapon = this.weapon;
    const reach = weapon.style === "melee" ? weapon.range + 40 : weapon.range;
    if (weapon.id === "bow") playEffect(this, "bow-draw", { volume: 0.6 });
    this.windup = {
      weapon,
      startedAt: now,
      readyAt: now + weapon.windupMs,
      released: false,
      aim: this.aimAt(reach),
    };
  }

  /** Soft aim: the nearest enemy close to where the hero faces, or straight ahead. */
  private aimAt(reach: number): number {
    const targets: { x: number; y: number }[] = [];
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Sprite;
      if (enemy.body?.enable) targets.push(enemy);
    }
    return aimAngle(this.facing, this.player.x, this.player.y, targets, reach);
  }

  /** Follow the attack being prepared and release it at the right moment. */
  private updateWindup(now: number, keyDown: boolean): void {
    const windup = this.windup;
    if (!windup || windup.released) return;
    const weapon = windup.weapon;
    if (weapon.style === "projectile") windup.aim = this.aimAt(weapon.range);
    if (now < windup.readyAt) return;
    // A bow can be held to draw it further; everything else goes as soon as it is ready.
    const charging = weapon.chargeMs > 0 && keyDown && now - windup.startedAt < MAX_HOLD_MS;
    if (charging) return;
    windup.released = true;
    this.nextAttackAt = now + weapon.cooldownMs;
    if (weapon.style === "melee") this.strike(weapon, windup.aim);
    else this.fire(weapon, windup.aim, chargePower(weapon, now - windup.startedAt));
    this.time.delayedCall(140, () => {
      if (this.windup === windup) this.windup = null;
    });
    if (this.tracker.isOver()) this.end(this.tracker.outcome()!);
  }

  /** A melee hit: a step forward, the swing (or thrust, or slam) and everything it reaches. */
  private strike(weapon: Weapon, aim: number): void {
    this.facing = aim;
    if (weapon.lunge > 0) {
      this.lungeAngle = aim;
      this.lungeSpeed = weapon.lunge;
      this.lungeUntil = this.time.now + 110;
    }
    this.swingUntil = this.time.now + SWING_MS;
    const { x, y } = this.player;
    playEffect(this, weapon.id === "spear" ? "thrust" : "swing", { volume: weapon.id === "axe" ? 1 : 0.8, rate: weapon.id === "axe" ? 0.8 : 1 });
    if (weapon.shockwave > 0) this.slam(weapon);
    if (weapon.id === "spear") this.thrustTrail(aim, weapon.range);
    else {
      const half = Phaser.Math.DegToRad(weapon.spread / 2);
      const radius = weapon.range - 6;
      const arc = this.add.graphics().setDepth(39).setBlendMode(Phaser.BlendModes.ADD);
      arc.lineStyle(10, 0x2d8cff, 0.3).beginPath().arc(x, y, radius, aim - half, aim + half).strokePath();
      arc.lineStyle(3, 0xd6ecff, 0.95).beginPath().arc(x, y, radius, aim - half, aim + half).strokePath();
      this.tweens.add({ targets: arc, alpha: 0, duration: 200, onComplete: () => arc.destroy() });
    }
    // A swing knocks enemy arrows and orbs out of the air.
    for (const shot of [...this.shots]) {
      if (!shot.hostile || !shot.shadow.active) continue;
      if (inSwing(shot.shadow.x - x, shot.shadow.y - y, aim, weapon, 10)) {
        this.floatText(shot.shadow.x, shot.shadow.y - 14, "¡Bloqueado!", "#7cc4ff");
        playEffect(this, "block");
        this.endShot(shot, true);
      }
    }
    // The hit lands as the step forward ends, from where the hero then stands.
    this.time.delayedCall(weapon.lunge > 0 ? 70 : 0, () => {
      if (this.finished) return;
      for (const child of [...this.enemies.getChildren()]) {
        const enemy = child as Sprite;
        if (!enemy.body?.enable) continue;
        if (inSwing(enemy.x - this.player.x, enemy.y - this.player.y, aim, weapon)) this.damageEnemy(enemy, weapon.damage, aim, weapon.knockback);
      }
      for (const child of [...this.explosives.getChildren()]) {
        const keg = child as Sprite;
        if (inSwing(keg.x - this.player.x, keg.y - this.player.y, aim, weapon)) this.detonate(keg);
      }
      if (this.tracker.isOver()) this.end(this.tracker.outcome()!);
    });
  }

  /** The spear's thrust: a bright streak along the line it reaches. */
  private thrustTrail(aim: number, range: number): void {
    const { x, y } = this.player;
    const line = this.add.graphics().setDepth(39).setBlendMode(Phaser.BlendModes.ADD);
    const ex = x + Math.cos(aim) * range;
    const ey = y + Math.sin(aim) * range;
    line.lineStyle(8, 0x2d8cff, 0.3).lineBetween(x, y, ex, ey);
    line.lineStyle(2, 0xffffff, 0.9).lineBetween(x, y, ex, ey);
    this.tweens.add({ targets: line, alpha: 0, duration: 180, onComplete: () => line.destroy() });
  }

  /** The hammer hits the ground: a shockwave pushes back everything around the hero. */
  private slam(weapon: Weapon): void {
    const { x, y } = this.player;
    this.cameras.main.shake(180, 0.01);
    playEffect(this, "slam");
    const ring = this.add.circle(x, y + 8, 10).setStrokeStyle(4, 0xffc547, 0.9).setDepth(38);
    this.tweens.add({ targets: ring, radius: weapon.shockwave, alpha: 0, duration: 320, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dust = this.add.rectangle(x, y + 10, 4, 4, 0xb08a5a).setDepth(37);
      this.tweens.add({ targets: dust, x: x + Math.cos(angle) * 40, y: y + 10 + Math.sin(angle) * 20, alpha: 0, duration: 380, onComplete: () => dust.destroy() });
    }
    for (const child of [...this.enemies.getChildren()]) {
      const enemy = child as Sprite;
      if (!enemy.body?.enable) continue;
      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (distance <= weapon.shockwave) this.damageEnemy(enemy, weapon.damage, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), weapon.knockback);
    }
  }

  /** Bow, wand, daggers, staff: launch what the weapon throws, with a little recoil. */
  private fire(weapon: Weapon, aim: number, power: number): void {
    const spec = weapon.projectile!;
    this.facing = aim;
    const startX = this.player.x + Math.cos(aim) * 12;
    const startY = this.player.y + Math.sin(aim) * 12;
    for (const angle of fanAngles(aim, spec.count, spec.fanDeg)) this.spawnShot(weapon, spec, startX, startY, angle, power);
    // Letting go pushes the hero back a little and makes the weapon kick.
    const body = this.player.body as Body;
    const recoil = RECOIL[weapon.id];
    const kick = recoil?.push ?? 70;
    body.velocity.x -= Math.cos(aim) * kick * power;
    body.velocity.y -= Math.sin(aim) * kick * power;
    this.tweens.add({ targets: this.player, scaleX: 0.92, scaleY: 1.06, duration: 70, yoyo: true });
    if (weapon.id === "bow") this.twang(aim);
    if (isFirearm(weapon.id)) {
      playEffect(this, GUN_SOUNDS[weapon.id]!, { volume: weapon.id === "smg" ? 0.55 : 0.85 });
      if (weapon.id !== "grenade") this.muzzleFlash(this.player.x, this.player.y, aim, 18, weapon.id === "launcher" || weapon.id === "shotgun");
      if (recoil) this.cameras.main.shake(70, recoil.shake);
      if (spec.texture === "bullet") this.ejectCasing(this.player.x, this.player.y, aim);
      // The gun jerks back in the hand.
      this.tweens.add({ targets: this.held, scaleX: 0.6, duration: 50, yoyo: true });
    } else {
      playEffect(this, weapon.id === "bow" ? "bow-release" : weapon.id === "dagger" ? "throw" : "cast", { volume: 0.8 });
      if (spec.splash > 0) this.cameras.main.flash(60, 45, 140, 255, false);
    }
  }

  /** The string of the bow snaps forward and shakes for a moment after the shot. */
  private twang(aim: number): void {
    const g = this.add.graphics().setDepth(this.player.depth + 0.0003);
    const cx = this.player.x + Math.cos(aim) * 10;
    const cy = this.player.y + Math.sin(aim) * 10 + 2;
    const nx = -Math.sin(aim);
    const ny = Math.cos(aim);
    let frame = 0;
    const timer = this.time.addEvent({
      delay: 25, repeat: 5,
      callback: () => {
        g.clear();
        const wobble = (frame % 2 === 0 ? 1 : -1) * (4 - frame * 0.7);
        g.lineStyle(3, 0x6b3f25, 1).beginPath().moveTo(cx + nx * 12, cy + ny * 12).lineTo(cx + Math.cos(aim) * 6, cy + Math.sin(aim) * 6).lineTo(cx - nx * 12, cy - ny * 12).strokePath();
        g.lineStyle(1, 0xf2f2f2, 0.95).beginPath().moveTo(cx + nx * 12, cy + ny * 12).lineTo(cx + Math.cos(aim) * wobble, cy + Math.sin(aim) * wobble).lineTo(cx - nx * 12, cy - ny * 12).strokePath();
        frame++;
        if (frame > 5) g.destroy();
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => timer.remove());
  }

  private spawnShot(weapon: Weapon, spec: ProjectileSpec, x: number, y: number, angle: number, power: number): void {
    this.spawnProjectile({
      spec, x, y, angle, range: weapon.range, power, damage: weapon.damage, knockback: weapon.knockback, hostile: false, source: "player",
    });
  }

  private spawnProjectile(launchInfo: Launch): void {
    const { spec, x, y, angle, power } = launchInfo;
    const flight = launch(spec, x, y, angle, launchInfo.range, power);
    const shadow = this.arrows.create(x, y, "shadow") as Sprite;
    const body = shadow.body as Body;
    body.setSize(10, 6).setAllowGravity(false);
    shadow.setDepth(-1).setAlpha(0.8);
    shadow.setVelocity(flight.vx, flight.vy);
    shadow.setBounce(spec.bounces > 0 ? 1 : 0);
    shadow.setCollideWorldBounds(spec.bounces > 0);
    const sprite = this.add.image(x, y - flight.z, spec.texture).setRotation(screenAngle(flight));
    if (spec.texture === "orb" || spec.texture === "spark") sprite.setBlendMode(Phaser.BlendModes.ADD);
    if (launchInfo.tint !== undefined && launchInfo.tint !== 0xffffff) sprite.setTint(launchInfo.tint);
    if (spec.texture === "fireball") sprite.setScale(1.3);
    if (spec.texture === "grenade") sprite.setScale(0.6);
    if (spec.texture === "bullet") sprite.setBlendMode(Phaser.BlendModes.ADD);
    const shot: Shot = {
      sprite, shadow, flight, spec,
      damage: launchInfo.damage, knockback: launchInfo.knockback, range: launchInfo.range * power,
      travelled: 0, pierceLeft: spec.pierce, bouncesLeft: spec.bounces, hit: new Set(), trailAt: 0,
      hostile: launchInfo.hostile, source: launchInfo.source,
    };
    shadow.setData("shot", shot);
    this.shots.push(shot);
  }

  /** An enemy shot reaches the player: it hurts, unless the player is dashing through it. */
  private shotHitPlayer(shadow: Sprite): void {
    const shot = this.shotOf(shadow);
    if (!shot || !shot.hostile || !shadow.active || this.finished) return;
    if (shot.flight.z > HIT_HEIGHT) return;
    if (this.time.now < this.dashUntil) return; // dodged
    this.hurt(shot.source, shadow, shot.damage);
    this.endShot(shot, true);
  }

  private shotOf(shadow: Sprite): Shot | undefined {
    return shadow.getData("shot") as Shot | undefined;
  }

  /** Move every projectile: physics on the ground, height and tilt above it, trails, landing. */
  private updateShots(time: number, dt: number): void {
    for (const shot of [...this.shots]) {
      const { shadow, sprite, flight, spec } = shot;
      if (!shadow.active) continue;
      const body = shadow.body as Body;
      // The ground motion comes from Arcade (so walls can bounce it); height and speed-up from the flight.
      flight.x = shadow.x;
      flight.y = shadow.y;
      flight.vx = body.velocity.x;
      flight.vy = body.velocity.y;
      const landed = step(flight, dt);
      body.setVelocity(flight.vx, flight.vy);
      shot.travelled += Math.hypot(flight.vx, flight.vy) * dt;
      sprite.setPosition(shadow.x, shadow.y - flight.z).setRotation(screenAngle(flight));
      sprite.setDepth(shadow.y / WORLD_HEIGHT + 0.01);
      shadow.setScale(1 - Math.min(0.5, flight.z / 80));
      if (time >= shot.trailAt && (spec.texture === "rocket" || spec.texture === "shell")) {
        // Rockets and shells leave a trail of smoke.
        shot.trailAt = time + (spec.texture === "rocket" ? 25 : 45);
        const puff = this.add.circle(sprite.x, sprite.y, 3, spec.texture === "rocket" ? 0xc9ced6 : 0x8a9099, 0.6).setDepth(sprite.depth - 0.001);
        this.tweens.add({ targets: puff, scale: 2.4, alpha: 0, duration: 420, onComplete: () => puff.destroy() });
      }
      if (time >= shot.trailAt && (spec.texture === "orb" || spec.texture === "spark" || spec.texture === "fireball")) {
        shot.trailAt = time + 30;
        const dot = this.add.image(sprite.x, sprite.y, spec.texture).setScale(0.5).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(sprite.depth - 0.001);
        if (shot.hostile && spec.texture === "orb") dot.setTint(spec.color);
        this.tweens.add({ targets: dot, alpha: 0, scale: 0.1, duration: 220, onComplete: () => dot.destroy() });
      }
      if (landed) this.landShot(shot);
      else if (spec.gravity <= 0 && shot.travelled >= shot.range) this.endShot(shot, true);
    }
  }

  /** Touching the ground: arrows and daggers stick in it and fade; magic bursts. */
  private landShot(shot: Shot): void {
    if (this.waterTiles.has(tileKey(shot.shadow.x, shot.shadow.y))) return this.splash(shot);
    if (shot.spec.splash > 0) return this.endShot(shot, true);
    this.stick(shot, shot.flight.vx, shot.flight.vy, 0.35);
  }

  private shotHitWall(shadow: Sprite): void {
    const shot = this.shotOf(shadow);
    if (!shot || !shadow.active) return;
    if (shot.bouncesLeft > 0) {
      // Arcade already bounced it; it loses a little each time.
      shot.bouncesLeft--;
      playEffect(this, "bounce", { volume: 0.5 });
      shot.travelled = Math.max(0, shot.travelled - 120);
      this.sparkle(shadow.x, shadow.y - shot.flight.z, shot.spec.color, 4);
      return;
    }
    if (shot.spec.splash > 0 || shot.spec.texture === "spark") return this.endShot(shot, true);
    playEffect(this, "arrow-hit", { volume: 0.5 });
    this.stick(shot, shot.flight.vx, shot.flight.vy, 0);
  }

  /** Falling into the water: a ring of ripples and it is gone. */
  private splash(shot: Shot): void {
    const { shadow, sprite } = shot;
    const x = shadow.x;
    const y = shadow.y;
    shadow.disableBody(true, true);
    this.removeShot(shot);
    sprite.destroy();
    playEffect(this, "splash", { volume: 0.5 });
    for (let i = 0; i < 2; i++) {
      const ring = this.add.ellipse(x, y, 6, 3).setStrokeStyle(1, 0xe6f6ff, 0.9).setDepth(-3);
      this.tweens.add({ targets: ring, scaleX: 4, scaleY: 4, alpha: 0, delay: i * 120, duration: 420, onComplete: () => ring.destroy() });
    }
  }

  /** The projectile stays where it hit, quivers, then fades away. */
  private stick(shot: Shot, vx: number, vy: number, dip: number): void {
    const { shadow, sprite } = shot;
    shadow.disableBody(true, true);
    this.removeShot(shot);
    sprite.setRotation(Math.atan2(vy, vx) + dip * Math.sign(vx || 1));
    this.tweens.add({ targets: sprite, angle: sprite.angle + 6, duration: 40, yoyo: true, repeat: 3 });
    this.tweens.add({ targets: sprite, alpha: 0, delay: 900, duration: 400, onComplete: () => sprite.destroy() });
  }

  private shotHitEnemy(shadow: Sprite, enemy: Sprite): void {
    const shot = this.shotOf(shadow);
    if (!shot || shot.hostile || !shadow.active || !enemy.body?.enable || shot.hit.has(enemy)) return;
    if (shot.flight.z > HIT_HEIGHT) return; // flew over it
    shot.hit.add(enemy);
    const angle = Math.atan2(shot.flight.vy, shot.flight.vx);
    if (shot.spec.splash > 0) {
      this.endShot(shot, true);
    } else {
      this.damageEnemy(enemy, shot.damage, angle, shot.knockback);
      if (shot.pierceLeft > 0) shot.pierceLeft--;
      else {
        shadow.disableBody(true, true);
        this.removeShot(shot);
        this.tweens.add({ targets: shot.sprite, alpha: 0, duration: 80, onComplete: () => shot.sprite.destroy() });
      }
    }
    if (this.tracker.isOver()) this.end(this.tracker.outcome()!);
  }

  /** End a projectile; magic ones burst and hurt everything around. */
  private endShot(shot: Shot, burst: boolean): void {
    const { shadow, sprite, spec } = shot;
    const x = shadow.x;
    const y = shadow.y;
    shadow.disableBody(true, true);
    this.removeShot(shot);
    sprite.destroy();
    if (!burst) return;
    this.sparkle(x, y - shot.flight.z, spec.color, 10);
    if (spec.splash <= 0) return;
    const fiery = spec.texture === "shell" || spec.texture === "rocket" || spec.texture === "grenade";
    if (fiery) this.boom(x, y, spec.splash);
    else {
      playEffect(this, "explode", { volume: 0.8 });
      const ring = this.add.circle(x, y, 6, spec.color, 0.35).setStrokeStyle(2, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(40);
      this.tweens.add({ targets: ring, radius: spec.splash, alpha: 0, duration: 260, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    }
    this.blastKegs(x, y, spec.splash);
    if (shot.hostile) {
      // Enemy grenades and shells hurt the hero when they land close, unless dashing.
      const near = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= spec.splash;
      if (near && this.time.now >= this.dashUntil && !this.finished) this.hurt(shot.source, shadow, shot.damage);
      return;
    }
    for (const child of [...this.enemies.getChildren()]) {
      const enemy = child as Sprite;
      if (!enemy.body?.enable) continue;
      if (Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= spec.splash) {
        this.damageEnemy(enemy, shot.damage, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), shot.knockback);
      }
    }
    if (this.tracker.isOver()) this.end(this.tracker.outcome()!);
  }

  private removeShot(shot: Shot): void {
    const index = this.shots.indexOf(shot);
    if (index >= 0) this.shots.splice(index, 1);
    this.time.delayedCall(0, () => shot.shadow.destroy());
  }

  private damageEnemy(enemy: Sprite, damage: number, angle: number, knockback = this.weapon.knockback): void {
    if (!enemy.body?.enable) return;
    if (enemy.getData("awake") === false) this.wake(enemy);
    const stats = enemy.getData("stats") as EnemyStats;
    const hp = (enemy.getData("hp") as number) - damage;
    enemy.setData("hp", hp);
    const heavy = { brute: 2, demon: 6, tank: 8, captain: 2, artillery: 99 }[enemy.getData("kind") as string] ?? 1;
    const push = knockback / heavy;
    enemy.setVelocity(Math.cos(angle) * push, Math.sin(angle) * push);
    enemy.setData("knockedUntil", this.time.now + 140);
    this.flash(enemy, 0xffffff, 80);
    this.floatText(enemy.x, enemy.y - 16, `-${damage}`, "#ffffff");
    playEffect(this, hp <= 0 ? "defeat" : "hit", { volume: 0.8 });
    this.sparkle(enemy.x, enemy.y, 0xd6ecff, 5);
    if (hp <= 0) {
      this.tracker.defeatEnemy(enemy.x, enemy.y, enemy.getData("kind") as string, stats.points);
      this.floatText(enemy.x, enemy.y - 30, `+${stats.points}`, "#ffc547");
      (enemy.getData("bar") as Phaser.GameObjects.Graphics).destroy();
      (enemy.getData("aim") as Phaser.GameObjects.Graphics).destroy();
      enemy.disableBody(false, false);
      this.tweens.add({ targets: enemy, alpha: 0, scale: 0.2, angle: 180, duration: 260, onComplete: () => enemy.destroy() });
    }
  }

  /** A bright flash at the muzzle of a gun or a cannon. */
  private muzzleFlash(x: number, y: number, angle: number, distance: number, big: boolean): void {
    const fx = x + Math.cos(angle) * distance;
    const fy = y + Math.sin(angle) * distance - 4;
    const core = this.add.circle(fx, fy, big ? 7 : 4, 0xfff3c4, 1).setDepth(44).setBlendMode(Phaser.BlendModes.ADD);
    const glow = this.add.circle(fx, fy, big ? 16 : 9, 0xffa53c, 0.55).setDepth(43).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: [core, glow], scale: 1.6, alpha: 0, duration: big ? 140 : 80, ease: "Cubic.easeOut",
      onComplete: () => {
        core.destroy();
        glow.destroy();
      },
    });
    if (big) this.smoke(fx, fy, 3);
  }

  /** A brass casing jumps out of the gun, falls with gravity, bounces once and fades. */
  private ejectCasing(x: number, y: number, aim: number): void {
    const side = aim + (Math.PI / 2) * (Math.cos(aim) >= 0 ? -1 : 1);
    const casing = this.add.rectangle(x, y - 6, 3, 2, 0xd9a441).setDepth(this.player.depth + 0.001);
    const landX = x + Math.cos(side) * 14 - Math.cos(aim) * 6;
    const landY = y + 8 + Math.random() * 6;
    this.tweens.add({ targets: casing, x: landX, duration: 320 });
    this.tweens.add({
      targets: casing, y: y - 20, duration: 130, ease: "Quad.easeOut",
      onComplete: () => this.tweens.add({
        targets: casing, y: landY, angle: 540, duration: 190, ease: "Bounce.easeOut",
        onComplete: () => this.tweens.add({ targets: casing, alpha: 0, delay: 700, duration: 300, onComplete: () => casing.destroy() }),
      }),
    });
  }

  /** Puffs of grey smoke that rise and spread. */
  private smoke(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const puff = this.add.circle(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 6, 4 + Math.random() * 4, 0x9aa3ad, 0.55).setDepth(42);
      this.tweens.add({ targets: puff, y: puff.y - 18 - Math.random() * 14, scale: 2.2, alpha: 0, duration: 600 + Math.random() * 400, ease: "Cubic.easeOut", onComplete: () => puff.destroy() });
    }
  }

  /**
   * A real explosion: the animated fireball (16x16 Explosion, CC0), a shockwave
   * ring, flying debris, smoke, a scorch mark on the ground and a camera shake
   * that grows with the radius.
   */
  private boom(x: number, y: number, radius: number): void {
    playEffect(this, radius >= 60 ? "explosion" : "explode", { volume: 0.95 });
    const fireball = this.add.sprite(x, y - 6, "explosion-1").setScale(Math.max(1.4, radius / 16)).setDepth(46);
    fireball.play("explode");
    fireball.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fireball.destroy());
    const ring = this.add.circle(x, y, 6, 0xffffff, 0).setStrokeStyle(3, 0xffd8a8, 0.9).setDepth(45);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 280, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    const light = this.add.circle(x, y, radius * 1.3, 0xffa53c, 0.25).setDepth(44).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: light, alpha: 0, duration: 220, onComplete: () => light.destroy() });
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const bit = this.add.rectangle(x, y, 3, 3, Math.random() < 0.5 ? 0x3b2f1c : 0x6e5a35).setDepth(45);
      const reach = radius * (0.5 + Math.random() * 0.6);
      this.tweens.add({ targets: bit, x: x + Math.cos(angle) * reach, duration: 420, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: bit, y: y + Math.sin(angle) * reach * 0.6, angle: 360, alpha: 0, duration: 480, ease: "Quad.easeIn", onComplete: () => bit.destroy() });
    }
    this.smoke(x, y - 4, 5);
    const scorch = this.add.ellipse(x, y + 2, radius * 0.9, radius * 0.5, 0x1b1712, 0.45).setDepth(-2);
    this.tweens.add({ targets: scorch, alpha: 0, delay: 2500, duration: 1500, onComplete: () => scorch.destroy() });
    this.cameras.main.shake(180 + radius * 2, Math.min(0.02, 0.004 + radius / 6000));
    this.buzz(Math.min(90, 30 + radius));
  }

  /** Kegs caught in a blast go off too (a little later, so chains ripple). */
  private blastKegs(x: number, y: number, radius: number): void {
    for (const child of [...this.explosives.getChildren()]) {
      const keg = child as Sprite;
      if (keg.active && Phaser.Math.Distance.Between(x, y, keg.x, keg.y) <= radius + 16) this.time.delayedCall(90, () => this.detonate(keg));
    }
  }

  /** A powder keg blows up: it hurts enemies and the hero, and throws boxes away. */
  private detonate(keg: Sprite): void {
    if (!keg.active || keg.getData("gone")) return;
    keg.setData("gone", true);
    const { x, y } = keg;
    const { damage, radius } = BARREL_BLAST;
    keg.destroy();
    this.boom(x, y, radius);
    for (const child of [...this.enemies.getChildren()]) {
      const enemy = child as Sprite;
      if (enemy.body?.enable && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) {
        this.damageEnemy(enemy, damage, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), 560);
      }
    }
    for (const child of this.boxes.getChildren()) {
      const box = child as Sprite;
      if (Phaser.Math.Distance.Between(x, y, box.x, box.y) <= radius * 1.3) {
        const a = Phaser.Math.Angle.Between(x, y, box.x, box.y);
        box.setVelocity(Math.cos(a) * 420, Math.sin(a) * 420);
      }
    }
    if (!this.finished && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= radius && this.time.now >= this.dashUntil) {
      this.hurt("explosive", this.player, 2);
    }
    this.blastKegs(x, y, radius);
    if (this.tracker.isOver()) this.end(this.tracker.outcome()!);
  }

  /** Paint a sprite in one solid colour for a moment: the "hit" flash. */
  private flash(sprite: Sprite, color: number, ms: number): void {
    sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(ms, () => {
      if (sprite.active) sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    });
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: "Orbitron, Inter, system-ui, sans-serif", fontSize: "12px", fontStyle: "bold", color, stroke: "#03060d", strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: label, y: y - 22, alpha: 0, duration: 650, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
  }

  private sparkle(x: number, y: number, color: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dot = this.add.rectangle(x, y, 3, 3, color).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: dot, x: x + Math.cos(angle) * 22, y: y + Math.sin(angle) * 22, alpha: 0, duration: 320, ease: "Cubic.easeOut", onComplete: () => dot.destroy() });
    }
  }

  private reportHud(time: number, force = false): void {
    if (!force && time - this.lastHud < 100) return;
    this.lastHud = time;
    this.hooks.onHud({
      score: this.tracker.score(),
      health: this.tracker.health(),
      maxHealth: this.tracker.maxHealth(),
      coins: this.tracker.coinsCollected,
      coinsTotal: this.tracker.coinsTotal,
      enemies: this.tracker.enemiesDefeated,
      enemiesTotal: this.tracker.enemiesTotal,
      elapsedMs: this.tracker.elapsedMs(),
      difficulty: this.difficulty,
      hero: this.hero.name,
      heroTexture: this.hero.texture,
      weapon: this.weapon.id,
      attackReady: Phaser.Math.Clamp(1 - (this.nextAttackAt - time) / this.weapon.cooldownMs, 0, 1),
      dashReady: Phaser.Math.Clamp(1 - (this.nextDashAt - time) / DASH_COOLDOWN_MS, 0, 1),
      charge: this.windup && !this.windup.released
        ? (this.windup.weapon.chargeMs > 0
          ? Phaser.Math.Clamp((time - this.windup.startedAt) / (this.windup.weapon.windupMs + this.windup.weapon.chargeMs), 0, 1)
          : Phaser.Math.Clamp((time - this.windup.startedAt) / Math.max(1, this.windup.weapon.windupMs), 0, 1))
        : 0,
    });
  }

  /** Called by the "Salir" button. */
  quit(): void {
    this.end("quit");
  }

  private end(outcome: RunResultDto["outcome"]): void {
    if (this.finished) return;
    this.finished = true;
    this.tracker.finish(outcome);
    if (outcome === "won") playJingle(this, "win");
    else if (outcome === "lost") playJingle(this, "lose");
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.reportHud(this.time.now, true);
    this.hooks.onFinish(this.tracker.result());
  }
}
