import { Client, Room, ServerError } from "colyseus";

type Direction = "down" | "up" | "left" | "right";

interface CharacterRecord {
  id: string;
  user_id: string;
  name: string;
  class_id: string;
  level: number;
  hp: number;
  state: Record<string, unknown> | null;
  x: number;
  y: number;
}

interface AuthData {
  userId: string;
  character: CharacterRecord;
}

interface OnlinePlayer {
  sessionId: string;
  userId: string;
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
  lastMoveAt: number;
  lastPvpAttackAt: number;
}

interface MovePayload {
  x?: number;
  y?: number;
  dir?: Direction;
}

interface ChatPayload {
  text?: string;
}

interface PvpAttackPayload {
  targetSessionId?: string;
}

const DIRECTIONS = new Set<Direction>(["down", "up", "left", "right"]);
const MAX_CHAT_LENGTH = 80;
const MAX_CLIENTS = 100;
const BASE_MOVE_TOLERANCE = 14;
const MAX_SPEED_PER_SECOND = 120;
const PVP_RANGE = 52;
const PVP_ATTACK_COOLDOWN_MS = 700;
const PVP_RESPAWN_MS = 5000;

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

function numberFrom(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isFacing(attacker: OnlinePlayer, target: OnlinePlayer): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) return true;

  const facing: [number, number] =
    attacker.dir === "left" ? [-1, 0] :
    attacker.dir === "right" ? [1, 0] :
    attacker.dir === "up" ? [0, -1] :
    [0, 1];

  return (dx / distance) * facing[0] + (dy / distance) * facing[1] >= 0.15;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required on the multiplayer server.",
    );
  }

  return { url, publishableKey };
}

async function loadOwnedCharacter(
  token: string,
  characterId: string,
): Promise<CharacterRecord | null> {
  const { url, publishableKey } = supabaseConfig();
  const query =
    `/rest/v1/characters?id=eq.${encodeURIComponent(characterId)}` +
    "&select=id,user_id,name,class_id,level,hp,state,x,y&limit=1";

  const response = await fetch(`${url}${query}`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;

  const rows = (await response.json()) as CharacterRecord[];
  return rows[0] || null;
}

export class WorldRoom extends Room {
  maxClients = MAX_CLIENTS;

  private players = new Map<string, OnlinePlayer>();

  static async onAuth(
    token: string,
    options: { characterId?: string },
  ): Promise<AuthData> {
    if (!token) {
      throw new ServerError(401, "Supabase access token is required.");
    }

    const characterId = options?.characterId?.trim();
    if (!characterId) {
      throw new ServerError(400, "characterId is required.");
    }

    const character = await loadOwnedCharacter(token, characterId);

    if (!character) {
      throw new ServerError(403, "Character not found or not owned by this account.");
    }

    return {
      userId: character.user_id,
      character,
    };
  }

  messages = {
    move: (client: Client, payload: MovePayload) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      if (player.pvpHp <= 0 || player.koUntil > Date.now()) return;

      const requestedX = Number(payload?.x);
      const requestedY = Number(payload?.y);
      if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) return;

      const now = Date.now();
      const elapsed = Math.max(
        0.05,
        Math.min(1, (now - player.lastMoveAt) / 1000),
      );
      const allowedDistance =
        BASE_MOVE_TOLERANCE + MAX_SPEED_PER_SECOND * elapsed;

      const dx = requestedX - player.x;
      const dy = requestedY - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance > allowedDistance && distance > 0) {
        const scale = allowedDistance / distance;
        player.x += dx * scale;
        player.y += dy * scale;
      } else {
        player.x = requestedX;
        player.y = requestedY;
      }

      if (payload?.dir && DIRECTIONS.has(payload.dir)) {
        player.dir = payload.dir;
      }

      player.lastMoveAt = now;

      this.broadcast(
        "player_move",
        publicPlayer(player),
        { except: client },
      );
    },

    chat: (client: Client, payload: ChatPayload) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;

      const text = String(payload?.text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CHAT_LENGTH);

      if (!text) return;

      this.broadcast(
        "chat",
        {
          sessionId: player.sessionId,
          name: player.name,
          text,
        },
        { except: client },
      );
    },

    pvp_attack: (client: Client, payload: PvpAttackPayload) => {
      const attacker = this.players.get(client.sessionId);
      if (!attacker) return;

      const targetSessionId = String(payload?.targetSessionId || "").trim();
      const target = this.players.get(targetSessionId);

      const fail = (message: string) => {
        client.send("pvp_error", { message });
      };

      if (!target || target.sessionId === attacker.sessionId) {
        fail("Alvo PvP inválido.");
        return;
      }

      const now = Date.now();

      if (attacker.pvpHp <= 0 || attacker.koUntil > now) {
        fail("Você está se recuperando do PvP.");
        return;
      }

      if (target.pvpHp <= 0 || target.koUntil > now) {
        fail("Esse jogador já foi derrotado.");
        return;
      }

      if (now - attacker.lastPvpAttackAt < PVP_ATTACK_COOLDOWN_MS) {
        return;
      }

      const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
      if (distance > PVP_RANGE) {
        fail("Chegue mais perto para atacar.");
        return;
      }

      if (!isFacing(attacker, target)) {
        fail("Fique de frente para o jogador.");
        return;
      }

      attacker.lastPvpAttackAt = now;

      const variance = 0.88 + Math.random() * 0.24;
      const damage = Math.max(
        1,
        Math.floor(attacker.attack * variance - target.defense * 0.42),
      );

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

      const defeatedSessionId = target.sessionId;
      setTimeout(() => {
        const current = this.players.get(defeatedSessionId);
        if (!current || current !== target) return;

        current.pvpHp = current.pvpMaxHp;
        current.koUntil = 0;
        current.lastPvpAttackAt = 0;

        this.broadcast("pvp_respawn", publicPlayer(current));
      }, PVP_RESPAWN_MS);
    },
  };

  onJoin(client: Client, _options: unknown, auth: AuthData) {
    const character = auth.character;

    const state = character.state || {};
    const level = Math.max(1, Math.floor(numberFrom(character.level, 1)));
    const baseAttack = numberFrom(state.baseAtk, 0);
    const baseDefense = numberFrom(state.baseDef, 0);
    const pvpMaxHp = Math.max(
      100,
      Math.floor(Math.max(numberFrom(character.hp, 0), 100 + level * 14)),
    );

    const player: OnlinePlayer = {
      sessionId: client.sessionId,
      userId: auth.userId,
      characterId: character.id,
      name: character.name,
      classId: character.class_id,
      x: Number.isFinite(character.x) ? character.x : 0,
      y: Number.isFinite(character.y) ? character.y : 0,
      dir: "down",
      level,
      attack: Math.max(10, 12 + level * 2.6 + baseAttack),
      defense: Math.max(6, 8 + level * 1.7 + baseDefense),
      pvpHp: pvpMaxHp,
      pvpMaxHp,
      koUntil: 0,
      lastMoveAt: Date.now(),
      lastPvpAttackAt: 0,
    };

    this.players.set(client.sessionId, player);

    client.send(
      "snapshot",
      Array.from(this.players.values(), publicPlayer),
    );

    this.broadcast(
      "player_joined",
      publicPlayer(player),
      { except: client },
    );

    this.broadcast("presence", { count: this.players.size });
  }

  onLeave(client: Client) {
    if (!this.players.delete(client.sessionId)) return;

    this.broadcast("player_left", {
      sessionId: client.sessionId,
    });

    this.broadcast("presence", { count: this.players.size });
  }
}
