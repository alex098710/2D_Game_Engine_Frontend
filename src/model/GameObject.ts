/** Every kind of object the engine knows. Same list as the backend and the AI service. */
export const KINDS = [
  "player", "box", "wall", "house", "tree", "spike", "coin", "enemy", "villager", "knight", "wizard",
  "bat", "spider", "ghost", "brute", "chest", "potion", "sword", "axe", "wand", "bow", "barrel", "fence", "bush",
  "dagger", "hammer", "spear", "staff", "path",
  "water", "sand", "bridge", "marksman", "necromancer", "demon", "mimic", "rat",
  "soldier", "grenadier", "tank", "artillery", "ally", "sandbag", "barricade", "hedgehog", "bunker", "tower",
  "flag", "rock", "road", "medkit", "legionary", "captain", "guard",
  "pistol", "rifle", "shotgun", "smg", "sniper", "launcher", "grenade", "explosive", "banner",
] as const;
export type Kind = (typeof KINDS)[number];

/** One object of the scene. Same shape the backend stores as JSON; x and y are its centre. */
export interface GameObject {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  /** One of the account's own creations based on this kind (admin panel). */
  variant?: number;
}

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 960;
export const TILE_SIZE = 32;

/** Width and height in pixels (the AI service uses the same numbers). */
export const SIZES: Record<Kind, [number, number]> = {
  player: [24, 24],
  box: [32, 32],
  wall: [32, 32],
  house: [96, 96],
  tree: [32, 32],
  spike: [32, 32],
  coin: [16, 16],
  enemy: [28, 28],
  villager: [24, 28],
  knight: [24, 28],
  wizard: [24, 28],
  bat: [24, 20],
  spider: [26, 24],
  ghost: [24, 28],
  brute: [30, 30],
  chest: [32, 28],
  potion: [16, 20],
  sword: [16, 28],
  axe: [24, 28],
  wand: [16, 28],
  bow: [24, 28],
  barrel: [28, 30],
  fence: [32, 16],
  bush: [30, 28],
  dagger: [16, 24],
  hammer: [24, 28],
  spear: [16, 32],
  staff: [16, 32],
  path: [32, 32],
  water: [32, 32],
  sand: [32, 32],
  bridge: [32, 32],
  marksman: [24, 28],
  necromancer: [24, 28],
  demon: [56, 56],
  mimic: [30, 28],
  rat: [24, 20],
  soldier: [24, 28],
  grenadier: [24, 28],
  tank: [52, 44],
  artillery: [30, 28],
  ally: [24, 28],
  sandbag: [32, 20],
  barricade: [32, 30],
  hedgehog: [30, 28],
  bunker: [32, 32],
  tower: [28, 32],
  flag: [20, 30],
  rock: [30, 28],
  road: [32, 32],
  medkit: [20, 18],
  legionary: [24, 30],
  captain: [26, 28],
  guard: [24, 28],
  pistol: [24, 18],
  rifle: [32, 14],
  shotgun: [32, 14],
  smg: [26, 20],
  sniper: [32, 14],
  launcher: [32, 16],
  grenade: [18, 20],
  explosive: [28, 30],
  banner: [20, 30],
};

