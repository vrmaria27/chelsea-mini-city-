// Distinctive features of individual King's Road buildings, drawn after their standard composition
// (see kingsRoadSpecs.ts for the sources of each). Each hook works in the frontage's local frame.
import { hex, shade } from '../../engine/geometry';
import { F, prismAt } from './facadeKit';
import { M, type KrHook, type KrHookCtx } from './kingsRoad';

const mainOf = (h: KrHookCtx): F | undefined => h.fronts.slice().sort((a, b) => b.len - a.len)[0];

/** Raised attic over the centre of the 74–108 terrace (central feature of the composition). */
const attic: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len;
  fr.box(0.3, L - 0.3, h.top, h.top + 1.3, 0, 0.1, M.stucco, false, true);
  fr.box(0.2, L - 0.2, h.top + 1.3, h.top + 1.5, 0, 0.3, shade(M.stucco, 1.03), true, true);
  fr.pediment(L / 2, h.top + 1.5, Math.min(L - 0.6, 7), 1.2, M.stucco, 0.3);
};

/** Wellington Square development pairs (55–59, 61–65): centre house advanced and pedimented. */
const pedCentre: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, a = L / 3 + 0.2, b = (2 * L) / 3 - 0.2;
  // advanced centre (a shallow projection carried up the full height above the shops)
  fr.box(a, b, h.ys[1], h.eaves, 0, 0.25, shade(M.stucco, 1.02), false, true);
  // its window re-drawn on the advanced face
  const uc = L / 2;
  for (let s = 1; s < h.ys.length - 1; s++) {
    const sh = h.ys[s + 1] - h.ys[s], y0 = h.ys[s] + (s === 1 ? 0.1 : sh * 0.24), wh = s === 1 ? sh * 0.8 : sh * 0.55;
    fr.wall(uc - 0.55, uc + 0.55, y0, y0 + wh, M.glass, 0.27);
    fr.box(uc - 0.7, uc - 0.55, y0, y0 + wh, 0.25, 0.36, M.stucco, false, true);
    fr.box(uc + 0.55, uc + 0.7, y0, y0 + wh, 0.25, 0.36, M.stucco, false, true);
    fr.box(uc - 0.7, uc + 0.7, y0 + wh, y0 + wh + 0.16, 0.25, 0.4, M.stucco, false, true);
  }
  fr.box(a - 0.1, b + 0.1, h.eaves - 0.25, h.eaves + 0.1, 0, 0.55, M.stucco, true, true);
  fr.pediment(uc, h.eaves + 0.1, b - a + 0.4, 1.2, M.stucco, 0.45);
};

/** Central bay of 68–70: iron balcony, arched window and a pediment (C:078, C:021). */
const pedBay: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const uc = fr.len / 2;
  fr.box(uc - 1.6, uc + 1.6, h.ys[1], h.eaves, 0, 0.3, M.red, false, true);
  for (const u of [uc - 1.6, uc + 1.6]) for (let y = h.ys[1]; y + 0.3 < h.eaves; y += 0.6) fr.box(u - 0.28, u + 0.28, y, y + 0.28, 0.28, 0.34, M.portland, false, true);
  fr.railing(uc - 1.2, uc + 1.2, h.ys[3], 0.75, 0.95);
  fr.window(uc, h.ys[3] + 0.15, 1.2, (h.ys[4] - h.ys[3]) * 0.8, { frame: M.portland, head: 'round', bars: 1, base: 0.3 });
  fr.pediment(uc, h.top, 3.6, 1.5, M.portland, 0.5);
  fr.wall(uc - 0.35, uc + 0.35, h.top + 0.35, h.top + 0.95, M.glass, 0.52);
};

/** The former Colville Tavern (72): arched pub windows between red granite piers, attic blocking. */
const colville: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, n = 3, w = (L - 0.6) / n;
  for (let i = 0; i < n; i++) {
    const uc = 0.3 + (i + 0.5) * w, ow = w * 0.55, top = h.ys[1] - 1.0;
    fr.arch(uc, top - ow / 2, ow / 2, ow / 2, M.shopGlass, 0.06, 8);
    fr.archRing(uc, top - ow / 2, ow / 2, ow / 2, 0.1, 0.1, M.paintBlack, 8);
  }
  fr.box(L / 2 - 2.4, L / 2 + 2.4, h.top, h.top + 1.0, 0, 0.12, M.stucco, false, true);
  fr.box(L / 2 - 2.5, L / 2 + 2.5, h.top + 1.0, h.top + 1.15, 0, 0.22, M.stucco, true, true);
};

