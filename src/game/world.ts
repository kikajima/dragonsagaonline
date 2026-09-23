// Tile textures (procedurally drawn 16x16, SNES palette) + world map generator
import type { Pal } from './pixel';

export const T = {
  WATER: 0, WATER2: 1, SAND: 2, GRASS: 3, TGRASS: 4, TREE: 5, MOUNT: 6,
  ROAD: 7, WALL: 8, ROOF: 9, DOOR: 10, WINDOW: 11, FENCE: 12, FLOWER: 13,
  CRATER: 14, BRIDGE: 15, DESERT: 16, CACTUS: 17, SIGN: 18, ROOF2: 19,
  FOUNTAIN: 20, SPRING: 21, TOWER: 22, ROCK: 23, PATH: 24,
} as const;

export const SOLID = new Set<number>([T.WATER, T.WATER2, T.MOUNT, T.TREE, T.WALL, T.ROOF, T.ROOF2, T.WINDOW, T.FENCE, T.CACTUS, T.TOWER, T.ROCK, T.FOUNTAIN]);
export const WALK_SLOW = new Set<number>([T.TGRASS, T.CRATER]);

export const MAP_W = 110;
export const MAP_H = 90;

const tileCache = new Map<number, HTMLCanvasElement>();

function mk(fn: (g: CanvasRenderingContext2D, seed: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  fn(g, 0);
  return c;
}

function dots(g: CanvasRenderingContext2D, color: string, n: number, seed: number) {
  g.fillStyle = color;
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const x = Math.floor((s / 233280) * 16);
    s = (s * 9301 + 49297) % 233280;
    const y = Math.floor((s / 233280) * 16);
    g.fillRect(x, y, 1, 1);
  }
}

