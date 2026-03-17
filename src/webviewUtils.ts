// Pure functions shared between webview logic and tests.
// Note: webview.js contains identical implementations inline (browser cannot import TS modules).

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