/** The Chelsea Drugstore building (49): travertine two-storey base with arches, red-brick tower. */
const drugstore: KrHook = (h) => {
  const all = [...h.fronts, ...h.returns];
  const y0 = h.ys[0], y2 = h.ys[2];
  for (const fr of all) {
    const L = h.returns.includes(fr) ? Math.min(fr.len, 16) : fr.len;
    const n = Math.max(1, Math.round(L / 3.6)), w = L / n;
    fr.box(0, L, y0, y2, 0, 0.2, M.travertine, false, true);
    for (let i = 0; i < n; i++) {
      const uc = (i + 0.5) * w, ow = w * 0.66, spring = y2 - 0.6 - ow / 2;
      fr.wall(uc - ow / 2, uc + ow / 2, y0 + 0.5, spring, M.shopGlass, 0.21);
      fr.arch(uc, spring, ow / 2, ow / 2, shade(M.shopGlass, 1.2), 0.21, 8);
      fr.box(uc - ow / 2, uc + ow / 2, y0 + 3.0, y0 + 4.8, 0.21, 0.26, M.paintBlack, false, false); // dark lattice panel
      fr.box(uc - ow / 2, uc + ow / 2, y0, y0 + 0.5, 0.2, 0.26, M.white, false, false);
    }
  }
  // corner tower over the Royal Avenue corner: one storey higher, pedimented, with a finial
  const fr = mainOf(h); if (!fr) return;
  const tw = 4.2, u0 = 0;
  fr.box(u0, u0 + tw, h.top, h.top + 3.2, 0, 0.15, M.redBright, false, true);
  fr.window(u0 + tw / 2, h.top + 0.6, 1.0, 1.8, { frame: M.portland, bars: 1 });
  fr.box(u0 - 0.1, u0 + tw + 0.1, h.top + 3.2, h.top + 3.5, 0, 0.35, M.portland, true, true);
  fr.pediment(u0 + tw / 2, h.top + 3.5, tw + 0.2, 1.3, M.portland, 0.35);
  const p = fr.P(u0 + tw / 2, 0, -2.0);
  prismAt(fr.b, p[0], p[2], 0.08, h.top + 4.8, h.top + 6.2, 6, M.iron);
};

/** The former Wright's Dairy (69): cow's head on the canted corner, embossed panels. */
const dairy: KrHook = (h) => {
  const fr = [...h.fronts, ...h.returns].sort((a, b) => a.len - b.len)[0]; if (!fr) return;
  const uc = fr.len / 2, y = h.ys[2] + 0.6;
  fr.box(uc - 0.45, uc + 0.45, y, y + 0.8, 0, 0.35, hex('#e6dccb'), false, true);
  fr.box(uc - 0.2, uc + 0.2, y + 0.05, y + 0.5, 0.35, 0.65, hex('#d8ccb6'), false, true);
  for (const s of [-1, 1]) fr.box(uc + s * 0.55 - 0.12, uc + s * 0.55 + 0.12, y + 0.65, y + 0.85, 0.2, 0.35, hex('#d8ccb6'), false, true);
};

