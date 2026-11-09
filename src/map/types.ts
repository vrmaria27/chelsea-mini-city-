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
  /** Old plot id → this map's plot id (for migrating saves from the legacy map). */
  legacyPlotMap?: Record<string, string>;
}
