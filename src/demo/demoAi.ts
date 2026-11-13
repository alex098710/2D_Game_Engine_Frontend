import {
  CHARACTER_KINDS, ENEMY_KINDS, GROUND_KINDS, isKind, KINDS, SIZES, WEAPON_KINDS, WORLD_HEIGHT, WORLD_WIDTH,
  type GameObject, type Kind,
} from "../model/GameObject";

/**
 * The AI of the demo, in the browser: the same deterministic rules as the AI
 * service's simulated provider (2D_Game_Engine_AI/app/providers/simulated.py)
 * and its removal rules (app/edits.py). It understands requests like
 * "3 monedas y una pared en 400 300", "borra los enemigos" or "elimina todo y
 * pon 5 tanques". Nothing is sent anywhere.
 */

// Keywords per kind, in English and Spanish (the order matters: longer names first).
const KIND_WORDS: [Kind, string[]][] = [
  ["explosive", ["explosive barrel", "barril explosivo", "barriles explosivos", "polvorin", "polvorín"]],
  ["turret", ["turret", "torreta"]],
  ["drone", ["drone", "dron"]],
  ["metalfloor", ["metal floor", "suelo de metal", "placas de metal"]],
  ["hazard", ["hazard", "franja de peligro", "franjas de peligro"]],
  ["steelwall", ["steel wall", "muro de acero", "muros de acero", "pared de acero", "muro metálico", "muro metalico"]],
  ["container", ["container", "contenedor"]],
  ["pipes", ["pipe", "tubería", "tuberia", "tubo"]],
  ["reactor", ["reactor", "generador", "núcleo", "nucleo"]],
  ["beacon", ["beacon", "baliza"]],
  ["barrier", ["barrier", "barrera"]],
  ["bandit", ["bandit", "outlaw", "bandido", "pistolero", "forajido"]],
  ["saloon", ["saloon", "cantina"]],
  ["cabin", ["cabin", "cabaña", "cabana"]],
  ["wagon", ["wagon", "carreta", "carro"]],
  ["hay", ["hay", "heno", "fardo", "paja"]],
  ["crates", ["crates", "pila de cajas", "cajas apiladas"]],
  ["trough", ["trough", "abrevadero"]],
  ["cactus", ["cactus", "saguaro"]],
  ["lamp", ["lamp", "farol", "farola"]],
  ["boardwalk", ["boardwalk", "pasarela", "tablones"]],
  ["dirt", ["dirt", "tierra"]],
  ["artillery", ["artillery", "artilleria", "artillería", "cañon", "cañón", "canon"]],
  ["tank", ["tank", "tanque"]],
  ["grenadier", ["grenadier", "granadero"]],
  ["grenade", ["grenade", "granada", "granadas"]],
  ["soldier", ["soldier", "fusilero", "soldado enemigo", "soldados enemigos"]],
  ["legionary", ["legionary", "legionario"]],
  ["captain", ["captain", "capitan", "capitán", "oficial"]],
  ["ally", ["ally", "aliado", "aliados", "soldado aliado"]],
  ["guard", ["guard", "guardia", "centinela"]],
  ["sandbag", ["sandbag", "sacos terreros", "saco terrero", "trinchera"]],
  ["barricade", ["barricade", "barricada"]],
  ["hedgehog", ["hedgehog", "erizo", "antitanque"]],
  ["bunker", ["bunker", "búnker"]],
  ["tower", ["tower", "torre"]],
  ["banner", ["banner", "estandarte"]],
  ["flag", ["flag", "bandera"]],
  ["rock", ["rock", "colina", "roca"]],
  ["road", ["road", "carretera", "asfalto"]],
  ["medkit", ["medkit", "botiquin", "botiquín"]],
  ["sniper", ["sniper", "francotirador"]],
  ["launcher", ["launcher", "lanzacohetes", "bazooka", "rpg"]],
  ["shotgun", ["shotgun", "escopeta"]],
  ["smg", ["smg", "subfusil", "metralleta", "ametralladora"]],
  ["rifle", ["rifle", "fusil"]],
  ["pistol", ["pistol", "pistola", "revolver", "revólver"]],
  ["villager", ["villager", "aldeano", "campesino"]],
  ["knight", ["knight", "caballero", "guerrero"]],
  ["wizard", ["wizard", "mago", "hechicero"]],
  ["bat", ["bat", "murcielago", "murciélago"]],
  ["spider", ["spider", "araña", "arana"]],
  ["ghost", ["ghost", "fantasma"]],
  ["brute", ["brute", "ogro", "ciclope", "cíclope"]],
  ["chest", ["chest", "cofre"]],
  ["potion", ["potion", "pocion", "poción"]],
  ["sword", ["sword", "espada"]],
  ["axe", ["axe", "hacha"]],
  ["wand", ["wand", "varita"]],
  ["bow", ["bow", "arco"]],
  ["dagger", ["dagger", "daga", "dagas", "cuchillo"]],
  ["hammer", ["hammer", "martillo"]],
  ["spear", ["spear", "lanza"]],
  ["staff", ["staff", "baculo", "báculo", "baston", "bastón"]],
  ["path", ["path", "road", "camino", "calle", "sendero"]],
  ["water", ["water", "agua", "lago", "río"]],
  ["sand", ["sand", "arena", "playa"]],
  ["bridge", ["bridge", "puente"]],
  ["marksman", ["marksman", "arquero oscuro", "arqueros oscuros"]],
  ["necromancer", ["necromancer", "nigromante"]],
  ["demon", ["demon", "demonio", "jefe", "boss"]],
  ["mimic", ["mimic", "mímico", "mimico"]],
  ["rat", ["rat", "rata"]],
  ["barrel", ["barrel", "barril"]],
  ["fence", ["fence", "valla"]],
  ["bush", ["bush", "arbusto"]],
  ["coin", ["coin", "moneda"]],
  ["enemy", ["enemy", "enemies", "enemigo", "slime", "monstruo"]],
  ["house", ["house", "casa"]],
  ["wall", ["wall", "pared", "muro"]],
  ["tree", ["tree", "arbol", "árbol"]],
  ["spike", ["spike", "pincho", "trampa"]],
  ["box", ["box", "caja"]],
];

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, a: 1, an: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4,
  cinco: 5, five: 5, seis: 6, six: 6, diez: 10, ten: 10,
};
const MAX_PER_KIND = 10;
/** The most objects one answer may add (the AI service's limit). */
export const MAX_TOTAL = 30;
const ZONE_XS = [260, 620, 980, 1340];
const ZONE_YS = [220, 480, 740];
const ZONE_ORDER: [number, number][] = [[1, 1], [2, 1], [0, 1], [3, 1], [1, 0], [2, 2], [2, 0], [1, 2], [0, 0], [3, 2], [3, 0], [0, 2]];
const PATCHES: Partial<Record<Kind, [number, number]>> = { water: [3, 2], sand: [3, 2], path: [6, 1], road: [6, 1] };
const PATCH_WORDS = ["lago", "lake", "rio", "río", "river", "playa", "beach", "camino", "calle", "sendero", "carretera"];

