// World-space VR panel (canvas texture). It lists the same actions as the desktop HUD, so every
// essential control is available in the headset without HTML overlays.
import { UI_FONT } from '../engine/text';
import { LANDMARKS } from '../explore/landmarks';

export type Action =
  | 'toStreet' | 'toMiniature' | 'rotL' | 'rotR' | 'scaleDown' | 'scaleUp' | 'resetView'
  | 'turnL' | 'turnR' | 'returnFromEnd' | 'labels' | 'lowDetail' | 'reducedMotion' | 'snap' | 'seated' | 'about' | 'exitVR'
  | `place:${string}`
  // visitor experience
  | 'welcomeFree' | 'welcomeDiscover' | 'welcomeClose' | 'welcome' | `tab:${PanelTab}`
  | 'routeStart' | 'routeLeave' | 'storyListen' | 'storyPause' | 'storyResume' | 'storyReplay' | 'storyDetail' | 'storyClose' | 'doneClose'
  | 'nextStop' | 'skipStop' | 'home' | 'capture' | `card:${string}` | 'hint' | 'postcards'
  | 'sndMute' | 'sndAmbience' | 'sndNarration' | 'smooth' | 'hideUI' | 'guide';

export type PanelTab = 'explore' | 'discover' | 'postcards' | 'sound';

/** What the visitor-experience tabs show (set by main.ts from the Visit state). */
export interface VisitPanel {
  tab: PanelTab;
  welcome: boolean;
  completion: boolean;
  mode: 'free' | 'discover';
  /** Open story (or the current stop when following the route). */
  story: { title: string; text: string; detail: string; showDetail: boolean } | null;
  /** "Next stop: …" line, or null. */
  next: string | null;
  narration: 'idle' | 'speaking' | 'paused' | 'unavailable';
  stopsDone: number;
  stopsTotal: number;
  cards: { id: string; place: string; clue: string; hint: string; have: boolean }[];
  selectedCard: string | null;
  showHint: boolean;
  cardCount: number;
  message: string | null;
  sound: { muted: boolean; ambience: boolean; narration: boolean };
  smooth: boolean;
  guide: boolean;
}

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
  /** At the end of the King's Road area: offer a way back (label names the place). */
  endReturn?: string | null;
  visit?: VisitPanel;
}

interface Btn { action: Action; label: string; x: number; y: number; w: number; h: number; on?: boolean; primary?: boolean; small?: boolean }

