import { Client, Room, ServerError } from "colyseus";
import {
  ENEMY_RULES,
  MOB_SPAWNS,
  canWalk,
  computeCharacterStats,
  expForLevel,
  isPvpSafeZone,
  minimumBattleDurationMs,
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
interface PveCompletePayload {
  battleId?: string;
  outcome?: "win" | "fled" | "lose";
  hp?: number;
  ki?: number;
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
      this.broadcast("player_move", { ...publicPlayer(player), seq: payload?.seq ?? 0 }, { except: client });
    },

    chat: (client: Client, payload: ChatPayload) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      const text = String(payload?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return;
      this.broadcast("chat", { sessionId: player.sessionId, name: player.name, text }, { except: client });
    },

    pve_begin: (client: Client, payload: PveBeginPayload) => {
      const player = this.players.get(client.sessionId);
      const mob = this.mobs.get(String(payload?.spawnId || ""));
      if (!player || !mob) return;
      const now = Date.now();
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
      this.encounters.set(client.sessionId, { battleId, spawnId: mob.spawnId, enemyId: mob.enemyId, startedAt: now });
      client.send("pve_begin", {
        battleId,
        spawnId: mob.spawnId,
        enemyId: mob.enemyId,
        isBoss: mob.isBoss,
      });
    },

    pve_complete: (client: Client, payload: PveCompletePayload) => {
      const player = this.players.get(client.sessionId);
      const encounter = this.encounters.get(client.sessionId);
      if (!player || !encounter || payload?.battleId !== encounter.battleId) return;
      const mob = this.mobs.get(encounter.spawnId);
      const enemy = ENEMY_RULES[encounter.enemyId];
      if (!mob || !enemy) return;
      this.encounters.delete(client.sessionId);
      mob.engagedBy = null;
      mob.engagedUntil = 0;

      const outcome = payload?.outcome;
      if (outcome !== "win") {
        client.send("pve_result", {
          outcome,
          battleId: encounter.battleId,
          hp: Math.max(1, Math.floor(numberFrom(payload?.hp, player.pvpMaxHp))),
          ki: Math.max(0, Math.floor(numberFrom(payload?.ki, 0))),
        });
        return;
      }

      const stats = computeCharacterStats({
        classId: player.classId,
        level: player.level,
        baseAtk: 0,
        baseDef: 0,
        gearOwned: [],
      });
      const elapsed = Date.now() - encounter.startedAt;
      if (elapsed < minimumBattleDurationMs(enemy, stats)) {
        client.send("pve_error", { message: "Resultado de batalha inválido." });
        return;
      }

      mob.dead = true;
      mob.respawnAt = Date.now() + (mob.isBoss ? 90000 + Math.random() * 60000 : 18000 + Math.random() * 10000);
      mob.vx = 0;
      mob.vy = 0;
      const drop = enemy.drop && Math.random() < enemy.drop.chance ? enemy.drop.id : null;
      const hp = Math.max(1, Math.floor(numberFrom(payload?.hp, player.pvpMaxHp)));
      const ki = Math.max(0, Math.floor(numberFrom(payload?.ki, 0)));

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

        player.level = Math.max(1, Math.floor(numberFrom(character.level, player.level)));
        const state = character.state || {};
        const stats = computeCharacterStats({
          classId: player.classId,
          level: player.level,
          baseAtk: numberFrom(state.baseAtk, 0),
          baseDef: numberFrom(state.baseDef, 0),
          gearOwned: stringArray(state.gearOwned),
        });
        player.attack = stats.attack;
        player.defense = stats.defense;
        player.pvpMaxHp = stats.maxHp;
        player.pvpHp = Math.min(player.pvpHp, player.pvpMaxHp);

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
        const current = this.players.get(id);
        if (!current || current !== target) return;
        current.pvpHp = current.pvpMaxHp;
        current.koUntil = 0;
        current.pvpProtectedUntil = Date.now() + 5000;
        this.broadcast("pvp_respawn", publicPlayer(current));
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

  onLeave(client: Client) {
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
    this.broadcast("player_left", { sessionId: client.sessionId });
    this.broadcast("presence", { count: this.players.size });
  }
}
