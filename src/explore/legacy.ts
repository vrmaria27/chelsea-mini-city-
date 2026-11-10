// Read-only access to saves left by the earlier city-builder ("Chelsea Mini City").
// The explorer never writes, migrates or deletes these keys, and never turns player-built
// structures into map features. A player can download a copy from the About panel; the game
// itself is preserved on the `game-final` branch (see docs/explorer.md).
import type { KeyValueStore } from './prefs';

export const LEGACY_KEYS = [
  'chelsea-mini-city.save',
  'chelsea-mini-city.save.backup',
  'chelsea-mini-city.map',
  'chelsea-mini-city.onboarded',
] as const;

export interface LegacySummary {
  found: boolean;
  /** Raw values exactly as stored, by key (only keys that exist). */
  values: Partial<Record<(typeof LEGACY_KEYS)[number], string>>;
  /** Best-effort description of the main save (never throws). */
  description: string;
}

export function readLegacy(store: KeyValueStore): LegacySummary {
  const values: LegacySummary['values'] = {};
  for (const k of LEGACY_KEYS) {
    try {
      const v = store.getItem(k);
      if (v !== null) values[k] = v;
    } catch { /* ignore */ }
  }
  const main = values['chelsea-mini-city.save'] ?? values['chelsea-mini-city.save.backup'];
  let description = 'No saved city from the earlier city-builder was found in this browser.';
  if (main !== undefined) {
    description = 'A saved city from the earlier city-builder is stored in this browser (unreadable format, kept as is).';
    try {
      const o = JSON.parse(main);
      const buildings = o?.state?.buildings ?? o?.buildings;
      const n = buildings && typeof buildings === 'object' ? Object.keys(buildings).length : null;
      description = `A saved city from the earlier city-builder is stored in this browser${o?.version ? ` (save format v${o.version}` : ' ('}${n !== null ? `, ${n} building${n === 1 ? '' : 's'}` : ''}). It is kept unchanged and is not shown in the explorer.`;
    } catch { /* keep the generic description */ }
  }
  return { found: Object.keys(values).length > 0, values, description };
}

/** JSON document containing every legacy key exactly as stored, for download. */
export function exportLegacy(summary: LegacySummary, exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ format: 'chelsea-mini-city.legacy-export', version: 1, exportedAt, localStorage: summary.values }, null, 2);
}
