// Lighting presets: "Daylight" (the established baseline) and "Golden hour" (warm, low late-afternoon
// sun). These are artistic presets, not an astronomical simulation. A preset sets the sun direction and
// colour, the ambient light from the sky and from the ground, the sky seen in reflections, the
// exposure and the background sky; the scene then re-bakes its sun shadow maps for the new direction
// (view/bake.ts), so shadows always agree with the light.
import type { LightMode } from '../explore/prefs';

type V3 = [number, number, number];

export interface LightPreset {
  mode: LightMode;
  label: string;
  /** Direction to the sun in map space (x east, y up, z south); normalised on use. */
  sunDir: V3;
  /** Linear sun colour including intensity. */
  sun: V3;
  /** Linear ambient light from above (shade) and bounced from the ground. */
  ambSky: V3;
  ambGnd: V3;
  /** Linear sky colours used by reflections (glass, water, polished stone). */
  skyZen: V3;
  skyHor: V3;
  exposure: number;
  /** sRGB background colour at street level (and in postcards). */
  clear: V3;
  /** Optional sRGB sky dome: horizon, zenith, the glow around the sun and the horizon opposite it. */
  dome: { horizon: V3; zenith: V3; glow: V3; away: V3 } | null;
  /** Area covered by the detailed shadow map (map metres); defaults to view/bake.ts BAKE_NEAR. */
  shadowArea?: { x: number; z: number; half: number };
}

const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

export const PRESETS: Record<LightMode, LightPreset> = {
  // the baseline from the realism milestone: morning sun from the south-east, about 50° high
  day: {
    mode: 'day', label: 'Daylight',
    sunDir: norm([0.5, 0.82, 0.42]),
    sun: [1.35, 1.269, 1.134],
    ambSky: [0.47, 0.50, 0.56],
    ambGnd: [0.27, 0.245, 0.21],
    skyZen: [0.20, 0.36, 0.70],
    skyHor: [0.62, 0.70, 0.80],
    exposure: 1.0,
    clear: [0.74, 0.82, 0.88],
    dome: null,
  },
  // late afternoon: the sun low in the south-west (about 22° up), so light comes in along King's
  // Road and across Sloane Square between long, cool shadows; warm sunlight, a cooler and slightly
  // dimmer sky light, a warm horizon in reflections. The detailed shadow map is widened to take in
  // Duke of York Square and the Saatchi Gallery, where low-sun shadows would otherwise look coarse.
  golden: {
    mode: 'golden', label: 'Golden hour',
    sunDir: norm([-0.707, 0.404, 0.707]),
    sun: [1.45, 1.0, 0.6],
    ambSky: [0.39, 0.44, 0.58],
    ambGnd: [0.25, 0.205, 0.165],
    skyZen: [0.17, 0.29, 0.56],
    skyHor: [0.86, 0.66, 0.47],
    exposure: 1.05,
    clear: [0.93, 0.80, 0.66],
    dome: { horizon: [0.95, 0.81, 0.64], zenith: [0.46, 0.61, 0.80], glow: [1.0, 0.86, 0.58], away: [0.80, 0.80, 0.84] },
    shadowArea: { x: 130, z: -50, half: 210 },
  },
};

/**
 * Sky dome vertices (the renderer's lit-mesh layout: position, normal, colour), unit radius, centred
 * on the origin, from a little below the horizon to the zenith. Drawn unlit, behind everything, at the
 * eye. Colours vary smoothly per vertex: warm horizon, blue zenith, a glow towards the sun.
 */
export function skyDome(p: LightPreset, rings = 14, segs = 40): Float32Array {
  const d = p.dome!;
  const sun = norm(p.sunDir);
  const sh = Math.hypot(sun[0], sun[2]) || 1;
  const sx = sun[0] / sh, sz = sun[2] / sh;
  const colour = (x: number, y: number, z: number): V3 => {
    const up = Math.max(0, y);
    const t = Math.pow(up, 0.5);
    const hx = Math.hypot(x, z) || 1;
    const toward = (x / hx) * sx + (z / hx) * sz; // -1 (away) .. 1 (towards the sun)
    const horizon: V3 = [0, 1, 2].map((i) => d.horizon[i] + (d.away[i] - d.horizon[i]) * Math.max(0, -toward) * 0.8) as V3;
    const glow = Math.pow(Math.max(0, toward), 6) * (1 - Math.min(1, up * 2.2));
    return [0, 1, 2].map((i) => {
      const base = horizon[i] + (d.zenith[i] - horizon[i]) * t;
      return Math.min(1, base + (d.glow[i] - base) * glow * 0.85);
    }) as V3;
  };
  const out: number[] = [];
  const v = (el: number, az: number) => {
    const y = Math.sin(el), c = Math.cos(el);
    const x = c * Math.sin(az), z = c * Math.cos(az);
    const col = colour(x, y, z);
    out.push(x, y, z, 0, 1, 0, col[0], col[1], col[2]);
  };
  const el0 = -0.12;
  for (let i = 0; i < rings; i++) {
    const a = el0 + ((Math.PI / 2 - el0) * i) / rings, b = el0 + ((Math.PI / 2 - el0) * (i + 1)) / rings;
    for (let j = 0; j < segs; j++) {
      const p0 = (j / segs) * Math.PI * 2, p1 = ((j + 1) / segs) * Math.PI * 2;
      v(a, p0); v(b, p0); v(a, p1);
      v(a, p1); v(b, p0); v(b, p1);
    }
  }
  return new Float32Array(out);
}
