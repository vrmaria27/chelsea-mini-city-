// Shared map types. A GameMap supplies plots (for the simulation) and scenery builders (for the renderer).
import type { MeshBuilder } from '../engine/geometry';

export interface PlotDef {
  id: string;
  number: number;
  /** Centre in map metres (x east, z south). */
  x: number;
  z: number;
  /** Frontage width and depth in metres. */
  w: number;
  d: number;
  /** Rotation about the vertical axis that turns the plot's local +z (front) toward its street. */
  angle: number;
  area: string;
  street?: string | null;
  /** Site boundary (map metres, flat x,z) — the cleared footprint. Absent on the legacy map (rectangle). */
  boundary?: number[];
  /** Triangulated boundary for the site ground (flat x,z triples). */
  boundaryTris?: number[];
  /** Building types that physically fit; absent = all. */
  allowed?: ('townhouse' | 'shop' | 'park')[];
  /** Why a type does not fit (shown before purchase). */
  restrictions?: Partial<Record<'townhouse' | 'shop' | 'park', string>>;
}

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
  /** 'major' labels are always shown; 'minor' only when the view is close enough. */
  tier: 'major' | 'minor' | 'plinth';
}

export interface LifePath {
  pts: number[]; // flat x,z
  y: number;
}

export interface GameMap {
  id: 'chelsea-osm' | 'legacy';
  version: number;
  title: string;
  /** Half the side length of the square map, metres. */
  half: number;
  /** World metres per map metre at model scale 1. */
  baseScale: number;
  plots: PlotDef[];
  buildStatic(): MeshBuilder;
  labels(): MapLabelDef[];
  walkPaths: LifePath[];
  drivePaths: LifePath[];
  /** Shown in the About panel and on the model. */
  attribution: { text: string; url: string } | null;
  /** Letter height for plot numbers (metres). */
  plotLabelSize?: number;
  notes: string;
  /** Textured details (e.g. landmark signage) in map space, drawn with the model. */
  decals?: () => { canvas: HTMLCanvasElement; data: Float32Array }[];
  /** Animated nature layers (trees and water), drawn with the nature shader. */
  nature?: () => import('./landmarks/sloaneSquare').SquareNature;
  /** Old plot id → this map's plot id (for migrating saves from the legacy map). */
  legacyPlotMap?: Record<string, string>;
  /** Plot ids of the previous version of this map → current ids (for migrating saves). */
  previousPlotMap?: Record<string, string>;
}