function parts(text: string): string[] {
  return text.split(/(?<!\d),|,(?!\s*\d)|;|\by\b|\band\b/).map((part) => part.trim()).filter(Boolean);
}

function kindOf(part: string): Kind | null {
  for (const [kind, words] of KIND_WORDS) if (words.some((word) => part.includes(word))) return kind;
  return null;
}

function countOf(part: string, wordAt: number): number {
  const before = part.slice(0, wordAt).split(/\s+/).filter(Boolean);
  const last = before[before.length - 1];
  if (last === undefined) return 1;
  if (/^\d+$/.test(last)) return Math.max(1, Math.min(Number(last), MAX_PER_KIND));
  return NUMBER_WORDS[last] ?? 1;
}

function positionOf(part: string): [number, number] | null {
  const match = /(?:at|en|in)\s+\(?\s*(\d+)\s*[, ]\s*(\d+)/.exec(part);
  return match ? [Math.min(Number(match[1]), WORLD_WIDTH), Math.min(Number(match[2]), WORLD_HEIGHT)] : null;
}

function zone(index: number): [number, number] {
  const [col, row] = ZONE_ORDER[index % ZONE_ORDER.length];
  return [ZONE_XS[col], ZONE_YS[row]];
}

function gridPositions(kind: Kind, count: number, centre: [number, number], fixedCols?: number): [number, number][] {
  const [width, height] = SIZES[kind] ?? [32, 32];
  const tile = kind in PATCHES;
  const stepX = tile ? width : width + 24;
  const stepY = tile ? height : height + 24;
  const cols = fixedCols ?? Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const left = centre[0] - (stepX * (cols - 1)) / 2;
  const top = centre[1] - (stepY * (rows - 1)) / 2;
  const spots: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const x = left + stepX * (i % cols);
    const y = top + stepY * Math.floor(i / cols);
    spots.push([Math.min(Math.max(x, width / 2), WORLD_WIDTH - width / 2), Math.min(Math.max(y, height / 2), WORLD_HEIGHT - height / 2)]);
  }
  return spots;
}

