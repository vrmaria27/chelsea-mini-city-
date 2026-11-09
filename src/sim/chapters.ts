// Neighbourhood chapters: sequential objectives evaluated from simulation stats.
import type { Stats } from './simulation';

export interface Goal {
  label: string;
  current: number;
  target: number;
  done: boolean;
  /** Display text for the current value (e.g. "—" for happiness with no residents). */
  display: string;
}

export interface ChapterDef {
  title: string;
  summary: string;
  goals: (s: Stats) => Goal[];
}

const goal = (label: string, current: number, target: number, display = String(current)): Goal => ({
  label,
  current,
  target,
  done: current >= target,
  display,
});
const happy = (s: Stats) => (s.happiness === null ? '—' : String(Math.round(s.happiness)));

export const CHAPTERS: ChapterDef[] = [
  {
    title: 'Welcome to Chelsea',
    summary: 'Reach 50 residents and 70 happiness.',
    goals: (s) => [goal('Residents', s.residents, 50), goal('Happiness', s.happiness ?? 0, 70, happy(s))],
  },
  {
    title: 'A Thriving High Street',
    summary: 'Reach 80 residents, run two active shops and upgrade two townhouses.',
    goals: (s) => [
      goal('Residents', s.residents, 80),
      goal('Active shops', s.activeShopCount, 2),
      goal('Upgraded homes', s.upgraded.townhouse, 2),
    ],
  },
  {
    title: 'A Greener Chelsea',
    summary: 'Reach 100 residents and 80 happiness, with two upgraded parks.',
    goals: (s) => [
      goal('Residents', s.residents, 100),
      goal('Happiness', s.happiness ?? 0, 80, happy(s)),
      goal('Upgraded parks', s.upgraded.park, 2),
    ],
  },
];

export const CHAPTER_COUNT = CHAPTERS.length;

export function chapterGoals(index: number, s: Stats): Goal[] {
  return index < CHAPTER_COUNT ? CHAPTERS[index].goals(s) : [];
}

export function chapterMet(index: number, s: Stats): boolean {
  const g = chapterGoals(index, s);
  return g.length > 0 && g.every((x) => x.done);
}

/**
 * Number of completed chapters after this state. Monotonic: completed chapters are never
 * lost, and chapters complete in order (several may complete at once if already met).
 */
export function advanceChapters(completed: number, s: Stats): number {
  let c = Math.max(0, Math.min(CHAPTER_COUNT, Math.floor(completed)));
  while (c < CHAPTER_COUNT && chapterMet(c, s)) c++;
  return c;
}

/** One useful next step for the current chapter. */
export function chapterHint(completed: number, s: Stats): string {
  if (completed >= CHAPTER_COUNT) return 'All chapters complete: keep building your Chelsea however you like.';
  const goals = chapterGoals(completed, s);
  const missing = goals.find((g) => !g.done);
  if (!missing) return 'Almost there…';
  const homesWithoutService = s.homes.filter((h) => !h.shop && h.parks.length === 0).length;
  switch (missing.label) {
    case 'Residents': {
      const need = missing.target - missing.current;
      if (completed >= 1 && s.townhouses > s.upgraded.townhouse) return `Need ${need} more residents: upgrade a townhouse (+10 residents) or build a new one.`;
      return `Need ${need} more residents: build ${Math.ceil(need / 10)} more townhouse${need > 10 ? 's' : ''}.`;
    }
    case 'Happiness':
      if (s.townhouses === 0) return 'Build a townhouse first, then add a park or shop beside it.';
      if (homesWithoutService > 0) return `${homesWithoutService} home${homesWithoutService > 1 ? 's have' : ' has'} no park or shop nearby: add one within 80 m.`;
      if (completed >= 2 && s.upgraded.park < s.parks) return 'Upgrade a park (+15 instead of +10) or add another park near your homes.';
      return 'Add a park near your least happy homes (Inspect a home to see why).';
    case 'Active shops':
      if (s.shops > s.activeShopCount) return 'A shop is idle: build a townhouse within 80 m of it.';
      return 'Build a shop within 80 m of your homes.';
    case 'Upgraded homes':
      return 'Inspect a townhouse and choose Upgrade (£1,500): 20 residents, £180/tick.';
    case 'Upgraded parks':
      return s.parks < 2 ? 'Build parks near your homes, then upgrade them (£1,000 each).' : 'Inspect a park and choose Upgrade (£1,000): +15 happiness nearby.';
    default:
      return missing.label;
  }
}
