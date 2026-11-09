// World-space panels for VR, drawn into canvas textures: the main build/status menu and the
// inspector. Both use the same action ids as the desktop HTML controls.
import { BUILDINGS, BUILDING_TYPES } from '../sim/rules';
import { formatHappiness, formatMoney } from '../sim/simulation';
import { UI_FONT } from '../engine/text';
import type { Game, Tool } from './game';
import { inspectorView } from './inspectView';

export type Action =
  | `tool:${Tool}`
  | 'undo' | 'rotL' | 'rotR' | 'scaleDown' | 'scaleUp' | 'lower' | 'raise' | 'resetView' | 'resetSave' | 'exitVR'
  | 'upgrade' | 'closeInspect' | 'toggleMotion' | 'toggleDetail' | 'mapView' | 'about';

interface Button {
  id: Action;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  disabled: '#ece6dc',
};

const f = (size: number, weight = 600) => `${weight} ${size}px ${UI_FONT}`;

/** Base class: a canvas with clickable buttons, redrawn only when dirty. */
abstract class CanvasPanel {
  readonly canvas = document.createElement('canvas');
  protected ctx: CanvasRenderingContext2D;
  protected buttons: Button[] = [];
  hover: Action | null = null;
  dirty = true;

  constructor(readonly px: { w: number; h: number }, readonly widthM: number) {
    this.canvas.width = px.w;
    this.canvas.height = px.h;
    this.ctx = this.canvas.getContext('2d')!;
  }

  get heightM(): number {
    return (this.widthM * this.px.h) / this.px.w;
  }

  setHover(a: Action | null): void {
    if (a !== this.hover) {
      this.hover = a;
      this.dirty = true;
    }
  }

  hit(u: number, v: number): Action | null {
    const x = u * this.px.w, y = v * this.px.h;
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  protected frame(): void {
    const c = this.ctx;
    this.buttons = [];
    c.clearRect(0, 0, this.px.w, this.px.h);
    rr(c, 4, 4, this.px.w - 8, this.px.h - 8, 34);
    c.fillStyle = COL.bg;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#c9b48f';
    c.stroke();
    c.textBaseline = 'middle';
  }

  protected button(b: Button, opts: { selected?: boolean; danger?: boolean; disabled?: boolean } = {}): void {
    const c = this.ctx;
    if (!opts.disabled) this.buttons.push(b);
    const hov = !opts.disabled && this.hover === b.id;
    rr(c, b.x, b.y, b.w, b.h, 18);
    c.fillStyle = opts.disabled ? COL.disabled : opts.danger ? COL.danger : opts.selected ? COL.selected : hov ? COL.hover : COL.button;
    c.fill();
    c.lineWidth = hov ? 6 : opts.selected ? 4 : 2;
    c.strokeStyle = hov ? '#c99a4a' : opts.selected ? '#1d3a2c' : COL.line;
    c.stroke();
  }

  protected label(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 700, max = 9999): void {
    const c = this.ctx;
    c.font = f(size, weight);
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(fit(c, text, max), x, y);
  }

  abstract draw(game: Game, tickProgress: number): void;
}

/** Main menu: status, chapter progress, tools, view controls and settings. */
export class WorldPanel extends CanvasPanel {
  constructor() {
    super({ w: 1024, h: 1040 }, 0.54);
  }

  /** Set by the scene: whether the model is in north-up map view. */
  mapMode = false;

  draw(game: Game, tickProgress: number): void {
    const c = this.ctx;
    const W = this.px.w;
    const mapMode = this.mapMode;
    this.frame();

    this.label('Chelsea Mini City', 36, 50, 40, COL.ink, 'left');
    this.label(game.map.attribution ? 'Map data © OpenStreetMap contributors' : 'Chelsea-inspired; approximate layout', W - 36, 52, 21, COL.soft, 'right', 500);

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
      rr(c, x + 4, 88, sw - 8, 92, 18);
      c.fillStyle = '#fffaf1';
      c.fill();
      this.label(label, x + sw / 2, 112, 22, COL.soft, 'center', 600);
      this.label(value, x + sw / 2, 152, 38, COL.ink);
    });
    c.fillStyle = COL.bar;
    c.fillRect(40, 188, W - 80, 6);
    c.fillStyle = '#c99a4a';
    c.fillRect(40, 188, (W - 80) * Math.min(1, tickProgress), 6);

    // Chapter progress
    const ch = game.chapterView();
    this.label(ch.done ? `★ ${ch.title}` : `Chapter ${ch.index + 1} of 3 · ${ch.title}`, 40, 224, 27, ch.done ? COL.good : COL.ink, 'left', 700, W - 80);
    if (ch.goals.length) {
      const gw = (W - 80 - 16 * (ch.goals.length - 1)) / ch.goals.length;
      ch.goals.forEach((g, i) => bar(c, 40 + i * (gw + 16), 248, gw, `${g.done ? '✓ ' : ''}${g.label} ${g.display}/${g.target}`, g.current / g.target, g.done));
    }
    rr(c, 40, 298, W - 80, 64, 14);
    c.fillStyle = '#fdf6e3';
    c.fill();
    const hl = wrap(c, 'Next: ' + ch.hint, W - 120, f(21, 600)).slice(0, 2);
    hl.forEach((l, i) => this.label(l, W / 2, 330 + (i - (hl.length - 1) / 2) * 26, 21, COL.ink, 'center', 600, W - 110));

