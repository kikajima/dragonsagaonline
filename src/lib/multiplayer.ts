import { Client } from '@colyseus/sdk';

export interface MultiplayerPlayer {
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

export interface MultiplayerChat {
  sessionId: string;
  name: string;
  text: string;
}

export interface MultiplayerPvpHit {
  attackerSessionId: string;
  targetSessionId: string;
  attackerName: string;
  targetName: string;
  damage: number;
  hp: number;
  maxHp: number;
}

export interface MultiplayerPvpKo {
  attackerSessionId: string;
  targetSessionId: string;
  attackerName: string;
  targetName: string;
}

export interface MultiplayerPvpError {
  message: string;
}

export interface MultiplayerMob {
  spawnId: string;
  enemyId: string;
  x: number;
  y: number;
  dead: boolean;
  isBoss: boolean;
  respawnAt: number;
}

export interface MultiplayerPveBegin {
  battleId: string;
  spawnId: string;
  enemyId: string;
  isBoss: boolean;
  playerHp: number;
  playerKi: number;
  enemyHp: number;
  enemyMaxHp: number;
}

export interface MultiplayerPveCharacter {
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

export interface MultiplayerPveResult {
  outcome: 'win' | 'fled' | 'lose';
  battleId: string;
  spawnId?: string;
  enemyId?: string;
  exp?: number;
  zeni?: number;
  drop?: string | null;
  hp?: number;
  ki?: number;
  character?: MultiplayerPveCharacter;
}

export interface MultiplayerPveError {
  message: string;
}

export interface MultiplayerPveState {
  battleId: string;
  playerHp: number;
  playerKi: number;
  enemyHp: number;
  enemyMaxHp: number;
  outcome: 'active' | 'win' | 'lose' | 'fled';
}

export type MultiplayerStatus =
  | 'disabled'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'error';

interface ColyseusRoom {
  sessionId: string;
  send(type: string, payload?: unknown): void;
  leave(consented?: boolean): Promise<number> | number | void;
  onMessage(type: string, callback: (message: any) => void): void;
  onLeave(callback: (code?: number) => void): void;
  onError(callback: (code: number, message?: string) => void): void;
}

export interface MultiplayerCallbacks {
  onStatus?: (status: MultiplayerStatus, message?: string) => void;
  onSnapshot?: (players: MultiplayerPlayer[]) => void;
  onPlayerJoined?: (player: MultiplayerPlayer) => void;
  onPlayerMoved?: (player: MultiplayerPlayer) => void;
  onMoveAck?: (event: {
    x: number;
    y: number;
    dir: 'down' | 'up' | 'left' | 'right';
    seq: number;
  }) => void;
  onPlayerLeft?: (sessionId: string) => void;
  onChat?: (message: MultiplayerChat) => void;
  onPresence?: (count: number) => void;
  onPvpState?: (player: MultiplayerPlayer) => void;
  onPvpHit?: (event: MultiplayerPvpHit) => void;
  onPvpKo?: (event: MultiplayerPvpKo) => void;
  onPvpRespawn?: (player: MultiplayerPlayer) => void;
  onPvpError?: (event: MultiplayerPvpError) => void;
  onMobSnapshot?: (mobs: MultiplayerMob[]) => void;
  onMobUpdate?: (mob: MultiplayerMob) => void;
  onPveBegin?: (event: MultiplayerPveBegin) => void;
  onPveResult?: (event: MultiplayerPveResult) => void;
  onPveState?: (event: MultiplayerPveState) => void;
  onPveError?: (event: MultiplayerPveError) => void;
  onCharacterSync?: (character: MultiplayerPveCharacter) => void;
  onActionError?: (event: { action?: string; message?: string }) => void;
}

export interface MultiplayerConnection {
  readonly sessionId: string;
  sendMove(
    x: number,
    y: number,
    dir: 'down' | 'up' | 'left' | 'right',
    seq?: number,
  ): void;
  sendChat(text: string): void;
  updateAuthToken(accessToken: string): void;
  sendPvpAttack(targetSessionId: string): void;
  sendShopPurchase(itemId: string): void;
  sendUseItem(itemId: string): void;
  sendQuestInteract(): void;
  sendDragonWish(wish: 'power' | 'defense' | 'zeni'): void;
  sendPveBegin(spawnId: string): void;
  sendPveAction(payload: {
    battleId: string;
    action: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'transform';
    skillId?: string;
    itemId?: string;
  }): void;
  sendPveComplete(payload: {
    battleId: string;
    outcome: 'win' | 'fled' | 'lose';
    hp: number;
    ki: number;
  }): void;
  leave(): Promise<void>;
}

export async function connectMultiplayer(options: {
  endpoint: string;
  accessToken: string;
  characterId: string;
  callbacks?: MultiplayerCallbacks;
}): Promise<MultiplayerConnection> {
  const endpoint = options.endpoint.trim();
  if (!endpoint) {
    throw new Error('NEXT_PUBLIC_COLYSEUS_URL não foi configurada.');
  }

  options.callbacks?.onStatus?.('connecting');

  const client = new Client(endpoint);
  client.auth.token = options.accessToken;

  let room: ColyseusRoom;

  try {
    room = (await client.joinOrCreate('world', {
      characterId: options.characterId,
    })) as unknown as ColyseusRoom;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao entrar no mundo online.';
    options.callbacks?.onStatus?.('error', message);
    throw error;
  }

  const ownSessionId = room.sessionId;

  room.onMessage('snapshot', (players: MultiplayerPlayer[]) => {
    const list = Array.isArray(players) ? players : [];
    const self = list.find((player) => player.sessionId === ownSessionId);
    if (self) options.callbacks?.onPvpState?.(self);

    const remote = list.filter((player) => player.sessionId !== ownSessionId);
    options.callbacks?.onSnapshot?.(remote);
  });

  room.onMessage('player_joined', (player: MultiplayerPlayer) => {
    if (player?.sessionId === ownSessionId) return;
    options.callbacks?.onPlayerJoined?.(player);
  });

  room.onMessage('player_move', (player: MultiplayerPlayer) => {
    if (player?.sessionId === ownSessionId) return;
    options.callbacks?.onPlayerMoved?.(player);
  });

  room.onMessage('move_ack', (event: {
    x?: number;
    y?: number;
    dir?: 'down' | 'up' | 'left' | 'right';
    seq?: number;
  }) => {
    const x = Number(event?.x);
    const y = Number(event?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !event?.dir) return;
    options.callbacks?.onMoveAck?.({
      x,
      y,
      dir: event.dir,
      seq: Number.isFinite(Number(event.seq)) ? Number(event.seq) : 0,
    });
  });

  room.onMessage('player_left', (payload: { sessionId?: string }) => {
    if (!payload?.sessionId || payload.sessionId === ownSessionId) return;
    options.callbacks?.onPlayerLeft?.(payload.sessionId);
  });

  room.onMessage('chat', (message: MultiplayerChat) => {
    if (!message || message.sessionId === ownSessionId) return;
    options.callbacks?.onChat?.(message);
  });

  room.onMessage('presence', (payload: { count?: number }) => {
    const count = Number(payload?.count);
    if (Number.isFinite(count)) {
      options.callbacks?.onPresence?.(Math.max(1, Math.floor(count)));
    }
  });

  room.onMessage('pvp_hit', (event: MultiplayerPvpHit) => {
    if (!event) return;
    options.callbacks?.onPvpHit?.(event);
  });

  room.onMessage('pvp_ko', (event: MultiplayerPvpKo) => {
    if (!event) return;
    options.callbacks?.onPvpKo?.(event);
  });

  room.onMessage('pvp_respawn', (player: MultiplayerPlayer) => {
    if (!player) return;
    options.callbacks?.onPvpRespawn?.(player);
  });

  room.onMessage('pvp_error', (event: MultiplayerPvpError) => {
    if (!event) return;
    options.callbacks?.onPvpError?.(event);
  });

  room.onMessage('mob_snapshot', (mobs: MultiplayerMob[]) => {
    options.callbacks?.onMobSnapshot?.(Array.isArray(mobs) ? mobs : []);
  });

  room.onMessage('mob_update', (mob: MultiplayerMob) => {
    if (!mob) return;
    options.callbacks?.onMobUpdate?.(mob);
  });

  room.onMessage('pve_begin', (event: MultiplayerPveBegin) => {
    if (!event) return;
    options.callbacks?.onPveBegin?.(event);
  });

  room.onMessage('pve_result', (event: MultiplayerPveResult) => {
    if (!event) return;
    options.callbacks?.onPveResult?.(event);
  });

  room.onMessage('pve_state', (event: MultiplayerPveState) => {
    if (!event) return;
    options.callbacks?.onPveState?.(event);
  });

  room.onMessage('pve_error', (event: MultiplayerPveError) => {
    if (!event) return;
    options.callbacks?.onPveError?.(event);
  });

  room.onMessage('character_sync', (character: MultiplayerPveCharacter) => {
    if (!character) return;
    options.callbacks?.onCharacterSync?.(character);
  });

  room.onMessage('action_error', (event: { action?: string; message?: string }) => {
    if (!event) return;
    options.callbacks?.onActionError?.(event);
  });

  room.onLeave(() => {
    options.callbacks?.onStatus?.('offline');
  });

  room.onError((_code, message) => {
    options.callbacks?.onStatus?.(
      'error',
      message || 'Erro na conexão multiplayer.',
    );
  });

  options.callbacks?.onStatus?.('online');

  return {
    sessionId: ownSessionId,

    sendMove(x, y, dir, seq = 0) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      room.send('move', { x, y, dir, seq });
    },

    sendChat(text) {
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!clean) return;
      room.send('chat', { text: clean });
    },

    updateAuthToken(accessToken) {
      const token = accessToken.trim();
      if (!token) return;
      room.send('auth_refresh', { accessToken: token });
    },

    sendPvpAttack(targetSessionId) {
      const target = targetSessionId.trim();
      if (!target || target === ownSessionId) return;
      room.send('pvp_attack', { targetSessionId: target });
    },

    sendShopPurchase(itemId) {
      const id = itemId.trim();
      if (!id) return;
      room.send('shop_purchase', { itemId: id });
    },

    sendUseItem(itemId) {
      const id = itemId.trim();
      if (!id) return;
      room.send('use_item', { itemId: id });
    },

    sendQuestInteract() {
      room.send('quest_interact');
    },

    sendDragonWish(wish) {
      room.send('dragon_wish', { wish });
    },

    sendPveBegin(spawnId) {
      const id = spawnId.trim();
      if (!id) return;
      room.send('pve_begin', { spawnId: id });
    },

    sendPveAction(payload) {
      if (!payload?.battleId || !payload.action) return;
      room.send('pve_action', payload);
    },

    sendPveComplete(payload) {
      if (!payload?.battleId) return;
      room.send('pve_complete', payload);
    },

    async leave() {
      await Promise.resolve(room.leave(true));
    },
  };
}
