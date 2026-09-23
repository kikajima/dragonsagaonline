// Enemy battle sprites (original pixel art, 16-bit style, facing left)
import { buildSprite, mirror, type Pal } from './pixel';

const O = '#181828';

// ---------- Saiba (green plant creature) ----------
const SAIBA = [
  '.......OOO.OOO..........',
  '......OGGOOGGO..........',
  '.......OGGGGGO..........',
  '......OGGGGGGGO.........',
  '.....OGGGGGGGGGO........',
  '....OGGGGGGGGGGGO.......',
  '....OGRRGGGGRRGO........',
  '....OGRRGGGGRRGO........',
  '....OGGGGMMGGGGO........',
  '.....OGGGGGGGGO.........',
  '......OOOOOOOO..........',
  '....OGGGGGGGGGGO........',
  '...OGDGGGGGGGDGO........',
  '..ODDGGGGGGGGDDO........',
  '..ODDGGGGGGGGDDO........',
  '..OGGDDGGGGDDGGO........',
  '...OGGDDDDDDGGO.........',
  '....OGGGGGGGGO..........',
  '.....OGOOOOGO...........',
  '....ODGO..OGDO..........',
  '...ODGO....OGDO.........',
  '...OGO......OGO.........',
  '...OO........OO.........',
  '..OOO........OOO........',
];
const SAIBA_PAL: Pal = { G: '#58b848', D: '#2f7a28', R: '#d83030', M: '#a03028', O };

// ---------- Wolf ----------
const WOLF = [
  '............................',
  '..................OO........',
  '..O.............OWWWO.......',
  '..OO...........OWWWWO.......',
  '..OWO..........OWRWO........',
  '..OWWO........OWWWWO........',
  '..OWWWOOOOOOOOWWWWO.........',
  '...OWWWWWWWWWWWWWMOW........',
  '...OWWWWWWWWWWWWMMWO........',
  '...OWWWWWWWWWWWWWWOO........',
  '...OWWWWWWWWWWWWWO..........',
  '....OWWWWWWWWWWWWWO.........',
  '....OWWWWWWWWWWWWWO.........',
  '...OWWWOOWWWOOWWWWO.........',
  '...OWWO..OWO..OWWO..........',
  '...OOWO..OWO..OWOO..........',
  '....OWO..OWO..OWO...........',
  '....OO...OO...OO............',
];
const WOLF_PAL: Pal = { W: '#9aa0ac', M: '#687080', R: '#f0c030', O };

// ---------- Dino (raptor, faces LEFT toward the party) ----------
const DINO_ART = [
  '.................OOOO...',
  '................OGGGGO..',
  '................OGWKGO..',
  '................OGGGGO..',
  '......OOOOOOOOOOGGGGO...',
  '.....ODDDDDDDDDGGGGO....',
  '....OGGGGGGGGGGGGGO.....',
  '....OGDDGGGGGGGDDGO.....',
  '...OGGGGGGGGGGGGGGO.....',
  '...OGDDGGGGGGGGDDGO.....',
  '...OCGGGGGGGGGGGGGO.....',
  '...OCCGGGGGGGGGCCGO.....',
  '...OCCCGGGGGGGCCCGO.....',
  '....OCCCCCCCCCCCGO......',
  '.....OOCCCCCCCOOO.......',
  '......OGGGOOOGGGO.......',
  '......OGGO...OGGO.......',
  '......OGGO...OGGO.......',
  '.....OGGGO...OGGGO......',
  '.....OGGGO...OGGGO......',
  '.....OOOO.....OOOO......',
];
const DINO = DINO_ART.map((r) => r.split('').reverse().join(''));
const DINO_PAL: Pal = { G: '#a87840', D: '#6e4a20', W: '#f8f8f0', K: '#181828', C: '#d8b078', O };