export const KIND_INFO: Record<Kind, { name: string; hint: string }> = {
  player: { name: "Jugador", hint: "Punto de inicio. Solo uno por escena." },
  box: { name: "Caja", hint: "Se puede empujar." },
  wall: { name: "Pared", hint: "Bloquea el paso." },
  house: { name: "Casa", hint: "Edificio sólido de 3 × 3 casillas." },
  tree: { name: "Árbol", hint: "Decoración sólida." },
  spike: { name: "Pinchos", hint: "Quita vida al tocarlos." },
  coin: { name: "Moneda", hint: "Recógelas todas para ganar." },
  enemy: { name: "Slime", hint: "Enemigo: te persigue. 3 de vida." },
  villager: { name: "Aldeana", hint: "Personaje amistoso: pasea y te da consejos." },
  knight: { name: "Caballero", hint: "Personaje amistoso que protege la aldea." },
  wizard: { name: "Mago", hint: "Personaje amistoso que sabe cómo aprende la IA." },
  bat: { name: "Murciélago", hint: "Enemigo rápido que vuela por encima de las paredes." },
  spider: { name: "Araña", hint: "Enemigo veloz que se acerca en zigzag." },
  ghost: { name: "Fantasma", hint: "Enemigo lento que atraviesa las paredes." },
  brute: { name: "Ogro", hint: "Enemigo lento y muy fuerte: 8 de vida, quita 2." },
  chest: { name: "Cofre", hint: "Tócalo para abrirlo: suelta un arma o una poción." },
  potion: { name: "Poción", hint: "Recupera 2 de vida." },
  sword: { name: "Espada", hint: "Arma: golpe en arco frente a ti." },
  axe: { name: "Hacha", hint: "Arma: golpe lento y pesado que empuja lejos." },
  wand: { name: "Varita", hint: "Arma: un orbe mágico que acelera y explota al chocar." },
  bow: { name: "Arco", hint: "Arma: flechas en parábola; mantén Espacio para tensar más." },
  dagger: { name: "Dagas", hint: "Arma: lanza tres dagas que giran en el aire." },
  hammer: { name: "Martillo", hint: "Arma: golpea el suelo y empuja a todos alrededor." },
  spear: { name: "Lanza", hint: "Arma: estocada larga con un salto hacia delante." },
  staff: { name: "Báculo", hint: "Arma: una chispa que rebota en las paredes." },
  path: { name: "Camino", hint: "Suelo de calle o piedra: se dibuja debajo de todo y no bloquea." },
  water: { name: "Agua", hint: "Nadie la cruza a pie; las flechas y los murciélagos pasan por encima." },
  sand: { name: "Arena", hint: "Suelo de playa o desierto: no bloquea." },
  bridge: { name: "Puente", hint: "Suelo de madera para cruzar el agua." },
  marksman: { name: "Arquero oscuro", hint: "Enemigo a distancia: guarda las distancias y dispara flechas. Esquívalas." },
  necromancer: { name: "Nigromante", hint: "Enemigo a distancia: lanza tres orbes malditos. 4 de vida." },
  demon: { name: "Demonio (jefe)", hint: "Jefe: 30 de vida, lanza anillos de bolas de fuego y se enfurece a media vida." },
  mimic: { name: "Mímico", hint: "Parece un cofre… hasta que te acercas. Muerde fuerte." },
  rat: { name: "Rata", hint: "Enemigo rápido y débil que corre en zigzag." },
  soldier: { name: "Fusilero", hint: "Soldado enemigo: guarda las distancias y dispara ráfagas de balas. 3 de vida." },
  grenadier: { name: "Granadero", hint: "Soldado enemigo: lanza granadas en parábola que explotan al caer. 3 de vida." },
  tank: { name: "Tanque (jefe)", hint: "Jefe: 25 de vida, dispara obuses en abanico y se enfurece a media vida." },
  artillery: { name: "Artillería", hint: "Cañón fijo: no se mueve, pero dispara obuses que explotan desde muy lejos." },
  ally: { name: "Soldado aliado", hint: "Personaje amistoso del ejército azul: patrulla y te da consejos de guerra." },
  sandbag: { name: "Sacos terreros", hint: "Trinchera de sacos: bloquea el paso y frena los disparos." },
  barricade: { name: "Barricada", hint: "Valla metálica que bloquea el paso." },
  hedgehog: { name: "Erizo antitanque", hint: "Obstáculo de acero: bloquea el paso." },
  bunker: { name: "Búnker", hint: "Edificio de hormigón: sólido." },
  tower: { name: "Torre de vigía", hint: "Torre de radio y vigilancia: sólida." },
  flag: { name: "Bandera", hint: "Estandarte del ejército azul: marca tu base." },
  banner: { name: "Estandarte rojo", hint: "Bandera del ejército enemigo: marca su base." },
  rock: { name: "Colina", hint: "Montículo de tierra: bloquea el paso." },
  road: { name: "Carretera", hint: "Asfalto para las bases y los frentes: se dibuja debajo de todo y no bloquea." },
  medkit: { name: "Botiquín", hint: "Recupera 3 de vida." },
  legionary: { name: "Legionario", hint: "Infantería enemiga con casco: carga contra ti con la espada. 4 de vida." },
  captain: { name: "Capitán", hint: "Oficial enemigo: lento pero muy duro. 9 de vida, quita 2." },
  guard: { name: "Guardia", hint: "Personaje amistoso: vigila la base aliada y te da consejos." },
  pistol: { name: "Pistola", hint: "Arma de fuego: disparos rápidos y rectos." },
  rifle: { name: "Fusil", hint: "Arma de fuego: balas que atraviesan a un enemigo y llegan lejos." },
  shotgun: { name: "Escopeta", hint: "Arma de fuego: cinco perdigones en abanico; devastadora de cerca." },
  smg: { name: "Subfusil", hint: "Arma de fuego: ráfagas muy rápidas de poco daño." },
  sniper: { name: "Francotirador", hint: "Arma de fuego: un disparo lento, enorme alcance y mucho daño." },
  launcher: { name: "Lanzacohetes", hint: "Arma pesada: cohetes que aceleran y explotan en un área grande." },
  grenade: { name: "Granadas", hint: "Lánzalas en parábola: explotan al caer y dañan todo alrededor." },
  explosive: { name: "Barril explosivo", hint: "Explota al recibir un golpe o un disparo: daña a todos los que estén cerca, también a ti." },
  barrel: { name: "Barril", hint: "Pesado: se puede empujar despacio." },
  fence: { name: "Valla", hint: "Bloquea el paso." },
  bush: { name: "Arbusto", hint: "Decoración sólida." },
};

