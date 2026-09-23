// Core pixel-art engine: builds SNES-style sprites from string matrices
export type Pal = Record<string, string>;

export function buildSprite(rows: string[], pal: Pal, scale = 1): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

export function mirror(c: HTMLCanvasElement): HTMLCanvasElement {
  const m = document.createElement('canvas');
  m.width = c.width;
  m.height = c.height;
  const g = m.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return m;
}

// White flash version (hit feedback)
export function whiten(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function drawShadow(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry = 3) {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

// Pixel text with shadow (crisp retro look)
export function pText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 8,
  color = '#fff',
  font = '"Press Start 2P", monospace',
  shadow = '#101828'
) {
  g.font = `${size}px ${font}`;
  g.textBaseline = 'top';
  if (shadow) {
    g.fillStyle = shadow;
    g.fillText(text, x + 1, y + 1);
  }
  g.fillStyle = color;
  g.fillText(text, x, y);
}

export function pTextC(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size = 8,
  color = '#fff',
  font = '"Press Start 2P", monospace',
  shadow: string | null = '#101828'
) {
  g.font = `${size}px ${font}`;
  const w = g.measureText(text).width;
  pText(g, text, Math.round(cx - w / 2), y, size, color, font, shadow);
}

export function panel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border = '#e8e0c8',
  fill = 'rgba(16,24,48,0.92)'
) {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.strokeStyle = border;
  g.lineWidth = 2;
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.strokeStyle = 'rgba(232,224,200,0.35)';
  g.lineWidth = 1;
  g.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

// Word-wrap for dialogs
export function wrapText(g: CanvasRenderingContext2D, text: string, maxW: number, size = 9): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  g.font = `${size}px "Press Start 2P", monospace`;
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
