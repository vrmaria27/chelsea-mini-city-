// Text labels baked into one canvas atlas (one texture, one draw call for all map labels).

export interface AtlasEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  aspect: number; // width / height
}

export interface LabelStyle {
  text: string;
  color: string;
  outline?: string;
  bold?: boolean;
}

export const UI_FONT = `"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

export function buildAtlas(items: LabelStyle[], fontPx = 56): { canvas: HTMLCanvasElement; entries: AtlasEntry[] } {
  const W = 2048;
  const pad = 10;
  const rowH = Math.ceil(fontPx * 1.35) + pad * 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = (b?: boolean) => `${b ? '700' : '600'} ${fontPx}px ${UI_FONT}`;
  // First pass: layout
  const layout: { x: number; y: number; w: number }[] = [];
  let x = 0, y = 0;
  for (const it of items) {
    ctx.font = font(it.bold);
    const w = Math.ceil(ctx.measureText(it.text).width) + pad * 2 + 8;
    if (x + w > W) {
      x = 0;
      y += rowH;
    }
    layout.push({ x, y, w });
    x += w;
  }
  canvas.width = W;
  canvas.height = Math.max(64, 2 ** Math.ceil(Math.log2(y + rowH)));
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const entries: AtlasEntry[] = items.map((it, i) => {
    const l = layout[i];
    ctx.font = font(it.bold);
    const cx = l.x + pad + 4, cy = l.y + rowH / 2;
    if (it.outline) {
      ctx.strokeStyle = it.outline;
      ctx.lineWidth = fontPx * 0.16;
      ctx.strokeText(it.text, cx, cy);
    }
    ctx.fillStyle = it.color;
    ctx.fillText(it.text, cx, cy);
    return {
      u0: l.x / W,
      u1: (l.x + l.w) / W,
      v0: l.y / canvas.height,
      v1: (l.y + rowH) / canvas.height,
      aspect: l.w / rowH,
    };
  });
  return { canvas, entries };
}

/**
 * Appends a flat (ground-lying) text quad to `out` as [pos3, uv2] vertices.
 * At angle 0 the text reads left-to-right for a viewer standing in the south (+z).
 */
export function pushFlatLabel(out: number[], e: AtlasEntry, x: number, y: number, z: number, height: number, angle: number): void {
  const w = height * e.aspect;
  const c = Math.cos(angle), s = Math.sin(angle);
  // local (lx, lz) -> rotated about Y
  const p = (lx: number, lz: number): [number, number, number] => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  const a = p(-w / 2, height / 2), b = p(w / 2, height / 2), cc = p(w / 2, -height / 2), d = p(-w / 2, -height / 2);
  // a = bottom-left (south side), cc = top-right
  out.push(...a, e.u0, e.v1, ...b, e.u1, e.v1, ...cc, e.u1, e.v0);
  out.push(...a, e.u0, e.v1, ...cc, e.u1, e.v0, ...d, e.u0, e.v0);
}

/** Vertical quad in the local XY plane (facing +z), centred at origin, size w × h, full UV. */
export function uprightQuad(w: number, h: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1): Float32Array {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  return new Float32Array([
    x0, y0, 0, u0, v1, x1, y0, 0, u1, v1, x1, y1, 0, u1, v0,
    x0, y0, 0, u0, v1, x1, y1, 0, u1, v0, x0, y1, 0, u0, v0,
  ]);
}
