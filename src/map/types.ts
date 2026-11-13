// Scene map types: geography only (no gameplay data).
import type { MeshBuilder } from '../engine/geometry';

/** Flat label in map space (one quad). */
export interface MapLabelDef {
  text: string;
  x: number;
  z: number;
  y?: number;
  angle: number;
  /** Letter height in metres. */
  size: number;
  color: string;
  outline: string;
  bold?: boolean;
  /** 'major' labels are shown whenever labels are on; 'minor' only when the miniature is close enough. */
  tier: 'major' | 'minor' | 'plinth';
}

export interface SceneMap {
  id: 'chelsea-osm';
  version: number;
  title: string;
  /** Half the side length of the square map, metres. */
  half: number;
  /** World metres per map metre at miniature scale 1. */
  baseScale: number;
  /** The neighbourhood itself (streets, buildings, landmarks). */
  buildStatic(): MeshBuilder;
  /** Street-corridor buildings at two levels of detail (full models near the viewer, simple masses
   *  further away and in the miniature). Call after buildStatic. */
  buildLod?(): { detail: MeshBuilder; simple: MeshBuilder };
  /** The wooden base and plinth lettering, drawn only in the miniature view. */
  buildPlinth(): MeshBuilder;
  labels(): MapLabelDef[];
  attribution: { text: string; url: string };
  notes: string;
  /** Textured details (e.g. landmark signage) in map space, drawn with the model. */
  decals?: () => { canvas: HTMLCanvasElement; data: Float32Array }[];
  /** Animated nature layers (trees and water), drawn with the nature shader. */
  nature?: () => import('./landmarks/sloaneSquare').SquareNature;
}
