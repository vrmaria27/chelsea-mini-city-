// A restrained soundscape, synthesised in the browser (no audio files, so nothing to license or
// download): the Venus Fountain (positional, falling off with distance), leaves rustling in gusts near
// the trees, occasional birdsong from the trees around you, and a low, distant city hum. Everything is
// built from filtered random noise and short tone sweeps with randomised timing, so nothing loops
// audibly. It starts only after a user action, and pauses when the page is hidden.
//
// Narration uses the browser's built-in speech synthesis (Web Speech API; no service or key). It speaks
// only when asked, never over another story, and can be paused, resumed, replayed and muted.

export interface SoundSettings { muted: boolean; ambience: boolean; narration: boolean }
interface P3 { x: number; y: number; z: number }

const FOUNTAIN: P3 = { x: 161.9, y: 2.2, z: -146.9 };
/** Tree groups (map metres): Sloane Square, Duke of York Square, King's Road planes (rough centres). */
const TREE_AREAS: { x: number; z: number; r: number }[] = [
  { x: 177, z: -150, r: 45 }, { x: -20, z: 30, r: 45 }, { x: 30, z: 0, r: 40 }, { x: -120, z: 70, r: 60 }, { x: -230, z: 170, r: 60 },
];

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private amb!: GainNode;
  private leavesGain!: GainNode;
  private cityGain!: GainNode;
  private noise!: AudioBuffer;
  private timers: number[] = [];
  private nearTrees = 0;
  private listener: P3 & { yaw: number } = { x: 0, y: 1.6, z: 0, yaw: 0 };
  private settings: SoundSettings;
  /** Set when audio could not start (no Web Audio): the visit carries on silently. */
  failed = false;

  constructor(settings: SoundSettings) {
    this.settings = { ...settings };
  }

  get started(): boolean { return !!this.ctx; }

  /** Creates the audio graph; call from a user gesture (click, trigger). Safe to call repeatedly. */
  start(): void {
    if (this.ctx || this.failed) { void this.ctx?.resume(); return; }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) { this.failed = true; return; }
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.amb = ctx.createGain();
      this.amb.connect(this.master);
      // 7.3 s of independent random noise per channel: as a loop it carries no recognisable pattern
      const len = Math.floor(ctx.sampleRate * 7.3);
      this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = this.noise.getChannelData(c); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
      this.buildFountain();
      this.buildLeaves();
      this.buildCity();
      this.scheduleBirds();
      this.apply();
    } catch {
      this.failed = true;
      this.ctx = null;
    }
  }

  private src(offset = 0): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(0, offset);
    return s;
  }

  private buildFountain(): void {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    p.rolloffFactor = 1.3;
    p.maxDistance = 400;
    p.positionX.value = FOUNTAIN.x; p.positionY.value = FOUNTAIN.y; p.positionZ.value = FOUNTAIN.z;
    p.connect(this.amb);
    // body of falling water: broad band noise
    const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 850; body.Q.value = 0.45;
    const bodyGain = ctx.createGain(); bodyGain.gain.value = 0.55;
    this.src(0).connect(body).connect(bodyGain).connect(p);
    // splashes: brighter band whose level wanders irregularly
    const splash = ctx.createBiquadFilter(); splash.type = 'bandpass'; splash.frequency.value = 3200; splash.Q.value = 0.9;
    const splashGain = ctx.createGain(); splashGain.gain.value = 0.2;
    this.src(2.1).connect(splash).connect(splashGain).connect(p);
    const wander = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      splashGain.gain.setTargetAtTime(0.1 + Math.random() * 0.25, t, 0.06);
      splash.frequency.setTargetAtTime(2600 + Math.random() * 1400, t, 0.2);
      this.timers.push(window.setTimeout(wander, 90 + Math.random() * 260));
    };
    wander();
  }

  private buildLeaves(): void {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.6;
    this.leavesGain = ctx.createGain(); this.leavesGain.gain.value = 0;
    this.src(4.4).connect(hp).connect(bp).connect(this.leavesGain).connect(this.amb);
    const gust = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const level = (0.015 + Math.random() * 0.09) * this.nearTrees;
      this.leavesGain.gain.setTargetAtTime(level, t, 0.6 + Math.random() * 1.2);
      this.timers.push(window.setTimeout(gust, 1500 + Math.random() * 4000));
    };
    gust();
  }

  private buildCity(): void {
    const ctx = this.ctx!;
    // distant traffic: low rumble from brownish noise, slowly swelling and fading
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.3;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 600;
    this.cityGain = ctx.createGain(); this.cityGain.gain.value = 0.12;
    this.src(1.3).connect(lp).connect(lp2).connect(this.cityGain).connect(this.amb);
    const swell = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.cityGain.gain.setTargetAtTime(0.07 + Math.random() * 0.1, t, 2 + Math.random() * 3);
      this.timers.push(window.setTimeout(swell, 4000 + Math.random() * 7000));
    };
    swell();
  }

  /** Short songs of a few rising and falling whistles, from a tree near the listener, every 6–20 s. */
  private scheduleBirds(): void {
    const next = () => {
      this.timers.push(window.setTimeout(() => { this.bird(); next(); }, 6000 + Math.random() * 14000));
    };
    next();
  }

  private bird(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.nearTrees < 0.2) return;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1;
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 18;
    p.positionX.value = this.listener.x + Math.cos(a) * d; p.positionY.value = 7 + Math.random() * 6; p.positionZ.value = this.listener.z + Math.sin(a) * d;
    const g = ctx.createGain(); g.gain.value = 0;
    g.connect(p).connect(this.amb);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.connect(g);
    let t = ctx.currentTime + 0.05;
    const base = 2400 + Math.random() * 2600, notes = 3 + Math.floor(Math.random() * 5), style = Math.random();
    for (let i = 0; i < notes; i++) {
      const dur = 0.04 + Math.random() * 0.09, f0 = base * (0.85 + Math.random() * 0.3);
      const f1 = style < 0.5 ? f0 * (1.15 + Math.random() * 0.4) : f0 * (0.7 + Math.random() * 0.15);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + dur);
      t += dur + 0.03 + Math.random() * 0.12;
    }
    o.start();
    o.stop(t + 0.1);
    o.onended = () => { g.disconnect(); p.disconnect(); };
  }

  /** Listener at the eye (map metres), facing `yaw` (0 = north). Cheap: call every frame. */
  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener = { x, y, z, yaw };
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setTargetAtTime(x, t, 0.05); L.positionY.setTargetAtTime(y, t, 0.05); L.positionZ.setTargetAtTime(z, t, 0.05);
      L.forwardX.setTargetAtTime(fx, t, 0.05); L.forwardY.setTargetAtTime(0, t, 0.05); L.forwardZ.setTargetAtTime(fz, t, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    // leaves and birds only near the trees
    let near = 0;
    for (const a of TREE_AREAS) near = Math.max(near, 1 - Math.min(1, Math.max(0, Math.hypot(x - a.x, z - a.z) - a.r * 0.6) / (a.r * 0.8)));
    this.nearTrees = near;
  }

  set(s: SoundSettings): void {
    this.settings = { ...s };
    this.apply();
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 0.9, t, 0.1);
    this.amb.gain.setTargetAtTime(this.settings.ambience ? 1 : 0, t, 0.15);
  }

  /** Page hidden or VR paused: stop all sound; resume when back. */
  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { if (this.ctx && !this.settings.muted) void this.ctx.resume(); }
}