// ---------- Soldier (F-exército, armadura branca + scouter) ----------
const SOLDIER = [
  '.......OOOOOO.......',
  '......OAAAAAAO......',
  '.....OAAAAAAAAO.....',
  '.....OASSSSSSAO.....',
  '.....OSGGSSSSEO.....',
  '.....OSSSSMMSSO.....',
  '......OSSSSSSO......',
  '....OOAAAAAAAAOO....',
  '...OAAAAAAAAAAAAO...',
  '..OAYAAAAAAAAAYAO...',
  '..OAYAABBBBBAYAO....',
  '..OSAABBBBBBAASO....',
  '..OSAABBBBBBAASO....',
  '...OAABBBBBBAAO.....',
  '....OBBBBBBBBO......',
  '.....OBBBBBBO.......',
  '.....OBB..BBO.......',
  '.....OBB..BBO.......',
  '....OWWW..WWWO......',
  '....OWWW..WWWO......',
  '...OWWWO..OWWWO.....',
  '...OOOO....OOOO.....',
];
const SOLDIER_PAL: Pal = { A: '#e8e8f0', Y: '#f0c030', S: '#f0c090', G: '#40c860', B: '#3058c8', W: '#28283a', E: '#181828', M: '#b07040', O };

// ---------- Radix (long-haired invader boss) ----------
const RADIX = [
  '......OHHHHHHO.......',
  '.....OHHHHHHHHO......',
  '....OHHHHHHHHHHO.....',
  '....OHHHHHHHHHHO.....',
  '....OHHSSSSSSHHO.....',
  '....OHSSESSSESHO.....',
  '....OHSSSSSMSSHO.....',
  '....OHSSSSSSSSHO.....',
  '....OHHSSSSSSHHO.....',
  '....OHHHSSSSHHHO.....',
  '.OOOHHHHOSSOHHHHOOO..',
  'OHHHHHHOAAYAOHHHHHHO.',
  'OHHHHHOAAAAAYAOHHHHO.',
  'OHHHHOAAAAAAAAYAOHHO.',
  '.OHHOAAAAAAAAYAAAOHO.',
  '..OOOAAABBBBBYAAAOO..',
  '...OSABBBBBBBBBASO...',
  '...OSABBBBBBBBBASO...',
  '....OBBBBBBBBBBO.....',
  '.....OBBBBBBBO.......',
  '.....OBB...BBO.......',
  '.....OBB...BBO.......',
  '....OWWW..OWWWO......',
  '....OWWW..OWWWO......',
  '...OWWWO..OWWWO......',
  '...OOOO....OOOO......',
];
const RADIX_PAL: Pal = { H: '#282838', S: '#f0c090', E: '#181828', M: '#b07040', A: '#e8e8f0', Y: '#f0c030', B: '#3058c8', W: '#28283a', O };

// ---------- Nappos (bald burly boss) ----------
const NAPPOS = [
  '.....OOOOOOOOOO.....',
  '....OAAAAAAAAAAO....',
  '...OAAAAAAAAAAAAO...',
  '...OASSSSSSSSSSAO...',
  '...OSSSESSSSESSSO...',
  '...OSSSSSSMMSSSSO...',
  '....OSSSSSSSSSSO....',
  '.....OSSSSSSSSO.....',
  '..OOOAAAAAAAAAAOOO..',
  '.OAAAAAAAAAAAAAAA O.'.replace(' ', 'O'),
  'OAYAAAAAAAAAAAAAYAO.',
  'OAYAABBBBBBBBBAYAAO.',
  'OSAABBBBBBBBBBBAASO.',
  'OSAABBBBBBBBBBBAASO.',
  'OOAABBBBBBBBBBBAAOO.',
  '.OAABBBBBBBBBBBAAO..',
  '..OBBBBBBBBBBBBO....',
  '...OBBBBBBBBBBO.....',
  '...OBBB...OBBBO.....',
  '...OBBB...OBBBO.....',
  '..OWWWW..OWWWWO.....',
  '..OWWWW..OWWWWO.....',
  '.OWWWWO..OWWWWO.....',
  '.OOOOO....OOOOO.....',
];
const NAPPOS_PAL: Pal = { S: '#f0c090', E: '#181828', M: '#b07040', A: '#e8e8f0', Y: '#f0c030', B: '#784828', W: '#28283a', O };