/** New objects for a request that asks to add things (never a second player, never more than MAX_TOTAL). */
export function generate(request: string): GameObject[] {
  const text = request.toLowerCase();
  const objects: GameObject[] = [];
  let zoneIndex = 0;
  for (const part of parts(text).length > 0 ? parts(text) : [text]) {
    const kind = kindOf(part);
    if (kind === null) continue;
    const words = KIND_WORDS.find(([name]) => name === kind)![1];
    const wordAt = Math.min(...words.filter((word) => part.includes(word)).map((word) => part.indexOf(word)));
    let count = countOf(part, wordAt);
    const position = positionOf(part);
    let spots: [number, number][];
    if (position !== null) {
      spots = Array.from({ length: count }, (_, i) => [Math.min(position[0] + 40 * i, WORLD_WIDTH), position[1]] as [number, number]);
    } else {
      let cols: number | undefined;
      const patch = PATCHES[kind];
      if (patch !== undefined && count === 1 && PATCH_WORDS.some((word) => part.includes(word))) {
        cols = patch[0];
        count = patch[0] * patch[1];
      }
      spots = gridPositions(kind, count, zone(zoneIndex), cols);
      zoneIndex += 1;
    }
    for (const [x, y] of spots.slice(0, MAX_TOTAL - objects.length)) {
      objects.push({ id: `${kind}-${objects.length + 1}`, kind, x, y });
    }
  }
  if (objects.length === 0) objects.push({ id: "box-1", kind: "box", x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  return objects.filter((object) => object.kind !== "player");
}

// ---------------------------------------------------------------- removals

const REMOVE_VERBS = ["borra", "borrar", "borrame", "borralo", "borralos", "borralas", "elimina", "eliminar", "eliminame",
  "quita", "quitar", "quitame", "saca", "sacar", "limpia", "limpiar", "vacia", "vaciar", "suprime",
  "remove", "delete", "clear", "erase", "wipe"];
const ADD_VERBS = ["pon", "poner", "ponme", "anade", "agrega", "crea", "crear", "coloca", "genera", "mete", "haz",
  "add", "create", "place", "put", "spawn", "make", "build"];
const EVERYTHING = ["todo", "todos", "toda", "todas", "everything", "all", "mapa", "escena", "nivel", "map", "scene", "level"];

const BUILDINGS: Kind[] = ["wall", "house", "fence", "bunker", "tower", "saloon", "cabin", "steelwall", "reactor"];
const OBSTACLES: Kind[] = ["box", "barrel", "spike", "explosive", "sandbag", "barricade", "hedgehog", "rock", "tree", "bush",
  "wagon", "hay", "crates", "trough", "cactus", "lamp", "container", "pipes", "barrier", "beacon"];
const REWARDS: Kind[] = ["coin", "chest", "potion", "medkit"];
const TERRAIN: Kind[] = ["water", "grass" as Kind].filter((kind) => isKind(kind));

const GROUPS: [string[], readonly Kind[]][] = [
  [["enemigo", "enemigos", "enemy", "enemies", "monstruo", "monstruos", "monster", "monsters", "malos"], ENEMY_KINDS],
  [["objeto", "objetos", "item", "items", "recompensa", "recompensas", "coleccionable", "coleccionables"], REWARDS],
  [["arma", "armas", "weapon", "weapons", "pistolas", "fusiles"], WEAPON_KINDS],
  [["moneda", "monedas", "coin", "coins"], ["coin"]],
  [["personaje", "personajes", "aldeanos", "npc", "npcs", "character", "characters", "aliados", "allies"], CHARACTER_KINDS],
  [["obstaculo", "obstaculos", "obstacle", "obstacles", "trampa", "trampas"], OBSTACLES],
  [["edificio", "edificios", "construccion", "construcciones", "building", "buildings"], BUILDINGS],
  [["terreno", "suelo", "terrain", "ground", "caminos", "carreteras"], [...GROUND_KINDS, ...TERRAIN]],
  [["soldado", "soldados", "soldier", "soldiers", "ejercito", "army"], ["soldier", "grenadier", "legionary", "captain"]],
  [["jugador", "player", "heroe", "hero"], ["player"]],
];

/** Lower case, no accents, single spaces. */
export function normalise(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordPattern = (word: string) => new RegExp(`\\b${escape(word)}(?:s|es)?\\b`, "g");
const hasWord = (text: string, word: string) => new RegExp(`\\b${escape(word)}(?:s|es)?\\b`).test(text);
const hasVerb = (text: string, verbs: string[]) => verbs.some((verb) => new RegExp(`\\b${verb}\\b`).test(text));

function targets(clause: string): Set<Kind> {
  const kinds = new Set<Kind>();
  let rest = clause;
  const phrases: [string, readonly Kind[]][] = [];
  for (const [kind, words] of KIND_WORDS) for (const word of words) phrases.push([normalise(word), [kind]]);
  for (const [words, group] of GROUPS) for (const word of words) phrases.push([word, group]);
  phrases.sort((a, b) => b[0].length - a[0].length);
  for (const [word, group] of phrases) {
    if (hasWord(rest, word)) {
      group.forEach((kind) => kinds.add(kind));
      rest = rest.replace(wordPattern(word), " ");
    }
  }
  if (kinds.size > 0) return kinds;
  if (EVERYTHING.some((word) => hasWord(clause, word)) || /\b(limpia|limpiar|vacia|vaciar|clear|wipe)\b/.test(clause)) {
    return new Set(KINDS.filter((kind) => kind !== "player"));
  }
  return kinds;
}

export interface Edit {
  removeKinds: Set<Kind>;
  addRequest: string;
}

/** Split a request into what it removes (decided by fixed words) and what it still asks to add. */
export function parseEdit(request: string): Edit {
  const text = normalise(request);
  if (!hasVerb(text, REMOVE_VERBS)) return { removeKinds: new Set(), addRequest: request.trim() };
  const remove = new Set<Kind>();
  let keep: string[] = [];
  const clauses = text.split(/\s*(?:[,;.]|\by luego\b|\by despues\b|\bluego\b|\bdespues\b|\bthen\b|\band\b|\by\b|\be\b)\s*/).filter(Boolean);
  for (const clause of clauses) {
    if (hasVerb(clause, REMOVE_VERBS)) targets(clause).forEach((kind) => remove.add(kind));
    else keep.push(clause);
  }
  if (remove.size > 0 && keep.length > 0) {
    const everything = KINDS.length - 1;
    const leftover: string[] = [];
    for (const clause of keep) {
      const asksToAdd = hasVerb(clause, ADD_VERBS) || /\d/.test(clause);
      const named = asksToAdd ? new Set<Kind>() : targets(`borra ${clause}`);
      if (named.size > 0 && named.size !== everything) named.forEach((kind) => remove.add(kind));
      else leftover.push(clause);
    }
    keep = leftover;
  }
  return { removeKinds: remove, addRequest: keep.join(" y ").trim() };
}

// ---------------------------------------------------------------- obstacles

/** Obstacles the learned model would place: more and harder ones as difficulty rises, away from the player. */
export function obstacles(scene: GameObject[], count: number, difficulty: number, random: () => number = Math.random): GameObject[] {
  const kinds: Kind[] = difficulty > 0.6 ? ["spike", "wall", "barrel", "box"] : ["box", "barrel", "bush", "rock"];
  const player = scene.find((object) => object.kind === "player");
  const taken = (x: number, y: number) => scene.some((object) => Math.abs(object.x - x) < 40 && Math.abs(object.y - y) < 40 && !GROUND_KINDS.includes(object.kind));
  const added: GameObject[] = [];
  for (let tries = 0; added.length < count && tries < count * 40; tries++) {
    const x = 48 + Math.round(random() * (WORLD_WIDTH - 96));
    const y = 48 + Math.round(random() * (WORLD_HEIGHT - 96));
    if (player && Math.hypot(player.x - x, player.y - y) < 120) continue;
    if (taken(x, y) || added.some((object) => Math.abs(object.x - x) < 40 && Math.abs(object.y - y) < 40)) continue;
    const kind = kinds[Math.floor(random() * kinds.length)];
    added.push({ id: `${kind}-ai-${added.length + 1}`, kind, x, y });
  }
  return added;
}
