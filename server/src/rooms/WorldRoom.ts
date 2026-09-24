import { Client, Room, ServerError } from "colyseus";
import {
  ENEMY_RULES,
  MOB_SPAWNS,
  SKILL_RULES,
  canUseSkill,
  canWalk,
  computeCharacterStats,
  isPvpSafeZone,
  type Direction,
} from "../worldRules.js";

interface CharacterRecord {
  id: string;
  user_id: string;
  name: string;
  class_id: string;
  level: number;
  xp: number;
  hp: number;
  ki: number;
  gold: number;
  state: Record<string, unknown> | null;
  x: number;
  y: number;
}

interface AuthData {
  userId: string;
  accessToken: string;
  character: CharacterRecord;
}

interface OnlinePlayer {
  sessionId: string;
  userId: string;
  accessToken: string;
  characterId: string;
  name: string;
  classId: string;
  x: number;
  y: number;
  dir: Direction;
  level: number;
  attack: number;
  defense: number;
  maxHp: number;
  maxKi: number;
  combatHp: number;
  combatKi: number;
  flags: Record<string, unknown>;
  items: Record<string, number>;
  gearOwned: string[];
  canSuper: boolean;
  pvpHp: number;
  pvpMaxHp: number;
  koUntil: number;
  pvpProtectedUntil: number;
  lastMoveAt: number;
  lastPvpAttackAt: number;
}

interface WorldMob {
  spawnId: string;
  enemyId: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  vx: number;
  vy: number;
  dead: boolean;
  respawnAt: number;
  isBoss: boolean;
  engagedBy: string | null;
  engagedUntil: number;
  nextWanderAt: number;
}

interface ActiveEncounter {
  battleId: string;
  spawnId: string;
  enemyId: string;
  startedAt: number;
  playerHp: number;
  playerKi: number;
  enemyHp: number;
  enemyMaxHp: number;
  buffed: boolean;
  transformed: boolean;
  defending: boolean;
  lastActionAt: number;
  outcome: "active" | "win" | "lose" | "fled";
}

interface MovePayload {
  x?: number;
  y?: number;
  dir?: Direction;
  seq?: number;
}
interface ChatPayload { text?: string; }
interface PvpAttackPayload { targetSessionId?: string; }
interface PveBeginPayload { spawnId?: string; }
interface PveActionPayload {
  battleId?: string;
  action?: "attack" | "skill" | "item" | "defend" | "flee" | "transform";
  skillId?: string;
  itemId?: string;
}
interface PveCompletePayload {
  battleId?: string;
  outcome?: "win" | "fled" | "lose";
  hp?: number;
  ki?: number;
}
interface WorldActionPayload {
  action?: "shop_buy" | "world_item" | "collect_ball" | "wish" | "master_quest" | "fountain_heal";
  arg?: string;
}
interface TradeRequestPayload { targetSessionId?: string; }
interface TradeOfferPayload { tradeId?: string; itemId?: string; quantity?: number; }
interface TradeAcceptPayload { tradeId?: string; }
interface TradeCancelPayload { tradeId?: string; }

interface TradeOffer {
  itemId: string;
  quantity: number;
}

interface ActiveTrade {
  tradeId: string;
  aSessionId: string;
  bSessionId: string;
  offers: Map<string, TradeOffer>;
  accepted: Set<string>;
  createdAt: number;
}

const DIRECTIONS = new Set<Direction>(["down","up","left","right"]);
const MAX_CHAT_LENGTH = 80;
const MAX_CLIENTS = 100;
const BASE_MOVE_TOLERANCE = 14;
const MAX_SPEED_PER_SECOND = 120;
const PVP_RANGE = 52;
const PVP_ATTACK_COOLDOWN_MS = 700;
const PVP_RESPAWN_MS = 5000;
const PVE_RANGE = 34;
const PVE_LOCK_MS = 60000;
const TRADE_RANGE = 64;
const TRADE_TTL_MS = 60000;
const TRADE_ITEMS = new Set([
  "sensu","capsula","elixir","bastao","armadura","scouter","espada","manto",
]);
const TRADE_GEAR = new Set(["bastao","armadura","scouter","espada","manto"]);

function publicPlayer(player: OnlinePlayer) {
  return {
    sessionId: player.sessionId,
    name: player.name,
    classId: player.classId,
    x: player.x,
    y: player.y,
    dir: player.dir,
    pvpHp: player.pvpHp,
    pvpMaxHp: player.pvpMaxHp,
    pvpKo: player.pvpHp <= 0 || player.koUntil > Date.now(),
  };
}

function publicMob(mob: WorldMob) {
  return {
    spawnId: mob.spawnId,
    enemyId: mob.enemyId,
    x: mob.x,
    y: mob.y,
    dead: mob.dead,
    isBoss: mob.isBoss,
    respawnAt: mob.respawnAt,
  };
}

function numberFrom(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
  }
  return out;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function combatDamage(attack: number, defense: number, power = 1, defending = false): number {
  const raw =
    attack * power * (0.85 + Math.random() * 0.3) -
    defense * (defending ? 1.6 : 1) * 0.5;
  return Math.max(1, Math.floor(raw));
}

function ownsTradeItem(player: OnlinePlayer, itemId: string, quantity: number): boolean {
  if (!TRADE_ITEMS.has(itemId) || quantity < 1 || quantity > 99) return false;
  if (TRADE_GEAR.has(itemId)) {
    return quantity === 1 && player.gearOwned.includes(itemId);
  }
  return (player.items[itemId] || 0) >= quantity;
}

