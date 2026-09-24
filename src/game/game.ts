// Main game engine: overworld, MMO layer, quests, dragon balls, dialogs, shop
import { T, SOLID, buildWorld, tileAt, MINI_COLORS, getTile, type WorldMap } from './world';
import { getCharFrames, getPortrait, type CharFrames } from './charSprites';
import { getMiniSprite, getBallSprite, getDragonArt } from './enemySprites';
import { chip } from './audio';
import { CLASSES, SKILLS, ITEMS, ENEMIES, QUESTS, BALL_SPOTS, FAKE_PLAYERS, SYSTEM_LINES, NPC_LINES, expForLevel } from './data';
import { Battle, type Fighter } from './battle';
import { panel, pText, pTextC, wrapText, drawShadow } from './pixel';

export const VW = 960;
export const VH = 600;
const TS = 32; // tile scale on screen
const T16 = 16;

export interface ChatLine { name: string; text: string; color: string; sys?: boolean }

export interface RemotePlayerNetworkState {
  sessionId: string;
  name: string;
  classId: string;
  x: number;
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  pvpHp: number;
  pvpMaxHp: number;
  pvpKo: boolean;
}

export interface PlayerState {
  name: string;
  classId: string;
  lv: number;
  exp: number;
  hp: number;
  ki: number;
  zeni: number;
  baseAtk: number;
  baseDef: number;
  items: Record<string, number>;
  gearOwned: string[];
  balls: string[]; // spot keys collected "x,y"
  questIdx: number;
  questProgress: number;
  sagaCycle: number;
  flags: Record<string, boolean>;
  x: number; y: number;
}

export interface AuthoritativeCharacterSnapshot {
  id: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  ki: number;
  base_atk: number;
  base_def: number;
  items: Record<string, number>;
  gear_owned: string[];
  dragon_balls: string[];
  flags: Record<string, boolean>;
  quest_index: number;
  quest_progress: number;
  saga_cycle: number;
  quest_completed?: boolean;
  saga_completed?: boolean;
  action?: string;
  item_id?: string;
  ball_key?: string;
  wish?: string;
}

interface Npc {
  id: string;
  name: string;
  styleKey: string;
  x: number; y: number;
  role: 'talk' | 'shop' | 'quest';
  dir: 'down' | 'up' | 'left' | 'right';
}

interface FakePlayer {
  name: string;
  styleKey: string;
  hair: string;
  x: number; y: number;
  tx: number; ty: number;
  wait: number;
  bubble: string | null;
  bubbleT: number;
  frames: CharFrames;
  animT: number;
  moving: boolean;
}

interface RemotePlayerView extends RemotePlayerNetworkState {
  tx: number;
  ty: number;
  animT: number;
  moving: boolean;
  bubble: string | null;
  bubbleT: number;
  hitT: number;
}

interface Spawn {
  spawnId?: string;
  enemyId: string;
  x: number; y: number;
  vx: number; vy: number;
  wait: number;
  dead: boolean;
  respawnT: number;
  spawnX?: number;
  spawnY?: number;
  isBoss?: boolean;
  serverControlled?: boolean;
  animT: number;
}

const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] } as const;

