export type Direction = "down" | "up" | "left" | "right";

export const TILE_SIZE = 16;
export const MAP_W = 110;
export const MAP_H = 90;

const T = {
  WATER: 0,
  WATER2: 1,
  SAND: 2,
  GRASS: 3,
  TGRASS: 4,
  TREE: 5,
  MOUNT: 6,
  ROAD: 7,
  WALL: 8,
  ROOF: 9,
  DOOR: 10,
  WINDOW: 11,
  FENCE: 12,
  FLOWER: 13,
  CRATER: 14,
  BRIDGE: 15,
  DESERT: 16,
  CACTUS: 17,
  SIGN: 18,
  ROOF2: 19,
  FOUNTAIN: 20,
  SPRING: 21,
  TOWER: 22,
  ROCK: 23,
  PATH: 24,
} as const;

const SOLID = new Set<number>([
  T.WATER,
  T.WATER2,
  T.MOUNT,
  T.TREE,
  T.WALL,
  T.ROOF,
  T.ROOF2,
  T.WINDOW,
  T.FENCE,
  T.CACTUS,
  T.TOWER,
  T.ROCK,
  T.FOUNTAIN,
]);

function stampRect(
  tiles: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  tile: number,
) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i >= 0 && j >= 0 && i < MAP_W && j < MAP_H) {
        tiles[j * MAP_W + i] = tile;
      }
    }
  }
}

function stampOutlineRect(
  tiles: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  tile: number,
) {
  for (let i = x; i < x + w; i++) {
    if (i >= 0 && i < MAP_W) {
      if (y >= 0 && y < MAP_H) tiles[y * MAP_W + i] = tile;
      if (y + h - 1 >= 0 && y + h - 1 < MAP_H) {
        tiles[(y + h - 1) * MAP_W + i] = tile;
      }
    }
  }

  for (let j = y; j < y + h; j++) {
    if (j >= 0 && j < MAP_H) {
      if (x >= 0 && x < MAP_W) tiles[j * MAP_W + x] = tile;
      if (x + w - 1 >= 0 && x + w - 1 < MAP_W) {
        tiles[j * MAP_W + x + w - 1] = tile;
      }
    }
  }
}

