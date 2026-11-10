// Procedural London-plane leaf atlas (2 × 2 clusters on a 512 px canvas). Original artwork drawn at
// start-up: no external texture. Alpha marks leaf coverage; RGB is the leaf colour (tinted per card).
import { rng } from '../../engine/geometry';

/** Palmate plane leaf outline (five lobes, three dominant), pointing up from the stem at (0, 0). */
function leafPath(ctx: CanvasRenderingContext2D, s: number): void {
  const lobes = [
    { a: 0, r: 1 }, { a: 0.85, r: 0.86 }, { a: 1.65, r: 0.5 }, { a: -0.85, r: 0.86 }, { a: -1.65, r: 0.5 },
  ].sort((p, q) => p.a - q.a);
  const pt = (a: number, r: number) => [Math.sin(a) * r * s, -Math.cos(a) * r * s - s * 0.12] as const;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const start = pt(-2.1, 0.35);
  ctx.lineTo(start[0], start[1]);
  for (let i = 0; i < lobes.length; i++) {
    const L = lobes[i];
    const tip = pt(L.a, L.r);
    const pre = pt(L.a - 0.22, L.r * 0.72), post = pt(L.a + 0.22, L.r * 0.72);
    ctx.quadraticCurveTo(pre[0], pre[1], tip[0], tip[1]);
    const next = lobes[i + 1];
    const sinusA = next ? (L.a + next.a) / 2 : 2.1;
    const sinus = pt(sinusA, next ? 0.42 : 0.35);
    ctx.quadraticCurveTo(post[0], post[1], sinus[0], sinus[1]);
  }
  ctx.closePath();
}

export function drawLeafAtlas(size = 512): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const cell = size / 2;
  const greens = ['#4f7b2f', '#5b8636', '#6a9340', '#77a04a', '#46702a', '#87a955'];
  for (let c = 0; c < 4; c++) {
    const r = rng(9100 + c * 17);
    const ox = (c % 2) * cell, oy = Math.floor(c / 2) * cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 4, oy + 4, cell - 8, cell - 8);
    ctx.clip();
    // twigs
    ctx.strokeStyle = '#6b5a3c';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(ox + cell * (0.3 + r() * 0.4), oy + cell * 0.95);
      ctx.quadraticCurveTo(ox + cell * r(), oy + cell * 0.55, ox + cell * (0.15 + r() * 0.7), oy + cell * (0.12 + r() * 0.2));
      ctx.stroke();
    }
    // leaves, back to front; darker underneath, lighter on top
    const n = 46;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      // denser toward the centre, keeping a ragged edge
      const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * cell * 0.42;
      const x = ox + cell / 2 + Math.cos(ang) * rad, y = oy + cell / 2 + Math.sin(ang) * rad * 0.9;
      const s = cell * (0.1 + r() * 0.06);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((r() - 0.5) * 2.6);
      ctx.scale(1, 0.75 + r() * 0.35); // foreshortening
      leafPath(ctx, s);
      const g = greens[Math.floor(r() * greens.length)];
      ctx.fillStyle = g;
      ctx.globalAlpha = 1;
      ctx.fill();
      // shading toward the front leaves
      ctx.fillStyle = `rgba(255,255,220,${0.05 + t * 0.12})`;
      ctx.fill();
      // midrib and two side veins
      ctx.strokeStyle = 'rgba(205,215,150,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -s * 1.0);
      ctx.moveTo(0, -s * 0.2); ctx.lineTo(Math.sin(0.85) * s * 0.75, -Math.cos(0.85) * s * 0.75 - s * 0.12);
      ctx.moveTo(0, -s * 0.2); ctx.lineTo(-Math.sin(0.85) * s * 0.75, -Math.cos(0.85) * s * 0.75 - s * 0.12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  return cv;
}
