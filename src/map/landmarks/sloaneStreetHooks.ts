// Distinctive features of individual Sloane Street and Lower Sloane Street buildings, drawn after their
// standard composition (sources in sloaneStreetSpecs.ts). Each hook works in the frontage's local frame
// (u along the front, y up, v outward).
import { shade } from '../../engine/geometry';
import { F } from './facadeKit';
import { KR_PAVE, M, type KrHook, type KrHookCtx } from './kingsRoad';

const mainOf = (h: KrHookCtx): F | undefined => h.fronts.slice().sort((a, b) => b.len - a.len)[0];
const houses = (h: KrHookCtx, L: number) => Math.max(1, h.spec.gables?.n ?? Math.round(L / 7));

/**
 * Queen Anne red-brick houses (Lower Sloane Street, C:213, C:168, C:233): per house a canted two-storey
 * bay over the ground and first floors, an arched entrance porch with steps, and basement lightwell
 * railings along the pavement.
 */
const qaHouses: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, n = houses(h, L), w = L / n;
  const brick = M[h.spec.wall], trim = M[h.spec.bandCol ?? 'portland'];
  for (let i = 0; i < n; i++) {
    const u0 = i * w, bc = u0 + w * 0.32, dc = u0 + w * 0.78;
    // canted bay: a projecting box with chamfered sides (two narrow faces) and three lights per storey
    const bw = Math.min(2.8, w * 0.42), y0 = h.ys[0] + 0.6, y1 = h.ys[2] - 0.2, d = 0.75;
    fr.box(bc - bw / 2 + 0.35, bc + bw / 2 - 0.35, y0, y1, 0, d, brick, true, true);
    fr.b.quad(fr.P(bc - bw / 2, y0, 0), fr.P(bc - bw / 2 + 0.35, y0, d), fr.P(bc - bw / 2 + 0.35, y1, d), fr.P(bc - bw / 2, y1, 0), shade(brick, 0.9));
    fr.b.quad(fr.P(bc + bw / 2 - 0.35, y0, d), fr.P(bc + bw / 2, y0, 0), fr.P(bc + bw / 2, y1, 0), fr.P(bc + bw / 2 - 0.35, y1, d), shade(brick, 0.9));
    for (let s = 0; s < 2; s++) {
      const ya = h.ys[s] + (s === 0 ? 1.0 : 0.6), yb = h.ys[s + 1] - 0.45;
      if (yb - ya < 0.6) continue;
      for (const k of [-1, 0, 1]) { const uc = bc + k * (bw - 0.7) / 3; fr.wall(uc - 0.32, uc + 0.32, ya, yb, M.glass, d + 0.01); fr.wall(uc - 0.34, uc + 0.34, (ya + yb) / 2 - 0.03, (ya + yb) / 2 + 0.03, M.frame, d + 0.02); }
      fr.box(bc - bw / 2 + 0.3, bc + bw / 2 - 0.3, h.ys[s + 1] - 0.3, h.ys[s + 1] - 0.15, d, d + 0.1, trim, true, false);
    }
    // porch: arched opening in a stone surround with a small balustraded top, three steps
    fr.box(dc - 0.95, dc + 0.95, h.ys[0], h.ys[0] + 3.2, 0, 0.45, trim, true, true);
    fr.arch(dc, h.ys[0] + 2.35, 0.55, 0.55, M.frameDark, 0.46, 6);
    fr.wall(dc - 0.55, dc + 0.55, h.ys[0] + 0.45, h.ys[0] + 2.35, M.frameDark, 0.46);
    for (let k = 0; k < 3; k++) fr.box(dc - 0.75, dc + 0.75, h.ys[0] + k * 0.15, h.ys[0] + (k + 1) * 0.15, 0, 0.45 + (3 - k) * 0.28, M.stone, true, false);
  }
  // basement lightwell railings along the front (0.9 m out from the façade), broken at the steps
  for (let i = 0; i < n; i++) {
    const u0 = i * w, dc = u0 + w * 0.78;
    fr.railing(u0 + 0.2, dc - 1.0, KR_PAVE, 0.9, 1.0);
    fr.railing(dc + 1.0, u0 + w - 0.2, KR_PAVE, 0.9, 1.0);
  }
};

