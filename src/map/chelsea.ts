// Static map definition: a ~400 m × 400 m Chelsea-inspired neighbourhood around
// King's Road and Duke of York Square. Approximate street layout, hand-authored
// (no external geographic data). Coordinates are map metres: x = east, z = south,
// origin at the map centre. The player's default view is from the south.

export type Facing = 'N' | 'S' | 'E' | 'W';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Road {
  name: string;
  /** Axis-aligned centreline. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  width: number;
  labelAt?: number; // 0..1 along the road
  dashed?: boolean;
}

export interface PlotDef {
  id: string;
  number: number;
  x: number;
  z: number;
  /** Plots are square. */
  size: number;
  facing: Facing;
  area: string;
}

export interface MapLabel {
  text: string;
  x: number;
  z: number;
  /** Rotation about the vertical axis; 0 reads left-to-right for a viewer in the south. */
  angle: number;
  /** Letter height in map metres. */
  size: number;
  color: string;
}

export const MAP_HALF = 200;
export const PLOT_SIZE = 24;
export const LAYOUT_NOTE = 'Chelsea-inspired; approximate street layout';

export const ROADS: Road[] = [
  { name: "King's Road", x0: -200, z0: -20, x1: 200, z1: -20, width: 18, labelAt: 0.3, dashed: true },
  { name: 'Bywater Street', x0: -115, z0: -200, x1: -115, z1: -29, width: 8, labelAt: 0.55 },
  { name: 'Blacklands Terrace', x0: -30, z0: -200, x1: -30, z1: -29, width: 10, labelAt: 0.35 },
  { name: 'Symons Street', x0: 100, z0: -200, x1: 100, z1: -29, width: 9, labelAt: 0.4 },
  { name: 'Walpole Street', x0: -80, z0: -11, x1: -80, z1: 150, width: 9, labelAt: 0.55 },
  { name: 'Cheltenham Terrace', x0: 30, z0: -11, x1: 30, z1: 200, width: 10, labelAt: 0.5 },
  { name: "St Leonard's Terrace", x0: -200, z0: 150, x1: 30, z1: 150, width: 9, labelAt: 0.35 },
  { name: 'Turks Row', x0: 35, z0: 135, x1: 164, z1: 135, width: 9, labelAt: 0.25 },
  { name: 'Lower Sloane Street', x0: 170, z0: -11, x1: 170, z1: 200, width: 12, labelAt: 0.55 },
];

/** Paved public squares (not editable). */
export const DUKE_OF_YORK_SQUARE: Rect = { x0: 40, z0: -9, x1: 130, z1: 52 };
export const SLOANE_SQUARE: Rect = { x0: 112, z0: -95, x1: 200, z1: -31 };
/** Large cream landmark building south of the square (gallery-style, decorative). */
export const GALLERY: Rect = { x0: 52, z0: 64, x1: 124, z1: 116 };

/** City blocks (raised pavement areas between roads). */
export const BLOCKS: Rect[] = [
  { x0: -200, z0: -200, x1: -119, z1: -29 },
  { x0: -111, z0: -200, x1: -35, z1: -29 },
  { x0: -25, z0: -200, x1: 95.5, z1: -29 },
  { x0: 104.5, z0: -200, x1: 200, z1: -29 },
  { x0: -200, z0: -11, x1: -84.5, z1: 145.5 },
  { x0: -75.5, z0: -11, x1: 25, z1: 145.5 },
  { x0: 35, z0: -11, x1: 164, z1: 130.5 },
  { x0: 35, z0: 139.5, x1: 164, z1: 200 },
  { x0: 176, z0: -11, x1: 200, z1: 200 },
  { x0: -200, z0: 154.5, x1: 25, z1: 200 },
];

const plot = (number: number, x: number, z: number, facing: Facing, area: string): PlotDef => ({
  id: `p${number}`,
  number,
  x,
  z,
  size: PLOT_SIZE,
  facing,
  area,
});

/**
 * 20 development plots in three neighbourhood clusters. The 3 × 3 Symons cluster has a
 * central plot that reaches all eight neighbours (≤ 80 m), so a park there plus a shop
 * and a second park on its middle edge make the objective comfortably achievable.
 */
export const PLOTS: PlotDef[] = [
  // Blacklands cluster (north of King's Road): middle-row plots reach the whole cluster
  plot(1, -95, -150, 'W', 'Blacklands'),
  plot(2, -55, -150, 'E', 'Blacklands'),
  plot(3, -95, -110, 'W', 'Blacklands'),
  plot(4, -55, -110, 'E', 'Blacklands'),
  plot(5, -95, -70, 'W', 'Blacklands'),
  plot(6, -55, -70, 'E', 'Blacklands'),
  // Symons cluster (north of King's Road), 3 × 3
  plot(7, -5, -150, 'W', 'Symons'),
  plot(8, 35, -150, 'N', 'Symons'),
  plot(9, 75, -150, 'E', 'Symons'),
  plot(10, -5, -105, 'W', 'Symons'),
  plot(11, 35, -105, 'S', 'Symons'),
  plot(12, 75, -105, 'E', 'Symons'),
  plot(13, -5, -60, 'S', 'Symons'),
  plot(14, 35, -60, 'S', 'Symons'),
  plot(15, 75, -60, 'S', 'Symons'),
  // Walpole cluster (south of King's Road, near Duke of York Square)
  plot(16, -55, 25, 'W', 'Walpole'),
  plot(17, 5, 25, 'E', 'Walpole'),
  plot(18, -55, 70, 'W', 'Walpole'),
  plot(19, 5, 70, 'E', 'Walpole'),
  plot(20, -55, 115, 'W', 'Walpole'),
];

export const ROAD_LABEL_COLOR = '#f7f2e8';

export const LABELS: MapLabel[] = [
  { text: 'Duke of York Square', x: 85, z: 2, angle: 0, size: 6.5, color: '#3d3a36' },
  { text: 'Sloane Square', x: 156, z: -40, angle: 0, size: 7, color: '#2f4a32' },
  { text: 'Chelsea Mini City', x: 0, z: 213, angle: 0, size: 10, color: '#fbf3e6' },
  { text: LAYOUT_NOTE, x: 0, z: 226, angle: 0, size: 5.5, color: '#f1e4cf' },
];

/** Footprints that procedural decorative buildings must avoid. */
export function reservedRects(): Rect[] {
  const pad = 4;
  return [
    ...PLOTS.map((p) => ({
      x0: p.x - p.size / 2 - pad,
      z0: p.z - p.size / 2 - pad,
      x1: p.x + p.size / 2 + pad,
      z1: p.z + p.size / 2 + pad,
    })),
    DUKE_OF_YORK_SQUARE,
    SLOANE_SQUARE,
    { x0: GALLERY.x0 - 4, z0: GALLERY.z0 - 6, x1: GALLERY.x1 + 4, z1: GALLERY.z1 + 4 },
  ];
}

export function facingAngle(f: Facing): number {
  // Rotation about Y that turns a building's local +z front toward the facing direction.
  switch (f) {
    case 'S':
      return 0;
    case 'N':
      return Math.PI;
    case 'E':
      return Math.PI / 2;
    case 'W':
      return -Math.PI / 2;
  }
}
