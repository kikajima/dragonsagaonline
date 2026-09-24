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
}

export interface MultiplayerPveCharacter {
  id: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  ki: number;
  state: Record<string, unknown>;
  quest_completed?: boolean;
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

interface ColyseusClient {
  auth: { token?: string };
  joinOrCreate(name: string, options?: Record<string, unknown>): Promise<ColyseusRoom>;
}

interface ColyseusGlobal {
  Client: new (endpoint: string) => ColyseusClient;
}

declare global {
  interface Window {
    Colyseus?: ColyseusGlobal;
  }
}

const SDK_URL =
  'https://unpkg.com/@colyseus/sdk@0.18.2/dist/colyseus.js';

let sdkPromise: Promise<ColyseusGlobal> | null = null;

function loadSdk(): Promise<ColyseusGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Colyseus só pode ser carregado no navegador.'));
  }

  if (window.Colyseus) return Promise.resolve(window.Colyseus);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<ColyseusGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-dso-colyseus-sdk]',
    );

    const finish = () => {
      if (window.Colyseus) {
        resolve(window.Colyseus);
      } else {
        reject(new Error('O SDK do Colyseus foi carregado sem expor window.Colyseus.'));
      }
    };

    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Não foi possível carregar o SDK do Colyseus.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.dataset.dsoColyseusSdk = 'true';
    script.onload = finish;
    script.onerror = () =>
      reject(new Error('Não foi possível carregar o SDK do Colyseus.'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export interface MultiplayerCallbacks {
  onStatus?: (status: MultiplayerStatus, message?: string) => void;
  onSnapshot?: (players: MultiplayerPlayer[]) => void;
  onPlayerJoined?: (player: MultiplayerPlayer) => void;
  onPlayerMoved?: (player: MultiplayerPlayer) => void;
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
  onPveError?: (event: MultiplayerPveError) => void;
}

export interface MultiplayerConnection {
  readonly sessionId: string;
  sendMove(
    x: number,
    y: number,
    dir: 'down' | 'up' | 'left' | 'right',
  ): void;
  sendChat(text: string): void;
  sendPvpAttack(targetSessionId: string): void;
  sendPveBegin(spawnId: string): void;
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

  const Colyseus = await loadSdk();
  const client = new Colyseus.Client(endpoint);
  client.auth.token = options.accessToken;

  let room: ColyseusRoom;

  try {
    room = await client.joinOrCreate('world', {
      characterId: options.characterId,
    });
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

  room.onMessage('pve_error', (event: MultiplayerPveError) => {
    if (!event) return;
    options.callbacks?.onPveError?.(event);
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

    sendMove(x, y, dir) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      room.send('move', { x, y, dir });
    },

    sendChat(text) {
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!clean) return;
      room.send('chat', { text: clean });
    },

    sendPvpAttack(targetSessionId) {
      const target = targetSessionId.trim();
      if (!target || target === ownSessionId) return;
      room.send('pvp_attack', { targetSessionId: target });
    },

    sendPveBegin(spawnId) {
      const id = spawnId.trim();
      if (!id) return;
      room.send('pve_begin', { spawnId: id });
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
