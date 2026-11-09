// Lazily-filled atlas of small pill-shaped markers ("+10 ♥", "+£200", "Idle") used as
// floating labels over buildings. Icons are drawn as shapes so they never depend on fonts.
import { UI_FONT } from './text';

export type MarkerIcon = 'heart' | 'coin' | 'star' | 'warn' | 'none';
export type MarkerTone = 'good' | 'info' | 'warn' | 'gold';

export interface MarkerEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  aspect: number;
}

const SLOT_W = 320, SLOT_H = 80, COLS = 4, ROWS = 12;
const TONES: Record<MarkerTone, [string, string]> = {
  good: ['#2f6b4a', '#ffffff'],
  info: ['#f7f1e6', '#2e2a26'],
  warn: ['#a33b32', '#ffffff'],
  gold: ['#e8b84a', '#3b2e10'],
};

export class MarkerAtlas {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private entries = new Map<string, MarkerEntry>();
  /** Set when a new marker was drawn and the texture must be re-uploaded. */
  dirty = true;

  constructor() {
    this.canvas.width = SLOT_W * COLS;
    this.canvas.height = SLOT_H * ROWS;
    this.ctx = this.canvas.getContext('2d')!;
  }

  get(text: string, icon: MarkerIcon, tone: MarkerTone): MarkerEntry {
    const key = `${text}|${icon}|${tone}`;
    let e = this.entries.get(key);
    if (e) return e;
    const i = this.entries.size % (COLS * ROWS); // wraps (overwrites) if ever exceeded
    const x = (i % COLS) * SLOT_W, y = Math.floor(i / COLS) * SLOT_H;
    const c = this.ctx;
    c.clearRect(x, y, SLOT_W, SLOT_H);
    c.font = `700 40px ${UI_FONT}`;
    const tw = c.measureText(text).width;
    const iconW = icon === 'none' ? 0 : 40;
    const w = Math.min(SLOT_W - 8, tw + iconW + 40);
    const x0 = x + (SLOT_W - w) / 2;
    const [bg, fg] = TONES[tone];
    pill(c, x0, y + 8, w, SLOT_H - 16);
    c.fillStyle = bg;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(40,30,20,0.35)';
    c.stroke();
    c.fillStyle = fg;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(text, x0 + 20, y + SLOT_H / 2 + 1, SLOT_W - 60);
    if (icon !== 'none') drawIcon(c, icon, x0 + 20 + tw + 22, y + SLOT_H / 2, fg);
    e = { u0: x0 / this.canvas.width, u1: (x0 + w) / this.canvas.width, v0: y / this.canvas.height, v1: (y + SLOT_H) / this.canvas.height, aspect: w / SLOT_H };
    this.entries.set(key, e);
    this.dirty = true;
    return e;
  }
}

function pill(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = h / 2;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawIcon(c: CanvasRenderingContext2D, icon: MarkerIcon, cx: number, cy: number, color: string): void {
  c.save();
  c.fillStyle = color;
  c.strokeStyle = color;
  c.beginPath();
  if (icon === 'heart') {
    const s = 13;
    c.moveTo(cx, cy + s);
    c.bezierCurveTo(cx - s * 1.6, cy, cx - s, cy - s * 1.2, cx, cy - s * 0.4);
    c.bezierCurveTo(cx + s, cy - s * 1.2, cx + s * 1.6, cy, cx, cy + s);
    c.fill();
  } else if (icon === 'coin') {
    c.lineWidth = 4;
    c.arc(cx, cy, 13, 0, Math.PI * 2);
    c.stroke();
    c.font = `800 20px ${UI_FONT}`;
    c.textAlign = 'center';
    c.fillText('£', cx, cy + 1);
  } else if (icon === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 6 : 15;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  } else if (icon === 'warn') {
    c.moveTo(cx, cy - 14);
    c.lineTo(cx + 15, cy + 12);
    c.lineTo(cx - 15, cy + 12);
    c.closePath();
    c.fill();
  }
  c.restore();
}
