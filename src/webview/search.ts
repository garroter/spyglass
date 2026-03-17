import { state } from './state';
import type { RecentFile, FileResult } from './types';

import { vscode } from './vscode';

export function isFileScope(): boolean   { return state.scope === 'files' || state.scope === 'recent'; }
export function isSymbolScope(): boolean { return state.scope === 'symbols'; }
export function isTextScope(): boolean   { return !isFileScope() && !isSymbolScope(); }

export function parseQueryInput(raw: string): { query: string; globFilter: string } {
  const words = raw.split(/\s+/);
  const globs: string[] = [], terms: string[] = [];
  for (const w of words) {
    if (w && (w.startsWith('*') || w.startsWith('!'))) { globs.push(w); }
    else { terms.push(w); }
  }
  return { query: terms.join(' ').trim(), globFilter: globs.join(',') };
}

export function fuzzyScore(str: string, query: string): { score: number; positions: number[] } | null {
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

export function filterFilesLocally(fileList: RecentFile[], query: string): void {
  const maxResults = 200;
  let results: FileResult[];
  if (!query.trim()) {
    results = fileList.slice(0, maxResults).map(({ file, rel }) => ({ file, relativePath: rel, matchPositions: [] }));
  } else {
    const scored: (FileResult & { score: number })[] = [];
    for (const { file, rel } of fileList) {
      const match = fuzzyScore(rel, query);
      if (match) { scored.push({ file, relativePath: rel, matchPositions: match.positions, score: match.score }); }
    }
    scored.sort((a, b) => b.score - a.score);
    results = scored.slice(0, maxResults).map(({ file, relativePath, matchPositions }) => ({ file, relativePath, matchPositions }));
  }
  state.searching = false;
  state.fileResults = results;
  state.selected = 0;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerSearch(renderFn: () => void): void {
  clearTimeout(searchTimer!);
  if (state.scope === 'files') {
    if (state.fileList) {
      filterFilesLocally(state.fileList, state.query);
      renderFn();
    } else {
      state.searching = true;
      renderFn();
      searchTimer = setTimeout(() => vscode.postMessage({ type: 'fileSearch' }), 180);
    }
    return;
  }
  if (state.scope === 'recent') {
    filterFilesLocally(state.recentFiles, state.query);
    renderFn();
    return;
  }
  searchTimer = setTimeout(() => {
    if (state.scope === 'symbols') {
      state.searching = true;
      renderFn();
      vscode.postMessage({ type: 'symbolSearch', query: state.query });
    } else {
      vscode.postMessage({
        type: 'search',
        query: state.query,
        useRegex: state.useRegex,
        scope: state.scope,
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        globFilter: state.globFilter,
      });
    }
  }, 180);
}
