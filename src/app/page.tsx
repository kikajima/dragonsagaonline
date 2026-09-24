'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Game, VW, VH, type PlayerState } from '@/game/game';
import { chip } from '@/game/audio';
import {
  createCharacter,
  listCharacters,
  restoreSession,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updateCharacter,
  type CharacterRow,
  type DsoSession,
} from '@/lib/supabase';
import {
  connectMultiplayer,
  type MultiplayerConnection,
  type MultiplayerStatus,
} from '@/lib/multiplayer';

const COLYSEUS_URL =
  process.env.NEXT_PUBLIC_COLYSEUS_URL?.trim() ||
  'https://dso-world-production.up.railway.app';

function characterToPlayer(row: CharacterRow): Partial<PlayerState> {
  const state = (row.state || {}) as Partial<PlayerState>;
  return {
    ...state,
    name: row.name,
    classId: row.class_id,
    lv: row.level,
    exp: Number(row.xp),
    hp: row.hp,
    ki: row.ki,
    zeni: Number(row.gold),
    x: row.x,
    y: row.y,
  };
}

function playerPayload(userId: string, player: PlayerState) {
  return {
    user_id: userId,
    name: player.name,
    class_id: player.classId,
    level: player.lv,
    xp: player.exp,
    hp: player.hp,
    ki: player.ki,
    gold: player.zeni,
    map_id: 'world',
    x: player.x,
    y: player.y,
    state: player as unknown as Record<string, unknown>,
    last_played_at: new Date().toISOString(),
  };
}

