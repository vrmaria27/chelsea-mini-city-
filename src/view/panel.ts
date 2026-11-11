// World-space VR panel (canvas texture). It lists the same actions as the desktop HUD, so every
// essential control is available in the headset without HTML overlays.
import { UI_FONT } from '../engine/text';
import { LANDMARKS } from '../explore/landmarks';

export type Action =
  | 'toStreet' | 'toMiniature' | 'rotL' | 'rotR' | 'scaleDown' | 'scaleUp' | 'resetView'
  | 'turnL' | 'turnR' | 'labels' | 'lowDetail' | 'reducedMotion' | 'snap' | 'seated' | 'about' | 'exitVR'
  | `place:${string}`;

export interface PanelState {
  mode: 'miniature' | 'street';
  labels: boolean;
  lowDetail: boolean;
  reducedMotion: boolean;
  snapTurnDeg: number;
  seated: boolean;
  selectedId: string | null;
  title: string;
  body: string;
  warn: boolean;
}

interface Btn { action: Action; label: string; x: number; y: number; w: number; h: number; on?: boolean; primary?: boolean; small?: boolean }

const W = 1024, H = 1000;
const C = { bg: '#faf6ee', line: '#e0d4bf', ink: '#2e2a26', soft: '#7a6f63', green: '#2f5a45', hover: '#f3e3c3', warn: '#a33b32', gold: '#c99a4a' };

export class ExplorePanel {
  readonly canvas = document.createElement('canvas');
  readonly widthM = 0.46;
  readonly heightM = (0.46 * H) / W;
  dirty = true;
  private ctx: CanvasRenderingContext2D;
  private buttons: Btn[] = [];
  private hover: Action | null = null;
  private state: PanelState | null = null;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  set(s: PanelState): void {
    const prev = this.state;
    if (prev && JSON.stringify(prev) === JSON.stringify(s)) return;
    this.state = s;
    this.layout();
    this.dirty = true;
  }

  setHover(a: Action | null): void {
    if (a !== this.hover) {
      this.hover = a;
      this.dirty = true;
    }
  }

  /** Button under panel coordinates (u, v in 0…1, v down); null between buttons. */
  hit(u: number, v: number): Action | null {
    const x = u * W, y = v * H;
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.action;
    return null;
  }

  private layout(): void {
    const s = this.state!;
    const out: Btn[] = [];
    const P = 28;
    let y = 96;
    if (s.mode === 'miniature') {
      out.push({ action: 'toStreet', label: 'Go to street level', x: P, y, w: 420, h: 72, primary: true });
      out.push({ action: 'rotL', label: '⟲ Rotate', x: 466, y, w: 128, h: 72 });
      out.push({ action: 'rotR', label: 'Rotate ⟳', x: 602, y, w: 128, h: 72 });
      out.push({ action: 'scaleDown', label: '− Smaller', x: 738, y, w: 128, h: 72 });
      out.push({ action: 'scaleUp', label: 'Larger +', x: 874, y, w: 122, h: 72 });
      y += 84;
      out.push({ action: 'resetView', label: 'Reset table position', x: P, y, w: 420, h: 56, small: true });
    } else {
      out.push({ action: 'toMiniature', label: 'Back to miniature', x: P, y, w: 420, h: 72, primary: true });
      out.push({ action: 'turnL', label: '↶ Turn left', x: 466, y, w: 262, h: 72 });
      out.push({ action: 'turnR', label: 'Turn right ↷', x: 736, y, w: 260, h: 72 });
      y += 84;
    }
    y += s.mode === 'miniature' ? 56 + 18 : 18;
    // Places: two columns
    const colW = (W - P * 2 - 12) / 2;
    LANDMARKS.forEach((l, i) => {
      const cx = P + (i % 2) * (colW + 12), cy = y + 32 + Math.floor(i / 2) * 50;
      const label = s.mode === 'street' && !l.street ? `${l.name} (miniature)` : l.name;
      out.push({ action: `place:${l.id}`, label, x: cx, y: cy, w: colW, h: 44, on: s.selectedId === l.id, small: true });
    });
    y += 32 + Math.ceil(LANDMARKS.length / 2) * 50 + 10;
    this.infoY = y;
    y += 132 + 14;
    const sw = (W - P * 2 - 4 * 10) / 5;
    const settings: [Action, string, boolean][] = [
      ['labels', `Labels ${s.labels ? 'on' : 'off'}`, s.labels],
      ['lowDetail', `Low detail ${s.lowDetail ? 'on' : 'off'}`, s.lowDetail],
      ['reducedMotion', `Less motion ${s.reducedMotion ? 'on' : 'off'}`, s.reducedMotion],
      ['snap', `Snap ${s.snapTurnDeg}°`, false],
      ['seated', `Seated ${s.seated ? 'on' : 'off'}`, s.seated],
    ];
    settings.forEach(([a, label, on], i) => out.push({ action: a, label, x: P + i * (sw + 10), y, w: sw, h: 52, on, small: true }));
    y += 62;
    out.push({ action: 'about', label: 'About & attribution', x: P, y, w: 470, h: 50, small: true });
    out.push({ action: 'exitVR', label: 'Exit VR', x: W - P - 470, y, w: 470, h: 50, small: true });
    this.buttons = out;
  }

