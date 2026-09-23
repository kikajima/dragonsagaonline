// SNES-style chibi overworld sprites: 12x16 body templates + hair overlays + palettes
import { buildSprite, mirror, type Pal } from './pixel';

// ---------- Base body templates (12 wide x 16 tall) ----------

const BODY_DOWN_A = [
  '............',
  '............',
  '............',
  '............',
  '..SSSSSSSS..',
  '..SESSSSES..',
  '..SSSMMSSS..',
  '...SSSSSS...',
  '..GGGGGGGG..',
  '.GGGGGGGGGG.',
  '.GGGGGGGGGG.',
  '.SBBBBBBBBS.',
  '..GGGGGGGG..',
  '..PPPPPPPP..',
  '..PPP..PPP..',
  '..BBB..BBB..',
];
const BODY_DOWN_B = [
  '............',
  '............',
  '............',
  '............',
  '..SSSSSSSS..',
  '..SESSSSES..',
  '..SSSMMSSS..',
  '...SSSSSS...',
  '..GGGGGGGG..',
  '.GGGGGGGGGG.',
  '.GGGGGGGGGG.',
  '.SBBBBBBBBS.',
  '..GGGGGGGG..',
  '..PPPPPPPP..',
  '.PPP....PPP.',
  '.BBB....BBB.',
];

const BODY_UP_A = [
  '............',
  '............',
  '............',
  '............',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '...SSSSSS...',
  '..GGGGGGGG..',
  '.GGGGGGGGGG.',
  '.GGGGGGGGGG.',
  '.SBBBBBBBBS.',
  '..GGGGGGGG..',
  '..PPPPPPPP..',
  '..PPP..PPP..',
  '..BBB..BBB..',
];
const BODY_UP_B = [
  '............',
  '............',
  '............',
  '............',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '..SSSSSSSS..',
  '...SSSSSS...',
  '..GGGGGGGG..',
  '.GGGGGGGGGG.',
  '.GGGGGGGGGG.',
  '.SBBBBBBBBS.',
  '..GGGGGGGG..',
  '..PPPPPPPP..',
  '.PPP....PPP.',
  '.BBB....BBB.',
];

const BODY_SIDE_A = [
  '............',
  '............',
  '............',
  '............',
  '...SSSSSS...',
  '...SSSESS...',
  '...SSSSSSS..',
  '....SSSS....',
  '...GGGGGG...',
  '...GGGGGG...',
  '...GGGGGG...',
  '...GBBBBG...',
  '...GGGGGG...',
  '...PPPPPP...',
  '..PPP...PPP.',
  '..BBB...BBB.',
];
const BODY_SIDE_B = [
  '............',
  '............',
  '............',
  '............',
  '...SSSSSS...',
  '...SSSESS...',
  '...SSSSSSS..',
  '....SSSS....',
  '...GGGGGG...',
  '...GGGGGG...',
  '...GGGGGG...',
  '...GBBBBG...',
  '...GGGGGG...',
  '...PPPPPP...',
  '....PPPP....',
  '....BBBB....',
];

// ---------- Hair overlays ----------

const HAIR_SPIKY_DN = [
  '..H..HH..H..',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHH....HHH.',
];
const HAIR_SPIKY_UP = [
  '..H.HHH.H...',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '..HHHHHHHH..',
  '..HHHHHH....',
];
const HAIR_SPIKY_SIDE = [
  '..HH.HH.....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHH..',
  '.HHH........',
  '.HH.........',
];

const HAIR_FLAME_DN = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHH..HHHH.',
];
const HAIR_FLAME_UP = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '..HHHHHHHH..',
  '..HHHHHH....',
];
const HAIR_FLAME_SIDE = [
  '.....HHH....',
  '....HHHHH...',
  '..HHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHH..',
  '.HHH........',
  '.HH.........',
];

const HAIR_PONY_DN = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HH......HH.',
];
const HAIR_PONY_UP = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '...HHHHHH...',
  '...HHHH.....',
  '...HHH......',
];
const HAIR_PONY_SIDE = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHH..',
  '.HH.........',
  '.HHH........',
  '..HH........',
];

const HAIR_BAND_DN = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '....HH......',
];
const HAIR_BAND_UP = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '..HHHHHHHH..',
  '..HHHHHH....',
];
const HAIR_BAND_SIDE = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHHHHHHHHH.',
  '.HHHHHHHHH..',
  '.HH.........',
  '.HH.........',
];

