// Surface materials for the lit shader. A vertex carries its material id in the length of its normal
// (|n| = 1 + id), so the interleaved [pos3, normal3, colour3] layout, the tile splitting and every
// existing builder stay unchanged; untagged geometry keeps id 0 (plain painted surface).
//
// Builders tag geometry either explicitly (MeshBuilder.mat) or by colour: tagColour() registers a palette
// colour object (as returned by hex()) so every vertex drawn with that exact colour gets the material.
import type { RGB } from './geometry';

export const MAT = {
  NONE: 0,
  /** Red / brown brick: brick and mortar detail at real course height. */
  BRICK: 1,
  /** London stock (yellow) brick: same bond, colour-neutral detail. */
  STOCK: 2,
  /** Portland and other dressed stone: fine grain, restrained variation. */
  STONE: 3,
  /** Painted stucco / render: very light grain. */
  STUCCO: 4,
  /** Yorkstone flags and pavements: grain and slight wear. */
  PAVING: 5,
  ASPHALT: 6,
  /** Granite kerbs and setts. */
  KERB: 7,
  /** Painted iron and steel (railings, lamp standards, canopies): dielectric, semi-gloss. */
  METAL: 8,
  /** Bronze and gilded metal: metallic, tinted reflection. */
  BRONZE: 9,
  /** Ordinary window glass: sky reflection over a dark interior. */
  GLASS: 10,
  /** Peter Jones curtain-wall glazing: reflection, per-pane variation and an impression of interior depth. */
  PJGLASS: 11,
  /** Lit shop displays: shown at their own brightness. */
  EMISSIVE: 12,
  /** Smooth enamelled / painted panels (curtain-wall spandrels). */
  ENAMEL: 13,
  /** Shopfront plate glass at street level (more reflective, lit display behind). */
  SHOPGLASS: 14,
} as const;

const byColour = new WeakMap<RGB, number>();

/** Every vertex drawn with exactly this colour object gets material `mat`. */
export function tagColour(c: RGB, mat: number): RGB {
  byColour.set(c, mat);
  return c;
}

export function matOf(c: RGB): number {
  return byColour.get(c) ?? 0;
}

/** Texture layers packed by scripts/assets/pack-textures.py (public/tex), in order. */
export const MAT_LAYERS = ['brick', 'stone', 'paving', 'asphalt', 'bark'] as const;