function buildWorldTiles(): Uint8Array {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  tiles.fill(T.WATER);

  stampRect(tiles, 8, 6, 62, 76, T.GRASS);
  stampRect(tiles, 46, 60, 24, 22, T.DESERT);
  stampRect(tiles, 42, 56, 10, 4, T.GRASS);

  stampRect(tiles, 84, 62, 20, 20, T.GRASS);
  stampRect(tiles, 86, 60, 16, 2, T.SAND);
  stampRect(tiles, 86, 82, 16, 2, T.SAND);
  stampRect(tiles, 82, 64, 2, 16, T.SAND);
  stampRect(tiles, 104, 64, 2, 16, T.SAND);
  stampRect(tiles, 70, 70, 14, 2, T.BRIDGE);

  for (let i = 0; i < 58; i++) {
    const x = 10 + i;
    const depth = 3 + Math.floor(3 * Math.abs(Math.sin(i * 0.7)));
    for (let j = 0; j < depth; j++) {
      tiles[(6 + j) * MAP_W + x] = T.MOUNT;
    }
  }

  stampRect(tiles, 38, 6, 4, 9, T.PATH);
  stampRect(tiles, 14, 12, 10, 8, T.CRATER);
  stampOutlineRect(tiles, 14, 12, 10, 8, T.ROCK);
  stampRect(tiles, 18, 19, 2, 1, T.PATH);
  stampRect(tiles, 18, 20, 2, 3, T.PATH);

  stampRect(tiles, 54, 22, 16, 18, T.DESERT);
  stampRect(tiles, 58, 26, 1, 1, T.CACTUS);
  stampRect(tiles, 64, 32, 1, 1, T.CACTUS);
  stampRect(tiles, 61, 24, 1, 1, T.CACTUS);

  const forestSpots: Array<[number, number]> = [
    [16, 30],
    [16, 36],
    [20, 44],
    [26, 50],
    [12, 46],
    [30, 16],
    [34, 44],
    [50, 46],
    [56, 52],
    [22, 56],
    [46, 20],
    [36, 26],
  ];

  for (const [fx, fy] of forestSpots) {
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 4; i++) {
        if ((i + j) % 2 === 0) {
          tiles[(fy + j) * MAP_W + fx + i] = T.TREE;
        }
      }
    }
  }

  stampRect(tiles, 26, 38, 8, 5, T.WATER);
  stampRect(tiles, 25, 39, 1, 3, T.WATER);
  stampRect(tiles, 34, 39, 1, 3, T.WATER);

  stampRect(tiles, 34, 32, 2, 2, T.TOWER);
  stampRect(tiles, 32, 34, 6, 2, T.SPRING);

  stampRect(tiles, 12, 24, 24, 18, T.GRASS);

  const house = (x: number, y: number, roof: number = T.ROOF) => {
    stampRect(tiles, x, y, 5, 2, roof);
    stampRect(tiles, x, y + 2, 5, 3, T.WALL);
    tiles[(y + 4) * MAP_W + x + 2] = T.DOOR;
    tiles[(y + 3) * MAP_W + x + 1] = T.WINDOW;
    tiles[(y + 3) * MAP_W + x + 3] = T.WINDOW;
  };

  house(14, 25, T.ROOF);
  house(22, 25, T.ROOF2);
  house(14, 33, T.ROOF);
  house(24, 33, T.ROOF2);
  house(30, 27, T.ROOF);

  for (let i = 12; i < 36; i++) tiles[30 * MAP_W + i] = T.ROAD;
  for (let j = 24; j < 42; j++) tiles[j * MAP_W + 19] = T.ROAD;
  tiles[30 * MAP_W + 19] = T.FOUNTAIN;

  for (let j = 42; j < 48; j++) tiles[j * MAP_W + 19] = T.ROAD;
  for (let i = 36; i < 54; i++) tiles[46 * MAP_W + i] = T.PATH;
  for (let j = 46; j < 71; j++) tiles[j * MAP_W + 69] = T.PATH;
  for (let i = 55; i < 70; i++) tiles[70 * MAP_W + i] = T.PATH;
  for (let j = 47; j < 71; j++) tiles[j * MAP_W + 55] = T.PATH;
  for (let j = 15; j < 31; j++) tiles[j * MAP_W + 40] = T.PATH;
  for (let j = 18; j < 24; j++) tiles[j * MAP_W + 19] = T.PATH;
  for (let i = 14; i < 20; i++) tiles[23 * MAP_W + i] = T.PATH;
  for (let i = 36; i < 40; i++) tiles[35 * MAP_W + i] = T.PATH;

  stampRect(tiles, 90, 68, 5, 2, T.ROOF2);
  stampRect(tiles, 90, 70, 5, 3, T.WALL);
  tiles[72 * MAP_W + 92] = T.DOOR;
  for (let j = 73; j < 80; j++) tiles[j * MAP_W + 92] = T.PATH;
  for (let i = 86; i < 100; i++) tiles[78 * MAP_W + i] = T.PATH;

  for (let i = 12; i < 19; i++) tiles[43 * MAP_W + i] = T.FENCE;

  stampRect(tiles, 28, 38, 1, 1, T.FLOWER);
  stampRect(tiles, 24, 26, 1, 1, T.FLOWER);
  stampRect(tiles, 44, 54, 1, 1, T.FLOWER);
  stampRect(tiles, 30, 52, 1, 1, T.FLOWER);

  stampRect(tiles, 24, 48, 10, 8, T.TGRASS);
  stampRect(tiles, 40, 50, 12, 10, T.TGRASS);
  stampRect(tiles, 28, 60, 14, 10, T.TGRASS);
  stampRect(tiles, 12, 50, 8, 12, T.TGRASS);

  stampRect(tiles, 44, 34, 1, 1, T.ROCK);
  stampRect(tiles, 50, 58, 1, 1, T.ROCK);
  stampRect(tiles, 36, 62, 1, 1, T.ROCK);

  tiles[43 * MAP_W + 20] = T.SIGN;
  tiles[70 * MAP_W + 68] = T.SIGN;
  tiles[24 * MAP_W + 18] = T.SIGN;

  return tiles;
}