    // Tools: three builds + inspect
    const tools: Tool[] = [...BUILDING_TYPES, 'inspect'];
    const bw = (W - 72 - 3 * 14) / 4;
    tools.forEach((t, i) => {
      const x = 36 + i * (bw + 14), y = 368, h = 120;
      const sel = game.tool === t;
      this.button({ id: `tool:${t}`, x, y, w: bw, h }, { selected: sel });
      if (t === 'inspect') {
        this.label('Inspect', x + bw / 2, y + 42, 32, sel ? COL.selectedInk : COL.ink);
        this.label('details & upgrades', x + bw / 2, y + 86, 19, sel ? '#e6efe9' : COL.soft, 'center', 500, bw - 16);
        return;
      }
      const afford = game.state.money >= BUILDINGS[t].cost;
      this.label(BUILDINGS[t].label, x + bw / 2, y + 36, 30, sel ? COL.selectedInk : COL.ink);
      this.label(formatMoney(BUILDINGS[t].cost), x + bw / 2, y + 72, 28, sel ? '#ffe6a8' : afford ? COL.good : COL.danger);
      this.label(BUILDINGS[t].description, x + bw / 2, y + 102, 17, sel ? '#e6efe9' : COL.soft, 'center', 500, bw - 16);
    });

    // Message line
    const msgAge = performance.now() - game.message.at;
    const pv = game.preview();
    const msg = pv && msgAge > 2200 ? { text: pv.text, kind: pv.ok ? 'info' : 'error' } : game.message;
    rr(c, 36, 502, W - 72, 58, 16);
    c.fillStyle = msg.kind === 'error' ? '#f8e1dc' : msg.kind === 'success' ? '#e1f0e4' : msg.kind === 'celebrate' ? '#fdf0c8' : '#fffaf1';
    c.fill();
    this.label(msg.text, W / 2, 531, 24, msg.kind === 'error' ? COL.danger : COL.ink, 'center', 600, W - 100);

    // Action rows
    const row = (y: number, h: number, items: [Action, string, boolean?][]) => {
      const gap = 12;
      const w = (W - 72 - gap * (items.length - 1)) / items.length;
      items.forEach(([id, text, on], i) => {
        const x = 36 + i * (w + gap);
        const danger = id === 'resetSave' && game.resetArmed;
        this.button({ id, x, y, w, h }, { danger, selected: on === true });
        this.label(text, x + w / 2, y + h / 2 + 1, 25, danger || on ? '#ffffff' : COL.ink, 'center', 700, w - 12);
      });
    };
    row(576, 70, [
      ['undo', '↶ Undo last action'],
      ['rotL', '↺ Rotate'],
      ['rotR', 'Rotate ↻'],
    ]);
    row(656, 70, [
      ['scaleDown', '− Smaller'],
      ['scaleUp', '+ Larger'],
      ['lower', '▼ Lower'],
      ['raise', '▲ Raise'],
    ]);
    row(736, 70, [
      ['resetView', 'Reset view'],
      ['mapView', mapMode ? 'Tabletop view' : 'Map view', mapMode],
      ['resetSave', game.resetArmed ? 'Confirm reset' : 'Reset save'],
      ['exitVR', 'Exit VR'],
    ]);
    row(816, 66, [
      ['toggleMotion', `Reduced motion: ${game.prefs.reducedMotion ? 'On' : 'Off'}`, game.prefs.reducedMotion],
      ['toggleDetail', `Low detail: ${game.prefs.lowDetail ? 'On' : 'Off'}`, game.prefs.lowDetail],
    ]);

    this.label('1 Choose a building   ·   2 Point at an empty plot   ·   3 Build a happier Chelsea', W / 2, 940, 22, COL.soft, 'center', 600);
    this.label('Thumbstick: flick ←/→ to rotate, ↑/↓ to resize', W / 2, 980, 19, COL.soft, 'center', 500);
    this.dirty = false;
  }
}

/** Inspector: building details, happiness breakdown, upgrade offer, or placement estimate. */
export class InspectorPanel extends CanvasPanel {
  constructor() {
    super({ w: 880, h: 940 }, 0.46);
  }