/** No. 139 Sloane Street (C:042, 2024): two arched ground-floor windows with radiating fanlight tympana, steps and railings. */
const fanlights: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, y0 = h.ys[0] + 0.9, top = h.ys[1] - 0.45;
  for (const uc of [L * 0.3, L * 0.72]) {
    const r = Math.min(1.25, L * 0.17), spring = top - r;
    fr.box(uc - r - 0.25, uc + r + 0.25, h.ys[0], h.ys[1], 0, 0.05, M.stock, false, true);
    fr.wall(uc - r, uc + r, y0, spring, M.glass, 0.06);
    fr.arch(uc, spring, r, r, M.white, 0.06, 10);
    for (let k = 1; k < 8; k++) { const a = (Math.PI * k) / 8; fr.wall(uc + Math.cos(a) * r * 0.2 - 0.02, uc + Math.cos(a) * r * 0.2 + 0.02, spring, spring + Math.sin(a) * r * 0.95, shade(M.white, 0.9), 0.07); }
    fr.archRing(uc, spring, r + 0.02, r + 0.02, 0.3, 0.08, M.rubbed, 10);
    fr.wall(uc - r, uc + r, spring - 0.04, spring + 0.04, M.frame, 0.08);
  }
  for (let k = 0; k < 4; k++) fr.box(L * 0.5 - 0.7, L * 0.5 + 0.7, h.ys[0] + k * 0.16, h.ys[0] + (k + 1) * 0.16, 0, 0.3 + (4 - k) * 0.3, M.stone, true, false);
  fr.railing(0.2, L * 0.5 - 0.8, KR_PAVE, 1.1, 1.0);
  fr.railing(L * 0.5 + 0.8, L - 0.2, KR_PAVE, 1.1, 1.0);
};

/** Nos 136–138 (Hackett, C:143, 2022): stucco shopfront with Corinthian pilasters and urns on the parapet. */
const urns: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len;
  for (const u of [0.4, L / 3, (2 * L) / 3, L - 0.4]) {
    fr.box(u - 0.2, u + 0.2, h.top, h.top + 0.25, 0, 0.3, M.stucco, true, true);
    fr.box(u - 0.28, u + 0.28, h.top + 0.25, h.top + 0.75, 0.0, 0.42, M.stucco, true, true);
    fr.box(u - 0.12, u + 0.12, h.top + 0.75, h.top + 0.95, 0.1, 0.32, M.stucco, true, true);
  }
};

/** Full-height white stucco bay windows on red brick (Sloane Street north of Cadogan Gardens, C:243, 2014). */
const whiteBays: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, uc = L * 0.22, bw = 2.6, d = 0.8;
  fr.box(uc - bw / 2, uc + bw / 2, h.ys[1] - 0.2, h.eaves, 0, d, M.white, true, true);
  for (let s = 1; s < h.ys.length - 1; s++) {
    const ya = h.ys[s] + 0.5, yb = h.ys[s + 1] - 0.5;
    for (const k of [-1, 0, 1]) fr.wall(uc + k * 0.8 - 0.3, uc + k * 0.8 + 0.3, ya, yb, M.glass, d + 0.01);
  }
};

/** George House, Nos 127–135 (C:142, C:144, C:145, 2022): deep terracotta piers and a grey fascia band. */
const georgeHouse: KrHook = (h) => {
  const fr = mainOf(h); if (!fr) return;
  const L = fr.len, n = h.spec.bays;
  for (let i = 0; i <= n; i++) { const u = (L * i) / n; fr.box(u - 0.35, u + 0.35, h.ys[0], h.eaves, 0, 0.35, M.terracotta, false, true); }
  fr.box(0, L, h.ys[1] - 0.95, h.ys[1] - 0.05, 0, 0.3, M.stoneGrey, true, false);
};

/** Bristol House (C:247, 2014): round-arched shopfront openings on a stone plinth along the ground floor. */
const arcadeShops: KrHook = (h) => {
  for (const fr of h.fronts) {
    const L = fr.len, n = Math.max(1, Math.round(L / 4.2)), w = L / n;
    for (let i = 0; i < n; i++) {
      const uc = (i + 0.5) * w, r = Math.min(1.6, w * 0.36), spring = h.ys[1] - 1.0 - r;
      fr.archRing(uc, spring, r + 0.04, r + 0.04, 0.32, 0.26, M.rubbed, 8);
    }
  }
};

export const SS_HOOKS: Record<string, KrHook> = { qaHouses, fanlights, urns, whiteBays, georgeHouse, arcadeShops };