export function getTile(id: number, frame = 0): HTMLCanvasElement {
  const key = id * 10 + frame;
  const c = tileCache.get(key);
  if (c) return c;
  let t: HTMLCanvasElement;
  switch (id) {
    case T.WATER:
    case T.WATER2:
      t = mk((g) => {
        g.fillStyle = frame === 0 ? '#2868c8' : '#3080d8';
        g.fillRect(0, 0, 16, 16);
        dots(g, frame === 0 ? '#3890e0' : '#48a8f0', 6, id + 7);
        dots(g, '#1c50a0', 4, id + 31);
      });
      break;
    case T.SAND:
      t = mk((g) => {
        g.fillStyle = '#e8d090';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#d0b070', 8, 11);
      });
      break;
    case T.DESERT:
      t = mk((g) => {
        g.fillStyle = '#e0c080';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#c8a060', 10, 23);
      });
      break;
    case T.GRASS:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#68c858', 7, 3);
        dots(g, '#489838', 5, 17);
      });
      break;
    case T.TGRASS:
      t = mk((g) => {
        g.fillStyle = '#3d9038';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#2d7828';
        for (let i = 0; i < 5; i++) {
          const x = 2 + ((i * 7 + 3) % 12);
          const y = 2 + ((i * 5 + 2) % 11);
          g.fillRect(x, y, 2, 3);
          g.fillRect(x + 1, y - 1, 1, 2);
        }
        dots(g, '#68c858', 4, 41);
      });
      break;
    case T.FLOWER:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#68c858', 5, 9);
        g.fillStyle = '#f0d040';
        g.fillRect(4, 4, 2, 2);
        g.fillStyle = '#f05878';
        g.fillRect(11, 9, 2, 2);
      });
      break;
    case T.TREE:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#185028';
        g.fillRect(6, 12, 4, 4);
        g.fillStyle = '#288838';
        g.fillRect(2, 2, 12, 11);
        g.fillStyle = '#38a848';
        g.fillRect(3, 1, 10, 6);
        g.fillStyle = '#48c058';
        g.fillRect(4, 0, 7, 3);
        dots(g, '#186028', 5, 13);
      });
      break;
    case T.MOUNT:
      t = mk((g) => {
        g.fillStyle = '#889098';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#a8b0b8';
        g.beginPath();
        g.moveTo(0, 16); g.lineTo(7, 2); g.lineTo(12, 16);
        g.fill();
        g.fillStyle = '#f0f0f8';
        g.beginPath();
        g.moveTo(5, 5); g.lineTo(7, 2); g.lineTo(9, 5);
        g.fill();
        g.fillStyle = '#687078';
        g.fillRect(12, 10, 4, 6);
        dots(g, '#788088', 5, 29);
      });
      break;
    case T.ROCK:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#888890';
        g.beginPath();
        g.ellipse(8, 10, 6, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#a8a8b0';
        g.fillRect(5, 6, 4, 3);
      });
      break;
    case T.ROAD:
      t = mk((g) => {
        g.fillStyle = '#d8b878';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#c0a060', 8, 19);
      });
      break;
    case T.PATH:
      t = mk((g) => {
        g.fillStyle = '#c8a868';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#b09850', 6, 37);
      });
      break;
    case T.WALL:
      t = mk((g) => {
        g.fillStyle = '#e8e0d0';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#c8bca8';
        for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1);
        g.fillRect(7, 0, 1, 4); g.fillRect(3, 4, 1, 4); g.fillRect(11, 8, 1, 4);
      });
      break;
    case T.ROOF:
      t = mk((g) => {
        g.fillStyle = '#d84838';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#b83828';
        for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1);
        g.fillStyle = '#f06858';
        g.fillRect(0, 0, 16, 2);
      });
      break;
    case T.ROOF2:
      t = mk((g) => {
        g.fillStyle = '#4878c8';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#3858a8';
        for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1);
        g.fillStyle = '#6898e8';
        g.fillRect(0, 0, 16, 2);
      });
      break;
    case T.DOOR:
      t = mk((g) => {
        g.fillStyle = '#e8e0d0';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#885828';
        g.fillRect(4, 2, 8, 14);
        g.fillStyle = '#f0d040';
        g.fillRect(10, 9, 2, 2);
      });
      break;
    case T.WINDOW:
      t = mk((g) => {
        g.fillStyle = '#e8e0d0';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#58a8e0';
        g.fillRect(3, 4, 10, 8);
        g.fillStyle = '#88c8f0';
        g.fillRect(4, 5, 4, 3);
        g.fillStyle = '#885828';
        g.fillRect(7, 4, 2, 8);
      });
      break;
    case T.FENCE:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#a87848';
        g.fillRect(1, 4, 2, 12);
        g.fillRect(13, 4, 2, 12);
        g.fillRect(0, 7, 16, 2);
      });
      break;
    case T.CACTUS:
      t = mk((g) => {
        g.fillStyle = '#e0c080';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#c8a060', 6, 43);
        g.fillStyle = '#387848';
        g.fillRect(6, 3, 4, 13);
        g.fillRect(2, 6, 4, 3);
        g.fillRect(10, 8, 4, 3);
        dots(g, '#58a868', 3, 51);
      });
      break;
    case T.CRATER:
      t = mk((g) => {
        g.fillStyle = '#685848';
        g.fillRect(0, 0, 16, 16);
        dots(g, '#887860', 8, 61);
        dots(g, '#483828', 6, 67);
        g.fillStyle = '#e06030';
        g.fillRect(7, 11, 2, 2);
      });
      break;
    case T.BRIDGE:
      t = mk((g) => {
        g.fillStyle = '#a87848';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#885828';
        for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1);
        g.fillStyle = '#c09058';
        g.fillRect(0, 1, 16, 3);
      });
      break;
    case T.SIGN:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#a87848';
        g.fillRect(7, 8, 2, 8);
        g.fillStyle = '#c8a068';
        g.fillRect(2, 2, 12, 7);
        g.fillStyle = '#684828';
        g.fillRect(4, 4, 8, 1);
        g.fillRect(4, 6, 6, 1);
      });
      break;
    case T.FOUNTAIN:
      t = mk((g) => {
        g.fillStyle = '#c8a868';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#888890';
        g.fillRect(2, 2, 12, 12);
        g.fillStyle = '#3890e0';
        g.fillRect(4, 4, 8, 8);
        g.fillStyle = '#88d8f8';
        g.fillRect(7, 3, 2, 6);
        dots(g, '#88d8f8', 3, 71);
      });
      break;
    case T.SPRING:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#3890e0';
        g.fillRect(2, 4, 12, 10);
        g.fillStyle = '#a8e8f8';
        g.fillRect(4, 6, 4, 2);
        g.fillRect(9, 10, 4, 2);
      });
      break;
    case T.TOWER:
      t = mk((g) => {
        g.fillStyle = '#e8e0d0';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#c8bca8';
        g.fillRect(0, 5, 16, 1);
        g.fillRect(0, 11, 16, 1);
        g.fillStyle = '#58a8e0';
        g.fillRect(6, 6, 4, 4);
      });
      break;
    default:
      t = mk((g) => {
        g.fillStyle = '#58b048';
        g.fillRect(0, 0, 16, 16);
      });
  }
  tileCache.set(key, t);
  return t;
}

// ---------- World map ----------
export interface WorldMap {
  tiles: Uint8Array;
  w: number;
  h: number;
}

function stampRect(m: WorldMap, x: number, y: number, w: number, h: number, t: number) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      if (i >= 0 && j >= 0 && i < m.w && j < m.h) m.tiles[j * m.w + i] = t;
}

