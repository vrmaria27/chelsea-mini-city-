// Shared colours and small decorative pieces for the procedural Chelsea model (map metres).
import { MeshBuilder, hex, shade, type RGB } from '../engine/geometry';

export const P = {
  pavement: hex('#ddd5c6'),
  plinth: hex('#7b5238'),
  plinthTop: hex('#8f6345'),
  trunk: hex('#6b4f3a'),
  greens: ['#6f9a55', '#5f8c4a', '#7ea860', '#58844a'].map(hex),
};

/** Simple stylised tree for green spaces away from Sloane Square (positions are not sourced). */
export function tree(b: MeshBuilder, x: number, z: number, y: number, s: number, col: RGB, twist = 0): void {
  b.cylinder(x, z, y, y + 3.2 * s, 0.35 * s, 4, P.trunk, false);
  b.blob(x, y + 5.4 * s, z, 3.1 * s, 3.0 * s, col, twist);
  b.blob(x + 0.6 * s, y + 7.4 * s, z - 0.4 * s, 2.1 * s, 2.2 * s, shade(col, 1.06), twist + 0.5);
}
