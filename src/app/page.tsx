'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

const COLYSEUS_URL = process.env.NEXT_PUBLIC_COLYSEUS_URL?.trim() || '';

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

  const sessionRef = useRef<DsoSession | null>(null);
  const characterRef = useRef<CharacterRow | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const multiplayerRef = useRef<MultiplayerConnection | null>(null);

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

    const onTouchStart = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      const x = ((t.clientX - rect.left) / rect.width) * VW;
      const y = ((t.clientY - rect.top) / rect.height) * VH;
      game.touchStart(x, y);
    };
    const onTouchEnd = () => game.touchEnd();
    canvasRef.current?.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    // Auto-enable audio on first interaction
    const unlock = () => chip.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('touchend', onTouchEnd);
      canvasRef.current?.removeEventListener('touchstart', onTouchStart as EventListener);
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
      },
    })
      .then((connection) => {
        if (cancelled) {
          void connection.leave();
          return;
        }

        multiplayerRef.current = connection;
        game.setMultiplayerActive(true);
        setMultiplayerStatus('online');

        connection.sendMove(game.px, game.py, game.pdir);

        movementTimer = setInterval(() => {
          const activeGame = gameRef.current;
          const activeConnection = multiplayerRef.current;
          if (!activeGame || !activeConnection || activeGame.state !== 'world') return;

          activeConnection.sendMove(
            activeGame.px,
            activeGame.py,
            activeGame.pdir,
          );
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
      });

    return () => {
      cancelled = true;
      if (movementTimer) clearInterval(movementTimer);

      const connection = multiplayerRef.current;
      multiplayerRef.current = null;
      game.setMultiplayerActive(false);

      if (connection) {
        void connection.leave().catch(() => undefined);
      }
    };
  }, [authReady, session?.access_token, activeCharacterId]);

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
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-black overflow-hidden p-1 sm:p-3">
      <div
        className="fixed right-2 top-2 z-50 flex items-center gap-2 rounded px-2 py-2"
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
      <div
        className="relative w-full"
        style={{ maxWidth: VW, aspectRatio: `${VW}/${VH}` }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block rounded-sm"
          style={{
            imageRendering: 'pixelated',
            boxShadow: '0 0 0 3px #2a2a3a, 0 0 40px rgba(80,120,255,0.25), 0 0 120px rgba(0,0,0,0.8)',
            background: '#05070d',
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

      <p
        className="mt-2 text-center"
        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: '#5a6078', lineHeight: 1.8 }}
      >
        WASD/SETAS mover · Z/ENTER falar & confirmar · X menu · ENTER abrir chat · M som
      </p>
    </main>
  );
}
