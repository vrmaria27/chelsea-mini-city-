// Pure game rules for Chelsea Mini City. No rendering, DOM or input code here.

export type BuildingType = 'townhouse' | 'shop' | 'park';

export const BUILDING_TYPES: readonly BuildingType[] = ['townhouse', 'shop', 'park'];

export interface BuildingSpec {
  label: string;
  cost: number;
  description: string;
}

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  townhouse: { label: 'Townhouse', cost: 1000, description: '+10 residents, +£100/tick' },
  shop: { label: 'Shop', cost: 1500, description: '+£200/tick near homes' },
  park: { label: 'Park', cost: 750, description: '+10 happiness nearby' },
};

export const RULES = {
  startingMoney: 10000,
  residentsPerTownhouse: 10,
  townhouseIncome: 100,
  shopIncome: 200,
  /** Radius in map metres for shop and park effects. */
  effectRadius: 80,
  baseHappiness: 50,
  shopHappinessBonus: 10,
  parkHappinessBonus: 10,
  maxHappiness: 100,
  tickSeconds: 10,
  objective: { residents: 50, happiness: 70 },
} as const;

/** Minimal plot data the simulation needs: an id and a centre in map metres. */
export interface PlotPosition {
  id: string;
  x: number;
  z: number;
}