function stampOutlineRect(m: WorldMap, x: number, y: number, w: number, h: number, t: number) {
  for (let i = x; i < x + w; i++) {
    if (i >= 0 && i < m.w) {
      if (y >= 0 && y < m.h) m.tiles[y * m.w + i] = t;
      if (y + h - 1 >= 0 && y + h - 1 < m.h) m.tiles[(y + h - 1) * m.w + i] = t;
    }
  }
  for (let j = y; j < y + h; j++) {
    if (j >= 0 && j < m.h) {
      if (x >= 0 && x < m.w) m.tiles[j * m.w + x] = t;
      if (x + w - 1 >= 0 && x + w - 1 < m.w) m.tiles[j * m.w + x + w - 1] = t;
    }
  }
}

let worldCache: WorldMap | null = null;

export function buildWorld(): WorldMap {
  if (worldCache) return worldCache;
  const m: WorldMap = { tiles: new Uint8Array(MAP_W * MAP_H), w: MAP_W, h: MAP_H };
  // Ocean everywhere
  m.tiles.fill(T.WATER);
  // Main continent (center-left)
  stampRect(m, 8, 6, 62, 76, T.GRASS);
  // Beaches south-east
  stampRect(m, 46, 60, 24, 22, T.DESERT);
  stampRect(m, 42, 56, 10, 4, T.GRASS);
  // Island (SE, master's island)
  stampRect(m, 84, 62, 20, 20, T.GRASS);
  stampRect(m, 86, 60, 16, 2, T.SAND);
  stampRect(m, 86, 82, 16, 2, T.SAND);
  stampRect(m, 82, 64, 2, 16, T.SAND);
  stampRect(m, 104, 64, 2, 16, T.SAND);
  // Bridge from desert to island
  stampRect(m, 70, 70, 14, 2, T.BRIDGE);
  // Mountains north
  for (let i = 0; i < 58; i++) {
    const x = 10 + i;
    const depth = 3 + Math.floor(3 * Math.abs(Math.sin(i * 0.7))) ;
    for (let j = 0; j < depth; j++) m.tiles[(6 + j) * m.w + x] = T.MOUNT;
  }
  // Mountain pass (gap) where Radix waits
  stampRect(m, 38, 6, 4, 9, T.PATH);
  // Volcano crater NW
  stampRect(m, 14, 12, 10, 8, T.CRATER);
  stampOutlineRect(m, 14, 12, 10, 8, T.ROCK);
  stampRect(m, 18, 19, 2, 1, T.PATH); // gap in south rim
  stampRect(m, 18, 20, 2, 3, T.PATH);
  // Desert east
  stampRect(m, 54, 22, 16, 18, T.DESERT);
  // Cacti
  stampRect(m, 58, 26, 1, 1, T.CACTUS);
  stampRect(m, 64, 32, 1, 1, T.CACTUS);
  stampRect(m, 61, 24, 1, 1, T.CACTUS);
  // Forests
  const forestSpots = [[16, 30], [16, 36], [20, 44], [26, 50], [12, 46], [30, 16], [34, 44], [50, 46], [56, 52], [22, 56], [46, 20], [36, 26]];
  for (const [fx, fy] of forestSpots) {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      if ((i + j) % 2 === 0) m.tiles[(fy + j) * m.w + fx + i] = T.TREE;
    }
  }
  // Lake center
  stampRect(m, 26, 38, 8, 5, T.WATER);
  stampRect(m, 25, 39, 1, 3, T.WATER);
  stampRect(m, 34, 39, 1, 3, T.WATER);
  // Korin tower (center-north)
  stampRect(m, 34, 32, 2, 2, T.TOWER);
  stampRect(m, 32, 34, 6, 2, T.SPRING);
  // Town (top-left region)
  stampRect(m, 12, 24, 24, 18, T.GRASS);
  // Houses: walls+roofs+doors
  function house(x: number, y: number, roof = T.ROOF) {
    stampRect(m, x, y, 5, 2, roof);
    stampRect(m, x, y + 2, 5, 3, T.WALL);
    m.tiles[(y + 4) * m.w + x + 2] = T.DOOR;
    m.tiles[(y + 3) * m.w + x + 1] = T.WINDOW;
    m.tiles[(y + 3) * m.w + x + 3] = T.WINDOW;
  }
  house(14, 25, T.ROOF);
  house(22, 25, T.ROOF2);
  house(14, 33);
  house(24, 33, T.ROOF2);
  house(30, 27, T.ROOF); // shop
  // Roads in town
  for (let i = 12; i < 36; i++) m.tiles[30 * m.w + i] = T.ROAD;
  for (let j = 24; j < 42; j++) m.tiles[j * m.w + 19] = T.ROAD;
  m.tiles[30 * m.w + 19] = T.FOUNTAIN;
  // Town gate to south
  for (let j = 42; j < 48; j++) m.tiles[j * m.w + 19] = T.ROAD;
  // Path town->desert->bridge
  for (let i = 36; i < 54; i++) m.tiles[46 * m.w + i] = T.PATH;
  for (let j = 46; j < 71; j++) m.tiles[j * m.w + 69] = j < 70 ? T.PATH : T.PATH;
  for (let i = 55; i < 70; i++) m.tiles[70 * m.w + i] = T.PATH;
  for (let j = 47; j < 71; j++) m.tiles[j * m.w + 55] = T.PATH;
  // Path to mountain pass
  for (let j = 15; j < 31; j++) m.tiles[j * m.w + 40] = T.PATH;
  // Path to crater
  for (let j = 18; j < 24; j++) m.tiles[j * m.w + 19] = T.PATH;
  for (let i = 14; i < 20; i++) m.tiles[23 * m.w + i] = T.PATH;
  // Path to tower
  for (let i = 36; i < 40; i++) m.tiles[35 * m.w + i] = T.PATH;
  // Master island house
  stampRect(m, 90, 68, 5, 2, T.ROOF2);
  stampRect(m, 90, 70, 5, 3, T.WALL);
  m.tiles[72 * m.w + 92] = T.DOOR;
  // Paths on island
  for (let j = 73; j < 80; j++) m.tiles[j * m.w + 92] = T.PATH;
  for (let i = 86; i < 100; i++) m.tiles[78 * m.w + i] = T.PATH;
  // Fences around town fields
  for (let i = 12; i < 19; i++) m.tiles[43 * m.w + i] = T.FENCE;
  // Flowers deco
  stampRect(m, 28, 38, 1, 1, T.FLOWER);
  stampRect(m, 24, 26, 1, 1, T.FLOWER);
  stampRect(m, 44, 54, 1, 1, T.FLOWER);
  stampRect(m, 30, 52, 1, 1, T.FLOWER);
  // Tall grass patches (plains)
  stampRect(m, 24, 48, 10, 8, T.TGRASS);
  stampRect(m, 40, 50, 12, 10, T.TGRASS);
  stampRect(m, 28, 60, 14, 10, T.TGRASS);
  stampRect(m, 12, 50, 8, 12, T.TGRASS);
  // Rocks deco
  stampRect(m, 44, 34, 1, 1, T.ROCK);
  stampRect(m, 50, 58, 1, 1, T.ROCK);
  stampRect(m, 36, 62, 1, 1, T.ROCK);
  // Signs
  m.tiles[43 * m.w + 20] = T.SIGN;
  m.tiles[70 * m.w + 68] = T.SIGN;
  m.tiles[24 * m.w + 18] = T.SIGN;

  worldCache = m;
  return m;
}