export default function Home() {
  const pageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showName, setShowName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [chatVal, setChatVal] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<DsoSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [multiplayerStatus, setMultiplayerStatus] = useState<MultiplayerStatus>(
    COLYSEUS_URL ? 'offline' : 'disabled',
  );
  const [multiplayerMessage, setMultiplayerMessage] = useState('');
  const [multiplayerRetry, setMultiplayerRetry] = useState(0);
  const [touchControls, setTouchControls] = useState(false);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });

  const sessionRef = useRef<DsoSession | null>(null);
  const characterRef = useRef<CharacterRow | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const multiplayerRef = useRef<MultiplayerConnection | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerRef = useRef<number | null>(null);
  const joystickDirectionRef = useRef<string | null>(null);

  const loadAccount = useCallback(async (nextSession: DsoSession) => {
    sessionRef.current = nextSession;
    setAuthMessage('');

    try {
      const characters = await listCharacters();
      characterRef.current = characters[0] || null;
      setActiveCharacterId(characterRef.current?.id || null);
    } catch (error) {
      console.error('[supabase] load characters', error);
      characterRef.current = null;
      setActiveCharacterId(null);
      setAuthMessage(error instanceof Error ? error.message : 'Não foi possível carregar o personagem.');
    }

    setSession(nextSession);
  }, []);

  const persistPlayer = useCallback((player: PlayerState) => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;

    const snapshot = JSON.parse(JSON.stringify(player)) as PlayerState;
    setSaveStatus('saving');
    setSaveError('');

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const payload = playerPayload(activeSession.user.id, snapshot);
        const current = characterRef.current;
        const saved = current
          ? await updateCharacter(current.id, payload)
          : await createCharacter(payload);

        characterRef.current = saved;
        setActiveCharacterId(saved.id);
        setSaveStatus('saved');
      })
      .catch((error) => {
        console.error('[supabase] save character', error);
        setSaveStatus('error');
        setSaveError(error instanceof Error ? error.message : 'Erro ao salvar na nuvem.');
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const restored = await restoreSession();
        if (cancelled) return;
        if (restored) await loadAccount(restored);
      } catch (error) {
        console.error('[supabase] restore session', error);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadAccount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const update = () => {
      setTouchControls(navigator.maxTouchPoints > 0 || coarsePointer.matches);
    };

    update();
    coarsePointer.addEventListener?.('change', update);

    return () => {
      coarsePointer.removeEventListener?.('change', update);
    };
  }, []);

  const handleAuthSubmit = useCallback(async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email || authPassword.length < 6) {
      setAuthMessage('Informe um e-mail válido e uma senha com pelo menos 6 caracteres.');
      return;
    }

    setAuthBusy(true);
    setAuthMessage('');

    try {
      if (authMode === 'login') {
        const nextSession = await signInWithPassword(email, authPassword);
        await loadAccount(nextSession);
      } else {
        const result = await signUpWithPassword(email, authPassword);
        if (result.session) {
          await loadAccount(result.session);
        } else {
          setAuthMessage('Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre no jogo.');
          setAuthMode('login');
        }
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Falha na autenticação.');
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authMode, authPassword, loadAccount]);

  const handleSignOut = useCallback(async () => {
    await saveQueueRef.current.catch(() => undefined);
    await multiplayerRef.current?.leave().catch(() => undefined);
    multiplayerRef.current = null;
    gameRef.current?.setMultiplayerActive(false);
    gameRef.current?.stop();
    gameRef.current = null;
    characterRef.current = null;
    sessionRef.current = null;
    await signOut();
    setSession(null);
    setActiveCharacterId(null);
    setMultiplayerStatus(COLYSEUS_URL ? 'offline' : 'disabled');
    setMultiplayerMessage('');
    setSaveStatus('idle');
    setSaveError('');
    setAuthPassword('');
    setAuthMessage('');
  }, []);

  useEffect(() => {
    if (!authReady || !session || !canvasRef.current) return;
    if (!gameRef.current) {
      const game = new Game(canvasRef.current);
      gameRef.current = game;
      (window as unknown as { __game: Game }).__game = game;

      game.setNameInputCb((showN, current) => {
        setShowName(showN);
        setNameVal(current);
        if (showN) {
          setTimeout(() => nameInputRef.current?.focus(), 50);
        }
      });

      game.setSaveHandler(persistPlayer);
      const cloudCharacter = characterRef.current;
      if (cloudCharacter) {
        game.setPersistedPlayer(characterToPlayer(cloudCharacter));
      }

      game.start();

      // Preload pixel font for canvas
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.load('8px "Press Start 2P"').catch(() => {});
      }
    }
    const game = gameRef.current;
    if (!game) return;

    const isTypingTarget = (): boolean => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget()) {
        // let the input handle; game keys suppressed
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const blockKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'];
      if (blockKeys.includes(e.key)) e.preventDefault();
      game.keys.add(e.key);
      const handled = game.keydown(e);
      // Enter in world opens chat
      if (game.state === 'world' && !game.dialog && !game.shop && !game.menuOpen && e.key === 'Enter' && !handled) {
        setShowChat(true);
        setTimeout(() => chatInputRef.current?.focus(), 30);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      game.keys.delete(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Auto-enable audio on first interaction
    const unlock = () => chip.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [authReady, session?.user.id, persistPlayer]);

  useEffect(() => {
    if (!authReady || !session || !activeCharacterId) return;

    const game = gameRef.current;
    if (!game) return;

    if (!COLYSEUS_URL) {
      game.setMultiplayerActive(false);
      setMultiplayerStatus('disabled');
      setMultiplayerMessage('');
      return;
    }

    let cancelled = false;
    let movementTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let sequence = 0;
    let lastSent = { x: Number.NaN, y: Number.NaN, dir: '' as string, at: 0 };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) setMultiplayerRetry((value) => value + 1);
      }, 2500);
    };

    setMultiplayerStatus('connecting');
    setMultiplayerMessage('');

    void connectMultiplayer({
      endpoint: COLYSEUS_URL,
      accessToken: session.access_token,
      characterId: activeCharacterId,
      callbacks: {
        onStatus(status, message) {
          if (cancelled) return;
          setMultiplayerStatus(status);
          setMultiplayerMessage(message || '');
          game.setMultiplayerActive(status === 'online');
          if (status === 'offline' || status === 'error') scheduleReconnect();
        },
        onSnapshot(players) {
          if (!cancelled) game.setRemoteSnapshot(players);
        },
        onPlayerJoined(player) {
          if (!cancelled) game.upsertRemotePlayer(player);
        },
        onPlayerMoved(player) {
          if (!cancelled) game.upsertRemotePlayer(player);
        },
        onPlayerLeft(sessionId) {
          if (!cancelled) game.removeRemotePlayer(sessionId);
        },
        onChat(message) {
          if (!cancelled) game.receiveRemoteChat(message);
        },
        onPresence(count) {
          if (!cancelled) game.setOnlineCount(count);
        },
        onPvpState(player) {
          if (!cancelled) {
            game.setPvpState(player.pvpHp, player.pvpMaxHp, player.pvpKo);
          }
        },
        onPvpHit(event) {
          if (!cancelled) game.receivePvpHit(event);
        },
        onPvpKo(event) {
          if (!cancelled) game.receivePvpKo(event);
        },
        onPvpRespawn(player) {
          if (!cancelled) game.receivePvpRespawn(player);
        },
        onPvpError(event) {
          if (cancelled) return;
          game.toast = { text: event.message || 'Ataque PvP indisponível.', t: 1.2 };
        },
        onMobSnapshot(mobs) {
          if (!cancelled) game.setMobSnapshot(mobs);
        },
        onMobUpdate(mob) {
          if (!cancelled) game.upsertMob(mob);
        },
        onPveBegin(event) {
          if (!cancelled) game.receivePveBegin(event);
        },
        onPveResult(event) {
          if (!cancelled) game.receivePveResult(event);
        },
        onPveError(event) {
          if (cancelled) return;
          game.pendingPveSpawnId = '';
          game.toast = { text: event.message || 'Batalha indisponível.', t: 1.4 };
        },
      },
    })
      .then((connection) => {
        if (cancelled) {
          void connection.leave();
          return;
        }

        multiplayerRef.current = connection;
        game.setMultiplayerActive(true);
        game.setMultiplayerSessionId(connection.sessionId);
        game.setPvpAttackHandler((targetSessionId) => {
          multiplayerRef.current?.sendPvpAttack(targetSessionId);
        });
        game.setPveHandlers(
          (spawnId) => multiplayerRef.current?.sendPveBegin(spawnId),
          (payload) => multiplayerRef.current?.sendPveComplete(payload),
        );
        setMultiplayerStatus('online');
        setMultiplayerMessage('');

        connection.sendMove(game.px, game.py, game.pdir);
        lastSent = { x: game.px, y: game.py, dir: game.pdir, at: Date.now() };

        movementTimer = setInterval(() => {
          const activeGame = gameRef.current;
          const activeConnection = multiplayerRef.current;
          if (!activeGame || !activeConnection || activeGame.state !== 'world') return;

          const now = Date.now();
          const moved = Math.hypot(activeGame.px - lastSent.x, activeGame.py - lastSent.y) > 0.3;
          const directionChanged = activeGame.pdir !== lastSent.dir;
          const heartbeat = now - lastSent.at >= 1000;
          if (!moved && !directionChanged && !heartbeat) return;

          sequence += 1;
          activeConnection.sendMove(
            activeGame.px,
            activeGame.py,
            activeGame.pdir,
          );
          lastSent = { x: activeGame.px, y: activeGame.py, dir: activeGame.pdir, at: now };
        }, 100);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[colyseus] connect', error);
        game.setMultiplayerActive(false);
        setMultiplayerStatus('error');
        setMultiplayerMessage(
          error instanceof Error ? error.message : 'Falha ao conectar ao mundo online.',
        );
        scheduleReconnect();
      });

    return () => {
      cancelled = true;
      if (movementTimer) clearInterval(movementTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);

      const connection = multiplayerRef.current;
      multiplayerRef.current = null;
      game.setPvpAttackHandler(null);
      game.setPveHandlers(null, null);
      game.setMultiplayerSessionId('');
      game.setMultiplayerActive(false);

      if (connection) {
        void connection.leave().catch(() => undefined);
      }
    };
  }, [authReady, session?.access_token, activeCharacterId, multiplayerRetry]);

  // Stop the game loop only on final unmount (survives Fast Refresh / StrictMode re-runs)
  useEffect(() => {
    return () => {
      gameRef.current?.stop();
      gameRef.current = null;
    };
  }, []);

  const sendChat = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;

    const text = chatVal.trim();
    if (text) {
      g.sendChat(text);
      if (multiplayerStatus === 'online') {
        multiplayerRef.current?.sendChat(text);
      }
    }

    setChatVal('');
    setShowChat(false);
    chatInputRef.current?.blur();
  }, [chatVal, multiplayerStatus]);

  const confirmName = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.confirmName(nameVal);
  }, [nameVal]);

  const updateVirtualJoystick = useCallback((clientX: number, clientY: number) => {
    const base = joystickRef.current;
    const game = gameRef.current;
    if (!base || !game) return;

    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxTravel = Math.max(24, rect.width * 0.31);
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance > maxTravel) {
      const scale = maxTravel / distance;
      dx *= scale;
      dy *= scale;
    }

    setStickPosition({ x: dx, y: dy });

    const nx = dx / maxTravel;
    const ny = dy / maxTravel;
    const magnitude = Math.hypot(nx, ny);
    const freeMovement =
      game.state === 'world' &&
      !game.dialog &&
      !game.shop &&
      !game.menuOpen &&
      !showName &&
      !showChat;

    if (freeMovement) {
      game.setTouchVector(nx, ny);
      joystickDirectionRef.current = null;
      return;
    }

    game.clearTouchVector();

    let direction: string | null = null;
    if (magnitude > 0.45) {
      if (Math.abs(nx) >= Math.abs(ny)) {
        direction = nx < 0 ? 'ArrowLeft' : 'ArrowRight';
      } else {
        direction = ny < 0 ? 'ArrowUp' : 'ArrowDown';
      }
    }

    if (direction && direction !== joystickDirectionRef.current) {
      game.touchKey(direction);
    }
    joystickDirectionRef.current = direction;
  }, [showChat, showName]);

  const startVirtualJoystick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    joystickPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateVirtualJoystick(event.clientX, event.clientY);
  }, [updateVirtualJoystick]);

  const moveVirtualJoystick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    updateVirtualJoystick(event.clientX, event.clientY);
  }, [updateVirtualJoystick]);

  const stopVirtualJoystick = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event &&
      joystickPointerRef.current !== null &&
      joystickPointerRef.current !== event.pointerId
    ) {
      return;
    }

    joystickPointerRef.current = null;
    joystickDirectionRef.current = null;
    setStickPosition({ x: 0, y: 0 });
    gameRef.current?.clearTouchVector();
  }, []);

  const touchAction = useCallback((key: string) => {
    const game = gameRef.current;
    if (!game) return;

    game.clearTouchVector();
    joystickPointerRef.current = null;
    joystickDirectionRef.current = null;
    setStickPosition({ x: 0, y: 0 });
    game.touchKey(key);
  }, []);

  const openTouchChat = useCallback(() => {
    const game = gameRef.current;
    if (
      !game ||
      game.state !== 'world' ||
      game.dialog ||
      game.shop ||
      game.menuOpen
    ) {
      return;
    }

    game.clearTouchVector();
    setStickPosition({ x: 0, y: 0 });
    setShowChat(true);
    setTimeout(() => chatInputRef.current?.focus(), 30);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await pageRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.warn('[mobile] fullscreen unavailable', error);
    }
  }, []);

  if (!authReady) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-black">
        <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 10, color: '#f8d030' }}>
          CONECTANDO AO DSO...
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-black p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleAuthSubmit();
          }}
          className="w-full max-w-md flex flex-col gap-4 p-6"
          style={{ background: '#101828', border: '3px solid #f8d030' }}
        >
          <div className="text-center">
            <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 18, color: '#f8d030', lineHeight: 1.5 }}>
              DRAGON SAGA ONLINE
            </h1>
            <p className="mt-3" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: '#a8b0c0', lineHeight: 1.8 }}>
              {authMode === 'login' ? 'ENTRE NA SUA CONTA' : 'CRIE SUA CONTA'}
            </p>
          </div>

          <input
            type="email"
            autoComplete="email"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
            placeholder="E-MAIL"
            required
            className="outline-none"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: '#fff',
              background: '#05070d',
              border: '2px solid #585878',
              padding: '12px',
            }}
          />

          <input
            type="password"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            placeholder="SENHA"
            minLength={6}
            required
            className="outline-none"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: '#fff',
              background: '#05070d',
              border: '2px solid #585878',
              padding: '12px',
            }}
          />

          {authMessage && (
            <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: '#f8a0a0', lineHeight: 1.8 }}>
              {authMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={authBusy}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: '#101828',
              background: '#f8d030',
              border: 'none',
              padding: '12px',
              cursor: authBusy ? 'wait' : 'pointer',
              opacity: authBusy ? 0.7 : 1,
            }}
          >
            {authBusy ? 'AGUARDE...' : authMode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'signup' : 'login');
              setAuthMessage('');
            }}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              color: '#88c8f8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            {authMode === 'login' ? 'NÃO TENHO CONTA' : 'JÁ TENHO CONTA'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main ref={pageRef} className="dso-game-page">
      <div
        className="dso-status-bar rounded px-2 py-2"
        style={{ background: 'rgba(5,7,13,0.92)', border: '1px solid #343a54' }}
      >
        <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#a8b0c0' }}>
          {saveStatus === 'saving'
            ? 'SALVANDO...'
            : saveStatus === 'saved'
              ? 'SALVO NA NUVEM'
              : saveStatus === 'error'
                ? 'ERRO NO SAVE'
                : session.user.email || 'CONTA DSO'}
        </span>
        <span
          title={multiplayerMessage || undefined}
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 6,
            color:
              multiplayerStatus === 'online'
                ? '#88f0a0'
                : multiplayerStatus === 'connecting'
                  ? '#f8d030'
                  : '#788098',
          }}
        >
          {multiplayerStatus === 'online'
            ? 'MUNDO ONLINE'
            : multiplayerStatus === 'connecting'
              ? 'CONECTANDO...'
              : multiplayerStatus === 'error'
                ? 'ONLINE INDISPONÍVEL'
                : multiplayerStatus === 'disabled'
                  ? 'MODO SOLO'
                  : 'OFFLINE'}
        </span>
        {touchControls && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title="Alternar tela cheia"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              color: '#88c8f8',
              background: 'transparent',
              border: '1px solid #585878',
              padding: '6px',
              cursor: 'pointer',
            }}
          >
            TELA
          </button>
        )}
        <button
          onClick={() => void handleSignOut()}
          title={saveError || 'Sair da conta'}
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 6,
            color: '#f8d030',
            background: 'transparent',
            border: '1px solid #585878',
            padding: '6px',
            cursor: 'pointer',
          }}
        >
          SAIR
        </button>
      </div>
      <div className="dso-game-shell">
        <div className="dso-game-stage">
        <canvas
          ref={canvasRef}
          className="w-full h-full block rounded-sm"
          style={{
            imageRendering: 'pixelated',
            boxShadow: '0 0 0 3px #2a2a3a, 0 0 40px rgba(80,120,255,0.25), 0 0 120px rgba(0,0,0,0.8)',
            background: '#05070d',
            touchAction: 'none',
          }}
          tabIndex={0}
        />

        {/* Name input overlay (character creation) */}
        {showName && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(5,7,13,0.55)' }}
          >
            <div
              className="flex flex-col items-center gap-4 p-6 rounded"
              style={{ background: '#101828', border: '3px solid #f8d030', minWidth: 320 }}
            >
              <span className="text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 11, color: '#f8d030' }}>
                NOME DO GUERREIRO
              </span>
              <input
                ref={nameInputRef}
                value={nameVal}
                maxLength={12}
                onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmName();
                }}
                className="text-center outline-none"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 13,
                  color: '#fff',
                  background: '#05070d',
                  border: '2px solid #585878',
                  padding: '10px 12px',
                  width: 240,
                }}
                placeholder="..."
              />
              <button
                onClick={confirmName}
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 10,
                  color: '#101828',
                  background: '#f8d030',
                  border: 'none',
                  padding: '10px 18px',
                  cursor: 'pointer',
                }}
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        )}

        {/* Chat input (MMO) */}
        {showChat && (
          <div className="absolute left-2 bottom-2 flex items-center gap-2" style={{ width: 'min(430px, 60%)' }}>
            <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#f8d030' }}>Chat:</span>
            <input
              ref={chatInputRef}
              value={chatVal}
              maxLength={80}
              onChange={(e) => setChatVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
                if (e.key === 'Escape') {
                  setChatVal('');
                  setShowChat(false);
                  chatInputRef.current?.blur();
                }
              }}
              className="flex-1 outline-none"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 10,
                color: '#fff',
                background: 'rgba(10,14,30,0.9)',
                border: '2px solid #f8d030',
                padding: '8px 10px',
              }}
              placeholder="mensagem global..."
            />
            <button
              onClick={sendChat}
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: '#101828',
                background: '#f8d030',
                border: 'none',
                padding: '9px 10px',
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        )}
        </div>

        {touchControls && !showName && !showChat && (
          <div
            className="dso-mobile-controls"
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <div
              ref={joystickRef}
              onPointerDown={startVirtualJoystick}
              onPointerMove={moveVirtualJoystick}
              onPointerUp={stopVirtualJoystick}
              onPointerCancel={stopVirtualJoystick}
              onLostPointerCapture={stopVirtualJoystick}
              aria-label="Joystick virtual"
              className="dso-joystick"
              style={{
                position: 'absolute',
                left: 'max(12px, env(safe-area-inset-left))',
                bottom: 'max(14px, env(safe-area-inset-bottom))',
                width: 'clamp(92px, 18vw, 124px)',
                aspectRatio: '1',
                borderRadius: '50%',
                border: '2px solid rgba(232,224,200,0.72)',
                background: 'rgba(16,24,48,0.56)',
                boxShadow: 'inset 0 0 0 10px rgba(40,56,104,0.26), 0 4px 18px rgba(0,0,0,0.35)',
                pointerEvents: 'auto',
                touchAction: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '42%',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  transform: `translate(calc(-50% + ${stickPosition.x}px), calc(-50% + ${stickPosition.y}px))`,
                  border: '2px solid #f8d030',
                  background: 'rgba(40,56,104,0.94)',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div
              className="dso-touch-actions"
              style={{
                position: 'absolute',
                right: 'max(12px, env(safe-area-inset-right))',
                bottom: 'max(14px, env(safe-area-inset-bottom))',
                pointerEvents: 'auto',
                touchAction: 'none',
              }}
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  openTouchChat();
                }}
                aria-label="Abrir chat"
                style={{
                  width: 'clamp(48px, 9vw, 64px)',
                  height: 'clamp(34px, 6vw, 42px)',
                  borderRadius: 8,
                  border: '2px solid #88c8f8',
                  background: 'rgba(16,24,48,0.84)',
                  color: '#88c8f8',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 'clamp(5px, 1.1vw, 7px)',
                  touchAction: 'none',
                }}
              >
                CHAT
              </button>

              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  touchAction('x');
                }}
                aria-label="Voltar ou abrir menu"
                style={{
                  width: 'clamp(54px, 11vw, 74px)',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  border: '2px solid #88c8f8',
                  background: 'rgba(40,56,104,0.9)',
                  color: '#fff',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 'clamp(11px, 2.4vw, 16px)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                  touchAction: 'none',
                }}
              >
                B
              </button>

              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  touchAction('z');
                }}
                aria-label="Confirmar ou interagir"
                style={{
                  width: 'clamp(62px, 13vw, 84px)',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  border: '3px solid #f8d030',
                  background: 'rgba(248,208,48,0.9)',
                  color: '#101828',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 'clamp(14px, 3vw, 20px)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                  touchAction: 'none',
                }}
              >
                A
              </button>
            </div>
          </div>
        )}

      </div>

      <p
        className="dso-controls-help"
        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: '#5a6078', lineHeight: 1.8 }}
      >
        {touchControls
          ? 'JOYSTICK mover/navegar · A confirmar/falar · B menu/voltar · CHAT conversar'
          : 'WASD/SETAS mover · Z/ENTER falar & confirmar · X menu · ENTER abrir chat · M som'}
      </p>
    </main>
  );
}