// Antennae for green warriors (skin drawn green via palette)
const ANT_DN = [
  '....A..A....',
  '....A..A....',
];
const ANT_UP = [
  '....A..A....',
  '....A..A....',
];
const ANT_SIDE = [
  '......A.....',
  '......A.....',
];

// Beard overlay (old master)
const BEARD_DN = [
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '..WWWWMWWW..',
  '..WWWWWWWW..',
];

// ---------- Palettes ----------

const SKIN: Pal = { S: '#f0c090', M: '#b07040', E: '#181828' };
const GREENSKIN: Pal = { S: '#78c860', M: '#3d7a30', E: '#b02020' };

export interface CharStyle {
  key: string;
  name: string;
  body: Pal; // includes G,B,P + skin
  hair: string; // hair color
  hairStyle: 'spiky' | 'flame' | 'pony' | 'band' | 'bald' | 'ant' | 'band_beard';
  superHair?: string;
}

export const CHAR_STYLES: Record<string, CharStyle> = {
  saiya: {
    key: 'saiya',
    name: 'Saiya',
    body: { ...SKIN, G: '#f07830', B: '#3058c8', P: '#f07830' },
    hair: '#20202e',
    hairStyle: 'spiky',
    superHair: '#f8d030',
  },
  humano: {
    key: 'humano',
    name: 'Humano',
    body: { ...SKIN, G: '#3878c8', B: '#e8e8f0', P: '#e8e8f0' },
    hair: '#28283a',
    hairStyle: 'band',
  },
  nameko: {
    key: 'nameko',
    name: 'Nameko',
    body: { ...GREENSKIN, G: '#8848c8', B: '#e8e8f0', P: '#8848c8' },
    hair: '#78c860',
    hairStyle: 'ant',
  },
  lutadora: {
    key: 'lutadora',
    name: 'Lutadora',
    body: { ...SKIN, G: '#f0c030', B: '#e85890', P: '#3058c8' },
    hair: '#583820',
    hairStyle: 'pony',
  },
  mestre: {
    key: 'mestre',
    name: 'Mestre',
    body: { ...SKIN, G: '#c84858', B: '#f0c030', P: '#c84858' },
    hair: '#f0f0e8',
    hairStyle: 'band_beard',
  },
  lojista: {
    key: 'lojista',
    name: 'Lojista',
    body: { ...SKIN, G: '#e85890', B: '#f0f0e8', P: '#684838' },
    hair: '#2848c8',
    hairStyle: 'pony',
  },
  aldeao: {
    key: 'aldeao',
    name: 'Aldeão',
    body: { ...SKIN, G: '#88a048', B: '#684838', P: '#684838' },
    hair: '#403020',
    hairStyle: 'band',
  },
  guarda: {
    key: 'guarda',
    name: 'Guarda',
    body: { ...SKIN, G: '#708090', B: '#384858', P: '#384858' },
    hair: '#484858',
    hairStyle: 'band',
  },
  rival: {
    key: 'rival',
    name: 'Rival',
    body: { ...SKIN, G: '#e8e8f0', B: '#f0c030', P: '#3058c8' },
    hair: '#f0c030',
    hairStyle: 'flame',
    superHair: '#f8d030',
  },
};

function hairOverlay(style: CharStyle, dir: 'dn' | 'up' | 'side'): string[] {
  const s = style.hairStyle;
  if (s === 'spiky') return dir === 'dn' ? HAIR_SPIKY_DN : dir === 'up' ? HAIR_SPIKY_UP : HAIR_SPIKY_SIDE;
  if (s === 'flame') return dir === 'dn' ? HAIR_FLAME_DN : dir === 'up' ? HAIR_FLAME_UP : HAIR_FLAME_SIDE;
  if (s === 'pony') return dir === 'dn' ? HAIR_PONY_DN : dir === 'up' ? HAIR_PONY_UP : HAIR_PONY_SIDE;
  if (s === 'band') return dir === 'dn' ? HAIR_BAND_DN : dir === 'up' ? HAIR_BAND_UP : HAIR_BAND_SIDE;
  if (s === 'band_beard') return dir === 'dn' ? BEARD_DN : dir === 'up' ? HAIR_BAND_UP : HAIR_BAND_SIDE;
  if (s === 'ant') return dir === 'dn' ? ANT_DN : dir === 'up' ? ANT_UP : ANT_SIDE;
  return []; // bald
}