// ---------- Vegar (prince boss, flame hair + armor) ----------
const VEGAR = [
  '........OHHHHO........',
  '.......OHHHHHHO.......',
  '......OHHHHHHHHO......',
  '.....OHHHHHHHHHHO.....',
  '....OHHHHHHHHHHHHO....',
  '....OHHHHHHHHHHHHO....',
  '....OHHSSSSSSSSHHO....',
  '....OHSSSSSSSSSSHO....',
  '....OHSSESSSSESSHO....',
  '....OHSSSSSMMSSSHO....',
  '....OHHSSSSSSSSHHO....',
  '....OHHHSSSSSSHHHO....',
  '.....OHHHOOOOHHHO.....',
  '...OOOAAAAAAAAAAOOO...',
  '..OAAAAAAAAAAAAAAA O.'.replace(' ', 'O'),
  '.OAYAAAAAAAAAAAAYAO..',
  '.OAYAABBBBBBBAYAAAO..',
  '.OSAABBBBBBBBBAAASO..',
  '.OSAABBBBBBBBBAAASO..',
  '.OOABBBBBBBBBBBAAOO..',
  '..OBBBBBBBBBBBBBO....',
  '...OBBBBBBBBBBBO.....',
  '...OBBB....OBBBO.....',
  '...OBBB....OBBBO.....',
  '..OWWWW...OWWWWO.....',
  '..OWWWW...OWWWWO.....',
  '.OWWWWO...OWWWWO.....',
  '.OOOOO.....OOOOO.....',
];
const VEGAR_PAL: Pal = { H: '#382838', S: '#f0c090', E: '#38b8d8', M: '#b07040', A: '#e8e8f0', Y: '#f0c030', B: '#3058c8', W: '#28283a', O };

// ---------- Shenlong (dragon, cutscene) ----------
const DRAGON = [
  '..........................OOOOOO..................',
  '.........................OGGGGGGO.................',
  '........................OGGGGGGGGO................',
  '.......................OGGGGGGGGGGO...............',
  '.......................OGGGRGGGRGGO...............',
  '......................OGGGGGGGGGGGGO..............',
  '......................OGGGGYYYGGGGGO..............',
  '.....................OGGGGGYYGGGGGGO..............',
  '.....................OGGGGGGGGGGGGGO..............',
  '....................OGGGGGOOOOGGGGGO..............',
  '...OOOOO...........OGGGGGO....OGGGGO..............',
  '..OGGGGGOOO.......OGGGGO......OGGGGO..............',
  '..OGGGGGGGGGOOOOOGGGGGO........OGGGO..............',
  '..OGGGGGGGGGGGGGGGGGGGO........OGGGO..............',
  '...OOOGGGGGGGGGGGGGGGGO.........OGGO..............',
  '......OGGGGGGGGGGGGGGO..........OGGO..............',
  '.......OGGGGGGGGGGGGGO..........OGGO..............',
  '........OGGGGGGGGGGGGO.........OGGGO..............',
  '.........OGGGGGGGGGGGO.........OGGGO..............',
  '.........OGGGGGOOGGGGO........OGGGO...............',
  '........OGGGGGO..OGGGO........OGGO................',
  '........OGGGGO....OGGGO......OGGGO................',
  '.......OGGGGO......OGGGO....OGGGO.................',
  '.......OGGGO........OGGGOOOGGGO...................',
  '......OGGGO..........OGGGGGGO.....................',
  '......OGGO............OOOOOO......................',
  '.....OGGGO........................................',
  '.....OGGO.........................................',
  '....OGGGO.........................................',
  '....OGGO.........................................',
  '...OGGGO.........................................',
  '...OGGO..........................................',
  '..OGGGO..........................................',
  '..OGGO...........................................',
  '..OOO............................................',
];
const DRAGON_PAL: Pal = { G: '#38a8d8', Y: '#f0e040', R: '#f04040', O: '#123050' };

// ---------- Dragon ball (map item) ----------
const BALL = [
  '..OOO..',
  '.OYYRO.',
  'OYRYYRO',
  'OYYYYYO',
  'OYYRYYO',
  '.OYYYO.',
  '..OOO..',
];
const BALL_PAL: Pal = { Y: '#f8a020', R: '#f04040', O: '#784818' };

// ---------- Effect sprites ----------
const STAR = ['.Y.', 'YYY', '.Y.'];
const SPARK = ['W', 'Y'];
const AURA = [
  '.Y..Y..Y.',
  'Y.YY.YY.Y',
  '.YYYYYY..',
  'Y.YWWWY.Y',
  '.YYWWYY..',
  'Y.YYYY.Y.',
];

export interface EnemyArt {
  body: HTMLCanvasElement;
  w: number;
  h: number;
}

const enemyCache = new Map<string, EnemyArt>();

