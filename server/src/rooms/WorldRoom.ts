import { Client, Room, ServerError } from "colyseus";

type Direction = "down" | "up" | "left" | "right";

interface CharacterRecord {
  id: string;
  user_id: string;
  name: string;
  class_id: string;
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
  lastMoveAt: number;
}

interface MovePayload {
  x?: number;
  y?: number;
  dir?: Direction;
}

interface ChatPayload {
  text?: string;
}

const DIRECTIONS = new Set<Direction>(["down", "up", "left", "right"]);
const MAX_CHAT_LENGTH = 80;
const MAX_CLIENTS = 100;
const BASE_MOVE_TOLERANCE = 14;
const MAX_SPEED_PER_SECOND = 120;

function publicPlayer(player: OnlinePlayer) {
  return {
    sessionId: player.sessionId,
    name: player.name,
    classId: player.classId,
    x: player.x,
    y: player.y,
    dir: player.dir,
  };
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
    "&select=id,user_id,name,class_id,x,y&limit=1";

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
  };

  onJoin(client: Client, _options: unknown, auth: AuthData) {
    const character = auth.character;

    const player: OnlinePlayer = {
      sessionId: client.sessionId,
      userId: auth.userId,
      characterId: character.id,
      name: character.name,
      classId: character.class_id,
      x: Number.isFinite(character.x) ? character.x : 0,
      y: Number.isFinite(character.y) ? character.y : 0,
      dir: "down",
      lastMoveAt: Date.now(),
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