// Compose body + hair overlay rows (hair on top)
function compose(body: string[], overlay: string[], oy: number): string[] {
  const rows = body.map((r) => r.split(''));
  overlay.forEach((orow, i) => {
    const y = oy + i;
    if (y < 0 || y >= rows.length) return;
    for (let x = 0; x < orow.length; x++) {
      if (orow[x] !== '.') rows[y][x] = orow[x];
    }
  });
  return rows.map((r) => r.join(''));
}

export interface CharFrames {
  down: HTMLCanvasElement[];
  up: HTMLCanvasElement[];
  right: HTMLCanvasElement[];
  left: HTMLCanvasElement[];
  gold: HTMLCanvasElement[]; // super form variants (down only used in battle dash)
  scale: number;
}

const frameCache = new Map<string, CharFrames>();

export function getCharFrames(styleKey: string, hairColor?: string, scale = 3): CharFrames {
  const ck = `${styleKey}|${hairColor || ''}|${scale}`;
  const cached = frameCache.get(ck);
  if (cached) return cached;
  const style = CHAR_STYLES[styleKey] || CHAR_STYLES.saiya;
  const hairC = hairColor || style.hair;
  const pal: Pal = { ...style.body, H: hairC, A: '#3d7a30', W: style.hairStyle === 'band_beard' ? '#f0f0e8' : hairC };

  function frames(overlayColor: string): { d: HTMLCanvasElement[]; u: HTMLCanvasElement[]; s: HTMLCanvasElement[] } {
    const p = { ...pal, H: overlayColor };
    const hov = (dir: 'dn' | 'up' | 'side') => hairOverlay(style, dir);
    const d = [compose(BODY_DOWN_A, hov('dn'), 0), compose(BODY_DOWN_B, hov('dn'), 0)];
    const u = [compose(BODY_UP_A, hov('up'), 0), compose(BODY_UP_B, hov('up'), 0)];
    const s = [compose(BODY_SIDE_A, hov('side'), 0), compose(BODY_SIDE_B, hov('side'), 0)];
    return {
      d: d.map((r) => buildSprite(r, p, scale)),
      u: u.map((r) => buildSprite(r, p, scale)),
      s: s.map((r) => buildSprite(r, p, scale)),
    };
  }

  const base = frames(hairC);
  const goldSet = style.superHair ? frames(style.superHair) : null;

  const out: CharFrames = {
    down: base.d,
    up: base.u,
    right: base.s,
    left: base.s.map(mirror),
    gold: goldSet
      ? [...goldSet.d, ...goldSet.u, ...goldSet.s]
      : [...base.d, ...base.u, ...base.s],
    scale,
  };
  frameCache.set(ck, out);
  return out;
}

// ---------- Battle stance sprites (20x30, SNES fighting pose, facing viewer 3/4) ----------

const FIGHT_BODY = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '.....SSSSSSSSSS.....',
  '.....SSSSSSSSSS.....',
  '.....SESSSSSSES.....',
  '.SSS.SSSSSSSSSS.SSS.',
  '.SSS.SSSSSSSSSS.SSS.',
  '.SSS..SSSMMSSS..SSS.',
  '..S...SSSSSSSS...S..',
  '..GG.GGGGGGGGGG.GG..',
  '...S.GGGGGGGGGG.S...',
  '.....GGGGGGGGGG.....',
  '....GGGGGGGGGGGG....',
  '....GGGBBBBBBGGG....',
  '....GGGGGGGGGGGG....',
  '....BBBBBBBBBBBB....',
  '.....PPPPPPPPPP.....',
  '.....PPPPPPPPPP.....',
  '.....PPPP..PPPP.....',
  '.....PPPP..PPPP.....',
  '.....PPPP..PPPP.....',
  '.....PPPP..PPPP.....',
  '.....BBBB..BBBB.....',
  '.....BBBB..BBBB.....',
  '....BBBBB..BBBBB....',
  '....................',
  '....................',
];