/** Atlantic Court (73–77): six giant stone piers, deep coved cornice, brick gables above. */
const atlantic: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, n = 6, w = L / n;
  const yC = h.ys[3]; // cove at the top of the third storey
  for (let i = 0; i <= n; i++) {
    const u = Math.min(L - 0.5, Math.max(0.5, i * w));
    fr.box(u - 0.55, u + 0.55, h.ys[0], yC, 0, 0.45, M.portland, false, true);
    for (let y = h.ys[0] + 1.2; y < yC; y += 2.4) fr.box(u - 0.56, u + 0.56, y, y + 0.05, 0.45, 0.47, shade(M.portland, 0.85), false, false);
  }
  // coved cornice: quarter-round sweep in five steps
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * (Math.PI / 2), a1 = ((k + 1) / 5) * (Math.PI / 2), R = 1.6;
    const v0 = 0.45 + R * (1 - Math.cos(a0)), v1 = 0.45 + R * (1 - Math.cos(a1));
    const y0 = yC + R * Math.sin(a0), y1 = yC + R * Math.sin(a1);
    fr.b.quad(fr.P(-0.3, y0, v0), fr.P(L + 0.3, y0, v0), fr.P(L + 0.3, y1, v1), fr.P(-0.3, y1, v1), shade(M.portland, 0.9 + k * 0.03));
  }
  fr.box(-0.3, L + 0.3, yC + 1.6, yC + 1.85, 0, 2.1, M.portland, true, true);
  // set-back brick upper storey with two gables and stone copings
  fr.box(0.8, L - 0.8, yC + 1.85, yC + 4.6, -1.6, -1.4, M.brown, false, true);
  for (const uc of [L * 0.3, L * 0.72]) {
    fr.gable(uc, yC + 4.6, 6.0, 2.8, M.brown, M.portland, 'triangle', -1.38, -3.0);
    fr.window(uc, yC + 2.2, 2.4, 1.8, { frame: M.portland, head: 'segment', bars: 2, base: -1.38 });
  }
  // the broken pediment over No. 77's entrance to Lambard House (RH CAA)
  const ue = L - w / 2;
  for (const s of [-1, 1]) fr.box(ue + s * 0.9 - 0.6, ue + s * 0.9 + 0.6, h.ys[1] - 0.3, h.ys[1], 0.45, 0.6, M.portland, true, true);
};

/** 120 King's Road (2023): green-tiled shopfront band, dark metal, set-back glazed roof storey. */
const oneTwenty: KrHook = (h) => {
  for (const fr of [...h.fronts, ...h.returns]) {
    const L = h.returns.includes(fr) ? Math.min(fr.len, 16) : fr.len;
    fr.box(0, L, h.ys[1] - 0.6, h.ys[1], 0, 0.14, M.tileGreen, false, false);
    fr.box(0, L, h.ys[1] - 0.66, h.ys[1] - 0.6, 0, 0.18, M.frameDark, false, false);
    fr.box(-0.05, L + 0.05, h.top - 0.15, h.top, 0, 0.12, M.frameDark, false, false);
    if (h.fronts.includes(fr)) {
      fr.box(1.5, L - 1.5, h.top, h.top + 3.1, -2.2, -1.9, M.frameDark, false, true);
      fr.wall(1.7, L - 1.7, h.top + 0.25, h.top + 2.9, hex('#3b4752'), -1.88);
      for (let u = 1.7; u < L - 1.7; u += 1.5) fr.box(u - 0.05, u + 0.05, h.top + 0.25, h.top + 2.9, -1.88, -1.82, M.frameDark, false, false);
      fr.box(1.3, L - 1.3, h.top + 3.1, h.top + 3.3, -2.4, -1.7, M.frameDark, true, false);
    }
  }
};

/** 138A: full-height bow at the right-hand (east) end, beside No. 138 (HE 1225025; C:029, C:111). */
const bow138a: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  fr.bay(fr.len - 1.6, 3.0, h.ys[1], h.eaves, 1.1, 'bow', M.stock, h.ys.length - 2, M.frame, null);
  fr.box(fr.len - 3.2, fr.len, h.eaves, h.eaves + 0.25, 0, 1.2, M.stucco, true, true);
};

/** Florist kiosk at the Wellington Square opening: green timber kiosk with a shallow roof. */
const kiosk: KrHook = (h) => {
  for (const fr of h.fronts) {
    fr.box(0, fr.len, h.ys[0] + 0.9, h.ys[0] + 2.4, 0, 0.05, shade(M.green, 1.2), false, false);
    fr.box(-0.2, fr.len + 0.2, h.ys[1] - 0.1, h.ys[1] + 0.15, 0, 0.5, M.green, true, false);
  }
};


const painted: KrHook = (h) => {
  const fr = mainOf(h), hs = h.spec.houses; if (!fr || !hs) return;
  const L = fr.len, n = Math.max(1, Math.round(L / hs.w)), hw = L / n;
  const seed = [...h.spec.addr].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  for (let k = 0; k < n; k++) fr.wall(k * hw + 0.04, (k + 1) * hw - 0.04, h.ys[0] + 0.45, h.eaves - 0.3, M[hs.cols[(k + seed) % hs.cols.length]], 0.003);
};

export const KR_HOOKS: Record<string, KrHook> = { painted, attic, pedCentre, pedBay, colville, drugstore, dairy, atlantic, oneTwenty, bow138a, kiosk };