export class Game {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  state: 'title' | 'create' | 'world' | 'battle' | 'dragon' | 'gameoverfade' = 'title';
  world: WorldMap = buildWorld();
  camX = 0; camY = 0;
  t = 0;
  raf = 0;
  lastTs = 0;
  keys = new Set<string>();
  chat: ChatLine[] = [];
  npcs: Npc[] = [];
  fakes: FakePlayer[] = [];
  remotePlayers = new Map<string, RemotePlayerView>();
  multiplayerActive = false;
  multiplayerSessionId = '';
  pvpAttackHandler: ((targetSessionId: string) => void) | null = null;
  pveBeginHandler: ((spawnId: string) => void) | null = null;
  pveActionHandler: ((payload: {
    battleId: string;
    action: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'transform';
    skillId?: string;
    itemId?: string;
  }) => void) | null = null;
  pveCompleteHandler: ((payload: { battleId: string; outcome: 'win' | 'fled' | 'lose'; hp: number; ki: number }) => void) | null = null;
  shopPurchaseHandler: ((itemId: string) => void) | null = null;
  useItemHandler: ((itemId: string) => void) | null = null;
  questInteractHandler: (() => void) | null = null;
  dragonWishHandler: ((wish: 'power' | 'defense' | 'zeni') => void) | null = null;
  activePveBattleId = '';
  activePveSpawnId = '';
  pendingPveSpawnId = '';
  pvpHp = 0;
  pvpMaxHp = 0;
  pvpKnockedOut = false;
  pvpHitT = 0;
  spawns: Spawn[] = [];
  ballEnts: { key: string; x: number; y: number }[] = [];
  battle: Battle | null = null;
  onlineCount = 47;
  chatTimer = 4;
  onlineTimer = 10;
  saveTimer = 0;
  player: PlayerState = this.newPlayer();
  px = 19.5 * T16; py = 43.5 * T16;
  pdir: 'down' | 'up' | 'left' | 'right' = 'down';
  panimT = 0;
  pmoving = false;
  pframe = 0;
  stepT = 0;
  battleCooldown = 0;
  // UI states
  titleIdx = 0;
  createStep: 'name' | 'class' = 'name';
  createName = '';
  createClassIdx = 0;
  nameInputCb: ((show: boolean, current: string) => void) | null = null;
  saveHandler: ((player: PlayerState) => void) | null = null;
  persistedPlayer: Partial<PlayerState> | null = null;
  dialog: { lines: { who: string; text: string }[]; idx: number; onDone?: () => void } | null = null;
  shop: { idx: number } | null = null;
  menuOpen = false;
  menuIdx = 0;
  itemIdx = 0;
  dragonPhase = 0;
  dragonY = -200;
  dragonT = 0;
  wishIdx = 0;
  fade = 0;
  fadeDir = 0;
  onChatInput: ((show: boolean) => void) | null = null;
  toast: { text: string; t: number } | null = null;
  touchDirs = new Set<string>();
  touchMoveX = 0;
  touchMoveY = 0;
  trail: [number, number][] = [];
  miniCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = VW;
    canvas.height = VH;
    this.g = canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.initEntities();
    this.addChat({ name: 'Sistema', text: 'Bem-vindo ao Dragon Saga Online! Pressione Enter para começar.', color: '#f8d030', sys: true });
  }

  newPlayer(): PlayerState {
    return {
      name: 'Guerreiro', classId: 'saiya', lv: 1, exp: 0, hp: 120, ki: 40, zeni: 300,
      baseAtk: 0, baseDef: 0, items: { sensu: 3, capsula: 2 }, gearOwned: [], balls: [],
      questIdx: 0, questProgress: 0, sagaCycle: 1, flags: {}, x: 0, y: 0,
    };
  }

  cls() { return CLASSES.find((c) => c.id === this.player.classId) || CLASSES[0]; }

  maxHp(): number { const c = this.cls(); return Math.floor(c.hp + c.growth.hp * (this.player.lv - 1)); }
  maxKi(): number { const c = this.cls(); return Math.floor(c.ki + c.growth.ki * (this.player.lv - 1)); }
  pAtk(): number { const c = this.cls(); let a = Math.floor(c.atk + c.growth.atk * (this.player.lv - 1)) + this.player.baseAtk; for (const gid of this.player.gearOwned) a += ITEMS[gid]?.gear?.atk || 0; return a; }
  pDef(): number { const c = this.cls(); let d = Math.floor(c.def + c.growth.def * (this.player.lv - 1)) + this.player.baseDef; for (const gid of this.player.gearOwned) d += ITEMS[gid]?.gear?.def || 0; return d; }
  pSpd(): number { const c = this.cls(); return Math.floor(c.spd + c.growth.spd * (this.player.lv - 1)); }
  powerLevel(): number { return Math.floor((this.pAtk() * 8 + this.pDef() * 6 + this.maxHp() * 1.2 + this.player.lv * 20) * (this.player.flags.super ? 1.8 : 1)); }
  hasSkill(id: string): boolean {
    const c = this.cls();
    const sk = SKILLS[id];
    if (!c.skills.includes(id)) return false;
    return this.player.lv >= sk.lv;
  }
  playerSkills(): string[] {
    return this.cls().skills.filter((s) => this.hasSkill(s));
  }

  companions(): { styleKey: string; name: string }[] {
    const out: { styleKey: string; name: string }[] = [];
    if (this.player.flags.kurin) out.push({ styleKey: 'humano', name: 'Kurin' });
    if (this.player.flags.nailo) out.push({ styleKey: 'nameko', name: 'Nailo' });
    return out;
  }

  // ---------- entities ----------
  initEntities() {
    this.npcs = [
      { id: 'mestre', name: 'Mestre Kame', styleKey: 'mestre', x: 92, y: 74, role: 'quest', dir: 'down' },
      { id: 'lojista', name: 'Lojista Cápsula', styleKey: 'lojista', x: 32, y: 31, role: 'shop', dir: 'down' },
      { id: 'aldeao1', name: 'Aldeão', styleKey: 'aldeao', x: 16, y: 31, role: 'talk', dir: 'down' },
      { id: 'aldeao2', name: 'Aldeã', styleKey: 'lutadora', x: 27, y: 31, role: 'talk', dir: 'left' },
      { id: 'guarda', name: 'Guarda', styleKey: 'guarda', x: 19, y: 45, role: 'talk', dir: 'down' },
    ];
    // Fake MMO players
    const hairs = ['#20202e', '#583820', '#f0c030', '#2848c8', '#8848c8', '#403020'];
    FAKE_PLAYERS.forEach((fp, i) => {
      const bx = 14 + ((i * 37) % 70);
      const by = 12 + ((i * 53) % 60);
      this.fakes.push({
        name: fp.name, styleKey: fp.style, hair: hairs[i % hairs.length],
        x: bx * T16, y: by * T16, tx: bx * T16, ty: by * T16,
        wait: Math.random() * 4, bubble: null, bubbleT: 0,
        frames: getCharFrames(fp.style, hairs[i % hairs.length], 3),
        animT: 0, moving: false,
      });
    });
    // Enemy spawns
    const spawnSets: [string, number, number][] = [
      ['saiba', 27, 51], ['saiba', 31, 55], ['saiba', 44, 53], ['saiba', 29, 63], ['saiba', 48, 57],
      ['lobo', 18, 52], ['lobo', 24, 58], ['lobo', 34, 64], ['lobo', 88, 70], ['lobo', 92, 78],
      ['dino', 43, 61], ['dino', 15, 48],
      ['soldado', 58, 28], ['soldado', 62, 34], ['soldado', 66, 26], ['soldado', 60, 38],
    ];
    spawnSets.forEach(([id, x, y]) => this.spawns.push({ enemyId: id, x: x * T16, y: y * T16, vx: 0, vy: 0, wait: 0, dead: false, respawnT: 0, animT: 0 }));
    // Bosses (activated by quests)
    this.spawns.push({ enemyId: 'radix', x: 40 * T16, y: 13 * T16, vx: 0, vy: 0, wait: 0, dead: false, respawnT: 0, isBoss: true, animT: 0 });
    this.spawns.push({ enemyId: 'nappos', x: 19 * T16, y: 16 * T16, vx: 0, vy: 0, wait: 0, dead: false, respawnT: 0, isBoss: true, animT: 0 });
    this.spawns.push({ enemyId: 'vegar', x: 63 * T16, y: 30 * T16, vx: 0, vy: 0, wait: 0, dead: false, respawnT: 0, isBoss: true, animT: 0 });
    for (const spawn of this.spawns) {
      spawn.spawnX = spawn.x;
      spawn.spawnY = spawn.y;
    }
    // Dragon balls
    this.refreshBalls();
  }

  refreshBalls() {
    this.ballEnts = BALL_SPOTS.filter(([x, y]) => !this.player.balls.includes(`${x},${y}`))
      .map(([x, y]) => ({ key: `${x},${y}`, x: x * T16 + 8, y: y * T16 + 8 }));
  }

  addChat(l: ChatLine) {
    this.chat.push(l);
    if (this.chat.length > 60) this.chat.shift();
  }

  setMultiplayerActive(active: boolean) {
    this.multiplayerActive = active;
    if (!active) {
      this.remotePlayers.clear();
      this.multiplayerSessionId = '';
      this.pvpHp = 0;
      this.pvpMaxHp = 0;
      this.pvpKnockedOut = false;
      this.activePveBattleId = '';
      this.activePveSpawnId = '';
      this.pendingPveSpawnId = '';
      this.pveActionHandler = null;
      this.shopPurchaseHandler = null;
      this.useItemHandler = null;
      this.questInteractHandler = null;
      this.dragonWishHandler = null;
    }
  }

  setMultiplayerSessionId(sessionId: string) {
    this.multiplayerSessionId = sessionId;
  }

  reconcileServerPosition(
    x: number,
    y: number,
    dir: 'down' | 'up' | 'left' | 'right',
  ) {
    if (this.state !== 'world') return;
    const distance = Math.hypot(x - this.px, y - this.py);
    if (distance > 8) {
      this.px = x;
      this.py = y;
      this.player.x = x;
      this.player.y = y;
      this.pdir = dir;
    }
  }

  setPvpAttackHandler(cb: ((targetSessionId: string) => void) | null) {
    this.pvpAttackHandler = cb;
  }

  setPveHandlers(
    begin: ((spawnId: string) => void) | null,
    action: ((payload: {
      battleId: string;
      action: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'transform';
      skillId?: string;
      itemId?: string;
    }) => void) | null,
    complete: ((payload: { battleId: string; outcome: 'win' | 'fled' | 'lose'; hp: number; ki: number }) => void) | null,
  ) {
    this.pveBeginHandler = begin;
    this.pveActionHandler = action;
    this.pveCompleteHandler = complete;
  }

  setWorldActionHandlers(
    shopPurchase: ((itemId: string) => void) | null,
    useItem: ((itemId: string) => void) | null,
    questInteract: (() => void) | null,
    dragonWish: ((wish: 'power' | 'defense' | 'zeni') => void) | null,
  ) {
    this.shopPurchaseHandler = shopPurchase;
    this.useItemHandler = useItem;
    this.questInteractHandler = questInteract;
    this.dragonWishHandler = dragonWish;
  }

  receiveCharacterSync(snapshot: AuthoritativeCharacterSnapshot) {
    if (!snapshot?.id) return;

    const previousLevel = this.player.lv;
    const previousSaga = this.player.sagaCycle;
    const previousBallCount = this.player.balls.length;

    this.player.lv = Math.max(1, Math.floor(snapshot.level));
    this.player.exp = Math.max(0, Number(snapshot.xp));
    this.player.zeni = Math.max(0, Number(snapshot.gold));
    this.player.hp = Math.max(1, Math.floor(snapshot.hp));
    this.player.ki = Math.max(0, Math.floor(snapshot.ki));
    this.player.baseAtk = Math.max(0, Math.floor(snapshot.base_atk));
    this.player.baseDef = Math.max(0, Math.floor(snapshot.base_def));
    this.player.items = { ...(snapshot.items || {}) };
    this.player.gearOwned = [...(snapshot.gear_owned || [])];
    this.player.balls = [...(snapshot.dragon_balls || [])];
    this.player.flags = { ...(snapshot.flags || {}) };
    this.player.questIdx = Math.max(0, Math.floor(snapshot.quest_index));
    this.player.questProgress = Math.max(0, Math.floor(snapshot.quest_progress));
    this.player.sagaCycle = Math.max(1, Math.floor(snapshot.saga_cycle || 1));
    this.refreshBalls();

    this.persistedPlayer = JSON.parse(JSON.stringify(this.player)) as PlayerState;

    if (this.player.lv > previousLevel) {
      chip.sfx('levelup');
      this.addChat({
        name: 'Sistema',
        text: `${this.player.name} subiu para o nível ${this.player.lv}!`,
        color: '#88f0a0',
        sys: true,
      });
    }

    if (snapshot.action === 'shop_purchase' && snapshot.item_id) {
      chip.sfx('coin');
      const item = ITEMS[snapshot.item_id];
      this.addChat({
        name: 'Loja',
        text: `${this.player.name} comprou ${item?.name || snapshot.item_id}!`,
        color: '#f8d030',
        sys: true,
      });
      if (snapshot.item_id === 'scouter') {
        this.toast = { text: 'Scouter ativado! PLs visiveis no mapa.', t: 3 };
      }
    } else if (snapshot.action === 'use_item') {
      chip.sfx('heal');
    } else if (snapshot.action === 'collect_ball') {
      chip.sfx('coin');
      this.addChat({
        name: 'Sistema',
        text: `Esfera do Dragão encontrada! (${this.player.balls.length}/7)`,
        color: '#f8a020',
        sys: true,
      });
      if (previousBallCount < 7 && this.player.balls.length >= 7 && this.state === 'world') {
        this.startDragon();
      }
    } else if (snapshot.action === 'quest_intro') {
      chip.sfx('levelup');
      this.toast = { text: `SAGA ${this.player.sagaCycle} · MISSÃO INICIADA!`, t: 3 };
      const nextQuest = QUESTS[this.player.questIdx];
      if (nextQuest) {
        this.addChat({
          name: 'Quest',
          text: `Saga ${this.player.sagaCycle}: ${nextQuest.title}`,
          color: '#88c8f8',
          sys: true,
        });
      }
    } else if (snapshot.action === 'wish') {
      if (snapshot.wish === 'power') this.toast = { text: 'ATK permanentemente aumentado!', t: 3.5 };
      else if (snapshot.wish === 'defense') this.toast = { text: 'DEF permanentemente aumentada!', t: 3.5 };
      else this.toast = { text: '+5.000 zeni!', t: 3.5 };

      this.addChat({
        name: 'Shenlong',
        text: 'Seu desejo foi realizado. As esferas se espalharam pelo mundo novamente...',
        color: '#88c8f8',
        sys: true,
      });
      this.state = 'world';
      chip.playSong('field');
    }

    if (snapshot.saga_completed || this.player.sagaCycle > previousSaga) {
      chip.sfx('levelup');
      this.toast = {
        text: `SAGA ${Math.max(1, this.player.sagaCycle - 1)} COMPLETA! SAGA ${this.player.sagaCycle} LIBERADA!`,
        t: 4,
      };
      this.addChat({
        name: 'Saga',
        text: `A sequência recomeçou. Fale com o Mestre Kame para iniciar a Saga ${this.player.sagaCycle}.`,
        color: '#f8d030',
        sys: true,
      });
    } else if (snapshot.quest_completed) {
      chip.sfx('levelup');
      this.toast = { text: 'MISSÃO COMPLETA!', t: 3 };
    }
  }

  setMobSnapshot(mobs: Array<{ spawnId: string; enemyId: string; x: number; y: number; dead: boolean; isBoss: boolean; respawnAt: number }>) {
    this.spawns = mobs.map((mob) => ({
      spawnId: mob.spawnId,
      enemyId: mob.enemyId,
      x: mob.x,
      y: mob.y,
      vx: 0,
      vy: 0,
      wait: 0,
      dead: mob.dead,
      respawnT: mob.respawnAt > 0 ? Math.max(0, (mob.respawnAt - Date.now()) / 1000) : 0,
      spawnX: mob.x,
      spawnY: mob.y,
      isBoss: mob.isBoss,
      serverControlled: true,
      animT: 0,
    }));
  }

  upsertMob(mob: { spawnId: string; enemyId: string; x: number; y: number; dead: boolean; isBoss: boolean; respawnAt: number }) {
    const existing = this.spawns.find((spawn) => spawn.spawnId === mob.spawnId);
    if (!existing) {
      this.spawns.push({
        spawnId: mob.spawnId,
        enemyId: mob.enemyId,
        x: mob.x,
        y: mob.y,
        vx: 0,
        vy: 0,
        wait: 0,
        dead: mob.dead,
        respawnT: mob.respawnAt > 0 ? Math.max(0, (mob.respawnAt - Date.now()) / 1000) : 0,
        spawnX: mob.x,
        spawnY: mob.y,
        isBoss: mob.isBoss,
        serverControlled: true,
        animT: 0,
      });
      return;
    }
    existing.x = mob.x;
    existing.y = mob.y;
    existing.dead = mob.dead;
    existing.isBoss = mob.isBoss;
    existing.respawnT = mob.respawnAt > 0 ? Math.max(0, (mob.respawnAt - Date.now()) / 1000) : 0;
  }

  receivePveBegin(event: {
    battleId: string;
    spawnId: string;
    enemyId: string;
    isBoss: boolean;
    playerHp: number;
    playerKi: number;
    enemyHp: number;
    enemyMaxHp: number;
  }) {
    if (!event?.battleId || this.state !== 'world') return;
    this.pendingPveSpawnId = '';
    this.activePveBattleId = event.battleId;
    this.activePveSpawnId = event.spawnId;
    this.lastDefeated = event.enemyId;
    const spawn = this.spawns.find((item) => item.spawnId === event.spawnId) || null;
    this.activeBoss = event.isBoss ? spawn : null;
    this.startBattle([event.enemyId], event.isBoss);
    this.battle?.syncAuthoritativeState({
      playerHp: event.playerHp,
      playerKi: event.playerKi,
      enemyHp: event.enemyHp,
      enemyMaxHp: event.enemyMaxHp,
      outcome: 'active',
    });
  }

  receivePveState(event: {
    battleId: string;
    playerHp: number;
    playerKi: number;
    enemyHp: number;
    enemyMaxHp: number;
    outcome: 'active' | 'win' | 'lose' | 'fled';
  }) {
    if (
      !this.battle ||
      !event?.battleId ||
      event.battleId !== this.activePveBattleId
    ) {
      return;
    }

    this.battle.syncAuthoritativeState(event);
  }

  receivePveResult(event: {
    outcome: 'win' | 'fled' | 'lose';
    battleId: string;
    enemyId?: string;
    exp?: number;
    zeni?: number;
    drop?: string | null;
    hp?: number;
    ki?: number;
    character?: AuthoritativeCharacterSnapshot;
  }) {
    if (!event?.battleId || event.battleId !== this.activePveBattleId) return;

    this.activePveBattleId = '';
    this.activePveSpawnId = '';
    this.pendingPveSpawnId = '';

    if (event.character) {
      this.receiveCharacterSync(event.character);
    } else {
      if (typeof event.hp === 'number') {
        this.player.hp = Math.max(1, Math.floor(event.hp));
      }
      if (typeof event.ki === 'number') {
        this.player.ki = Math.max(0, Math.floor(event.ki));
      }
    }

    if (event.outcome === 'win') {
      this.addChat({
        name: 'Sistema',
        text: `${this.player.name} venceu uma batalha! +${Math.max(0, Math.floor(event.exp || 0))} EXP`,
        color: '#f8d030',
        sys: true,
      });

      if (event.drop) {
        this.addChat({
          name: 'Sistema',
          text: `Item obtido: ${ITEMS[event.drop]?.name || event.drop}`,
          color: '#88f0a0',
          sys: true,
        });
      }

      const q = QUESTS[this.player.questIdx];
      if (
        !event.character?.quest_completed &&
        q?.target &&
        q.target === event.enemyId
      ) {
        this.addChat({
          name: 'Quest',
          text: `Saga ${this.player.sagaCycle} · ${q.title}: ${this.player.questProgress}/${q.count}`,
          color: '#88c8f8',
          sys: true,
        });
      }
    } else if (event.outcome === 'lose') {
      this.px = 19.5 * T16;
      this.py = 43.5 * T16;
      this.addChat({
        name: 'Sistema',
        text: 'Você acordou na cidade. Metade do zeni foi perdido...',
        color: '#f08888',
        sys: true,
      });
    }

    this.persistedPlayer = JSON.parse(JSON.stringify(this.player)) as PlayerState;
    this.save();
  }

  setPvpState(hp: number, maxHp: number, knockedOut = false) {
    this.pvpMaxHp = Math.max(1, Math.floor(maxHp || 1));
    this.pvpHp = Math.max(0, Math.min(this.pvpMaxHp, Math.floor(hp)));
    this.pvpKnockedOut = knockedOut || this.pvpHp <= 0;
  }

  receivePvpHit(event: {
    attackerSessionId: string;
    targetSessionId: string;
    attackerName: string;
    targetName: string;
    damage: number;
    hp: number;
    maxHp: number;
  }) {
    const remote = this.remotePlayers.get(event.targetSessionId);
    if (remote) {
      remote.pvpHp = event.hp;
      remote.pvpMaxHp = event.maxHp;
      remote.pvpKo = event.hp <= 0;
      remote.hitT = 0.35;
    }

    if (event.targetSessionId === this.multiplayerSessionId) {
      this.setPvpState(event.hp, event.maxHp, event.hp <= 0);
      this.pvpHitT = 0.35;
      this.toast = { text: `${event.attackerName} causou ${event.damage} de dano PvP!`, t: 1.3 };
    } else if (event.attackerSessionId === this.multiplayerSessionId) {
      this.toast = { text: `${event.damage} de dano em ${event.targetName}!`, t: 1.1 };
    }
  }

  receivePvpKo(event: {
    targetSessionId: string;
    targetName: string;
    attackerSessionId: string;
    attackerName: string;
  }) {
    const remote = this.remotePlayers.get(event.targetSessionId);
    if (remote) {
      remote.pvpHp = 0;
      remote.pvpKo = true;
    }

    if (event.targetSessionId === this.multiplayerSessionId) {
      this.pvpKnockedOut = true;
      this.pvpHp = 0;
      this.clearTouchVector();
      this.keys.clear();
      this.addChat({ name: 'PvP', text: `${event.attackerName} derrotou você. Recuperando...`, color: '#f08888', sys: true });
    } else if (event.attackerSessionId === this.multiplayerSessionId) {
      this.addChat({ name: 'PvP', text: `Você derrotou ${event.targetName}!`, color: '#f8d030', sys: true });
    }
  }

  receivePvpRespawn(player: RemotePlayerNetworkState) {
    if (player.sessionId === this.multiplayerSessionId) {
      this.setPvpState(player.pvpHp, player.pvpMaxHp, false);
      this.toast = { text: 'Você se recuperou do PvP!', t: 1.5 };
      return;
    }

    this.upsertRemotePlayer(player);
  }

  setRemoteSnapshot(players: RemotePlayerNetworkState[]) {
    this.remotePlayers.clear();
    for (const player of players) this.upsertRemotePlayer(player);
  }

  upsertRemotePlayer(player: RemotePlayerNetworkState) {
    if (!player?.sessionId) return;

    const existing = this.remotePlayers.get(player.sessionId);
    if (existing) {
      const distance = Math.hypot(player.x - existing.tx, player.y - existing.ty);
      existing.tx = player.x;
      existing.ty = player.y;
      existing.name = player.name;
      existing.classId = player.classId;
      existing.dir = player.dir;
      existing.pvpHp = player.pvpHp;
      existing.pvpMaxHp = player.pvpMaxHp;
      existing.pvpKo = player.pvpKo;
      existing.moving = distance > 0.5;
      return;
    }

    this.remotePlayers.set(player.sessionId, {
      ...player,
      tx: player.x,
      ty: player.y,
      animT: 0,
      moving: false,
      bubble: null,
      bubbleT: 0,
      hitT: 0,
    });
  }

  removeRemotePlayer(sessionId: string) {
    this.remotePlayers.delete(sessionId);
  }

  receiveRemoteChat(message: { sessionId: string; name: string; text: string }) {
    const text = message.text.trim();
    if (!text) return;

    this.addChat({ name: message.name, text, color: '#d8d8f0' });

    const remote = this.remotePlayers.get(message.sessionId);
    if (remote) {
      remote.bubble = text;
      remote.bubbleT = 4;
    }
  }

  setOnlineCount(count: number) {
    this.onlineCount = Math.max(1, Math.floor(count));
  }

  sendChat(text: string) {
    if (!text.trim()) return;
    this.addChat({ name: this.player.name, text: text.trim(), color: '#88f0a0' });
    if (this.state === 'world') {
      // bubble above head handled via chatBubble cache
      this.bubbleText = text.trim();
      this.bubbleT = 4;
    }
  }
  bubbleText: string | null = null;
  bubbleT = 0;

  startBattle(enemyIds: string[], isBoss = false) {
    const party: Fighter[] = [];
    const pf: Fighter = {
      id: 'player', name: this.player.name, side: 'party', styleKey: this.player.classId === 'saiya' ? 'saiya' : this.player.classId === 'humano' ? 'humano' : this.player.classId === 'nameko' ? 'nameko' : 'lutadora',
      lv: this.player.lv, hp: this.player.hp, maxHp: this.maxHp(), ki: this.player.ki, maxKi: this.maxKi(),
      atk: this.pAtk(), def: this.pDef(), spd: this.pSpd(), skills: this.playerSkills(),
      alive: this.player.hp > 0, defending: false, buffed: false,
    };
    (pf as Fighter & { canSuper?: boolean }).canSuper = !!this.player.flags.super;
    party.push(pf);
    for (const c of this.companions()) {
      const lv = Math.max(1, this.player.lv);
      const hp = 90 + lv * 14;
      party.push({
        id: c.styleKey, name: c.name, side: 'party', styleKey: c.styleKey,
        lv, hp, maxHp: hp, ki: 40 + lv * 4, maxKi: 40 + lv * 4,
        atk: 12 + lv * 2.4, def: 10 + lv * 1.6, spd: 11,
        skills: c.styleKey === 'nameko' ? ['onda', 'regen'] : ['onda', 'punho'],
        alive: true, defending: false, buffed: false,
      });
    }
    const defs = enemyIds.map((id) => ENEMIES[id]).filter(Boolean);
    this.battle = new Battle(party, defs, isBoss);
    this.battle.inventory = new Map(Object.entries(this.player.items));
    if (
      this.multiplayerActive &&
      this.activePveBattleId &&
      this.pveActionHandler
    ) {
      this.battle.onCommand = (event) => {
        this.pveActionHandler?.({
          battleId: this.activePveBattleId,
          action: event.action,
          skillId: event.skillId,
          itemId: event.itemId,
        });
      };
    }
    this.battle.onEnd = (r) => this.endBattle(r);
    this.state = 'battle';
    this.dialog = null;
    this.shop = null;
    this.menuOpen = false;
    chip.playSong(isBoss ? 'boss' : 'battle');
  }

  endBattle(r: { win: boolean; fled: boolean; exp: number; zeni: number; drops: string[] } | null) {
    if (!r || !this.battle) { this.state = 'world'; this.battle = null; chip.playSong('field'); return; }
    const pf = this.battle.party[0];
    this.player.hp = Math.max(1, Math.floor(pf.hp));
    this.player.ki = Math.max(0, Math.floor(pf.ki));

    if (this.multiplayerActive && this.activePveBattleId && this.pveCompleteHandler) {
      this.player.items = Object.fromEntries(this.battle.inventory || []);
      const outcome: 'win' | 'fled' | 'lose' = r.win ? 'win' : r.fled ? 'fled' : 'lose';
      this.pveCompleteHandler({
        battleId: this.activePveBattleId,
        outcome,
        hp: this.player.hp,
        ki: this.player.ki,
      });
      this.battle = null;
      this.state = 'world';
      this.battleCooldown = 1.5;
      chip.playSong(this.nearTown() ? 'town' : 'field');
      return;
    }
    if (r.win) {
      this.player.zeni += r.zeni;
      this.player.exp += r.exp;
      for (const d of r.drops) this.player.items[d] = (this.player.items[d] || 0) + 1;
      this.addChat({ name: 'Sistema', text: `${this.player.name} venceu uma batalha! +${r.exp} EXP`, color: '#f8d030', sys: true });
      // quest progress
      const q = QUESTS[this.player.questIdx];
      if (q && q.target && this.lastDefeated && q.target === this.lastDefeated) {
        this.player.questProgress++;
        if (this.player.questProgress >= (q.count || 1)) this.completeQuest();
        else this.addChat({ name: 'Quest', text: `${q.title}: ${this.player.questProgress}/${q.count}`, color: '#88c8f8', sys: true });
      }
      // level ups
      let leveled = false;
      while (this.player.exp >= expForLevel(this.player.lv)) {
        this.player.exp -= expForLevel(this.player.lv);
        this.player.lv++;
        leveled = true;
      }
      if (leveled) {
        chip.sfx('levelup');
        this.player.hp = this.maxHp();
        this.player.ki = this.maxKi();
        this.addChat({ name: 'Sistema', text: `${this.player.name} subiu para o nível ${this.player.lv}!`, color: '#88f0a0', sys: true });
        const c = this.cls();
        for (const sid of c.skills) {
          if (SKILLS[sid].lv === this.player.lv) {
            this.addChat({ name: 'Sistema', text: `Nova arte aprendida: ${SKILLS[sid].name}!`, color: '#f8d030', sys: true });
          }
        }
        if (this.player.lv >= 12 && !this.player.flags.super) {
          this.player.flags.super = true;
          this.addChat({ name: 'Sistema', text: 'Seu espírito de luta despertou! FORMA SUPER desbloqueada (na batalha: comando Transformar)!', color: '#f8d030', sys: true });
          this.toast = { text: 'FORMA SUPER DESBLOQUEADA!', t: 4 };
        }
      }
      // defeated bosses also respawn, but on a much longer MMO timer
      if (this.activeBoss && this.lastDefeated === this.activeBoss.enemyId) {
        this.activeBoss.dead = true;
        this.activeBoss.respawnT = 90 + Math.random() * 60;
        this.activeBoss = null;
      }
      this.save();
    } else if (!r.fled) {
      // defeat: revive in town
      this.player.hp = Math.floor(this.maxHp() / 2);
      this.player.ki = Math.floor(this.maxKi() / 2);
      this.player.zeni = Math.floor(this.player.zeni / 2);
      this.px = 19.5 * T16; this.py = 43.5 * T16;
      this.addChat({ name: 'Sistema', text: 'Você acordou na cidade. Metade do zeni foi perdido...', color: '#f08888', sys: true });
      this.save();
    }
    // sync inventory back (consumables used in battle)
    this.player.items = Object.fromEntries(this.battle.inventory || []);
    this.battle = null;
    this.state = 'world';
    this.battleCooldown = 1.5;
    chip.playSong(this.nearTown() ? 'town' : 'field');
  }
  lastDefeated: string | null = null;
  activeBoss: Spawn | null = null;

  completeQuest() {
    const q = QUESTS[this.player.questIdx];
    if (!q) return;
    this.player.zeni += q.rewardZeni;
    this.player.exp += q.rewardExp;
    this.addChat({ name: 'Quest completa', text: `${q.title} — ${q.rewardText} (+${q.rewardZeni}z)`, color: '#f8d030', sys: true });
    if (q.id === 'q0' && !this.player.flags.kurin) { this.player.flags.kurin = true; this.toast = { text: 'Kurin entrou no grupo!', t: 4 }; }
    if (q.id === 'q1' && !this.player.flags.kurin) { this.player.flags.kurin = true; this.toast = { text: 'Kurin entrou no grupo!', t: 4 }; }
    if (q.id === 'q2' && !this.player.flags.nailo) { this.player.flags.nailo = true; this.toast = { text: 'Nailo entrou no grupo!', t: 4 }; }
    this.player.questIdx++;
    this.player.questProgress = 0;
    this.save();
  }

  nearTown(): boolean {
    return Math.abs(this.px / T16 - 19) < 12 && Math.abs(this.py / T16 - 30) < 12;
  }

  // ---------- save/load ----------
  setSaveHandler(cb: ((player: PlayerState) => void) | null) {
    this.saveHandler = cb;
  }

  setPersistedPlayer(player: Partial<PlayerState> | null) {
    this.persistedPlayer = player ? { ...player } : null;
  }

  save() {
    this.player.x = this.px;
    this.player.y = this.py;
    const snapshot = JSON.parse(JSON.stringify(this.player)) as PlayerState;
    this.persistedPlayer = snapshot;
    this.saveHandler?.(snapshot);
  }

  hasSave(): boolean {
    return !!this.persistedPlayer;
  }

  load(): boolean {
    if (!this.persistedPlayer) return false;
    const p = this.persistedPlayer;
    this.player = { ...this.newPlayer(), ...p };
    this.px = typeof p.x === 'number' && p.x > 0 ? p.x : this.px;
    this.py = typeof p.y === 'number' && p.y > 0 ? p.y : this.py;
    this.refreshBalls();
    return true;
  }

  // ---------- main loop ----------
  start() {
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0.016);
      this.lastTs = ts;
      try {
        this.update(dt);
        this.render();
      } catch (err) {
        console.error('[game]', err);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); }

  update(dt: number) {
    this.t += dt;
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 2;
      if (this.fade >= 1) { this.fade = 1; this.fadeDir = 0; }
      if (this.fade <= 0) { this.fade = 0; this.fadeDir = 0; }
    }
    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'create': this.updateCreate(dt); break;
      case 'world': this.updateWorld(dt); break;
      case 'battle': if (this.battle) this.battle.update(dt); break;
      case 'dragon': this.updateDragon(dt); break;
    }
  }

  updateTitle(dt: number) {
    void dt;
    // animated: handled in render
  }

  updateCreate(dt: number) {
    void dt;
  }

  // ---------- world update ----------
  solidAt(x: number, y: number): boolean {
    const tx = Math.floor(x / T16), ty = Math.floor(y / T16);
    return SOLID.has(tileAt(this.world, tx, ty));
  }

  canWalk(x: number, y: number): boolean {
    const r = 5;
    return !this.solidAt(x - r, y) && !this.solidAt(x + r, y) && !this.solidAt(x, y - r) && !this.solidAt(x, y + r) &&
      !this.solidAt(x - r, y - 2) && !this.solidAt(x + r, y - 2);
  }

  updateWorld(dt: number) {
    const speed = 72;
    let dx = 0, dy = 0;
    const analogMagnitude = Math.hypot(this.touchMoveX, this.touchMoveY);
    const usingTouchStick = analogMagnitude > 0.08;

    if (usingTouchStick) {
      dx = this.touchMoveX;
      dy = this.touchMoveY;

      if (Math.abs(dx) >= Math.abs(dy)) {
        this.pdir = dx < 0 ? 'left' : 'right';
      } else {
        this.pdir = dy < 0 ? 'up' : 'down';
      }
    } else {
      const k = (d: string) => this.keys.has(d) || this.touchDirs.has(d);
      if (k('ArrowLeft') || k('a')) { dx = -1; this.pdir = 'left'; }
      else if (k('ArrowRight') || k('d')) { dx = 1; this.pdir = 'right'; }
      if (k('ArrowUp') || k('w')) { dy = -1; if (!dx) this.pdir = 'up'; }
      else if (k('ArrowDown') || k('s')) { dy = 1; if (!dx) this.pdir = 'down'; }
    }

    if (this.pvpKnockedOut) {
      dx = 0;
      dy = 0;
    }

    this.pmoving = Math.hypot(dx, dy) > 0.08;
    if (this.pvpHitT > 0) this.pvpHitT -= dt;
    if (this.pmoving) {
      const n = Math.hypot(dx, dy) || 1;
      const strength = usingTouchStick ? Math.min(1, n) : 1;
      const nx = this.px + (dx / n) * speed * strength * dt;
      const ny = this.py + (dy / n) * speed * strength * dt;
      if (this.canWalk(nx, this.py)) this.px = nx;
      if (this.canWalk(this.px, ny)) this.py = ny;
      this.stepT += dt;
      if (this.stepT > 0.18) { this.stepT = 0; this.pframe = 1 - this.pframe; }
      this.panimT += dt;
    } else this.pframe = 0;

    // companion trail
    this.trail.unshift([this.px, this.py]);
    if (this.trail.length > 90) this.trail.length = 90;

    // slow on tall grass
    // camera
    this.camX = Math.max(0, Math.min(this.world.w * T16 * (TS / T16) - VW, this.px * (TS / T16) - VW / 2));
    this.camY = Math.max(0, Math.min(this.world.h * TS - VH, this.py * (TS / T16) - VH / 2));

    if (this.bubbleT > 0) this.bubbleT -= dt;

    // fake players wander
    for (const f of (this.multiplayerActive ? [] : this.fakes)) {
      f.animT += dt;
      if (f.bubbleT > 0) f.bubbleT -= dt; else f.bubble = null;
      if (f.moving) {
        const sp = 40;
        const ddx = f.tx - f.x, ddy = f.ty - f.y;
        const d = Math.hypot(ddx, ddy);
        if (d < 2) { f.moving = false; f.wait = 1 + Math.random() * 4; }
        else { f.x += (ddx / d) * sp * dt; f.y += (ddy / d) * sp * dt; }
      } else {
        f.wait -= dt;
        if (f.wait <= 0) {
          // pick target near current
          for (let tries = 0; tries < 8; tries++) {
            const tx = f.x + (Math.random() - 0.5) * 5 * T16;
            const ty = f.y + (Math.random() - 0.5) * 5 * T16;
            if (!this.solidAt(tx, ty) && tx > 9 * T16 && ty > 7 * T16 && tx < 104 * T16 && ty < 84 * T16) {
              f.tx = tx; f.ty = ty; f.moving = true; break;
            }
          }
          if (!f.moving) f.wait = 2;
        }
      }
    }

    // fake chat
    this.chatTimer -= dt;
    if (!this.multiplayerActive && this.chatTimer <= 0) {
      this.chatTimer = 7 + Math.random() * 9;
      if (Math.random() < 0.8) {
        const fp = FAKE_PLAYERS[Math.floor(Math.random() * FAKE_PLAYERS.length)];
        const line = fp.lines[Math.floor(Math.random() * fp.lines.length)];
        this.addChat({ name: fp.name, text: line, color: '#d8d8f0' });
        const fake = this.fakes.find((f) => f.name === fp.name);
        if (fake) { fake.bubble = line; fake.bubbleT = 4; }
      } else {
        const sysLine = SYSTEM_LINES[Math.floor(Math.random() * SYSTEM_LINES.length)];
        this.addChat({ name: 'Sistema', text: sysLine, color: '#f8d030', sys: true });
      }
    }
    this.onlineTimer -= dt;
    if (!this.multiplayerActive && this.onlineTimer <= 0) {
      this.onlineTimer = 8 + Math.random() * 6;
      this.onlineCount = Math.max(38, Math.min(64, this.onlineCount + Math.floor(Math.random() * 5) - 2));
    }

    // interpolate real multiplayer players between network updates
    for (const remote of this.remotePlayers.values()) {
      remote.animT += dt;
      if (remote.hitT > 0) remote.hitT -= dt;
      if (remote.bubbleT > 0) {
        remote.bubbleT -= dt;
      } else {
        remote.bubble = null;
      }

      const dx = remote.tx - remote.x;
      const dy = remote.ty - remote.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 0.25) {
        const factor = Math.min(1, dt * 12);
        remote.x += dx * factor;
        remote.y += dy * factor;
        remote.moving = true;
      } else {
        remote.x = remote.tx;
        remote.y = remote.ty;
        remote.moving = false;
      }
    }

    // spawns wander & collision
    if (this.battleCooldown > 0) this.battleCooldown -= dt;
    for (const s of this.spawns) {
      s.animT += dt;

      if (this.multiplayerActive && s.serverControlled) {
        if (s.dead) continue;
        if (
          this.battleCooldown <= 0 &&
          !this.pendingPveSpawnId &&
          s.spawnId &&
          Math.hypot(s.x - this.px, s.y - this.py) < 20
        ) {
          const q = QUESTS[this.player.questIdx];
          if (s.isBoss && (!q || q.target !== s.enemyId)) {
            this.toast = { text: 'Esse poder é enorme... prepare-se primeiro!', t: 2.5 };
            this.battleCooldown = 2;
          } else if (this.pveBeginHandler) {
            this.pendingPveSpawnId = s.spawnId;
            this.battleCooldown = 1;
            this.pveBeginHandler(s.spawnId);
          }
        }
        continue;
      }

      if (s.dead) {
        s.respawnT -= dt;
        if (s.respawnT <= 0) {
          s.dead = false;
          s.x = s.spawnX ?? s.x;
          s.y = s.spawnY ?? s.y;
          s.vx = 0;
          s.vy = 0;
          s.wait = 0.5 + Math.random() * 1.5;
          s.animT = 0;
        }
        continue;
      }
      if (!s.isBoss) {
        if (s.wait <= 0) {
          s.vx = (Math.random() - 0.5) * 2;
          s.vy = (Math.random() - 0.5) * 2;
          s.wait = 1 + Math.random() * 2;
        } else s.wait -= dt;
        const nx = s.x + s.vx * 26 * dt;
        const ny = s.y + s.vy * 26 * dt;
        if (!this.solidAt(nx, s.y)) s.x = nx; else s.vx = -s.vx;
        if (!this.solidAt(s.x, ny)) s.y = ny; else s.vy = -s.vy;
      }
      // contact battle
      if (this.battleCooldown <= 0 && Math.hypot(s.x - this.px, s.y - this.py) < 20) {
        this.lastDefeated = s.enemyId;
        if (s.isBoss) this.activeBoss = s;
        const q = QUESTS[this.player.questIdx];
        if (s.isBoss && q && q.target === s.enemyId) {
          this.startBattle([s.enemyId], true);
        } else if (s.isBoss) {
          this.toast = { text: 'Esse poder é enorme... prepare-se primeiro!', t: 2.5 };
          this.battleCooldown = 2;
        } else {
          this.startBattle([s.enemyId]);
          s.dead = true;
          s.respawnT = 18 + Math.random() * 10;
        }
        break;
      }
    }

    // dragon ball pickup
    for (const b of [...this.ballEnts]) {
      if (Math.hypot(b.x - this.px, b.y - this.py) < 14) {
        this.player.balls.push(b.key);
        this.ballEnts = this.ballEnts.filter((x) => x !== b);
        chip.sfx('coin');
        this.addChat({ name: 'Sistema', text: `Esfera do Dragão encontrada! (${this.player.balls.length}/7)`, color: '#f8a020', sys: true });
        this.save();
        if (this.player.balls.length >= 7) {
          this.startDragon();
        }
      }
    }

    // auto-save every 30s
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 30; this.player.x = this.px; this.player.y = this.py; this.save(); }
  }

  // ---------- interactions ----------
  facingEntity(): Npc | null {
    const [fx, fy] = DIRS[this.pdir];
    const tx = this.px + fx * 20, ty = this.py + fy * 20;
    for (const n of this.npcs) {
      if (Math.hypot(n.x * T16 + 16 - tx, n.y * T16 + 16 - ty) < 26) {
        if (n.id === 'kurin' && !this.player.flags.kurin) continue;
        if (n.id === 'nailo' && !this.player.flags.nailo) continue;
        return n;
      }
    }
    return null;
  }

  facingRemotePlayer(): RemotePlayerView | null {
    const [fx, fy] = DIRS[this.pdir];
    const tx = this.px + fx * 26;
    const ty = this.py + fy * 26;
    let nearest: RemotePlayerView | null = null;
    let nearestDistance = 38;

    for (const remote of this.remotePlayers.values()) {
      if (remote.pvpKo) continue;
      const distance = Math.hypot(remote.x - tx, remote.y - ty);
      if (distance < nearestDistance) {
        nearest = remote;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  interact() {
    if (this.dialog) { this.advanceDialog(); return; }
    if (this.shop) { return; }

    if (this.multiplayerActive && this.pvpAttackHandler && !this.pvpKnockedOut) {
      const remote = this.facingRemotePlayer();
      if (remote) {
        this.pvpAttackHandler(remote.sessionId);
        chip.sfx('hit');
        return;
      }
    }

    // sign?
    const tx = Math.floor(this.px / T16), ty = Math.floor(this.py / T16);
    const [fx, fy] = DIRS[this.pdir];
    const ftx = tx + fx, fty = ty + fy;
    if (tileAt(this.world, ftx, fty) === T.SIGN) {
      const msgs: Record<string, string> = {
        '20,43': '← Cidade do Oeste   Planície ao sul ↓',
        '68,70': 'Ponte para a Ilha do Mestre →   Deserto ao norte ↑',
        '18,24': '← Trilha do Vulcão   Torre do Felino →',
      };
      const msg = msgs[`${ftx},${fty}`] || 'Placa antiga: os textos apagaram com o tempo.';
      this.showDialog([{ who: 'Placa', text: msg }]);
      return;
    }
    const npc = this.facingEntity();
    if (npc) {
      chip.sfx('talk');
      if (npc.role === 'shop') { this.openShop(); return; }
      if (npc.role === 'quest') { this.masterDialog(); return; }
      const lines = NPC_LINES[npc.id] || ['...'];
      const line = lines[Math.floor(Math.random() * lines.length)];
      this.showDialog([{ who: npc.name, text: line }]);
      return;
    }
    // fountain heal
    if (tileAt(this.world, ftx, fty) === T.FOUNTAIN || tileAt(this.world, ftx, fty) === T.SPRING) {
      this.player.hp = this.maxHp();
      this.player.ki = this.maxKi();
      chip.sfx('heal');
      this.showDialog([{ who: 'Fonte', text: 'Água cristalina! HP e Ki totalmente restaurados!' }]);
      return;
    }
    // nothing nearby — no fallback menu (menu opens with X only)
    chip.sfx('cancel');
  }

  masterDialog() {
    const q = QUESTS[this.player.questIdx];
    if (!q) {
      this.showDialog([{ who: 'Mestre Kame', text: 'Você se tornou uma lenda viva! Continue caçando as Esferas do Dragão e ajudando os novatos!' }]);
      return;
    }
    const done = q.target ? this.player.questProgress >= (q.count || 1) : false;
    if (q.id === 'q0') {
      this.showDialog([
        { who: 'Mestre Kame', text: `Ah, ${this.player.name}! Sentei o seu Ki de longe. Você tem potencial!` },
        { who: 'Mestre Kame', text: q.desc },
        { who: 'Mestre Kame', text: 'Leve estes 300 zeni e fale com os aliados na cidade. E cuidado com as criaturas!' },
      ], () => {
        this.player.zeni += 300;
        this.player.questProgress = 1;
        this.completeQuest();
        chip.sfx('coin');
      });
      return;
    }
    if (done && q.id !== 'q0') {
      this.completeQuest();
      this.showDialog([{ who: 'Mestre Kame', text: q.rewardText }]);
      return;
    }
    this.showDialog([
      { who: 'Mestre Kame', text: `Missão atual: ${q.title}` },
      { who: 'Mestre Kame', text: q.desc },
    ]);
  }

  showDialog(lines: { who: string; text: string }[], onDone?: () => void) {
    this.dialog = { lines, idx: 0, onDone };
    this.onChatInput?.(false);
  }
  advanceDialog() {
    if (!this.dialog) return;
    chip.sfx('talk');
    this.dialog.idx++;
    if (this.dialog.idx >= this.dialog.lines.length) {
      const cb = this.dialog.onDone;
      this.dialog = null;
      cb?.();
    }
  }

  openShop() {
    this.shop = { idx: 0 };
    chip.sfx('confirm');
  }

  // ---------- dragon ----------
  startDragon() {
    this.state = 'dragon';
    this.dragonPhase = 0;
    this.dragonY = -260;
    this.dragonT = 0;
    this.wishIdx = 0;
    chip.playSong('dragon');
    chip.sfx('dragon');
  }

  updateDragon(dt: number) {
    this.dragonT += dt;
    if (this.dragonPhase === 0) {
      this.dragonY += 60 * dt;
      if (this.dragonY >= 40) { this.dragonY = 40; this.dragonPhase = 1; }
    }
  }

  applyWish(idx: number) {
    if (idx === 0) { this.player.baseAtk += 30; this.toast = { text: 'ATK permanentemente aumentado!', t: 3.5 }; }
    else if (idx === 1) { this.player.baseDef += 30; this.toast = { text: 'DEF permanentemente aumentada!', t: 3.5 }; }
    else { this.player.zeni += 5000; this.toast = { text: '+5.000 zeni!', t: 3.5 }; }
    this.player.balls = [];
    this.refreshBalls();
    this.player.hp = this.maxHp();
    this.player.ki = this.maxKi();
    this.addChat({ name: 'Shenlong', text: 'Seu desejo foi realizado. As esferas se espalharam pelo mundo novamente...', color: '#88c8f8', sys: true });
    this.save();
    this.state = 'world';
    chip.playSong('field');
  }

  // ---------- render ----------
  render() {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    switch (this.state) {
      case 'title': this.renderTitle(g); break;
      case 'create': this.renderCreate(g); break;
      case 'world': this.renderWorld(g); break;
      case 'battle': if (this.battle) this.battle.render(g, VW, VH); break;
      case 'dragon': this.renderDragon(g); break;
    }
    if (this.fade > 0) {
      g.fillStyle = `rgba(0,0,0,${this.fade})`;
      g.fillRect(0, 0, VW, VH);
    }
    if (this.toast) {
      const w = g.measureText(this.toast.text).width;
      panel(g, VW / 2 - Math.max(180, w / 2 + 20), VH - 130, Math.max(360, w + 40), 30);
      pTextC(g, this.toast.text, VW / 2, VH - 122, 8, '#f8d030');
    }
  }

  renderTitle(g: CanvasRenderingContext2D) {
    // sky
    const grad = g.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#101838');
    grad.addColorStop(0.55, '#283868');
    grad.addColorStop(1, '#c86838');
    g.fillStyle = grad;
    g.fillRect(0, 0, VW, VH);
    // stars
    g.fillStyle = '#fff';
    for (let i = 0; i < 60; i++) {
      const x = (i * 173) % VW;
      const y = (i * 79) % 260;
      const tw = Math.sin(this.t * 2 + i) > 0 ? 2 : 1;
      g.fillRect(x, y, tw, tw);
    }
    // dragon ball glow
    g.fillStyle = '#f8a020';
    g.beginPath(); g.arc(VW - 120, 110, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f8d030';
    g.beginPath(); g.arc(VW - 120, 110, 20, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#f04040';
      g.beginPath(); g.arc(VW - 130 + i * 7, 102 + (i % 2) * 14, 3, 0, Math.PI * 2); g.fill();
    }
    // logo
    const bob = Math.sin(this.t * 1.5) * 4;
    pTextC(g, 'DRAGON SAGA', VW / 2, 92 + bob, 42, '#f8d030');
    pTextC(g, 'ONLINE', VW / 2, 142 + bob, 42, '#f07830');
    pTextC(g, 'A Super Lenda Saiya', VW / 2, 200 + bob, 12, '#fff');
    pTextC(g, '~ MMORPG 16-bit ~', VW / 2, 226 + bob, 8, '#a8c8f8');

    // walking parade
    const parade = ['saiya', 'humano', 'nameko', 'lutadora', 'rival'];
    parade.forEach((s, i) => {
      const f = getCharFrames(s, undefined, 3);
      const x = ((this.t * 40 + i * 130) % (VW + 100)) - 50;
      const idx = Math.floor(this.t * 6 + i) % 2;
      g.drawImage(f.right[idx], x, 330 + (i % 2) * 26);
    });

    // menu
    const hasSave = this.hasSave();
    const opts = hasSave ? ['Continuar', 'Novo Jogo'] : ['Novo Jogo'];
    opts.forEach((o, i) => {
      const sel = i === this.titleIdx;
      pTextC(g, (sel ? '> ' : '') + o, VW / 2, 430 + i * 34, 12, sel ? '#f8d030' : '#fff');
    });
    pTextC(g, 'Setas + Enter/Z para escolher', VW / 2, 520, 8, '#a8b0c0');
    pTextC(g, `Online: ${this.onlineCount} jogadores`, VW / 2, 548, 8, '#88f0a0');
  }

  renderCreate(g: CanvasRenderingContext2D) {
    g.fillStyle = '#101828';
    g.fillRect(0, 0, VW, VH);
    g.fillStyle = '#182848';
    for (let i = 0; i < 8; i++) g.fillRect(0, i * 76, VW, 40);
    pTextC(g, 'CRIE SEU GUERREIRO', VW / 2, 40, 18, '#f8d030');
    pTextC(g, `Nome: ${this.createName || '...'}`, VW / 2, 92, 12, '#fff');
    if (this.createStep === 'name') {
      pTextC(g, 'Digite seu nome na caixa abaixo e confirme', VW / 2, 130, 8, '#a8b0c0');
    } else {
      pTextC(g, 'Escolha sua linhagem (setas + Z)', VW / 2, 130, 8, '#a8b0c0');
      CLASSES.forEach((c, i) => {
        const sel = i === this.createClassIdx;
        const x = 60 + i * 216;
        const y = 170;
        panel(g, x, y, 200, 330, sel ? '#f8d030' : '#585878', sel ? 'rgba(40,48,88,0.95)' : 'rgba(16,24,48,0.9)');
        const f = getCharFrames(c.styleKey, undefined, 4);
        const idx = Math.floor(this.t * 5) % 2;
        g.drawImage(f.down[idx], x + 60, y + 24);
        pTextC(g, c.name, x + 100, y + 150, 9, sel ? '#f8d030' : '#fff');
        const lines = wrapText(g, c.desc, 180, 7);
        lines.forEach((l, li) => pText(g, l, x + 12, y + 176 + li * 12, 7, '#c8d0e0'));
        pText(g, `HP ${c.hp}  KI ${c.ki}`, x + 12, y + 236, 7, '#a8f0a8');
        pText(g, `ATK ${c.atk}  DEF ${c.def}`, x + 12, y + 252, 7, '#f0a8a8');
        pText(g, `VEL ${c.spd}`, x + 12, y + 268, 7, '#88c8f8');
        const skillNames = c.skills.map((s) => SKILLS[s].name).join(', ');
        const skillLines = wrapText(g, `Artes: ${skillNames}`, 180, 7).slice(0, 2);
        skillLines.forEach((l, li) => pText(g, l, x + 12, y + 288 + li * 11, 7, '#f8d030'));
      });
    }
  }

  renderWorld(g: CanvasRenderingContext2D) {
    const sc = TS / T16;
    // tiles
    const x0 = Math.floor(this.camX / TS) - 1, y0 = Math.floor(this.camY / TS) - 1;
    const x1 = x0 + Math.ceil(VW / TS) + 3, y1 = y0 + Math.ceil(VH / TS) + 3;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(this.world, tx, ty);
        const frame = (t === T.WATER || t === T.WATER2) ? (Math.floor(this.t * 2) % 2) : 0;
        g.drawImage(getTile(t, frame), tx * TS - this.camX, ty * TS - this.camY, TS, TS);
      }
    }

    // draw order by y
    interface Drawable { y: number; draw: () => void }
    const draws: Drawable[] = [];

    // dragon balls
    for (const b of this.ballEnts) {
      draws.push({
        y: b.y, draw: () => {
          const ball = getBallSprite();
          const bob = Math.sin(this.t * 3) * 3;
          const glow = 0.5 + Math.sin(this.t * 4) * 0.3;
          g.fillStyle = `rgba(248,200,48,${glow * 0.35})`;
          g.beginPath(); g.arc(b.x * sc - this.camX, b.y * sc - this.camY + bob, 14, 0, Math.PI * 2); g.fill();
          g.drawImage(ball, b.x * sc - this.camX - 7, b.y * sc - this.camY - 7 + bob, 14, 14);
        },
      });
    }

    // npcs
    for (const n of this.npcs) {
      if (n.id === 'kurin' && !this.player.flags.kurin) continue;
      if (n.id === 'nailo' && !this.player.flags.nailo) continue;
      const f = getCharFrames(n.styleKey, undefined, 3);
      const x = n.x * T16 * sc - this.camX;
      const y = n.y * T16 * sc - this.camY;
      draws.push({
        y: n.y * T16, draw: () => {
          drawShadow(g, x + 18, y + 48, 12);
          g.drawImage(f.down[0], x, y);
          // name tag
          g.fillStyle = 'rgba(16,24,48,0.7)';
          const nw = g.measureText(n.name).width;
          g.font = '7px "Press Start 2P", monospace';
          g.fillRect(x + 18 - nw / 2 - 3, y - 12, nw + 6, 11);
          pTextC(g, n.role === 'shop' ? '! ' + n.name : n.name, x + 18, y - 11, 7, n.role === 'shop' ? '#f8d030' : '#a8e8f8');
          if (n.role === 'quest') pTextC(g, '!', x + 18, y - 26, 9, '#f04040');
        },
      });
    }

    // fake players
    for (const fp of (this.multiplayerActive ? [] : this.fakes)) {
      const x = fp.x * sc - this.camX;
      const y = fp.y * sc - this.camY;
      if (x < -60 || x > VW + 60 || y < -80 || y > VH + 60) continue;
      draws.push({
        y: fp.y, draw: () => {
          drawShadow(g, x + 18, y + 48, 12);
          const idx = fp.moving ? Math.floor(fp.animT * 6) % 2 : 0;
          g.drawImage(fp.frames.down[idx], x, y);
          g.font = '7px "Press Start 2P", monospace';
          const nw = g.measureText(fp.name).width;
          g.fillStyle = 'rgba(16,24,48,0.7)';
          g.fillRect(x + 18 - nw / 2 - 3, y - 12, nw + 6, 11);
          pTextC(g, fp.name, x + 18, y - 11, 7, '#88f0a0');
          if (fp.bubble) {
            const lines = wrapText(g, fp.bubble, 140, 7);
            const bw = 150, bh = lines.length * 11 + 8;
            panel(g, x + 18 - bw / 2, y - 20 - bh, bw, bh, '#88f0a0', 'rgba(16,24,48,0.92)');
            lines.forEach((l, li) => pText(g, l, x + 18 - bw / 2 + 6, y - 20 - bh + 6 + li * 11, 7, '#fff'));
          }
        },
      });
    }

    // real multiplayer players
    for (const remote of this.remotePlayers.values()) {
      const x = remote.x * sc - this.camX;
      const y = remote.y * sc - this.camY;
      if (x < -60 || x > VW + 60 || y < -80 || y > VH + 60) continue;

      draws.push({
        y: remote.y,
        draw: () => {
          const frames = getCharFrames(remote.classId, undefined, 3);
          const dirFrames =
            remote.dir === 'up' ? frames.up :
            remote.dir === 'left' ? frames.left :
            remote.dir === 'right' ? frames.right :
            frames.down;
          const frame = remote.moving ? Math.floor(remote.animT * 6) % 2 : 0;

          drawShadow(g, x + 18, y + 48, 12);
          g.drawImage(dirFrames[frame], x, y);

          g.font = '7px "Press Start 2P", monospace';
          const nw = g.measureText(remote.name).width;
          g.fillStyle = 'rgba(16,24,48,0.75)';
          g.fillRect(x + 18 - nw / 2 - 3, y - 12, nw + 6, 11);
          pTextC(g, remote.name, x + 18, y - 11, 7, remote.pvpKo ? '#888898' : '#88f0a0');

          if (remote.pvpMaxHp > 0) {
            const hpPct = Math.max(0, Math.min(1, remote.pvpHp / remote.pvpMaxHp));
            g.fillStyle = 'rgba(16,24,48,0.9)';
            g.fillRect(x - 2, y - 22, 40, 6);
            g.fillStyle = remote.pvpKo ? '#606070' : remote.hitT > 0 ? '#fff' : '#f04040';
            g.fillRect(x - 1, y - 21, 38 * hpPct, 4);
          }

          if (remote.bubble) {
            const lines = wrapText(g, remote.bubble, 140, 7);
            const bw = 150, bh = lines.length * 11 + 8;
            panel(g, x + 18 - bw / 2, y - 20 - bh, bw, bh, '#88f0a0', 'rgba(16,24,48,0.92)');
            lines.forEach((line, index) =>
              pText(g, line, x + 18 - bw / 2 + 6, y - 20 - bh + 6 + index * 11, 7, '#fff')
            );
          }
        },
      });
    }

    // enemy spawns
    for (const s of this.spawns) {
      if (s.dead) continue;
      const x = s.x * sc - this.camX;
      const y = s.y * sc - this.camY;
      if (x < -60 || x > VW + 60 || y < -60 || y > VH + 60) continue;
      draws.push({
        y: s.y, draw: () => {
          const mini = s.isBoss ? getMiniSprite('boss') : getMiniSprite(ENEMIES[s.enemyId]?.mini || 'saiba');
          const bob = Math.sin(s.animT * 3) * 2;
          drawShadow(g, x + 10, y + 20, 9);
          g.drawImage(mini, x, y + bob, mini.width, mini.height);
          if (s.isBoss) {
            pTextC(g, '!', x + 10, y - 16, 10, '#f04040');
          } else if (this.player.gearOwned.includes('scouter')) {
            const e = ENEMIES[s.enemyId];
            g.font = '7px "Press Start 2P", monospace';
            const label = `PL ${e.pl.toLocaleString('pt-BR')}`;
            const nw = g.measureText(label).width;
            g.fillStyle = 'rgba(16,24,48,0.6)';
            g.fillRect(x + 10 - nw / 2 - 2, y - 12, nw + 4, 10);
            pTextC(g, label, x + 10, y - 11, 7, '#40c860');
          }
        },
      });
    }

    // player
    draws.push({
      y: this.py, draw: () => {
        const styleKey = this.player.classId;
        const f = getCharFrames(styleKey, undefined, 3);
        const x = this.px * sc - this.camX;
        const y = this.py * sc - this.camY;
        drawShadow(g, x + 18, y + 48, 12);
        const dirFrames = this.pdir === 'down' ? f.down : this.pdir === 'up' ? f.up : this.pdir === 'left' ? f.left : f.right;
        const fr = this.pmoving ? dirFrames[this.pframe] : dirFrames[0];
        g.drawImage(fr, x, y);
        g.font = '7px "Press Start 2P", monospace';
        const nw = g.measureText(this.player.name).width;
        g.fillStyle = 'rgba(16,24,48,0.75)';
        g.fillRect(x + 18 - nw / 2 - 3, y - 12, nw + 6, 11);
        pTextC(g, this.player.name, x + 18, y - 11, 7, '#f8d030');
        if (this.bubbleT > 0 && this.bubbleText) {
          const lines = wrapText(g, this.bubbleText, 140, 7);
          const bw = 150, bh = lines.length * 11 + 8;
          panel(g, x + 18 - bw / 2, y - 20 - bh, bw, bh, '#f8d030', 'rgba(16,24,48,0.92)');
          lines.forEach((l, li) => pText(g, l, x + 18 - bw / 2 + 6, y - 20 - bh + 6 + li * 11, 7, '#fff'));
        }
      },
    });

    // companions follow via trail
    const comps = this.companions();
    comps.forEach((c, ci) => {
      const tp = this.trail[Math.min(this.trail.length - 1, 26 * (ci + 1))] || [this.px, this.py];
      draws.push({
        y: tp[1], draw: () => {
          const f = getCharFrames(c.styleKey, undefined, 3);
          const x = tp[0] * sc - this.camX;
          const y = tp[1] * sc - this.camY;
          drawShadow(g, x + 18, y + 48, 12);
          g.drawImage(f.down[this.pmoving ? this.pframe : 0], x, y);
          g.font = '7px "Press Start 2P", monospace';
          const nw = g.measureText(c.name).width;
          g.fillStyle = 'rgba(16,24,48,0.7)';
          g.fillRect(x + 18 - nw / 2 - 3, y - 12, nw + 6, 11);
          pTextC(g, c.name, x + 18, y - 11, 7, '#a8e8f8');
        },
      });
    });

    draws.sort((a, b) => a.y - b.y);
    draws.forEach((d) => d.draw());

    // ---------- HUD ----------
    this.renderHud(g);
    if (this.dialog) this.renderDialog(g);
    if (this.shop) this.renderShop(g);
    if (this.menuOpen) this.renderMenu(g);
  }

  renderHud(g: CanvasRenderingContext2D) {
    // top-left player panel
    panel(g, 8, 8, 250, 78);
    const port = getPortrait(this.player.classId);
    g.drawImage(port, 16, 16);
    pText(g, `${this.player.name} Lv${this.player.lv}`, 60, 16, 8, '#f8d030');
    // HP bar
    const hpPct = this.player.hp / this.maxHp();
    g.fillStyle = '#101828'; g.fillRect(60, 32, 186, 12);
    g.fillStyle = hpPct > 0.5 ? '#48c848' : hpPct > 0.25 ? '#f0c030' : '#f04040';
    g.fillRect(61, 33, 184 * Math.max(0, hpPct), 10);
    pText(g, `HP ${Math.max(0, Math.floor(this.player.hp))}/${this.maxHp()}`, 64, 33, 7, '#fff');
    // Ki bar
    const kiPct = this.player.ki / this.maxKi();
    g.fillStyle = '#101828'; g.fillRect(60, 48, 186, 10);
    g.fillStyle = '#40a8f0';
    g.fillRect(61, 49, 184 * Math.max(0, kiPct), 8);
    pText(g, `KI ${Math.floor(this.player.ki)}/${this.maxKi()}`, 64, 49, 7, '#fff');
    pText(g, `PL ${this.powerLevel().toLocaleString('pt-BR')}`, 60, 62, 7, '#f0a838');
    pText(g, `${this.player.zeni}z`, 170, 62, 7, '#f8d030');
    pText(g, `EXP ${this.player.exp}/${expForLevel(this.player.lv)}`, 60, 74, 6, '#a8b0c0');

    if (this.multiplayerActive && this.pvpMaxHp > 0) {
      const pvpPct = Math.max(0, Math.min(1, this.pvpHp / this.pvpMaxHp));
      panel(g, VW / 2 - 100, 8, 200, 26, this.pvpKnockedOut ? '#f04040' : '#585878', 'rgba(10,14,30,0.84)');
      g.fillStyle = '#101828';
      g.fillRect(VW / 2 - 88, 20, 176, 7);
      g.fillStyle = this.pvpKnockedOut ? '#606070' : this.pvpHitT > 0 ? '#fff' : '#f04040';
      g.fillRect(VW / 2 - 87, 21, 174 * pvpPct, 5);
      pTextC(g, this.pvpKnockedOut ? 'PVP: DERROTADO' : `PVP ${this.pvpHp}/${this.pvpMaxHp}`, VW / 2, 11, 6, '#fff');
    }

    // minimap top-right
    const mw = this.world.w, mh = this.world.h;
    const mmScale = 1.5;
    const mmW = mw * mmScale, mmH = mh * mmScale;
    const mmX = VW - mmW - 12, mmY = 8;
    panel(g, mmX - 4, mmY - 4, mmW + 8, mmH + 8);
    if (!this.miniCanvas) {
      const mc = document.createElement('canvas');
      mc.width = mw; mc.height = mh;
      const mg = mc.getContext('2d')!;
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const t = tileAt(this.world, x, y);
          mg.fillStyle = MINI_COLORS[t] || '#58b048';
          mg.fillRect(x, y, 1, 1);
        }
      }
      this.miniCanvas = mc;
    }
    g.drawImage(this.miniCanvas, mmX, mmY, mmW, mmH);
    // town marker
    g.fillStyle = '#f8d030';
    g.fillRect(mmX + 19 * mmScale - 1, mmY + 30 * mmScale - 1, 4, 4);
    // dragon balls
    g.fillStyle = '#f8a020';
    for (const b of this.ballEnts) {
      g.fillRect(mmX + Math.floor(b.x / T16) * mmScale - 1, mmY + Math.floor(b.y / T16) * mmScale - 1, 3, 3);
    }
    // boss
    for (const s of this.spawns) {
      if (s.isBoss && !s.dead) {
        const q = QUESTS[this.player.questIdx];
        if (q && q.target === s.enemyId) {
          g.fillStyle = '#f04040';
          g.fillRect(mmX + Math.floor(s.x / T16) * mmScale - 2, mmY + Math.floor(s.y / T16) * mmScale - 2, 5, 5);
        }
      }
    }
    // player dot
    g.fillStyle = '#fff';
    g.fillRect(mmX + Math.floor(this.px / T16) * mmScale - 1, mmY + Math.floor(this.py / T16) * mmScale - 1, 3, 3);

    // online count + quest tracker
    pText(g, `Online: ${this.onlineCount}`, mmX, mmY + mmH + 8, 7, '#88f0a0');
    const q = QUESTS[this.player.questIdx];
    if (q) {
      const lines = wrapText(g, `${q.title}: ${q.desc}`, 210, 6);
      panel(g, mmX - 224, mmY - 4, 220, 14 + lines.length * 10, '#585878');
      pText(g, 'MISSAO', mmX - 216, mmY + 2, 7, '#f8d030');
      lines.forEach((l, i) => pText(g, l, mmX - 216, mmY + 14 + i * 10, 6, '#e8e8f0'));
    }

    if (this.pvpKnockedOut) {
      g.fillStyle = 'rgba(5,7,13,0.52)';
      g.fillRect(0, 0, VW, VH);
      pTextC(g, 'DERROTADO NO PVP', VW / 2, VH / 2 - 18, 14, '#f04040');
      pTextC(g, 'Aguarde alguns segundos para se recuperar', VW / 2, VH / 2 + 12, 7, '#fff');
    }

    // chat bottom-left (above input)
    const chatLines = this.chat.slice(-7);
    const ch = 13;
    g.fillStyle = 'rgba(10,14,30,0.72)';
    g.fillRect(8, VH - 30 - chatLines.length * ch, 430, chatLines.length * ch + 8);
    chatLines.forEach((c, i) => {
      pText(g, `${c.name}: ${c.text}`, 14, VH - 24 - (chatLines.length - i) * ch, 7, c.color);
    });

    // controls hint
    pText(g, 'WASD/setas: mover  Z: falar/confirmar  X: menu', 12, VH - 34, 6, 'rgba(232,232,240,0.75)');

  }

  renderDialog(g: CanvasRenderingContext2D) {
    const d = this.dialog!;
    const line = d.lines[d.idx];
    panel(g, 60, VH - 150, VW - 120, 110);
    pText(g, line.who, 80, VH - 136, 9, '#f8d030');
    const lines = wrapText(g, line.text, VW - 200, 9);
    lines.forEach((l, i) => pText(g, l, 80, VH - 118 + i * 14, 9, '#fff'));
    const showCursor = Math.floor(this.t * 2) % 2 === 0;
    if (showCursor) pText(g, 'v', VW - 100, VH - 58, 9, '#f8d030');
  }

  renderShop(g: CanvasRenderingContext2D) {
    panel(g, VW / 2 - 240, 90, 480, 380);
    pTextC(g, 'LOJA DE CAPSULAS', VW / 2, 104, 12, '#f8d030');
    pText(g, `Zeni: ${this.player.zeni}z`, VW / 2 - 210, 130, 8, '#88f0a0');
    pText(g, '(setas: escolher, Z: comprar, X: sair)', VW / 2 - 210, 146, 7, '#a8b0c0');
    const stock = ['sensu', 'capsula', 'elixir', 'bastao', 'armadura', 'scouter', 'espada', 'manto'];
    stock.forEach((id, i) => {
      const it = ITEMS[id];
      const y = 168 + i * 30;
      const owned = it.kind === 'gear' && this.player.gearOwned.includes(id);
      const sel = i === this.shop!.idx;
      if (sel) { g.fillStyle = '#f0c030'; g.fillRect(VW / 2 - 220, y - 5, 440, 26); }
      const canBuy = this.player.zeni >= it.price && !owned;
      pText(g, it.name, VW / 2 - 206, y, 8, owned ? '#585878' : sel ? '#101828' : canBuy ? '#fff' : '#f08888');
      pText(g, owned ? 'COMPRADO' : `${it.price}z`, VW / 2 + 140, y, 8, owned ? '#585878' : sel ? '#101828' : '#f8d030');
    });
    const selItem = ITEMS[stock[this.shop!.idx]];
    const lines = wrapText(g, selItem.desc, 420, 8);
    lines.forEach((l, i) => pText(g, l, VW / 2 - 206, 416 + i * 12, 8, '#c8d0e0'));
  }

  renderMenu(g: CanvasRenderingContext2D) {
    panel(g, VW / 2 - 200, 120, 400, 340);
    pTextC(g, 'MENU', VW / 2, 136, 12, '#f8d030');
    const opts = ['Itens', 'Status', 'Salvar', 'Som: ' + (chip.enabled ? 'ON' : 'OFF'), 'Fechar'];
    opts.forEach((o, i) => {
      const sel = i === this.menuIdx;
      if (sel) { g.fillStyle = '#f0c030'; g.fillRect(VW / 2 - 170, 164 + i * 32 - 4, 340, 26); }
      pText(g, o, VW / 2 - 156, 164 + i * 32, 9, sel ? '#101828' : '#fff');
    });
    if (this.menuIdx === 0) {
      // items list on right side
      const items = Object.entries(this.player.items).filter(([id, n]) => n > 0 && ITEMS[id]);
      pText(g, 'Z para usar item', VW / 2 + 20, 136, 7, '#a8b0c0');
      items.slice(0, 8).forEach(([id, n], i) => {
        pText(g, `${ITEMS[id].name} x${n}`, VW / 2 + 10, 200 + i * 26, 8, '#88c8f8');
      });
      if (this.itemIdx < items.length) {
        const selIt = ITEMS[items[this.itemIdx][0]];
        const lines = wrapText(g, selIt.desc, 180, 7);
        lines.forEach((l, i) => pText(g, l, VW / 2 - 190, 340 + i * 11, 7, '#c8d0e0'));
      }
    }
    if (this.menuIdx === 1) {
      const p = this.player;
      const info = [
        `Classe: ${this.cls().name}`,
        `Nivel: ${p.lv}`,
        `EXP: ${p.exp}/${expForLevel(p.lv)}`,
        `HP: ${Math.floor(p.hp)}/${this.maxHp()}`,
        `Ki: ${Math.floor(p.ki)}/${this.maxKi()}`,
        `ATK: ${this.pAtk()}  DEF: ${this.pDef()}`,
        `Nivel de Poder: ${this.powerLevel().toLocaleString('pt-BR')}`,
        `Esferas: ${p.balls.length}/7`,
        `Grupo: ${['voce', ...this.companions().map((c) => c.name)].join(', ')}`,
      ];
      info.forEach((l, i) => pText(g, l, VW / 2 + 10, 200 + i * 16, 8, '#e8e8f0'));
    }
  }

  renderDragon(g: CanvasRenderingContext2D) {
    g.fillStyle = '#050810';
    g.fillRect(0, 0, VW, VH);
    // lightning
    if (Math.random() < 0.06) {
      g.fillStyle = 'rgba(136,200,248,0.25)';
      g.fillRect(0, 0, VW, VH);
    }
    // dragon ball glow
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.t;
      g.fillStyle = '#f8a020';
      g.beginPath();
      g.arc(VW / 2 + Math.cos(a) * 180, VH - 90 + Math.sin(a) * 40, 8, 0, Math.PI * 2);
      g.fill();
    }
    const dragon = getDragonArt();
    g.drawImage(dragon, VW / 2 - dragon.width / 2, this.dragonY);
    if (this.dragonPhase === 1) {
      const wishes = ['Mais PODER (ATK+30)', 'Mais DEFESA (DEF+30)', 'Riquezas (+5.000 zeni)'];
      pTextC(g, 'Fale seu desejo, mortal...', VW / 2, 240, 12, '#88c8f8');
      wishes.forEach((w, i) => {
        const sel = i === this.wishIdx;
        pTextC(g, (sel ? '> ' : '') + w, VW / 2, 290 + i * 30, 10, sel ? '#f8d030' : '#fff');
      });
      pTextC(g, 'setas + Z', VW / 2, 400, 8, '#a8b0c0');
    }
  }

  // ---------- input ----------
  keydown(e: KeyboardEvent): boolean {
    const k = e.key;
    // title
    if (this.state === 'title') {
      const opts = this.hasSave() ? 2 : 1;
      if (k === 'ArrowUp') { this.titleIdx = (this.titleIdx - 1 + opts) % opts; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown') { this.titleIdx = (this.titleIdx + 1) % opts; chip.sfx('menu'); return true; }
      if (k === 'Enter' || k === 'z' || k === 'Z') {
        chip.resume();
        chip.sfx('confirm');
        if (this.hasSave() && this.titleIdx === 0) {
          this.load();
          this.state = 'world';
          chip.playSong('town');
        } else {
          this.state = 'create';
          this.createStep = 'name';
          this.nameInputCb?.(true, this.createName);
        }
        return true;
      }
      return false;
    }
    // create
    if (this.state === 'create') {
      if (this.createStep === 'name') {
        // handled by DOM input
        return true;
      }
      if (k === 'ArrowLeft') { this.createClassIdx = (this.createClassIdx + CLASSES.length - 1) % CLASSES.length; chip.sfx('menu'); return true; }
      if (k === 'ArrowRight') { this.createClassIdx = (this.createClassIdx + 1) % CLASSES.length; chip.sfx('menu'); return true; }
      if (k === 'Enter' || k === 'z' || k === 'Z') {
        chip.sfx('confirm');
        this.player.classId = CLASSES[this.createClassIdx].id;
        const c = this.cls();
        this.player.hp = c.hp; this.player.ki = c.ki;
        this.state = 'world';
        this.player.x = this.px; this.player.y = this.py;
        this.save();
        chip.playSong('town');
        this.showDialog([
          { who: 'Mestre Kame', text: `Bem-vindo ao Dragon Saga Online, ${this.player.name}!` },
          { who: 'Mestre Kame', text: 'Este mundo precisa de heróis. Visite-me na ilha ao sudeste (siga a estrada para leste e cruze a ponte)!' },
          { who: 'Sistema', text: 'Fale com aldeões, aceite missões, cace monstros e junte as 7 Esferas do Dragão!' },
        ]);
        return true;
      }
      return false;
    }
    // dragon
    if (this.state === 'dragon') {
      if (this.dragonPhase === 0) {
        if (k === 'z' || k === 'Enter') this.dragonPhase = 1;
        return true;
      }
      if (k === 'ArrowUp') { this.wishIdx = (this.wishIdx + 2) % 3; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown') { this.wishIdx = (this.wishIdx + 1) % 3; chip.sfx('menu'); return true; }
      if (k === 'z' || k === 'Enter') { chip.sfx('dragon'); this.applyWish(this.wishIdx); return true; }
      return false;
    }
    // battle
    if (this.state === 'battle' && this.battle) {
      this.battle.key(k);
      return true;
    }
    // dialog
    if (this.dialog) {
      if (k === 'z' || k === 'Enter' || k === ' ') { this.advanceDialog(); return true; }
      return true;
    }
    // shop
    if (this.shop) {
      const stock = ['sensu', 'capsula', 'elixir', 'bastao', 'armadura', 'scouter', 'espada', 'manto'];
      if (k === 'ArrowUp') { this.shop.idx = (this.shop.idx + stock.length - 1) % stock.length; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown') { this.shop.idx = (this.shop.idx + 1) % stock.length; chip.sfx('menu'); return true; }
      if (k === 'z' || k === 'Enter' || k === 'Z') {
        const id = stock[this.shop.idx];
        const it = ITEMS[id];
        const owned = it.kind === 'gear' && this.player.gearOwned.includes(id);
        if (owned) { chip.sfx('cancel'); return true; }
        if (this.player.zeni >= it.price) {
          this.player.zeni -= it.price;
          if (it.kind === 'gear') {
            this.player.gearOwned.push(id);
            if (id === 'scouter') this.toast = { text: 'Scouter ativado! PLs visiveis no mapa.', t: 3 };
          } else {
            this.player.items[id] = (this.player.items[id] || 0) + 1;
          }
          chip.sfx('coin');
          this.addChat({ name: 'Loja', text: `${this.player.name} comprou ${it.name}!`, color: '#f8d030', sys: true });
          this.save();
        } else chip.sfx('cancel');
        return true;
      }
      if (k === 'x' || k === 'Escape') { this.shop = null; chip.sfx('cancel'); return true; }
      return true;
    }
    // menu
    if (this.menuOpen) {
      const opts = 5;
      if (k === 'ArrowUp') { this.menuIdx = (this.menuIdx + opts - 1) % opts; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown') { this.menuIdx = (this.menuIdx + 1) % opts; chip.sfx('menu'); return true; }
      if (k === 'z' || k === 'Enter' || k === 'Z') {
        chip.sfx('confirm');
        if (this.menuIdx === 0) {
          // use item
          const items = Object.entries(this.player.items).filter(([id, n]) => n > 0 && ITEMS[id] && ITEMS[id].kind !== 'gear');
          if (items.length && this.itemIdx < items.length) {
            const [id] = items[this.itemIdx];
            const it = ITEMS[id];
            if (it.kind === 'heal') { this.player.hp = Math.min(this.maxHp(), this.player.hp + (it.power || 0)); }
            else if (it.kind === 'kiheal') { this.player.ki = Math.min(this.maxKi(), this.player.ki + (it.power || 0)); }
            else if (it.kind === 'fullheal') { this.player.hp = this.maxHp(); this.player.ki = this.maxKi(); }
            this.player.items[id]--;
            chip.sfx('heal');
          }
        } else if (this.menuIdx === 2) {
          this.player.x = this.px; this.player.y = this.py;
          this.save();
          this.toast = { text: 'Jogo salvo!', t: 2 };
        } else if (this.menuIdx === 3) {
          chip.setEnabled(!chip.enabled);
        } else if (this.menuIdx === 4) {
          this.menuOpen = false;
        }
        return true;
      }
      if (this.menuIdx === 0 && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        const n = Object.values(this.player.items).filter((n) => n > 0).length;
        if (n > 0) { this.itemIdx = (this.itemIdx + (k === 'ArrowRight' ? 1 : n - 1)) % n; chip.sfx('menu'); }
        return true;
      }
      if (k === 'x' || k === 'Escape') { this.menuOpen = false; chip.sfx('cancel'); return true; }
      return true;
    }
    // world
    if (this.state === 'world') {
      // NOTE: Enter is reserved to open the MMO chat (handled in page.tsx)
      if (k === 'z' || k === 'Z' || k === ' ') {
        this.interact();
        return true;
      }
      if (k === 'x' || k === 'Escape') { this.menuOpen = true; this.menuIdx = 0; chip.sfx('confirm'); return true; }
      if (k === 'm' || k === 'M') { chip.setEnabled(!chip.enabled); return true; }
    }
    return false;
  }

  // DOM callbacks (set by React page)
  setNameInputCb(cb: (show: boolean, current: string) => void) { this.nameInputCb = cb; }
  confirmName(name: string) {
    const cleaned = name.trim().slice(0, 12);
    this.createName = cleaned.length >= 2 ? cleaned : 'Guerreiro';
    this.player.name = this.createName;
    this.createStep = 'class';
    this.nameInputCb?.(false, '');
    chip.sfx('confirm');
  }
  setTouchVector(x: number, y: number) {
    const magnitude = Math.hypot(x, y);
    if (magnitude <= 0.08) {
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      return;
    }

    const scale = magnitude > 1 ? 1 / magnitude : 1;
    this.touchMoveX = x * scale;
    this.touchMoveY = y * scale;
  }

  clearTouchVector() {
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchDirs.clear();
  }

  touchKey(key: string) {
    chip.resume();
    return this.keydown(new KeyboardEvent('keydown', { key }));
  }
}