const W = 1024, H = 1150;
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
  /** Postcard images (loaded by main.ts) drawn in the Postcards tab. */
  images = new Map<string, CanvasImageSource>();

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  set(s: PanelState, force = false): void {
    const prev = this.state;
    if (!force && prev && JSON.stringify(prev) === JSON.stringify(s)) return;
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
    const v = s.visit;
    if (v?.welcome) { this.layoutWelcome(); return; }
    if (v?.completion) { this.layoutCompletion(v); return; }
    const out: Btn[] = [];
    const P = 28;
    let y = 96;
    if (v) {
      const tabs: [PanelTab, string][] = [['explore', 'Explore'], ['discover', 'Discover'], ['postcards', `Postcards ${v.cardCount}/6`], ['sound', 'Sound & comfort']];
      const tw = (W - P * 2 - 30) / 4;
      tabs.forEach(([t, label], i) => out.push({ action: `tab:${t}`, label, x: P + i * (tw + 10), y, w: tw, h: 56, on: v.tab === t, small: true }));
      y += 72;
      if (v.tab !== 'explore') {
        this.buttons = out;
        if (v.tab === 'discover') this.layoutDiscover(v, y);
        else if (v.tab === 'postcards') this.layoutPostcards(v, y);
        else this.layoutSound(v, y);
        return;
      }
    }
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
    if (s.mode === 'street' && s.endReturn) out.push({ action: 'returnFromEnd', label: `↩ ${s.endReturn}`, x: W - 28 - 360, y: y + 72, w: 344, h: 50, primary: true, small: true });
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
  /** Text blocks drawn by the visitor tabs: [text, x, y, maxWidth, lineHeight, maxLines, font, colour]. */
  private texts: [string, number, number, number, number, number, string, string][] = [];
  private thumbs: { id: string; x: number; y: number; w: number; h: number; have: boolean; place: string; on: boolean }[] = [];

  private layoutWelcome(): void {
    const P = 28;
    this.texts = [
      ['Welcome to Chelsea', P + 8, 120, W - 80, 52, 1, `700 46px ${UI_FONT}`, C.ink],
      ['A little corner of London around Sloane Square and King’s Road. Choose how you’d like to begin; you can change your mind at any time.', P + 8, 186, W - 80, 32, 3, `500 26px ${UI_FONT}`, C.soft],
      ['Wander at your own pace: step anywhere on the pavement, look around and jump to places from the list.', P + 40, 448, W - 140, 30, 2, `500 24px ${UI_FONT}`, C.ink],
      ['Follow a gentle walk past five stops with short stories, collecting six postcards along the way.', P + 40, 664, W - 140, 30, 2, `500 24px ${UI_FONT}`, C.ink],
      ['How to move: point at the paving and pull the trigger to step there. Flick the thumbstick left or right to turn.', P + 8, 860, W - 80, 30, 3, `600 24px ${UI_FONT}`, C.green],
    ];
    this.thumbs = [];
    this.buttons = [
      { action: 'welcomeFree', label: 'Explore freely', x: P, y: 300, w: W - P * 2, h: 200, small: false },
      { action: 'welcomeDiscover', label: 'Discover Chelsea', x: P, y: 520, w: W - P * 2, h: 200, primary: true },
      { action: 'welcomeClose', label: 'Just look around', x: P, y: 990, w: 340, h: 64, small: true },
      { action: 'exitVR', label: 'Exit VR', x: W - P - 340, y: 990, w: 340, h: 64, small: true },
    ];
  }

  private layoutCompletion(v: VisitPanel): void {
    const P = 28;
    this.texts = [
      ['You’ve reached the end of the walk', P + 8, 120, W - 80, 52, 1, `700 42px ${UI_FONT}`, C.ink],
      [`From the Venus Fountain to Markham Square: ${v.stopsDone} of ${v.stopsTotal} stops and ${v.cardCount} of 6 postcards. Missing ones will still be here whenever you come back.`, P + 8, 190, W - 80, 32, 4, `500 26px ${UI_FONT}`, C.soft],
    ];
    this.thumbs = this.cardGrid(v, 330, false);
    this.buttons = [
      { action: 'postcards', label: 'View postcards', x: P, y: 860, w: 300, h: 72, primary: true, small: true },
      { action: 'doneClose', label: 'Continue exploring', x: P + 312, y: 860, w: 320, h: 72, small: true },
      { action: 'home', label: 'Return to Sloane Square', x: P + 644, y: 860, w: W - P * 2 - 644, h: 72, small: true },
      { action: 'exitVR', label: 'Exit VR', x: W - P - 260, y: 990, w: 260, h: 56, small: true },
    ];
  }

  private cardGrid(v: VisitPanel, y0: number, buttons: boolean): typeof this.thumbs {
    const P = 28, gw = (W - P * 2 - 2 * 16) / 3, gh = 230;
    return v.cards.map((c, i) => {
      const x = P + (i % 3) * (gw + 16), y = y0 + Math.floor(i / 3) * (gh + 16);
      if (buttons) this.buttons.push({ action: `card:${c.id}`, label: '', x, y, w: gw, h: gh, small: true });
      return { id: c.id, x, y, w: gw, h: gh, have: c.have, place: c.place, on: v.selectedCard === c.id };
    });
  }

  private layoutDiscover(v: VisitPanel, y: number): void {
    const P = 28, out = this.buttons;
    this.texts = [];
    this.thumbs = [];
    if (v.mode === 'free' && !v.story) {
      this.texts.push(['Discover Chelsea', P + 8, y + 40, W - 80, 48, 1, `700 38px ${UI_FONT}`, C.ink]);
      this.texts.push(['A gentle walk from Sloane Square past Peter Jones, Duke of York Square and the Saatchi Gallery to King’s Road at Markham Square: five short stories and six postcards. Stop, skip or wander off whenever you like.', P + 8, y + 100, W - 80, 32, 5, `500 26px ${UI_FONT}`, C.soft]);
      this.texts.push([`${v.stopsDone} of ${v.stopsTotal} stops visited so far.`, P + 8, y + 290, W - 80, 30, 1, `600 25px ${UI_FONT}`, C.green]);
      out.push({ action: 'routeStart', label: v.stopsDone ? 'Resume the walk' : 'Start the walk', x: P, y: y + 330, w: 460, h: 76, primary: true });
      out.push({ action: 'home', label: 'Return to Sloane Square', x: P + 476, y: y + 330, w: W - P * 2 - 476, h: 76, small: true });
      return;
    }
    if (v.story) {
      this.texts.push([v.story.title, P + 8, y + 36, W - 80, 44, 1, `700 36px ${UI_FONT}`, C.ink]);
      this.texts.push([v.story.text, P + 8, y + 86, W - 80, 31, 11, `500 25px ${UI_FONT}`, C.ink]);
      let by = y + 86 + 11 * 31 + 10;
      if (v.story.showDetail) { this.texts.push([`Look for: ${v.story.detail}`, P + 8, by + 10, W - 80, 30, 4, `600 24px ${UI_FONT}`, C.green]); by += 130; }
      const n = v.narration;
      const bw = (W - P * 2 - 30) / 4;
      if (n !== 'unavailable') {
        out.push({ action: n === 'speaking' ? 'storyPause' : n === 'paused' ? 'storyResume' : 'storyListen', label: n === 'speaking' ? '❚❚ Pause' : n === 'paused' ? '▶ Resume' : '▶ Listen', x: P, y: by, w: bw, h: 64, small: true });
        out.push({ action: 'storyReplay', label: '↺ Replay', x: P + bw + 10, y: by, w: bw, h: 64, small: true });
      }
      out.push({ action: 'storyDetail', label: v.story.showDetail ? 'Hide detail' : 'Detail to notice', x: P + (bw + 10) * 2, y: by, w: bw, h: 64, small: true, on: v.story.showDetail });
      out.push({ action: 'storyClose', label: 'Continue exploring', x: P + (bw + 10) * 3, y: by, w: bw, h: 64, primary: true, small: true });
      by += 78;
      if (n === 'unavailable') this.texts.push(['Narration isn’t available in this browser; the story is shown as text.', P + 8, by + 8, W - 80, 28, 1, `500 22px ${UI_FONT}`, C.soft]);
      return;
    }
    // following the route, no story open: where next
    this.texts.push(['Discover Chelsea', P + 8, y + 40, W - 80, 48, 1, `700 38px ${UI_FONT}`, C.ink]);
    this.texts.push([v.next ?? 'All five stops visited. Enjoy exploring!', P + 8, y + 100, W - 80, 34, 3, `600 28px ${UI_FONT}`, C.green]);
    this.texts.push([`${v.stopsDone} of ${v.stopsTotal} stops · ${v.cardCount} of 6 postcards · follow the small green ring on the ground, or step to the next stop.`, P + 8, y + 220, W - 80, 30, 3, `500 24px ${UI_FONT}`, C.soft]);
    const bw = (W - P * 2 - 20) / 3;
    out.push({ action: 'nextStop', label: 'Step to the next stop', x: P, y: y + 330, w: bw, h: 72, primary: true, small: true });
    out.push({ action: 'skipStop', label: 'Skip this stop', x: P + bw + 10, y: y + 330, w: bw, h: 72, small: true });
    out.push({ action: 'routeLeave', label: 'Explore freely', x: P + (bw + 10) * 2, y: y + 330, w: bw, h: 72, small: true });
    out.push({ action: 'guide', label: `Ground ring ${v.guide ? 'on' : 'off'}`, x: P, y: y + 414, w: bw, h: 56, small: true, on: v.guide });
    out.push({ action: 'home', label: 'Return to Sloane Square', x: P + bw + 10, y: y + 414, w: bw * 2 + 10, h: 56, small: true });
  }

  private layoutPostcards(v: VisitPanel, y: number): void {
    const P = 28;
    this.texts = [[`${v.cardCount} of 6 postcards`, P + 8, y + 30, W - 80, 40, 1, `700 32px ${UI_FONT}`, C.ink]];
    this.thumbs = this.cardGrid(v, y + 64, true);
    let by = y + 64 + 2 * 246 + 4;
    const sel = v.cards.find((c) => c.id === v.selectedCard) ?? v.cards.find((c) => !c.have) ?? v.cards[0];
    this.texts.push([`${sel.place}: ${sel.clue}${v.showHint ? `  Hint: ${sel.hint}` : ''}`, P + 8, by + 22, W - 80, 29, 3, `500 24px ${UI_FONT}`, C.ink]);
    by += 104;
    this.buttons.push({ action: 'capture', label: '◉ Take postcard', x: P, y: by, w: 420, h: 76, primary: true });
    this.buttons.push({ action: 'hint', label: v.showHint ? 'Hide hint' : 'Show hint', x: P + 432, y: by, w: 250, h: 76, small: true, on: v.showHint });
    this.buttons.push({ action: 'home', label: 'Sloane Square', x: P + 694, y: by, w: W - P * 2 - 694, h: 76, small: true });
    if (v.message) this.texts.push([v.message, P + 8, by + 106, W - 80, 28, 2, `600 23px ${UI_FONT}`, C.green]);
    else this.texts.push(['Frame the view with your head, then press Take postcard (or the A button). To retake one, take it again.', P + 8, by + 106, W - 80, 28, 2, `500 22px ${UI_FONT}`, C.soft]);
  }

  private layoutSound(v: VisitPanel, y: number): void {
    const P = 28, out = this.buttons, bw = (W - P * 2 - 20) / 3;
    this.texts = [['Sound', P + 8, y + 30, W - 80, 40, 1, `700 30px ${UI_FONT}`, C.ink], ['Comfort and view', P + 8, y + 210, W - 80, 40, 1, `700 30px ${UI_FONT}`, C.ink]];
    this.thumbs = [];
    out.push({ action: 'sndMute', label: v.sound.muted ? 'All sound: muted' : 'All sound: on', x: P, y: y + 64, w: bw, h: 72, on: !v.sound.muted, small: true });
    out.push({ action: 'sndAmbience', label: `Ambience ${v.sound.ambience ? 'on' : 'off'}`, x: P + bw + 10, y: y + 64, w: bw, h: 72, on: v.sound.ambience, small: true });
    out.push({ action: 'sndNarration', label: `Narration ${v.sound.narration ? 'on' : 'off'}`, x: P + (bw + 10) * 2, y: y + 64, w: bw, h: 72, on: v.sound.narration, small: true });
    const s = this.state!;
    out.push({ action: 'smooth', label: `Smooth walking ${v.smooth ? 'on' : 'off'}`, x: P, y: y + 244, w: bw, h: 64, on: v.smooth, small: true });
    out.push({ action: 'snap', label: `Snap turn ${s.snapTurnDeg}°`, x: P + bw + 10, y: y + 244, w: bw, h: 64, small: true });
    out.push({ action: 'seated', label: `Seated ${s.seated ? 'on' : 'off'}`, x: P + (bw + 10) * 2, y: y + 244, w: bw, h: 64, on: s.seated, small: true });
    out.push({ action: 'reducedMotion', label: `Less motion ${s.reducedMotion ? 'on' : 'off'}`, x: P, y: y + 320, w: bw, h: 64, on: s.reducedMotion, small: true });
    out.push({ action: 'lowDetail', label: `Low detail ${s.lowDetail ? 'on' : 'off'}`, x: P + bw + 10, y: y + 320, w: bw, h: 64, on: s.lowDetail, small: true });
    out.push({ action: 'hideUI', label: 'Hide this panel', x: P + (bw + 10) * 2, y: y + 320, w: bw, h: 64, small: true });
    out.push({ action: 'welcome', label: 'Welcome screen', x: P, y: y + 396, w: bw, h: 64, small: true });
    out.push({ action: 'home', label: 'Return to Sloane Square', x: P + bw + 10, y: y + 396, w: bw * 2 + 10, h: 64, small: true });
    out.push({ action: 'exitVR', label: 'Exit VR', x: P, y: y + 472, w: bw, h: 56, small: true });
    this.texts.push(['Smooth walking: push the left thumbstick to walk; the right one turns. The hidden panel comes back with the X or Y button.', P + 8, y + 560, W - 80, 28, 3, `500 22px ${UI_FONT}`, C.soft]);
  }

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
    c.textBaseline = 'middle';
    const v = s.visit;
    if (v && (v.welcome || v.completion || v.tab !== 'explore')) { this.drawVisit(); return; }
    c.fillStyle = C.ink;
    c.font = `700 44px ${UI_FONT}`;
    c.fillText('Chelsea Explorer', 28, 50);
    c.font = `600 26px ${UI_FONT}`;
    c.fillStyle = C.soft;
    c.textAlign = 'right';
    c.fillText(s.mode === 'miniature' ? 'Miniature · point at the pavement to choose a spot' : 'Street level · trigger on the ground to step there', W - 28, 52);
    c.textAlign = 'left';
    const placesY = this.buttons.find((b) => b.action.startsWith('place:'))!.y - 26;
    void placesY;
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
    this.drawInfo();
  }

  private drawButtons(): void {
    const c = this.ctx;
    for (const b of this.buttons) {
      if (b.action.startsWith('card:')) continue;
      const hov = this.hover === b.action;
      rr(c, b.x, b.y, b.w, b.h, 14);
      c.fillStyle = b.primary ? C.green : b.on ? '#dfe9e3' : hov ? C.hover : '#ffffff';
      c.fill();
      c.strokeStyle = hov ? C.gold : b.primary ? C.green : C.line;
      c.lineWidth = hov ? 5 : 2;
      c.stroke();
      c.fillStyle = b.primary ? '#ffffff' : C.ink;
      c.font = `${b.primary ? 700 : 600} ${b.small ? 25 : 32}px ${UI_FONT}`;
      c.textAlign = 'center';
      c.fillText(fit(c, b.label, b.w - 16), b.x + b.w / 2, b.y + (b.h > 120 ? 52 : b.h / 2 + 1));
      c.textAlign = 'left';
    }
  }

  private drawVisit(): void {
    const c = this.ctx, s = this.state!, v = s.visit!;
    if (!v.welcome && !v.completion) {
      c.fillStyle = C.ink;
      c.font = `700 40px ${UI_FONT}`;
      c.fillText('Chelsea Explorer', 28, 48);
    }
    this.drawButtons();
    for (const t of this.thumbs) {
      const hov = this.hover === `card:${t.id}`;
      rr(c, t.x, t.y, t.w, t.h, 14);
      c.fillStyle = t.have ? '#ffffff' : '#f2ece0';
      c.fill();
      c.strokeStyle = t.on || hov ? C.gold : C.line;
      c.lineWidth = t.on || hov ? 5 : 2;
      c.stroke();
      const img = this.images.get(t.id);
      if (t.have && img) {
        c.save(); rr(c, t.x + 8, t.y + 8, t.w - 16, t.h - 58, 8); c.clip();
        c.drawImage(img, t.x + 8, t.y + 8, t.w - 16, t.h - 58);
        c.restore();
      } else {
        c.fillStyle = C.soft;
        c.font = `600 70px ${UI_FONT}`;
        c.textAlign = 'center';
        c.fillText(t.have ? '✓' : '?', t.x + t.w / 2, t.y + (t.h - 50) / 2);
        c.textAlign = 'left';
      }
      c.fillStyle = C.ink;
      c.font = `600 21px ${UI_FONT}`;
      c.textAlign = 'center';
      c.fillText(fit(c, t.place, t.w - 16), t.x + t.w / 2, t.y + t.h - 24);
      c.textAlign = 'left';
    }
    for (const [text, x, y, w, lh, lines, font, col] of this.texts) {
      c.font = font;
      c.fillStyle = col;
      wrap(c, text, x, y, w, lh, lines);
    }
  }

  private drawInfo(): void {
    const c = this.ctx, s = this.state!;
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