  draw(game: Game): void {
    const c = this.ctx;
    const W = this.px.w;
    this.frame();
    const v = inspectorView(game);
    let y = 50;
    this.label(v.title, 36, y, 34, COL.ink, 'left', 700, W - (v.mode === 'inspect' ? 200 : 72));
    if (v.mode === 'inspect') this.button({ id: 'closeInspect', x: W - 156, y: 22, w: 120, h: 58 });
    if (v.mode === 'inspect') this.label('Close ✕', W - 96, 52, 24, COL.ink);
    y += 44;
    if (v.level === 2) {
      rr(c, 36, y - 18, 220, 38, 19);
      c.fillStyle = '#e8b84a';
      c.fill();
      this.label('★ Level 2', 146, y + 1, 22, '#3b2e10');
      this.label('fully upgraded', 270, y + 1, 21, COL.soft, 'left', 500);
    } else this.label(v.subtitle, 36, y, 23, COL.soft, 'left', 500, W - 72);
    y += 40;

    if (v.stats.length) {
      const sw = (W - 72) / v.stats.length;
      v.stats.forEach((s, i) => {
        const x = 36 + i * sw;
        rr(c, x + 4, y, sw - 8, 86, 16);
        c.fillStyle = '#fffaf1';
        c.fill();
        this.label(s.label, x + sw / 2, y + 24, 20, COL.soft, 'center', 600);
        this.label(s.value, x + sw / 2, y + 60, 34, COL.ink);
      });
      y += 106;
    }
    for (const r of v.rows.slice(0, 7)) {
      this.label(r.label, 48, y, 23, COL.ink, 'left', 600, W - 220);
      if (r.value) this.label(r.value, W - 48, y, 24, r.value.startsWith('-') || r.value.startsWith('−') ? COL.danger : COL.good, 'right');
      c.fillStyle = COL.line;
      c.fillRect(48, y + 20, W - 96, 2);
      y += 42;
    }
    for (const n of v.nearby) {
      this.label(n, 48, y, 21, COL.soft, 'left', 600, W - 96);
      y += 34;
    }
    y += 8;
    // Actionable explanation
    const lines = wrap(c, v.hint, W - 110, f(23, 600));
    const hh = 22 + lines.length * 30;
    rr(c, 36, y, W - 72, hh, 14);
    c.fillStyle = v.hintKind === 'warn' ? '#f8e1dc' : v.hintKind === 'good' ? '#e1f0e4' : '#fdf6e3';
    c.fill();
    lines.forEach((l, i) => this.label((i === 0 ? (v.hintKind === 'warn' ? '! ' : v.hintKind === 'good' ? '✓ ' : '→ ') : '') + l, 56, y + 26 + i * 30, 23, v.hintKind === 'warn' ? COL.danger : COL.ink, 'left', 600));
    y += hh + 18;

    if (v.upgrade) {
      const u = v.upgrade;
      const bh = 82;
      const by = Math.min(y, this.px.h - 40 - bh - u.effects.length * 32 - 34);
      this.button({ id: 'upgrade', x: 36, y: by, w: W - 72, h: bh }, { selected: u.enabled, disabled: !u.enabled });
      this.label(u.label, W / 2, by + bh / 2 + 1, 30, u.enabled ? '#ffffff' : '#9a9087');
      let ey = by + bh + 30;
      for (const e of u.effects) {
        this.label('• ' + e, 52, ey, 22, COL.ink, 'left', 600, W - 104);
        ey += 32;
      }
      if (!u.enabled && u.reason) this.label(u.reason, W / 2, ey, 22, u.reason.startsWith('Already') ? COL.soft : COL.danger, 'center', 600, W - 80);
    }
    this.dirty = false;
  }
}

function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, frac: number, done: boolean): void {
  rr(c, x, y, w, 40, 20);
  c.fillStyle = COL.bar;
  c.fill();
  const fr = Math.max(0, Math.min(1, frac));
  if (fr > 0) {
    rr(c, x, y, Math.max(40, w * fr), 40, 20);
    c.fillStyle = done ? COL.good : '#d9a54a';
    c.fill();
  }
  c.fillStyle = done ? '#ffffff' : COL.ink;
  c.font = f(20, 700);
  c.textAlign = 'center';
  c.fillText(fit(c, label, w - 16), x + w / 2, y + 21);
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
  while (t.length > 4 && c.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function wrap(c: CanvasRenderingContext2D, text: string, max: number, font: string): string[] {
  c.font = font;
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (c.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Small floating tooltip texture shown above the hovered plot. */
export class Tooltip {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  text = '';
  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;
  }
  /** Returns true if the texture changed. */
  set(text: string, ok: boolean): boolean {
    const key = text + ok;
    if (key === this.text) return false;
    this.text = key;
    const c = this.ctx;
    c.clearRect(0, 0, 1024, 128);
    c.font = f(40, 700);
    const t = fit(c, text, 960);
    const w = Math.min(1016, c.measureText(t).width + 56);
    rr(c, (1024 - w) / 2, 14, w, 100, 50);
    c.fillStyle = ok ? 'rgba(47,90,69,0.94)' : 'rgba(163,59,50,0.94)';
    c.fill();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, 512, 66);
    return true;
  }
}