/** Friendly 2D characters: they walk around and talk, they never hurt. */
export const CHARACTER_KINDS: readonly Kind[] = ["villager", "knight", "wizard", "ally", "guard"];
export const ENEMY_KINDS: readonly Kind[] = [
  "enemy", "bat", "spider", "ghost", "brute", "marksman", "necromancer", "demon", "mimic", "rat",
  "soldier", "grenadier", "tank", "artillery", "legionary", "captain",
];
export const WEAPON_KINDS: readonly Kind[] = [
  "sword", "axe", "wand", "bow", "dagger", "hammer", "spear", "staff",
  "pistol", "rifle", "shotgun", "smg", "sniper", "launcher", "grenade",
];
/** Ground drawn under everything, with no body. */
export const GROUND_KINDS: readonly Kind[] = ["path", "sand", "bridge", "road"];

export function isGround(kind: Kind): boolean {
  return GROUND_KINDS.includes(kind);
}

export function isCharacter(kind: Kind): boolean {
  return CHARACTER_KINDS.includes(kind);
}

export function isEnemy(kind: Kind): boolean {
  return ENEMY_KINDS.includes(kind);
}

export function isWeapon(kind: Kind): boolean {
  return WEAPON_KINDS.includes(kind);
}

/** How the library groups the kinds, in the order it shows them. */
export const CATEGORIES: readonly { id: string; name: string; kinds: readonly Kind[] }[] = [
  { id: "characters", name: "Personajes", kinds: ["player", "villager", "knight", "wizard"] },
  { id: "enemies", name: "Enemigos", kinds: ["enemy", "bat", "spider", "ghost", "brute", "rat", "mimic", "marksman", "necromancer", "demon"] },
  { id: "building", name: "Construcción", kinds: ["wall", "house", "tree", "bush", "fence"] },
  { id: "terrain", name: "Terreno", kinds: ["path", "sand", "water", "bridge"] },
  { id: "obstacles", name: "Obstáculos", kinds: ["box", "barrel", "spike"] },
  { id: "items", name: "Objetos", kinds: ["coin", "chest", "potion", "medkit", "sword", "axe", "wand", "bow", "dagger", "hammer", "spear", "staff"] },
  { id: "firearms", name: "Armas de fuego", kinds: ["pistol", "rifle", "shotgun", "smg", "sniper", "launcher", "grenade"] },
  { id: "war", name: "Guerra", kinds: ["legionary", "captain", "soldier", "grenadier", "artillery", "tank", "ally", "guard", "sandbag", "barricade", "hedgehog", "bunker", "tower", "flag", "banner", "rock", "road", "explosive"] },
];

export function categoryOf(kind: Kind): string {
  return CATEGORIES.find((category) => category.kinds.includes(kind))!.id;
}

export function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}