export function tileAt(m: WorldMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return T.WATER;
  return m.tiles[y * m.w + x];
}

// Map tile -> minimap color
export const MINI_COLORS: Record<number, string> = {
  [T.WATER]: '#2868c8', [T.WATER2]: '#2868c8', [T.SAND]: '#e8d090', [T.GRASS]: '#58b048',
  [T.TGRASS]: '#3d9038', [T.TREE]: '#186028', [T.MOUNT]: '#889098', [T.ROAD]: '#d8b878',
  [T.WALL]: '#e8e0d0', [T.ROOF]: '#d84838', [T.DOOR]: '#885828', [T.WINDOW]: '#58a8e0',
  [T.FENCE]: '#a87848', [T.FLOWER]: '#58b048', [T.CRATER]: '#685848', [T.BRIDGE]: '#a87848',
  [T.DESERT]: '#e0c080', [T.CACTUS]: '#387848', [T.SIGN]: '#c8a068', [T.ROOF2]: '#4878c8',
  [T.FOUNTAIN]: '#3890e0', [T.SPRING]: '#3890e0', [T.TOWER]: '#e8e0d0', [T.ROCK]: '#888890',
  [T.PATH]: '#c8a868',
};

// Regions for encounter tables (by tile at position)
export function regionAt(m: WorldMap, x: number, y: number): string {
  const t = tileAt(m, x, y);
  if (t === T.DESERT) return 'deserto';
  if (t === T.CRATER) return 'cratera';
  if (t === T.SAND) return 'ilha';
  if (t === T.TGRASS) return 'planicie';
  if (t === T.ROAD || t === T.PATH || t === T.BRIDGE) return 'estrada';
  return 'campo';
}