function isFacing(attacker: OnlinePlayer, target: OnlinePlayer): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const d = Math.hypot(dx, dy);
  if (d <= 0.001) return true;
  const f: [number, number] =
    attacker.dir === "left" ? [-1,0] :
    attacker.dir === "right" ? [1,0] :
    attacker.dir === "up" ? [0,-1] : [0,1];
  return (dx / d) * f[0] + (dy / d) * f[1] >= 0.15;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase server config missing.");
  return { url, publishableKey };
}

interface RewardCharacterSnapshot {
  id: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  ki: number;
  state: Record<string, unknown>;
  x?: number;
  y?: number;
  quest_completed?: boolean;
}

async function applyAuthoritativeReward(
  player: OnlinePlayer,
  enemyId: string,
  exp: number,
  zeni: number,
  drop: string | null,
  hp: number,
  ki: number,
): Promise<RewardCharacterSnapshot> {
  const { url, publishableKey } = supabaseConfig();
  const serverSecret = process.env.PVE_SERVER_SECRET;
  if (!serverSecret) throw new Error("PVE_SERVER_SECRET is required.");

  const response = await fetch(`${url}/rest/v1/rpc/apply_pve_reward`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${player.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      p_character_id: player.characterId,
      p_claim_id: crypto.randomUUID(),
      p_enemy_id: enemyId,
      p_exp: exp,
      p_zeni: zeni,
      p_drop: drop,
      p_hp: hp,
      p_ki: ki,
      p_server_secret: serverSecret,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase reward RPC failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as RewardCharacterSnapshot;
}

async function applyWorldAction(
  player: OnlinePlayer,
  action: NonNullable<WorldActionPayload["action"]>,
  arg: string,
  hp: number,
  ki: number,
): Promise<RewardCharacterSnapshot> {
  const { url, publishableKey } = supabaseConfig();
  const serverSecret = process.env.PVE_SERVER_SECRET;
  if (!serverSecret) throw new Error("PVE_SERVER_SECRET is required.");

  const response = await fetch(`${url}/rest/v1/rpc/apply_world_action`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${player.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      p_character_id: player.characterId,
      p_action: action,
      p_arg: arg,
      p_hp: hp,
      p_ki: ki,
      p_server_secret: serverSecret,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase world action RPC failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as RewardCharacterSnapshot;
}

async function applyVitalCheckpoint(
  player: OnlinePlayer,
  action: "checkpoint" | "fountain_heal" | "pve_defeat" | "pvp_respawn",
  hp: number,
  ki: number,
  x: number,
  y: number,
): Promise<RewardCharacterSnapshot> {
  const { url, publishableKey } = supabaseConfig();
  const serverSecret = process.env.PVE_SERVER_SECRET;
  if (!serverSecret) throw new Error("PVE_SERVER_SECRET is required.");

  const response = await fetch(`${url}/rest/v1/rpc/apply_vital_checkpoint`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${player.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      p_character_id: player.characterId,
      p_action: action,
      p_hp: hp,
      p_ki: ki,
      p_x: x,
      p_y: y,
      p_server_secret: serverSecret,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase vital checkpoint RPC failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as RewardCharacterSnapshot;
}

function syncOnlinePlayer(player: OnlinePlayer, character: RewardCharacterSnapshot) {
  const state = character.state || {};
  player.level = Math.max(1, Math.floor(numberFrom(character.level, player.level)));
  player.combatHp = Math.max(1, Math.floor(numberFrom(character.hp, player.combatHp)));
  player.combatKi = Math.max(0, Math.floor(numberFrom(character.ki, player.combatKi)));
  player.flags = objectRecord(state.flags);
  player.items = numberRecord(state.items);
  player.gearOwned = stringArray(state.gearOwned);
  player.canSuper = Boolean(player.flags.super) || player.level >= 12;

  const stats = computeCharacterStats({
    classId: player.classId,
    level: player.level,
    baseAtk: numberFrom(state.baseAtk, 0),
    baseDef: numberFrom(state.baseDef, 0),
    gearOwned: player.gearOwned,
  });
  player.attack = stats.attack;
  player.defense = stats.defense;
  player.maxHp = stats.maxHp;
  player.maxKi = stats.maxKi;
  player.combatHp = Math.min(player.combatHp, player.maxHp);
  player.combatKi = Math.min(player.combatKi, player.maxKi);
  player.pvpMaxHp = stats.maxHp;
  player.pvpHp = Math.min(player.pvpHp, player.pvpMaxHp);
  if (Number.isFinite(character.x)) player.x = Number(character.x);
  if (Number.isFinite(character.y)) player.y = Number(character.y);
}

interface TradeRpcResult {
  trade_id: string;
  character_a: CharacterRecord;
  character_b: CharacterRecord;
}

async function executeItemTrade(
  a: OnlinePlayer,
  b: OnlinePlayer,
  tradeId: string,
  offerA: TradeOffer,
  offerB: TradeOffer,
): Promise<TradeRpcResult> {
  const { url, publishableKey } = supabaseConfig();
  const serverSecret = process.env.PVE_SERVER_SECRET;
  if (!serverSecret) throw new Error("PVE_SERVER_SECRET is required.");

  const response = await fetch(`${url}/rest/v1/rpc/execute_item_trade`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${a.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      p_trade_id: tradeId,
      p_character_a: a.characterId,
      p_character_b: b.characterId,
      p_item_a: offerA.itemId,
      p_quantity_a: offerA.quantity,
      p_item_b: offerB.itemId,
      p_quantity_b: offerB.quantity,
      p_server_secret: serverSecret,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase item trade RPC failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as TradeRpcResult;
}

async function validateAccessTokenUser(token: string): Promise<string | null> {
  const { url, publishableKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string };
  return typeof user.id === "string" ? user.id : null;
}

async function loadOwnedCharacter(token: string, characterId: string): Promise<CharacterRecord | null> {
  const { url, publishableKey } = supabaseConfig();
  const query =
    `/rest/v1/characters?id=eq.${encodeURIComponent(characterId)}` +
    "&select=id,user_id,name,class_id,level,xp,hp,ki,gold,state,x,y&limit=1";
  const response = await fetch(`${url}${query}`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as CharacterRecord[];
  return rows[0] || null;
}

export class WorldRoom extends Room {
  maxClients = MAX_CLIENTS;
  private players = new Map<string, OnlinePlayer>();
  private mobs = new Map<string, WorldMob>();
  private encounters = new Map<string, ActiveEncounter>();
  private trades = new Map<string, ActiveTrade>();
  private lastMobBroadcastAt = 0;

  onCreate() {
    for (const def of MOB_SPAWNS) {
      this.mobs.set(def.spawnId, {
        ...def,
        spawnX: def.x,
        spawnY: def.y,
        vx: 0,
        vy: 0,
        dead: false,
        respawnAt: 0,
        engagedBy: null,
        engagedUntil: 0,
        nextWanderAt: Date.now() + Math.random() * 2000,
      });
    }
    this.setSimulationInterval((dt) => this.updateMobs(dt), 100);
  }

  static async onAuth(token: string, options: { characterId?: string }): Promise<AuthData> {
    if (!token) throw new ServerError(401, "Supabase access token is required.");
    const characterId = options?.characterId?.trim();
    if (!characterId) throw new ServerError(400, "characterId is required.");
    const character = await loadOwnedCharacter(token, characterId);
    if (!character) throw new ServerError(403, "Character not found or not owned by this account.");
    return { userId: character.user_id, accessToken: token, character };
  }

  private clientBySessionId(sessionId: string): Client | undefined {
    return this.clients.find((client) => client.sessionId === sessionId);
  }

  private tradeForSession(sessionId: string): ActiveTrade | undefined {
    for (const trade of this.trades.values()) {
      if (trade.aSessionId === sessionId || trade.bSessionId === sessionId) return trade;
    }
    return undefined;
  }

  private sendTradeState(trade: ActiveTrade) {
    for (const sessionId of [trade.aSessionId, trade.bSessionId]) {
      const client = this.clientBySessionId(sessionId);
      if (!client) continue;
      const otherSessionId = sessionId === trade.aSessionId ? trade.bSessionId : trade.aSessionId;
      client.send("trade_state", {
        tradeId: trade.tradeId,
        selfOffer: trade.offers.get(sessionId) || null,
        otherOffer: trade.offers.get(otherSessionId) || null,
        selfAccepted: trade.accepted.has(sessionId),
        otherAccepted: trade.accepted.has(otherSessionId),
      });
    }
  }

  private cancelTrade(trade: ActiveTrade, message: string) {
    this.trades.delete(trade.tradeId);
    for (const sessionId of [trade.aSessionId, trade.bSessionId]) {
      this.clientBySessionId(sessionId)?.send("trade_cancelled", {
        tradeId: trade.tradeId,
        message,
      });
    }
  }

  private updateMobs(dtMs: number) {
    const now = Date.now();
    let changed = false;
    for (const mob of this.mobs.values()) {
      if (mob.dead) {
        if (mob.respawnAt && now >= mob.respawnAt) {
          mob.dead = false;
          mob.respawnAt = 0;
          mob.x = mob.spawnX;
          mob.y = mob.spawnY;
          mob.vx = 0;
          mob.vy = 0;
          mob.engagedBy = null;
          mob.engagedUntil = 0;
          changed = true;
        }
        continue;
      }
      if (mob.engagedBy && now > mob.engagedUntil) {
        mob.engagedBy = null;
        mob.engagedUntil = 0;
      }
      if (mob.isBoss || mob.engagedBy) continue;
      if (now >= mob.nextWanderAt) {
        mob.vx = (Math.random() - 0.5) * 2;
        mob.vy = (Math.random() - 0.5) * 2;
        mob.nextWanderAt = now + 1000 + Math.random() * 2000;
      }
      const dt = Math.min(0.2, dtMs / 1000);
      const nx = mob.x + mob.vx * 26 * dt;
      const ny = mob.y + mob.vy * 26 * dt;
      if (canWalk(nx, mob.y)) mob.x = nx; else mob.vx = -mob.vx;
      if (canWalk(mob.x, ny)) mob.y = ny; else mob.vy = -mob.vy;
      changed = changed || Math.abs(mob.vx) + Math.abs(mob.vy) > 0.01;
    }
    if (changed && now - this.lastMobBroadcastAt >= 250) {
      this.lastMobBroadcastAt = now;
      this.broadcast("mob_snapshot", Array.from(this.mobs.values(), publicMob));
    }
  }

  messages = {
    auth_refresh: async (client: Client, payload: { accessToken?: string }) => {
      const player = this.players.get(client.sessionId);
      const accessToken = String(payload?.accessToken || "").trim();
      if (!player || !accessToken) return;

      const userId = await validateAccessTokenUser(accessToken);
      if (!userId || userId !== player.userId) {
        client.send("auth_refresh_error", { message: "Token de sessão inválido." });
        return;
      }

      player.accessToken = accessToken;
      client.send("auth_refresh_ok", {});
    },

    move: (client: Client, payload: MovePayload) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.pvpHp <= 0 || player.koUntil > Date.now()) return;
      const requestedX = Number(payload?.x);
      const requestedY = Number(payload?.y);
      if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) return;
      const now = Date.now();
      const elapsed = Math.max(0.05, Math.min(1, (now - player.lastMoveAt) / 1000));
      const allowed = BASE_MOVE_TOLERANCE + MAX_SPEED_PER_SECOND * elapsed;
      const dx = requestedX - player.x;
      const dy = requestedY - player.y;
      const distance = Math.hypot(dx, dy);
      let nextX = requestedX;
      let nextY = requestedY;
      if (distance > allowed && distance > 0) {
        const scale = allowed / distance;
        nextX = player.x + dx * scale;
        nextY = player.y + dy * scale;
      }
      if (canWalk(nextX, player.y)) player.x = nextX;
      if (canWalk(player.x, nextY)) player.y = nextY;
      if (payload?.dir && DIRECTIONS.has(payload.dir)) player.dir = payload.dir;
      player.lastMoveAt = now;
      const seq = Number.isFinite(Number(payload?.seq)) ? Math.floor(Number(payload?.seq)) : 0;
      client.send("move_ack", {
        x: player.x,
        y: player.y,
        dir: player.dir,
        seq,
      });
      this.broadcast("player_move", { ...publicPlayer(player), seq }, { except: client });
    },

    chat: (client: Client, payload: ChatPayload) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      const text = String(payload?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return;
      this.broadcast("chat", { sessionId: player.sessionId, name: player.name, text }, { except: client });
    },

    world_action: async (client: Client, payload: WorldActionPayload) => {
      const player = this.players.get(client.sessionId);
      if (!player || this.encounters.has(client.sessionId)) return;

      const action = payload?.action;
      const arg = String(payload?.arg || "");
      if (!action) return;

      let hp = player.combatHp;
      let ki = player.combatKi;

      if (action === "shop_buy") {
        if (Math.hypot(player.x - 32 * 16, player.y - 31 * 16) > 64) {
          return client.send("world_action_error", { action, message: "Chegue mais perto da loja." });
        }
      } else if (action === "master_quest") {
        if (Math.hypot(player.x - 92 * 16, player.y - 74 * 16) > 64) {
          return client.send("world_action_error", { action, message: "Fale com o Mestre Kame de perto." });
        }
      } else if (action === "collect_ball") {
        const parts = arg.split(",");
        const tx = Number(parts[0]);
        const ty = Number(parts[1]);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
        if (Math.hypot(player.x - (tx * 16 + 8), player.y - (ty * 16 + 8)) > 34) {
          return client.send("world_action_error", { action, message: "Chegue mais perto da Esfera do Dragão." });
        }
      } else if (action === "world_item") {
        const qty = player.items[arg] || 0;
        if (qty <= 0) {
          return client.send("world_action_error", { action, message: "Você não possui esse item." });
        }
        if (arg === "sensu") hp = Math.min(player.maxHp, hp + 100);
        else if (arg === "capsula") ki = Math.min(player.maxKi, ki + 60);
        else if (arg === "elixir") { hp = player.maxHp; ki = player.maxKi; }
        else return client.send("world_action_error", { action, message: "Esse item não pode ser usado aqui." });
      } else if (action === "wish") {
        hp = player.maxHp;
        ki = player.maxKi;
      } else if (action === "fountain_heal") {
        const nearTownFountain = Math.hypot(player.x - 19 * 16, player.y - 30 * 16) <= 52;
        const nearTowerSpring = player.x >= 31 * 16 && player.x <= 39 * 16 &&
          player.y >= 32 * 16 && player.y <= 37 * 16;
        if (!nearTownFountain && !nearTowerSpring) {
          return client.send("world_action_error", { action, message: "Chegue mais perto de uma fonte." });
        }
        hp = player.maxHp;
        ki = player.maxKi;
      }

      try {
        const character = action === "fountain_heal"
          ? await applyVitalCheckpoint(player, "fountain_heal", hp, ki, player.x, player.y)
          : await applyWorldAction(player, action, arg, hp, ki);
        syncOnlinePlayer(player, character);
        if (action === "fountain_heal") player.pvpHp = player.pvpMaxHp;
        client.send("world_action_result", { action, arg, character });
      } catch (error) {
        console.error("[world_action]", error);
        const raw = error instanceof Error ? error.message : "";
        const message =
          raw.includes("not enough zeni") ? "Zeni insuficiente." :
          raw.includes("gear already owned") ? "Você já possui esse equipamento." :
          raw.includes("dragon ball already collected") ? "Essa Esfera já foi coletada." :
          raw.includes("seven dragon balls required") ? "Você precisa das 7 Esferas do Dragão." :
          raw.includes("master quest is not active") ? "Essa etapa da saga já foi concluída." :
          "Não foi possível concluir essa ação.";
        client.send("world_action_error", { action, message });
      }
    },

    trade_request: (client: Client, payload: TradeRequestPayload) => {
      const player = this.players.get(client.sessionId);
      const target = this.players.get(String(payload?.targetSessionId || "").trim());
      if (!player || !target || target.sessionId === player.sessionId) return;

      const fail = (message: string) => client.send("trade_error", { message });
      if (this.encounters.has(player.sessionId) || this.encounters.has(target.sessionId)) {
        return fail("Não é possível negociar durante uma batalha.");
      }
      if (player.koUntil > Date.now() || target.koUntil > Date.now()) {
        return fail("Não é possível negociar enquanto alguém está derrotado.");
      }
      if (Math.hypot(target.x - player.x, target.y - player.y) > TRADE_RANGE) {
        return fail("Chegue mais perto do outro jogador.");
      }
      if (this.tradeForSession(player.sessionId) || this.tradeForSession(target.sessionId)) {
        return fail("Um dos jogadores já está em uma troca.");
      }

      const trade: ActiveTrade = {
        tradeId: crypto.randomUUID(),
        aSessionId: player.sessionId,
        bSessionId: target.sessionId,
        offers: new Map(),
        accepted: new Set(),
        createdAt: Date.now(),
      };
      this.trades.set(trade.tradeId, trade);

      client.send("trade_open", {
        tradeId: trade.tradeId,
        otherSessionId: target.sessionId,
        otherName: target.name,
      });
      this.clientBySessionId(target.sessionId)?.send("trade_open", {
        tradeId: trade.tradeId,
        otherSessionId: player.sessionId,
        otherName: player.name,
      });

      setTimeout(() => {
        const current = this.trades.get(trade.tradeId);
        if (current && Date.now() - current.createdAt >= TRADE_TTL_MS) {
          this.cancelTrade(current, "A troca expirou.");
        }
      }, TRADE_TTL_MS + 250);
    },

    trade_offer: (client: Client, payload: TradeOfferPayload) => {
      const trade = this.trades.get(String(payload?.tradeId || ""));
      const player = this.players.get(client.sessionId);
      if (!trade || !player) return;
      if (client.sessionId !== trade.aSessionId && client.sessionId !== trade.bSessionId) return;

      const itemId = String(payload?.itemId || "");
      const quantity = Math.max(1, Math.floor(numberFrom(payload?.quantity, 1)));
      if (!ownsTradeItem(player, itemId, quantity)) {
        return client.send("trade_error", { message: "Item ou quantidade indisponível." });
      }

      trade.offers.set(client.sessionId, { itemId, quantity });
      trade.accepted.clear();
      this.sendTradeState(trade);
    },

    trade_accept: async (client: Client, payload: TradeAcceptPayload) => {
      const trade = this.trades.get(String(payload?.tradeId || ""));
      if (!trade) return;
      if (client.sessionId !== trade.aSessionId && client.sessionId !== trade.bSessionId) return;

      const a = this.players.get(trade.aSessionId);
      const b = this.players.get(trade.bSessionId);
      const offerA = trade.offers.get(trade.aSessionId);
      const offerB = trade.offers.get(trade.bSessionId);
      if (!a || !b || !offerA || !offerB) {
        return client.send("trade_error", { message: "Os dois jogadores precisam fazer uma oferta." });
      }

      if (
        this.encounters.has(a.sessionId) ||
        this.encounters.has(b.sessionId) ||
        a.koUntil > Date.now() ||
        b.koUntil > Date.now() ||
        Math.hypot(b.x - a.x, b.y - a.y) > TRADE_RANGE
      ) {
        return this.cancelTrade(trade, "A troca foi cancelada porque as condições mudaram.");
      }

      if (!ownsTradeItem(a, offerA.itemId, offerA.quantity) || !ownsTradeItem(b, offerB.itemId, offerB.quantity)) {
        return this.cancelTrade(trade, "Um dos itens oferecidos não está mais disponível.");
      }

      trade.accepted.add(client.sessionId);
      this.sendTradeState(trade);
      if (trade.accepted.size < 2) return;

      try {
        const result = await executeItemTrade(a, b, trade.tradeId, offerA, offerB);
        syncOnlinePlayer(a, { ...result.character_a, state: result.character_a.state || {} });
        syncOnlinePlayer(b, { ...result.character_b, state: result.character_b.state || {} });
        this.trades.delete(trade.tradeId);

        this.clientBySessionId(a.sessionId)?.send("trade_complete", {
          tradeId: trade.tradeId,
          otherName: b.name,
          character: result.character_a,
        });
        this.clientBySessionId(b.sessionId)?.send("trade_complete", {
          tradeId: trade.tradeId,
          otherName: a.name,
          character: result.character_b,
        });
      } catch (error) {
        console.error("[trade]", error);
        this.cancelTrade(trade, "A troca não pôde ser concluída.");
      }
    },

    trade_cancel: (client: Client, payload: TradeCancelPayload) => {
      const trade = this.trades.get(String(payload?.tradeId || ""));
      if (!trade) return;
      if (client.sessionId !== trade.aSessionId && client.sessionId !== trade.bSessionId) return;
      this.cancelTrade(trade, "A troca foi cancelada.");
    },

    pve_begin: (client: Client, payload: PveBeginPayload) => {
      const player = this.players.get(client.sessionId);
      const mob = this.mobs.get(String(payload?.spawnId || ""));
      if (!player || !mob) return;
      const enemy = ENEMY_RULES[mob.enemyId];
      if (!enemy) return;

      const now = Date.now();
      if (this.tradeForSession(client.sessionId)) {
        return client.send("pve_error", { message: "Finalize ou cancele a troca antes de batalhar." });
      }
      const existingEncounter = this.encounters.get(client.sessionId);
      if (existingEncounter) {
        const existingMob = this.mobs.get(existingEncounter.spawnId);
        if (existingMob && existingMob.engagedUntil <= now) {
          existingMob.engagedBy = null;
          existingMob.engagedUntil = 0;
          this.encounters.delete(client.sessionId);
        } else {
          return client.send("pve_error", { message: "Você já está em uma batalha." });
        }
      }
      if (mob.dead) return client.send("pve_error", { message: "Esse inimigo já foi derrotado." });
      if (mob.engagedBy && mob.engagedBy !== client.sessionId && mob.engagedUntil > now) {
        return client.send("pve_error", { message: "Outro jogador já está enfrentando esse inimigo." });
      }
      if (Math.hypot(mob.x - player.x, mob.y - player.y) > PVE_RANGE) {
        return client.send("pve_error", { message: "Chegue mais perto do inimigo." });
      }

      const battleId = crypto.randomUUID();
      mob.engagedBy = client.sessionId;
      mob.engagedUntil = now + PVE_LOCK_MS;

      const encounter: ActiveEncounter = {
        battleId,
        spawnId: mob.spawnId,
        enemyId: mob.enemyId,
        startedAt: now,
        playerHp: Math.max(1, Math.min(player.maxHp, player.combatHp)),
        playerKi: Math.max(0, Math.min(player.maxKi, player.combatKi)),
        enemyHp: enemy.hp,
        enemyMaxHp: enemy.hp,
        buffed: false,
        transformed: false,
        defending: false,
        lastActionAt: 0,
        outcome: "active",
      };

      this.encounters.set(client.sessionId, encounter);
      client.send("pve_begin", {
        battleId,
        spawnId: mob.spawnId,
        enemyId: mob.enemyId,
        isBoss: mob.isBoss,
        playerHp: encounter.playerHp,
        playerKi: encounter.playerKi,
        enemyHp: encounter.enemyHp,
        enemyMaxHp: encounter.enemyMaxHp,
      });
    },

    pve_action: async (client: Client, payload: PveActionPayload) => {
      const player = this.players.get(client.sessionId);
      const encounter = this.encounters.get(client.sessionId);
      if (!player || !encounter || payload?.battleId !== encounter.battleId) return;
      if (encounter.outcome !== "active") return;

      const enemy = ENEMY_RULES[encounter.enemyId];
      if (!enemy) return;

      const now = Date.now();
      if (now - encounter.lastActionAt < 220) return;
      encounter.lastActionAt = now;

      const action = payload.action;
      let acted = false;

      const effectiveAttack =
        player.attack *
        (encounter.buffed ? 1.3 : 1) *
        (encounter.transformed ? 1.8 : 1);

      if (action === "attack") {
        encounter.enemyHp = Math.max(
          0,
          encounter.enemyHp - combatDamage(effectiveAttack, enemy.def),
        );
        acted = true;
      } else if (action === "skill") {
        const skillId = String(payload.skillId || "");
        const skill = SKILL_RULES[skillId];
        if (
          skill &&
          canUseSkill(player.classId, player.level, skillId, player.flags) &&
          encounter.playerKi >= skill.cost
        ) {
          encounter.playerKi -= skill.cost;
          if (skill.kind === "heal") {
            const heal = Math.floor(
              encounter.playerKi * skill.power * 0.9 + effectiveAttack * 0.5,
            );
            encounter.playerHp = Math.min(player.maxHp, encounter.playerHp + heal);
          } else if (skill.kind === "buff") {
            encounter.buffed = true;
          } else {
            const hits = skill.kind === "multi" ? 2 : 1;
            for (let i = 0; i < hits; i++) {
              encounter.enemyHp = Math.max(
                0,
                encounter.enemyHp - combatDamage(effectiveAttack, enemy.def, skill.power),
              );
            }
          }
          acted = true;
        }
      } else if (action === "item") {
        const itemId = String(payload.itemId || "");
        const quantity = player.items[itemId] || 0;
        if (quantity > 0 && ["sensu", "capsula", "elixir"].includes(itemId)) {
          let nextHp = encounter.playerHp;
          let nextKi = encounter.playerKi;
          if (itemId === "sensu") nextHp = Math.min(player.maxHp, nextHp + 100);
          if (itemId === "capsula") nextKi = Math.min(player.maxKi, nextKi + 60);
          if (itemId === "elixir") {
            nextHp = player.maxHp;
            nextKi = player.maxKi;
          }

          try {
            const character = await applyWorldAction(
              player,
              "world_item",
              itemId,
              nextHp,
              nextKi,
            );
            syncOnlinePlayer(player, character);
            encounter.playerHp = player.combatHp;
            encounter.playerKi = player.combatKi;
            acted = true;
          } catch (error) {
            console.error("[pve_item]", error);
            client.send("pve_error", { message: "Não foi possível usar esse item." });
            return;
          }
        }
      } else if (action === "defend") {
        encounter.defending = true;
        acted = true;
      } else if (action === "transform") {
        if (player.canSuper && !encounter.transformed && encounter.playerKi >= 20) {
          encounter.transformed = true;
          acted = true;
        }
      } else if (action === "flee") {
        if (!enemy.boss && Math.random() < 0.7) {
          encounter.outcome = "fled";
          acted = true;
        } else {
          acted = true;
        }
      }

      if (!acted) {
        client.send("pve_state", {
          battleId: encounter.battleId,
          playerHp: encounter.playerHp,
          playerKi: encounter.playerKi,
          enemyHp: encounter.enemyHp,
          enemyMaxHp: encounter.enemyMaxHp,
          outcome: encounter.outcome,
        });
        return;
      }

      if (encounter.enemyHp <= 0) {
        encounter.outcome = "win";
      } else if (encounter.outcome === "active") {
        const enemyDamage = combatDamage(
          enemy.atk,
          player.defense,
          1,
          encounter.defending,
        );
        encounter.defending = false;
        encounter.playerHp = Math.max(0, encounter.playerHp - enemyDamage);
        if (encounter.playerHp <= 0) encounter.outcome = "lose";

        if (encounter.transformed) {
          encounter.playerKi = Math.max(0, encounter.playerKi - 4);
          if (encounter.playerKi <= 0) encounter.transformed = false;
        }
      }

      player.combatHp = Math.max(1, encounter.playerHp);
      player.combatKi = encounter.playerKi;

      client.send("pve_state", {
        battleId: encounter.battleId,
        playerHp: encounter.playerHp,
        playerKi: encounter.playerKi,
        enemyHp: encounter.enemyHp,
        enemyMaxHp: encounter.enemyMaxHp,
        outcome: encounter.outcome,
      });
    },

    pve_complete: async (client: Client, payload: PveCompletePayload) => {
      const player = this.players.get(client.sessionId);
      const encounter = this.encounters.get(client.sessionId);
      if (!player || !encounter || payload?.battleId !== encounter.battleId) return;
      const mob = this.mobs.get(encounter.spawnId);
      const enemy = ENEMY_RULES[encounter.enemyId];
      if (!mob || !enemy) return;
      const requestedOutcome = payload?.outcome;

      if (requestedOutcome === "win" && encounter.outcome !== "win") {
        client.send("pve_error", { message: "O servidor ainda não confirmou a vitória." });
        return;
      }

      if (requestedOutcome !== "win") {
        this.encounters.delete(client.sessionId);
        mob.engagedBy = null;
        mob.engagedUntil = 0;

        const outcome =
          encounter.outcome === "lose" ? "lose" :
          encounter.outcome === "fled" ? "fled" :
          requestedOutcome;

        const checkpointAction = outcome === "lose" ? "pve_defeat" : "checkpoint";
        const nextHp = outcome === "lose"
          ? Math.max(1, Math.floor(player.maxHp / 2))
          : Math.max(1, encounter.playerHp);
        const nextKi = outcome === "lose"
          ? Math.max(0, Math.floor(player.maxKi / 2))
          : Math.max(0, encounter.playerKi);
        const nextX = outcome === "lose" ? 19.5 * 16 : player.x;
        const nextY = outcome === "lose" ? 43.5 * 16 : player.y;

        try {
          const character = await applyVitalCheckpoint(
            player,
            checkpointAction,
            nextHp,
            nextKi,
            nextX,
            nextY,
          );
          syncOnlinePlayer(player, character);
          client.send("pve_result", {
            outcome,
            battleId: encounter.battleId,
            hp: player.combatHp,
            ki: player.combatKi,
            x: player.x,
            y: player.y,
            character,
          });
        } catch (error) {
          console.error("[pve_checkpoint]", error);
          client.send("pve_error", { message: "Não foi possível salvar o resultado da batalha." });
        }
        return;
      }

      const drop = enemy.drop && Math.random() < enemy.drop.chance ? enemy.drop.id : null;
      const hp = Math.max(1, encounter.playerHp);
      const ki = Math.max(0, encounter.playerKi);

      try {
        const character = await applyAuthoritativeReward(
          player,
          enemy.id,
          enemy.exp,
          enemy.zeni,
          drop,
          hp,
          ki,
        );

        this.encounters.delete(client.sessionId);
        mob.engagedBy = null;
        mob.engagedUntil = 0;

        syncOnlinePlayer(player, character);

        mob.dead = true;
        mob.respawnAt = Date.now() + (mob.isBoss ? 90000 + Math.random() * 60000 : 18000 + Math.random() * 10000);
        mob.vx = 0;
        mob.vy = 0;
        this.broadcast("mob_update", publicMob(mob));

        client.send("pve_result", {
          outcome: "win",
          battleId: encounter.battleId,
          spawnId: mob.spawnId,
          enemyId: mob.enemyId,
          exp: enemy.exp,
          zeni: enemy.zeni,
          drop,
          character,
        });
      } catch (error) {
        console.error("[pve_reward]", error);
        client.send("pve_error", { message: "Não foi possível confirmar a recompensa. Tente novamente." });
      }
    },

    pvp_attack: (client: Client, payload: PvpAttackPayload) => {
      const attacker = this.players.get(client.sessionId);
      const target = this.players.get(String(payload?.targetSessionId || "").trim());
      if (!attacker || !target || target.sessionId === attacker.sessionId) return;
      const now = Date.now();
      const fail = (message: string) => client.send("pvp_error", { message });
      if (attacker.pvpHp <= 0 || attacker.koUntil > now) return fail("Você está se recuperando do PvP.");
      if (target.pvpHp <= 0 || target.koUntil > now) return fail("Esse jogador já foi derrotado.");
      if (attacker.pvpProtectedUntil > now || target.pvpProtectedUntil > now) {
        return fail("Proteção PvP temporária ativa.");
      }
      if (isPvpSafeZone(attacker.x, attacker.y) || isPvpSafeZone(target.x, target.y)) {
        return fail("PvP não é permitido dentro da cidade.");
      }
      if (this.encounters.has(attacker.sessionId) || this.encounters.has(target.sessionId)) {
        return fail("PvP indisponível durante uma batalha PvE.");
      }
      if (this.tradeForSession(attacker.sessionId) || this.tradeForSession(target.sessionId)) {
        return fail("PvP indisponível durante uma troca.");
      }
      if (now - attacker.lastPvpAttackAt < PVP_ATTACK_COOLDOWN_MS) return;
      if (Math.hypot(target.x - attacker.x, target.y - attacker.y) > PVP_RANGE || !isFacing(attacker, target)) return;
      attacker.lastPvpAttackAt = now;
      const damage = Math.max(1, Math.floor(attacker.attack * (0.88 + Math.random() * 0.24) - target.defense * 0.42));
      target.pvpHp = Math.max(0, target.pvpHp - damage);
      this.broadcast("pvp_hit", {
        attackerSessionId: attacker.sessionId,
        targetSessionId: target.sessionId,
        attackerName: attacker.name,
        targetName: target.name,
        damage,
        hp: target.pvpHp,
        maxHp: target.pvpMaxHp,
      });
      if (target.pvpHp > 0) return;
      target.koUntil = now + PVP_RESPAWN_MS;
      this.broadcast("pvp_ko", {
        attackerSessionId: attacker.sessionId,
        targetSessionId: target.sessionId,
        attackerName: attacker.name,
        targetName: target.name,
      });
      const id = target.sessionId;
      setTimeout(() => {
        void (async () => {
          const current = this.players.get(id);
          if (!current || current !== target) return;
          try {
            const character = await applyVitalCheckpoint(
              current,
              "pvp_respawn",
              Math.max(1, Math.floor(current.maxHp / 2)),
              Math.max(0, Math.floor(current.maxKi / 2)),
              19.5 * 16,
              43.5 * 16,
            );
            syncOnlinePlayer(current, character);
            current.pvpHp = current.pvpMaxHp;
            current.koUntil = 0;
            current.pvpProtectedUntil = Date.now() + 5000;
            this.broadcast("pvp_respawn", {
              ...publicPlayer(current),
              character,
            });
          } catch (error) {
            console.error("[pvp_respawn]", error);
          }
        })();
      }, PVP_RESPAWN_MS);
    },
  };

  onJoin(client: Client, _options: unknown, auth: AuthData) {
    const character = auth.character;
    const state = character.state || {};
    const level = Math.max(1, Math.floor(numberFrom(character.level, 1)));
    const stats = computeCharacterStats({
      classId: character.class_id,
      level,
      baseAtk: numberFrom(state.baseAtk, 0),
      baseDef: numberFrom(state.baseDef, 0),
      gearOwned: stringArray(state.gearOwned),
    });
    const player: OnlinePlayer = {
      sessionId: client.sessionId,
      userId: auth.userId,
      accessToken: auth.accessToken,
      characterId: character.id,
      name: character.name,
      classId: character.class_id,
      x: Number.isFinite(character.x) && canWalk(character.x, character.y) ? character.x : 19.5 * 16,
      y: Number.isFinite(character.y) && canWalk(character.x, character.y) ? character.y : 43.5 * 16,
      dir: "down",
      level,
      attack: stats.attack,
      defense: stats.defense,
      maxHp: stats.maxHp,
      maxKi: stats.maxKi,
      combatHp: Math.max(1, Math.min(stats.maxHp, Math.floor(numberFrom(character.hp, stats.maxHp)))),
      combatKi: Math.max(0, Math.min(stats.maxKi, Math.floor(numberFrom(character.ki, stats.maxKi)))),
      flags: objectRecord(state.flags),
      items: numberRecord(state.items),
      gearOwned: stringArray(state.gearOwned),
      canSuper: Boolean(objectRecord(state.flags).super) || level >= 12,
      pvpHp: stats.maxHp,
      pvpMaxHp: stats.maxHp,
      koUntil: 0,
      pvpProtectedUntil: Date.now() + 8000,
      lastMoveAt: Date.now(),
      lastPvpAttackAt: 0,
    };
    this.players.set(client.sessionId, player);
    client.send("snapshot", Array.from(this.players.values(), publicPlayer));
    client.send("mob_snapshot", Array.from(this.mobs.values(), publicMob));
    this.broadcast("player_joined", publicPlayer(player), { except: client });
    this.broadcast("presence", { count: this.players.size });
  }

  async onLeave(client: Client) {
    const leavingPlayer = this.players.get(client.sessionId);
    const activeTrade = this.tradeForSession(client.sessionId);
    if (activeTrade) this.cancelTrade(activeTrade, "A troca foi cancelada porque um jogador saiu.");
    this.players.delete(client.sessionId);
    const encounter = this.encounters.get(client.sessionId);
    if (encounter) {
      const mob = this.mobs.get(encounter.spawnId);
      if (mob?.engagedBy === client.sessionId) {
        mob.engagedBy = null;
        mob.engagedUntil = 0;
      }
      this.encounters.delete(client.sessionId);
    }
    if (leavingPlayer) {
      try {
        await applyVitalCheckpoint(
          leavingPlayer,
          "checkpoint",
          leavingPlayer.combatHp,
          leavingPlayer.combatKi,
          leavingPlayer.x,
          leavingPlayer.y,
        );
      } catch (error) {
        console.error("[leave_checkpoint]", error);
      }
    }
    this.broadcast("player_left", { sessionId: client.sessionId });
    this.broadcast("presence", { count: this.players.size });
  }
}
