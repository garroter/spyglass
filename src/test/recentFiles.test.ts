import { describe, it, expect } from 'vitest';
import {
  decayedScore, recordVisit, rankByFrecency, recordRecentFile, getRankedRecentFiles,
  MAX_RECENT, MAX_FRECENCY_ENTRIES,
} from '../recentFiles';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

function memento(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    store,
    get: <T>(key: string, fallback?: T): T => (store.has(key) ? store.get(key) as T : fallback as T),
    update: async (key: string, value: unknown) => { store.set(key, value); },
  };
}

describe('decayedScore', () => {
  it('is the stored score at the moment of the last visit', () => {
    expect(decayedScore({ score: 3, last: T0 }, T0)).toBe(3);
  });

  it('halves every 7 days', () => {
    expect(decayedScore({ score: 8, last: T0 }, T0 + 7 * DAY)).toBeCloseTo(4);
    expect(decayedScore({ score: 8, last: T0 }, T0 + 14 * DAY)).toBeCloseTo(2);
  });

  it('does not grow when the clock goes backwards', () => {
    expect(decayedScore({ score: 3, last: T0 }, T0 - DAY)).toBe(3);
  });
});

describe('recordVisit', () => {
  it('starts a new file at 1', () => {
    expect(recordVisit({}, '/a', T0)).toEqual({ '/a': { score: 1, last: T0 } });
  });

  it('decays the old score, then adds one', () => {
    const once = recordVisit({}, '/a', T0);
    const twice = recordVisit(once, '/a', T0 + 7 * DAY);
    expect(twice['/a'].score).toBeCloseTo(1.5);
    expect(twice['/a'].last).toBe(T0 + 7 * DAY);
  });

  it('ignores a repeat visit within a minute, so flipping between two files does not inflate them', () => {
    const once = recordVisit({}, '/a', T0);
    expect(recordVisit(once, '/a', T0 + 30_000)).toEqual(once);
  });

  it('counts a visit again once a minute has passed', () => {
    const once = recordVisit({}, '/a', T0);
    expect(recordVisit(once, '/a', T0 + 61_000)['/a'].score).toBeCloseTo(2, 2);
  });

  it('does not modify the map it is given', () => {
    const before = { '/a': { score: 1, last: T0 } };
    recordVisit(before, '/a', T0 + DAY);
    recordVisit(before, '/b', T0 + DAY);
    expect(before).toEqual({ '/a': { score: 1, last: T0 } });
  });

  it('keeps at most MAX_FRECENCY_ENTRIES files, dropping the lowest scores', () => {
    let map = {};
    for (let i = 0; i < MAX_FRECENCY_ENTRIES + 20; i++) { map = recordVisit(map, `/f${i}`, T0 + i * 1000); }
    const kept = Object.keys(map);
    expect(kept).toHaveLength(MAX_FRECENCY_ENTRIES);
    expect(kept).toContain(`/f${MAX_FRECENCY_ENTRIES + 19}`); // the newest survive
    expect(kept).not.toContain('/f0');                         // the oldest do not
  });

  it('forgets files whose score has decayed to nothing', () => {
    const map = recordVisit(recordVisit({}, '/old', T0), '/new', T0 + 200 * DAY);
    expect(Object.keys(map)).toEqual(['/new']);
  });
});

describe('rankByFrecency', () => {
  it('puts a file visited often above one visited once at the same time', () => {
    let map = {};
    for (let i = 0; i < 5; i++) { map = recordVisit(map, '/often', T0 + i * 10 * 60_000); }
    map = recordVisit(map, '/once', T0 + 50 * 60_000);
    expect(rankByFrecency(['/once', '/often'], map, T0 + 60 * 60_000)).toEqual(['/often', '/once']);
  });

  it('lets recency win over an old habit', () => {
    let map = {};
    for (let i = 0; i < 10; i++) { map = recordVisit(map, '/habit', T0 + i * 60_000 * 2); }
    map = recordVisit(map, '/today', T0 + 60 * DAY);
    expect(rankByFrecency(['/habit', '/today'], map, T0 + 60 * DAY + 60_000)).toEqual(['/today', '/habit']);
  });

  it('keeps the given order for files that score the same, including files it has never seen', () => {
    expect(rankByFrecency(['/x', '/y', '/z'], {}, T0)).toEqual(['/x', '/y', '/z']);
  });

  it('ranks known files above unknown ones without disturbing the unknown ones\' order', () => {
    const map = recordVisit({}, '/known', T0);
    expect(rankByFrecency(['/u1', '/u2', '/known', '/u3'], map, T0)).toEqual(['/known', '/u1', '/u2', '/u3']);
  });

  it('only reorders the files it is given', () => {
    const map = recordVisit(recordVisit({}, '/a', T0), '/elsewhere', T0);
    expect(rankByFrecency(['/a'], map, T0)).toEqual(['/a']);
  });
});

describe('recordRecentFile / getRankedRecentFiles', () => {
  it('keeps the list most recent first, without duplicates', async () => {
    const state = memento();
    await recordRecentFile(state, '/a', T0);
    await recordRecentFile(state, '/b', T0 + 1000);
    await recordRecentFile(state, '/a', T0 + 2000);
    expect(state.store.get('spyglass.recentFiles')).toEqual(['/a', '/b']);
  });

  it('keeps at most MAX_RECENT files', async () => {
    const state = memento();
    for (let i = 0; i < MAX_RECENT + 5; i++) { await recordRecentFile(state, `/f${i}`, T0 + i * 1000); }
    const list = state.store.get('spyglass.recentFiles') as string[];
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe(`/f${MAX_RECENT + 4}`);
  });

  it('returns the files ordered by frecency, not only by how recently they were opened', async () => {
    const state = memento();
    for (let i = 0; i < 6; i++) { await recordRecentFile(state, '/often', T0 + i * 10 * 60_000); await recordRecentFile(state, '/other', T0 + i * 10 * 60_000 + 5 * 60_000); }
    await recordRecentFile(state, '/often', T0 + 2 * 60 * 60_000);
    await recordRecentFile(state, '/once', T0 + 2 * 60 * 60_000 + 5 * 60_000); // the most recent of all
    const ranked = getRankedRecentFiles(state, T0 + 2 * 60 * 60_000 + 10 * 60_000);
    expect(ranked[0]).toBe('/often');
    expect(ranked.indexOf('/once')).toBeGreaterThan(ranked.indexOf('/often'));
  });

  it('shows files saved before frecency existed in their recency order', () => {
    const state = memento({ 'spyglass.recentFiles': ['/a', '/b', '/c'] });
    expect(getRankedRecentFiles(state, T0)).toEqual(['/a', '/b', '/c']);
  });
});