/** Story narration with the browser's speech synthesis. */
export class Narrator {
  readonly available: boolean;
  state: 'idle' | 'speaking' | 'paused' = 'idle';
  /** The text being read (null when idle). */
  current: string | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private token = 0;
  onchange: () => void = () => {};

  constructor() {
    this.available = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    if (this.available) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find((v) => v.lang === 'en-GB' && /Female|Google|Libby|Sonia|Serena|Kate/i.test(v.name)) ?? vs.find((v) => v.lang === 'en-GB') ?? vs.find((v) => v.lang.startsWith('en')) ?? null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  /** Reads a story from the start, stopping anything already being read (never two at once). */
  speak(text: string): void {
    if (!this.available) return;
    speechSynthesis.cancel();
    const token = ++this.token;
    // sentence by sentence: some browsers stop long utterances part-way
    const parts = text.match(/[^.!?]+[.!?]+["”’]?\s*|[^.!?]+$/g) ?? [text];
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim());
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang ?? 'en-GB';
      u.rate = 0.95;
      if (i === parts.length - 1) u.onend = () => { if (token === this.token) { this.state = 'idle'; this.current = null; this.onchange(); } };
      u.onerror = () => { if (token === this.token) { this.state = 'idle'; this.current = null; this.onchange(); } };
      speechSynthesis.speak(u);
    });
    this.state = 'speaking';
    this.current = text;
    this.onchange();
  }

  pause(): void {
    if (this.state !== 'speaking') return;
    speechSynthesis.pause();
    this.state = 'paused';
    this.onchange();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    speechSynthesis.resume();
    this.state = 'speaking';
    this.onchange();
  }

  stop(): void {
    if (!this.available) return;
    this.token++;
    speechSynthesis.cancel();
    if (this.state !== 'idle') { this.state = 'idle'; this.current = null; this.onchange(); }
  }
}
