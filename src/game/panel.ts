// World-space build menu + status panel for VR, drawn into a canvas texture.
// The same action ids are used by the desktop HTML controls.
import { BUILDINGS, BUILDING_TYPES, RULES, type BuildingType } from '../sim/rules';
import { formatHappiness, formatMoney } from '../sim/simulation';
import { UI_FONT } from '../engine/text';
import type { Game } from './game';

export type Action =
  | `tool:${BuildingType}`
  | 'undo' | 'rotL' | 'rotR' | 'scaleDown' | 'scaleUp' | 'lower' | 'raise' | 'resetView' | 'resetSave' | 'exitVR';

interface Button {
  id: Action;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PANEL_PX = { w: 1024, h: 800 };
/** Physical size of the panel in metres. */
export const PANEL_M = { w: 0.52, h: 0.52 * (800 / 1024) };

const COL = {
  bg: '#f7f1e6',
  ink: '#2e2a26',
  soft: '#7a6f63',
  line: '#e2d6c2',
  button: '#ffffff',
  hover: '#f3e3c3',
  selected: '#2f5a45',
  selectedInk: '#ffffff',
  danger: '#a33b32',
  good: '#3f8a5a',
  bar: '#e8dcc8',
};

export class WorldPanel {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private buttons: Button[] = [];
  hover: Action | null = null;
  dirty = true;

  constructor() {
    this.canvas.width = PANEL_PX.w;
    this.canvas.height = PANEL_PX.h;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setHover(a: Action | null): void {
    if (a !== this.hover) {
      this.hover = a;
      this.dirty = true;
    }
  }

  hit(u: number, v: number): Action | null {
    const x = u * PANEL_PX.w, y = v * PANEL_PX.h;
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  draw(game: Game, tickProgress: number): void {
    const c = this.ctx;
    const W = PANEL_PX.w, H = PANEL_PX.h;
    this.buttons = [];
    c.clearRect(0, 0, W, H);
    rr(c, 4, 4, W - 8, H - 8, 34);
    c.fillStyle = COL.bg;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#c9b48f';
    c.stroke();

    const f = (size: number, weight = 600) => `${weight} ${size}px ${UI_FONT}`;
    c.textBaseline = 'middle';

    // Header
    c.fillStyle = COL.ink;
    c.font = f(40, 700);
    c.textAlign = 'left';
    c.fillText('Chelsea Mini City', 36, 52);
    c.font = f(22, 500);
    c.fillStyle = COL.soft;
    c.textAlign = 'right';
    c.fillText('Chelsea-inspired; approximate layout', W - 36, 54);

    // Stats
    const s = game.stats;
    const stats: [string, string][] = [
      ['Money', formatMoney(game.state.money)],
      ['Residents', String(s.residents)],
      ['Happiness', formatHappiness(s.happiness)],
      ['Income / tick', '+' + formatMoney(s.incomePerTick)],
    ];
    const sw = (W - 72) / 4;
    stats.forEach(([label, value], i) => {
      const x = 36 + i * sw;
      rr(c, x + 4, 92, sw - 8, 96, 18);
      c.fillStyle = '#fffaf1';
      c.fill();
      c.textAlign = 'center';
      c.fillStyle = COL.soft;
      c.font = f(22, 600);
      c.fillText(label, x + sw / 2, 118);
      c.fillStyle = COL.ink;
      c.font = f(40, 700);
      c.fillText(value, x + sw / 2, 160);
    });
    // next tick progress
    c.fillStyle = COL.bar;
    c.fillRect(40, 196, W - 80, 6);
    c.fillStyle = '#c99a4a';
    c.fillRect(40, 196, (W - 80) * Math.min(1, tickProgress), 6);

    // Objective
    const p = game.objectiveProgress();
    const done = game.state.objectiveReached;
    c.textAlign = 'left';
    c.font = f(26, 700);
    c.fillStyle = done ? COL.good : COL.ink;
    c.fillText(done ? '★ Objective reached — keep building!' : `Goal: ${RULES.objective.residents} residents & ${RULES.objective.happiness} happiness`, 40, 232);
    this.bar(c, 40, 254, (W - 100) / 2, `Residents ${s.residents}/${RULES.objective.residents}`, p.residents);
    this.bar(c, 60 + (W - 100) / 2, 254, (W - 100) / 2, `Happiness ${formatHappiness(s.happiness)}/${RULES.objective.happiness}`, p.happiness);

    // Build buttons
    const bw = (W - 72 - 32) / 3;
    BUILDING_TYPES.forEach((t, i) => {
      const id: Action = `tool:${t}`;
      const x = 36 + i * (bw + 16), y = 318, h = 128;
      const sel = game.selected === t;
      const afford = game.state.money >= BUILDINGS[t].cost;
      this.button(c, { id, x, y, w: bw, h }, sel);
      c.textAlign = 'center';
      c.fillStyle = sel ? COL.selectedInk : COL.ink;
      c.font = f(36, 700);
      c.fillText(BUILDINGS[t].label, x + bw / 2, y + 40);
      c.font = f(30, 700);
      c.fillStyle = sel ? '#ffe6a8' : afford ? COL.good : COL.danger;
      c.fillText(formatMoney(BUILDINGS[t].cost), x + bw / 2, y + 80);
      c.font = f(19, 500);
      c.fillStyle = sel ? '#e6efe9' : COL.soft;
      c.fillText(fit(c, BUILDINGS[t].description, bw - 24), x + bw / 2, y + 111);
    });

    // Message / preview line
    const pv = game.preview();
    const msgAge = performance.now() - game.message.at;
    const msg = pv && msgAge > 1800 ? { text: pv.text, kind: pv.ok ? 'info' : 'error' } : game.message;
    rr(c, 36, 462, W - 72, 60, 16);
    c.fillStyle = msg.kind === 'error' ? '#f8e1dc' : msg.kind === 'success' ? '#e1f0e4' : msg.kind === 'celebrate' ? '#fdf0c8' : '#fffaf1';
    c.fill();
    c.fillStyle = msg.kind === 'error' ? COL.danger : COL.ink;
    c.font = f(25, 600);
    c.textAlign = 'center';
    c.fillText(fit(c, msg.text, W - 100), W / 2, 492);

    // Action rows
    const row = (y: number, items: [Action, string][]) => {
      const gap = 12;
      const w = (W - 72 - gap * (items.length - 1)) / items.length;
      items.forEach(([id, label], i) => {
        const x = 36 + i * (w + gap);
        const danger = id === 'resetSave' && game.resetArmed;
        this.button(c, { id, x, y, w, h: 74 }, false, danger);
        c.textAlign = 'center';
        c.fillStyle = danger ? '#ffffff' : COL.ink;
        c.font = f(26, 700);
        c.fillText(label, x + w / 2, y + 38);
      });
    };
    row(542, [
      ['undo', '↶ Undo'],
      ['rotL', '↺ Rotate'],
      ['rotR', 'Rotate ↻'],
      ['scaleDown', '− Smaller'],
      ['scaleUp', '+ Larger'],
    ]);
    row(630, [
      ['lower', '▼ Lower'],
      ['raise', '▲ Raise'],
      ['resetView', 'Reset view'],
      ['resetSave', game.resetArmed ? 'Confirm reset' : 'Reset save'],
      ['exitVR', 'Exit VR'],
    ]);

    // Onboarding
    c.textAlign = 'center';
    c.font = f(23, 600);
    c.fillStyle = COL.soft;
    c.fillText('1 Choose a building   ·   2 Point at an empty plot   ·   3 Build a happier Chelsea', W / 2, 752);
    this.dirty = false;
  }

  private bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, frac: number): void {
    rr(c, x, y, w, 40, 20);
    c.fillStyle = COL.bar;
    c.fill();
    if (frac > 0) {
      rr(c, x, y, Math.max(40, w * frac), 40, 20);
      c.fillStyle = frac >= 1 ? COL.good : '#d9a54a';
      c.fill();
    }
    c.fillStyle = COL.ink;
    c.font = `700 22px ${UI_FONT}`;
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, y + 21);
  }

