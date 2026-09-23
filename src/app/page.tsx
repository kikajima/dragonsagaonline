'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Game, VW, VH } from '@/game/game';
import { chip } from '@/game/audio';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showName, setShowName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [chatVal, setChatVal] = useState('');

  useEffect(() => {
    if (!canvasRef.current) return;
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
  }, []);

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
    if (chatVal.trim()) g.sendChat(chatVal);
    setChatVal('');
    setShowChat(false);
    chatInputRef.current?.blur();
  }, [chatVal]);

  const confirmName = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.confirmName(nameVal);
  }, [nameVal]);

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-black overflow-hidden p-1 sm:p-3">
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
