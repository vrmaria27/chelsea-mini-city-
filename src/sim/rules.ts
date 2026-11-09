// Pure game rules for Chelsea Mini City. No rendering, DOM or input code here.

export type BuildingType = 'townhouse' | 'shop' | 'park';
export type Level = 1 | 2;
export const MAX_LEVEL: Level = 2;

export const BUILDING_TYPES: readonly BuildingType[] = ['townhouse', 'shop', 'park'];

/** Per-level values are replacement totals, not additional bonuses. */
export interface LevelSpec {
  residents: number;
  /** Income per tick (shops: only while active). */
  income: number;
  /** Happiness added to each home in range (parks only). */
  parkBonus: number;
}

export interface BuildingSpec {
  label: string;
  cost: number;
  upgradeCost: number;
  description: string;
  levels: Record<Level, LevelSpec>;
}

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  townhouse: {
    label: 'Townhouse',
    cost: 1000,
    upgradeCost: 1500,
    description: '+10 residents, +£100/tick',
    levels: { 1: { residents: 10, income: 100, parkBonus: 0 }, 2: { residents: 20, income: 180, parkBonus: 0 } },
  },
  shop: {
    label: 'Shop',
    cost: 1500,
    upgradeCost: 2000,
    description: '+£200/tick near homes',
    levels: { 1: { residents: 0, income: 200, parkBonus: 0 }, 2: { residents: 0, income: 350, parkBonus: 0 } },
  },
  park: {
    label: 'Park',
    cost: 750,
    upgradeCost: 1000,
    description: '+10 happiness nearby',
    levels: { 1: { residents: 0, income: 0, parkBonus: 10 }, 2: { residents: 0, income: 0, parkBonus: 15 } },
  },
};

export const RULES = {
  startingMoney: 10000,
  /** Radius in map metres for shop and park effects. */
  effectRadius: 80,
  baseHappiness: 50,
  shopHappinessBonus: 10,
  maxHappiness: 100,
  tickSeconds: 10,
} as const;

/** Minimal plot data the simulation needs: an id and a centre in map metres. */
export interface PlotPosition {
  id: string;
  x: number;
  z: number;
  /** Optional display number ("plot 7"). */
  number?: number;
}