const FIGHT_HAIR: Record<string, string[]> = {
  spiky: [
    '....................',
    '...H....H...H.......',
    '..HHH..HHH.HHH......',
    '..HHHHHHHHHHHHH.....',
    '.HHHHHHHHHHHHHHH....',
    '.HHHHHHHHHHHHHHH....',
    '.HHH.........HHH....',
  ],
  flame: [
    '....................',
    '.....HHHHHH.........',
    '....HHHHHHHH........',
    '...HHHHHHHHHH.......',
    '..HHHHHHHHHHHH......',
    '..HHHHHHHHHHHHH.....',
    '..HHH........HH.....',
  ],
  pony: [
    '....................',
    '.....HHHHHHHH.......',
    '....HHHHHHHHHH......',
    '...HHHHHHHHHHHH.....',
    '...HHHHHHHHHHHH.....',
    '...HHH......HHHH....',
    '...HH........HHH....',
    '...H..........H.....',
  ],
  band: [
    '....................',
    '....................',
    '.....HHHHHHHH.......',
    '....HHHHHHHHHH......',
    '...HHHHHHHHHHHH.....',
    '...HHH......HHH.....',
  ],
  band_beard: [
    '....................',
    '....................',
    '.....HHHHHHHH.......',
    '....HHHHHHHHHH......',
    '...HHHHHHHHHHHH.....',
    '...HHH......HHH.....',
    '....................',
    '....................',
    '....................',
    '......WWWWWW........',
    '.....WWWWWWWW.......',
    '.....WWWWWWWW.......',
  ],
  ant: [
    '....................',
    '....................',
    '........A..A........',
    '.......AA..AA.......',
    '......AA....AA......',
  ],
  bald: [],
};

// 1px silhouette outline around a sprite (SNES look)
function outlineSprite(c: HTMLCanvasElement, color = '#181828'): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = c.width + 2;
  out.height = c.height + 2;
  const g = out.getContext('2d')!;
  const sil = document.createElement('canvas');
  sil.width = c.width;
  sil.height = c.height;
  const sg = sil.getContext('2d')!;
  sg.drawImage(c, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = color;
  sg.fillRect(0, 0, sil.width, sil.height);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(sil, 1 + dx, 1 + dy);
  g.drawImage(c, 1, 1);
  return out;
}

const battleCache = new Map<string, HTMLCanvasElement>();

export function getBattleSprite(styleKey: string, gold = false): HTMLCanvasElement {
  const ck = `battle_${styleKey}_${gold ? 1 : 0}`;
  const cached = battleCache.get(ck);
  if (cached) return cached;
  const style = CHAR_STYLES[styleKey] || CHAR_STYLES.saiya;
  const hairC = gold && style.superHair ? style.superHair : style.hair;
  const pal: Pal = {
    O: '#181828',
    S: style.body.S,
    E: style.body.E || '#181828',
    M: style.body.M || '#b07040',
    G: style.body.G,
    B: style.body.B,
    P: style.body.P || style.body.G,
    H: hairC,
    A: style.body.S,
    W: '#f0f0e8',
  };
  const hs = style.hairStyle === 'band_beard' ? 'band_beard' : style.hairStyle;
  const rows = compose(FIGHT_BODY, FIGHT_HAIR[hs] || [], 0);
  const c = outlineSprite(buildSprite(rows, pal, 4));
  battleCache.set(ck, c);
  return c;
}

// Portrait (head only, for battle panel): 10x8 crop rebuilt at bigger scale
export function getPortrait(styleKey: string, hairColor?: string): HTMLCanvasElement {
  const style = CHAR_STYLES[styleKey] || CHAR_STYLES.saiya;
  const hairC = hairColor || style.hair;
  const pal: Pal = { ...style.body, H: hairC, A: '#3d7a30', W: '#f0f0e8' };
  const rows = compose(BODY_DOWN_A, hairOverlay(style, 'dn'), 0);
  const head = rows.slice(2, 9).map((r) => r.slice(0, 12));
  return buildSprite(head, pal, 3);
}

export function getPortraitGold(styleKey: string): HTMLCanvasElement | null {
  const style = CHAR_STYLES[styleKey];
  if (!style || !style.superHair) return null;
  const pal: Pal = { ...style.body, H: style.superHair, A: '#3d7a30', W: '#f0f0e8' };
  const rows = compose(BODY_DOWN_A, hairOverlay(style, 'dn'), 0);
  const head = rows.slice(2, 9).map((r) => r.slice(0, 12));
  return buildSprite(head, pal, 3);
}