  private button(c: CanvasRenderingContext2D, b: Button, selected: boolean, danger = false): void {
    this.buttons.push(b);
    rr(c, b.x, b.y, b.w, b.h, 18);
    c.fillStyle = danger ? COL.danger : selected ? COL.selected : this.hover === b.id ? COL.hover : COL.button;
    c.fill();
    c.lineWidth = this.hover === b.id ? 5 : 2;
    c.strokeStyle = this.hover === b.id ? '#c99a4a' : COL.line;
    c.stroke();
  }
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fit(c: CanvasRenderingContext2D, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 4 && c.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

/** Small floating tooltip texture shown above the hovered plot. */
export class Tooltip {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  text = '';
  constructor() {
    this.canvas.width = 768;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;
  }
  /** Returns true if the texture changed. */
  set(text: string, ok: boolean): boolean {
    const key = text + ok;
    if (key === this.text) return false;
    this.text = key;
    const c = this.ctx;
    c.clearRect(0, 0, 768, 128);
    c.font = `700 44px ${UI_FONT}`;
    const t = fit(c, text, 720);
    const w = Math.min(760, c.measureText(t).width + 56);
    rr(c, (768 - w) / 2, 14, w, 100, 50);
    c.fillStyle = ok ? 'rgba(47,90,69,0.94)' : 'rgba(163,59,50,0.94)';
    c.fill();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, 384, 66);
    return true;
  }
}