export function getEnemyArt(key: string): EnemyArt {
  const c = enemyCache.get(key);
  if (c) return c;
  let rows: string[], pal: Pal;
  switch (key) {
    case 'saiba': rows = SAIBA; pal = SAIBA_PAL; break;
    case 'lobo': rows = WOLF; pal = WOLF_PAL; break;
    case 'dino': rows = DINO; pal = DINO_PAL; break;
    case 'soldado': rows = SOLDIER; pal = SOLDIER_PAL; break;
    case 'radix': rows = RADIX; pal = RADIX_PAL; break;
    case 'nappos': rows = NAPPOS; pal = NAPPOS_PAL; break;
    case 'vegar': rows = VEGAR; pal = VEGAR_PAL; break;
    default: rows = SAIBA; pal = SAIBA_PAL;
  }
  const body = buildSprite(rows, pal, 4);
  const art = { body, w: body.width, h: body.height };
  enemyCache.set(key, art);
  return art;
}

export function getEnemyArtFlipped(key: string): HTMLCanvasElement {
  return mirror(getEnemyArt(key).body);
}

export function getDragonArt(): HTMLCanvasElement {
  return buildSprite(DRAGON, DRAGON_PAL, 5);
}

export function getBallSprite(): HTMLCanvasElement {
  return buildSprite(BALL, BALL_PAL, 2);
}

export function getEffectSprites() {
  return {
    star: buildSprite(STAR, { Y: '#f8d030' }, 3),
    spark: buildSprite(SPARK, { W: '#ffffff', Y: '#f8d030' }, 3),
    aura: buildSprite(AURA, { Y: '#f8d030', W: '#fff8c0' }, 3),
  };
}

// ---------- Map minis (12x12 wanderers) ----------
const MINI_SAIBA = [
  '..OOOOOO..',
  '.OGGGGGGO.',
  'OGRRGGRRGO',
  'OGGGMMGGGO',
  '.OGGGGGGO.',
  'OGDGGGGDGO',
  'OGGGGGGGGO',
  '.OGGGGGGO.',
  '..OG..GO..',
  '.OG....GO.',
  '.OO....OO.',
];
const MINI_WOLF = [
  '..........',
  '.OO...OO..',
  'OWWO.OWWO.',
  'OWWWOOWWO.',
  '.OWWWWWW..',
  '.OWWWWWO..',
  '.OWWWWWO..',
  '..OW.OW...',
  '..OW.OW...',
  '..OO.OO...',
];
const MINI_DINO = [
  '....OOOO...',
  '...OGGGGO..',
  '...OGKWGO..',
  '...OGGGGOOO',
  '..OOGGGGGGO',
  '..OGGGGGGGO',
  '..OGGGGGGDO',
  '..OGGGGGGO.',
  '...OGO.OGO.',
  '...OGO.OGO.',
  '...OOO.OOO.',
];
const MINI_SOLDIER = [
  '..OOOOOO..',
  '.OAAAAAAO.',
  '.OSGSSSEO.',
  '.OSSSMMSO.',
  '..OSSSSO..',
  '.OAAAAAAO.',
  'OAYAAAAYAO',
  'OSAABBAASO',
  '.OBBBBBBO.',
  '..OBBBBO..',
  '..OB.OBO..',
  '..OW.OWO..',
];
const MINI_BOSS = [
  '..OWWWWO...',
  '.OWWWWWWO..',
  'OWOWWWOWO..',
  'OWWWWWWWWO.',
  '.OWOOWOWO..',
  '..OWWWWO...',
  '.ORRRRRRO..',
  'ORRRRRRRRO.',
  '.ORROORRO..',
  '..OR..RO...',
  '..OR..RO...',
];

export function getMiniSprite(key: string): HTMLCanvasElement {
  const cacheKey = `mini_${key}`;
  const c = enemyCache.get(cacheKey);
  if (c) return c.body;
  let rows: string[], pal: Pal, scale = 2;
  switch (key) {
    case 'saiba': rows = MINI_SAIBA; pal = SAIBA_PAL; break;
    case 'lobo': rows = MINI_WOLF; pal = WOLF_PAL; break;
    case 'dino': rows = MINI_DINO; pal = DINO_PAL; break;
    case 'soldado': rows = MINI_SOLDIER; pal = SOLDIER_PAL; break;
    case 'boss': rows = MINI_BOSS; pal = { W: '#e8e8f0', O, R: '#d83030' }; scale = 2; break;
    default: rows = MINI_SAIBA; pal = SAIBA_PAL;
  }
  const body = buildSprite(rows, pal, scale);
  const art = { body, w: body.width, h: body.height };
  enemyCache.set(cacheKey, art);
  return body;
}
