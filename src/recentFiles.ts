/**
 * The "Recent" list. Files are kept most-recently-opened first (for the plain history), and each
 * visit also feeds a "frecency" score — how often *and* how recently a file is used — so the files
 * you keep coming back to rise above one you opened once a minute ago.
 *
 * A file's score is halved every 7 days; each visit decays the old score and adds 1. Pure functions
 * plus two thin helpers over a Memento (workspaceState); no dependency on the `vscode` module.
 */

export interface FrecencyEntry { score: number; last: number }
export type Frecency = Record<string, FrecencyEntry>;

export const MAX_RECENT = 100;
export const MAX_FRECENCY_ENTRIES = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_MS = 7 * DAY_MS;
/** Visits to the same file closer together than this count once, so flipping between two files does not inflate them. */
const MIN_VISIT_GAP_MS = 60_000;
/** Scores that have decayed below this are forgotten. */
const FORGET_BELOW = 0.01;

const RECENT_KEY = 'spyglass.recentFiles';
const FRECENCY_KEY = 'spyglass.fileFrecency';

export interface Memento {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export function decayedScore(entry: FrecencyEntry, now: number): number {
  return entry.score * Math.pow(0.5, Math.max(0, now - entry.last) / HALF_LIFE_MS);
}

function prune(map: Frecency, now: number): Frecency {
  return Object.fromEntries(
    Object.entries(map)
      .map(([file, entry]) => ({ file, entry, score: decayedScore(entry, now) }))
      .filter(x => x.score >= FORGET_BELOW)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FRECENCY_ENTRIES)
      .map(x => [x.file, x.entry]),
  );
}

/** Returns a new map with a visit to `file` recorded at `now`; the given map is not modified. */
export function recordVisit(map: Frecency, file: string, now: number): Frecency {
  const existing = map[file];
  if (existing && now - existing.last >= 0 && now - existing.last < MIN_VISIT_GAP_MS) { return map; }
  const score = (existing ? decayedScore(existing, now) : 0) + 1;
  return prune({ ...map, [file]: { score, last: now } }, now);
}

/** Orders `files` by frecency; files with the same score (including unseen ones) keep their given order. */
export function rankByFrecency(files: string[], map: Frecency, now: number): string[] {
  return files
    .map((file, index) => ({ file, index, score: map[file] ? decayedScore(map[file], now) : 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.file);
}

/** Records that `file` was opened: moves it to the front of the history and counts the visit. */
export async function recordRecentFile(state: Memento, file: string, now: number = Date.now()): Promise<void> {
  const list = state.get<string[]>(RECENT_KEY, []);
  await state.update(RECENT_KEY, [file, ...list.filter(p => p !== file)].slice(0, MAX_RECENT));
  await state.update(FRECENCY_KEY, recordVisit(state.get<Frecency>(FRECENCY_KEY, {}), file, now));
}

/** The recent files, best first. */
export function getRankedRecentFiles(state: Memento, now: number = Date.now()): string[] {
  return rankByFrecency(state.get<string[]>(RECENT_KEY, []), state.get<Frecency>(FRECENCY_KEY, {}), now);
}
