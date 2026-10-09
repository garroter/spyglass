// Pure functions shared between the webview (bundled into media/webview.js by esbuild) and the tests.

export interface FuzzyMatch {
  score: number;
  positions: number[];
}

export function fuzzyScore(str: string, query: string): FuzzyMatch | null {
  const lStr = str.toLowerCase();
  const lQuery = query.toLowerCase();
  const positions: number[] = [];
  let si = 0, qi = 0;
  while (si < lStr.length && qi < lQuery.length) {
    if (lStr[si] === lQuery[qi]) { positions.push(si); qi++; }
    si++;
  }
  if (qi < lQuery.length) { return null; }
  let score = 0, consecutive = 1;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] === positions[i - 1] + 1) { score += consecutive * 10; consecutive++; }
    else { consecutive = 1; }
  }
  const basenameStart = str.lastIndexOf('/') + 1;
  if (positions[0] >= basenameStart) { score += 50; }
  if (positions[0] === basenameStart) { score += 30; }
  score -= positions[positions.length - 1] - positions[0];
  let slashes = 0;
  for (let i = 0; i < str.length; i++) { if (str[i] === '/') { slashes++; } }
  score -= slashes * 2;
  return { score, positions };
}

export function parseQueryInput(raw: string): { query: string; globFilter: string } {
  const words = raw.split(/\s+/);
  const globs: string[] = [], terms: string[] = [];
  for (const w of words) {
    if (w && (w.startsWith('*') || w.startsWith('!'))) { globs.push(w); }
    else { terms.push(w); }
  }
  return {
    query: terms.join(' ').trim(),
    globFilter: globs.join(','),
  };
}

// ---------------------------------------------------------------------------------------------------
// Ranking a long list of files while the user types
// ---------------------------------------------------------------------------------------------------

interface ListIndex {
  length: number;
  /** rel.toLowerCase(), filled in only for paths with a non-ASCII character (ASCII paths are compared without it). */
  lower: Array<string | undefined>;
  /** Where the file name starts and how many '/' the path has - measured on the original string, as fuzzyScore does. -1 = not computed yet. */
  base: Int32Array;
  slashes: Int32Array;
  /** Recent queries and the files (indices, ascending) that matched them; newest last. */
  recent: Array<{ query: string; matches: Int32Array }>;
}

const listIndexes = new WeakMap<object, ListIndex>();
const MAX_CACHED_QUERIES = 8;
/** Above this spread of scores, picking the top N by counting is not worth it and a plain sort is used. */
const MAX_SCORE_RANGE = 200_000;

function indexOfList(list: readonly { rel: string }[]): ListIndex {
  const cached = listIndexes.get(list);
  // lists are treated as immutable (a new array arrives whenever the files change); the length check
  // only guards against one that was appended to in place
  if (cached && cached.length === list.length) { return cached; }
  const index: ListIndex = {
    length: list.length,
    lower: new Array<string | undefined>(list.length),
    base: new Int32Array(list.length).fill(-1),
    slashes: new Int32Array(list.length),
    recent: [],
  };
  listIndexes.set(list, index);
  return index;
}

/**
 * The best `limit` files for a fuzzy query, best first, each with the positions to highlight. Returns
 * exactly what scoring every file with fuzzyScore, stable-sorting by score and taking the first `limit`
 * would - only much faster on a long list, which matters because it runs on every keystroke:
 *  - the lowercase form of each path is computed once per list, not once per keystroke;
 *  - files are scored without allocating, and highlight positions are computed only for the winners;
 *  - the top `limit` are picked by counting scores instead of sorting every match;
 *  - a longer query can only match files its prefix matched, so typing (or deleting) a letter rescans
 *    just those files rather than the whole list.
 * The query must not be blank (callers show the unfiltered list for that); an empty one returns the
 * first `limit` files unhighlighted.
 */