const WORLD_TILES = buildWorldTiles();

function solidAt(x: number, y: number): boolean {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return SOLID.has(WORLD_TILES[ty * MAP_W + tx]!);
}

export function canWalk(x: number, y: number): boolean {
  const r = 5;
  return (
    !solidAt(x - r, y) &&
    !solidAt(x + r, y) &&
    !solidAt(x, y - r) &&
    !solidAt(x, y + r) &&
    !solidAt(x - r, y - 2) &&
    !solidAt(x + r, y - 2)
  );
}

interface ClassRule {
  hp: number;
  ki: number;
  atk: number;
  def: number;
  spd: number;
  growth: {
    hp: number;
    ki: number;
    atk: number;
    def: number;
    spd: number;
  };
}

const CLASS_RULES: Record<string, ClassRule> = {
  saiya: {
    hp: 120,
    ki: 40,
    atk: 22,
    def: 14,
    spd: 10,
    growth: { hp: 18, ki: 7, atk: 3.4, def: 2.2, spd: 1.4 },
  },
  humano: {
    hp: 100,
    ki: 45,
    atk: 18,
    def: 12,
    spd: 15,
    growth: { hp: 14, ki: 8, atk: 2.8, def: 2.0, spd: 2.2 },
  },
  nameko: {
    hp: 110,
    ki: 55,
    atk: 17,
    def: 17,
    spd: 9,
    growth: { hp: 16, ki: 10, atk: 2.6, def: 2.8, spd: 1.1 },
  },
  lutadora: {
    hp: 95,
    ki: 50,
    atk: 19,
    def: 11,
    spd: 14,
    growth: { hp: 13, ki: 9, atk: 3.0, def: 1.8, spd: 2.0 },
  },
};

const GEAR_RULES: Record<string, { atk?: number; def?: number }> = {
  bastao: { atk: 12 },
  armadura: { def: 10 },
  espada: { atk: 30 },
  manto: { def: 25 },
  scouter: {},
};

export interface CharacterCombatInput {
  classId: string;
  level: number;
  baseAtk?: number;
  baseDef?: number;
  gearOwned?: string[];
}

export interface CharacterStats {
  maxHp: number;
  maxKi: number;
  attack: number;
  defense: number;
  speed: number;
}

export function computeCharacterStats(
  input: CharacterCombatInput,
): CharacterStats {
  const cls = CLASS_RULES[input.classId] ?? CLASS_RULES.saiya!;
  const level = Math.max(1, Math.floor(input.level || 1));
  let attack =
    Math.floor(cls.atk + cls.growth.atk * (level - 1)) +
    Number(input.baseAtk || 0);
  let defense =
    Math.floor(cls.def + cls.growth.def * (level - 1)) +
    Number(input.baseDef || 0);

  for (const id of input.gearOwned || []) {
    attack += GEAR_RULES[id]?.atk || 0;
    defense += GEAR_RULES[id]?.def || 0;
  }

  return {
    maxHp: Math.floor(cls.hp + cls.growth.hp * (level - 1)),
    maxKi: Math.floor(cls.ki + cls.growth.ki * (level - 1)),
    attack,
    defense,
    speed: Math.floor(cls.spd + cls.growth.spd * (level - 1)),
  };
}

export interface EnemyRule {
  id: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  ki: number;
  exp: number;
  zeni: number;
  boss?: boolean;
  drop?: { id: string; chance: number };
}