  private infoY = 0;

  draw(): void {
    const c = this.ctx, s = this.state;
    this.dirty = false;
    c.clearRect(0, 0, W, H);
    rr(c, 0, 0, W, H, 34);
    c.fillStyle = 'rgba(250,246,238,0.97)';
    c.fill();
    c.strokeStyle = C.line;
    c.lineWidth = 3;
    c.stroke();
    if (!s) return;
    c.fillStyle = C.ink;
    c.font = `700 44px ${UI_FONT}`;
    c.textBaseline = 'middle';
    c.fillText('Chelsea Explorer', 28, 50);
    c.font = `600 26px ${UI_FONT}`;
    c.fillStyle = C.soft;
    c.textAlign = 'right';
    c.fillText(s.mode === 'miniature' ? 'Miniature · point at the pavement to choose a spot' : 'Street level · trigger on the ground to step there', W - 28, 52);
    c.textAlign = 'left';
    const placesY = this.buttons.find((b) => b.action.startsWith('place:'))!.y - 26;
    c.fillStyle = C.soft;
    c.font = `700 24px ${UI_FONT}`;
    c.fillText('PLACES', 30, placesY);
    for (const b of this.buttons) {
      const hov = this.hover === b.action;
      rr(c, b.x, b.y, b.w, b.h, 14);
      c.fillStyle = b.primary ? C.green : b.on ? '#dfe9e3' : hov ? C.hover : '#ffffff';
      c.fill();
      c.strokeStyle = hov ? C.gold : b.primary ? C.green : C.line;
      c.lineWidth = hov ? 5 : 2;
      c.stroke();
      c.fillStyle = b.primary ? '#ffffff' : C.ink;
      c.font = `${b.primary ? 700 : 600} ${b.small ? 25 : 30}px ${UI_FONT}`;
      c.textAlign = 'center';
      c.fillText(fit(c, b.label, b.w - 16), b.x + b.w / 2, b.y + b.h / 2 + 1);
      c.textAlign = 'left';
    }
    // Information box (selected place, notice or About text)
    const y0 = this.infoY;
    rr(c, 28, y0, W - 56, 132, 14);
    c.fillStyle = s.warn ? '#f8e1dc' : '#fdf6e3';
    c.fill();
    c.fillStyle = s.warn ? C.warn : C.ink;
    c.font = `700 28px ${UI_FONT}`;
    c.fillText(fit(c, s.title, W - 90), 44, y0 + 28);
    c.font = `500 23px ${UI_FONT}`;
    wrap(c, s.body, 44, y0 + 62, W - 90, 29, 3);
  }
}

export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function fit(c: CanvasRenderingContext2D, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && c.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number): void {
  const words = text.split(/\s+/);
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(test).width > max && line) {
      if (n === lines - 1) {
        c.fillText(fit(c, `${line} ${words.slice(i).join(' ')}`, max), x, y + n * lh);
        return;
      }
      c.fillText(line, x, y + n * lh);
      n++;
      line = words[i];
    } else line = test;
  }
  if (line) c.fillText(line, x, y + n * lh);
}