export function fuzzyRank<T extends { rel: string }>(list: readonly T[], query: string, limit: number): Array<{ item: T; positions: number[] }> {
  if (limit <= 0 || list.length === 0) { return []; }
  const q = query.toLowerCase();
  const m = q.length;
  if (m === 0) { return list.slice(0, limit).map(item => ({ item, positions: [] })); }

  const index = indexOfList(list);
  const { lower, base, slashes } = index;

  // A path without non-ASCII characters is matched by folding upper-case ASCII letters on the fly, so
  // no lowercase copy of every path is ever made. Any other path (or a query with a non-ASCII letter)
  // takes the exact route: match against rel.toLowerCase(), as fuzzyScore does.
  const qCodes = new Uint16Array(m);
  let qAscii = true;
  for (let n = 0; n < m; n++) { qCodes[n] = q.charCodeAt(n); if (qCodes[n] >= 128) { qAscii = false; } }

  /** Fills `out` with the positions of the query in file `i` (leftmost match) and says whether it matches. */
  const matchLowered = (i: number, out: Int32Array): boolean => {
    const s = lower[i] ?? (lower[i] = list[i].rel.toLowerCase());
    let si = 0, qi = 0;
    while (si < s.length && qi < m) {
      if (s.charCodeAt(si) === qCodes[qi]) { out[qi++] = si; }
      si++;
    }
    return qi === m;
  };
  const matchFile = (i: number, out: Int32Array): boolean => {
    if (!qAscii) { return matchLowered(i, out); }
    const rel = list[i].rel;
    let si = 0, qi = 0;
    while (si < rel.length && qi < m) {
      let c = rel.charCodeAt(si);
      if (c >= 128) { return matchLowered(i, out); }
      if (c >= 65 && c <= 90) { c += 32; }
      if (c === qCodes[qi]) { out[qi++] = si; }
      si++;
    }
    return qi === m;
  };

  // the longest earlier query this one extends: its matches are all the files that can still match
  let narrowed: Int32Array | undefined;
  let narrowedBy = -1;
  for (const c of index.recent) {
    if (c.query.length > narrowedBy && q.startsWith(c.query)) { narrowed = c.matches; narrowedBy = c.query.length; }
  }
  const candidates = narrowed ? narrowed.length : list.length;

  const pos = new Int32Array(m);
  const matchIdx = new Int32Array(candidates);
  const matchScore = new Float64Array(candidates);
  let k = 0;
  for (let c = 0; c < candidates; c++) {
    const i = narrowed ? narrowed[c] : c;
    if (!matchFile(i, pos)) { continue; }

    if (base[i] < 0) {
      const rel = list[i].rel;
      base[i] = rel.lastIndexOf('/') + 1;
      let n = 0;
      for (let r = 0; r < rel.length; r++) { if (rel.charCodeAt(r) === 47) { n++; } }
      slashes[i] = n;
    }
    let score = 0, consecutive = 1;
    for (let p = 1; p < m; p++) {
      if (pos[p] === pos[p - 1] + 1) { score += consecutive * 10; consecutive++; }
      else { consecutive = 1; }
    }
    if (pos[0] >= base[i]) { score += 50; }
    if (pos[0] === base[i]) { score += 30; }
    score -= pos[m - 1] - pos[0];
    score -= slashes[i] * 2;
    matchIdx[k] = i;
    matchScore[k] = score;
    k++;
  }

  // remember which files matched, for the next keystroke
  index.recent = index.recent.filter(c => c.query !== q);
  index.recent.push({ query: q, matches: matchIdx.slice(0, k) });
  if (index.recent.length > MAX_CACHED_QUERIES) { index.recent.shift(); }

  if (k === 0) { return []; }
  const byScore = (a: number, b: number) => matchScore[b] - matchScore[a] || a - b;   // best first; ties keep the list order

  let chosen: number[];
  if (k <= limit) {
    chosen = Array.from({ length: k }, (_, j) => j).sort(byScore);
  } else {
    let min = Infinity, max = -Infinity;
    for (let j = 0; j < k; j++) { if (matchScore[j] < min) { min = matchScore[j]; } if (matchScore[j] > max) { max = matchScore[j]; } }
    if (max - min > MAX_SCORE_RANGE) {
      chosen = Array.from({ length: k }, (_, j) => j).sort(byScore).slice(0, limit);
    } else {
      // scores are integers: find the score `t` at which the best `limit` matches are reached
      const counts = new Int32Array(max - min + 1);
      for (let j = 0; j < k; j++) { counts[matchScore[j] - min]++; }
      let above = 0, t = max;
      for (; t >= min; t--) {
        if (above + counts[t - min] >= limit) { break; }
        above += counts[t - min];
      }
      let ties = limit - above;
      chosen = [];
      for (let j = 0; j < k; j++) {
        if (matchScore[j] > t) { chosen.push(j); }
        else if (matchScore[j] === t && ties > 0) { chosen.push(j); ties--; }
      }
      chosen.sort(byScore);
    }
  }

  return chosen.map(j => {
    const i = matchIdx[j];
    matchFile(i, pos);
    return { item: list[i], positions: Array.from(pos) };
  });
}