export const ENEMY_RULES: Record<string, EnemyRule> = {
  saiba: {
    id: "saiba",
    hp: 55,
    atk: 16,
    def: 6,
    spd: 10,
    ki: 10,
    exp: 22,
    zeni: 18,
    drop: { id: "sensu", chance: 0.15 },
  },
  lobo: {
    id: "lobo",
    hp: 70,
    atk: 19,
    def: 8,
    spd: 14,
    ki: 0,
    exp: 30,
    zeni: 22,
    drop: { id: "sensu", chance: 0.1 },
  },
  dino: {
    id: "dino",
    hp: 120,
    atk: 24,
    def: 12,
    spd: 6,
    ki: 0,
    exp: 48,
    zeni: 40,
    drop: { id: "capsula", chance: 0.12 },
  },
  soldado: {
    id: "soldado",
    hp: 150,
    atk: 30,
    def: 16,
    spd: 12,
    ki: 30,
    exp: 75,
    zeni: 70,
    drop: { id: "capsula", chance: 0.2 },
  },
  radix: {
    id: "radix",
    hp: 420,
    atk: 42,
    def: 22,
    spd: 14,
    ki: 60,
    exp: 400,
    zeni: 500,
    boss: true,
    drop: { id: "sensu", chance: 1 },
  },
  nappos: {
    id: "nappos",
    hp: 700,
    atk: 55,
    def: 30,
    spd: 10,
    ki: 80,
    exp: 800,
    zeni: 900,
    boss: true,
    drop: { id: "capsula", chance: 1 },
  },
  vegar: {
    id: "vegar",
    hp: 1100,
    atk: 70,
    def: 38,
    spd: 18,
    ki: 120,
    exp: 2000,
    zeni: 2500,
    boss: true,
    drop: { id: "sensu", chance: 1 },
  },
};

export interface MobSpawnDefinition {
  spawnId: string;
  enemyId: string;
  x: number;
  y: number;
  isBoss: boolean;
}

const COMMON_SPAWNS: Array<[string, number, number]> = [
  ["saiba", 27, 51],
  ["saiba", 31, 55],
  ["saiba", 44, 53],
  ["saiba", 29, 63],
  ["saiba", 48, 57],
  ["lobo", 18, 52],
  ["lobo", 24, 58],
  ["lobo", 34, 64],
  ["lobo", 88, 70],
  ["lobo", 92, 78],
  ["dino", 43, 61],
  ["dino", 15, 48],
  ["soldado", 58, 28],
  ["soldado", 62, 34],
  ["soldado", 66, 26],
  ["soldado", 60, 38],
];

export const MOB_SPAWNS: MobSpawnDefinition[] = [
  ...COMMON_SPAWNS.map(([enemyId, x, y], index) => ({
    spawnId: `mob-${index + 1}`,
    enemyId,
    x: x * TILE_SIZE,
    y: y * TILE_SIZE,
    isBoss: false,
  })),
  {
    spawnId: "boss-radix",
    enemyId: "radix",
    x: 40 * TILE_SIZE,
    y: 13 * TILE_SIZE,
    isBoss: true,
  },
  {
    spawnId: "boss-nappos",
    enemyId: "nappos",
    x: 19 * TILE_SIZE,
    y: 16 * TILE_SIZE,
    isBoss: true,
  },
  {
    spawnId: "boss-vegar",
    enemyId: "vegar",
    x: 63 * TILE_SIZE,
    y: 30 * TILE_SIZE,
    isBoss: true,
  },
];

export function expForLevel(level: number): number {
  return Math.floor(level * level * 25 + level * 25);
}

export function minimumBattleDurationMs(
  enemy: EnemyRule,
  stats: CharacterStats,
): number {
  const estimatedHit = Math.max(
    1,
    stats.attack * 0.95 - enemy.def * 0.5,
  );
  const hits = Math.max(1, Math.ceil(enemy.hp / estimatedHit));
  return Math.max(1800, Math.min(12000, hits * 450));
}
