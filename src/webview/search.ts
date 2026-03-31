import { state } from './state';
import type { RecentFile, FileResult } from './types';

import { vscode } from './vscode';

export function isFileScope(): boolean   { return state.scope === 'files' || state.scope === 'recent' || state.scope === 'git'; }
export function isSymbolScope(): boolean { return state.scope === 'symbols' || state.scope === 'doc'; }
export function isDocScope(): boolean    { return state.scope === 'doc'; }
export function isGitScope(): boolean    { return state.scope === 'git'; }
export function isRefsScope(): boolean   { return state.scope === 'refs'; }
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

function fuzzyFilter(fileList: RecentFile[], query: string): FileResult[] {
  if (!query.trim()) {
    return fileList.map(({ file, rel }) => ({ file, relativePath: rel, matchPositions: [] }));
  }
  const scored: (FileResult & { score: number })[] = [];
  for (const { file, rel } of fileList) {
    const match = fuzzyScore(rel, query);
    if (match) { scored.push({ file, relativePath: rel, matchPositions: match.positions, score: match.score }); }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ file, relativePath, matchPositions }) => ({ file, relativePath, matchPositions }));
}

export function filterFilesLocally(fileList: RecentFile[], query: string): void {
  const maxResults = 200;

  if (state.scope === 'recent' && state.pinnedFiles.length > 0) {
    const pinnedPaths = new Set(state.pinnedFiles.map(f => f.file));
    const pinned  = fuzzyFilter(state.pinnedFiles, query)
      .map(r => ({ ...r, isPinned: true }));
    const nonPinned = fuzzyFilter(
      fileList.filter(f => !pinnedPaths.has(f.file)),
      query,
    );
    state.fileResults = [...pinned, ...nonPinned].slice(0, maxResults);
    state.searching = false;
    state.selected = 0;
    return;
  }

  state.fileResults = fuzzyFilter(fileList, query).slice(0, maxResults);
  state.searching = false;
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
  if (state.scope === 'git') {
    if (state.gitFiles) {
      filterFilesLocally(state.gitFiles, state.query);
      renderFn();
    } else {
      state.searching = true;
      renderFn();
      searchTimer = setTimeout(() => vscode.postMessage({ type: 'gitSearch' }), 50);
    }
    return;
  }
  searchTimer = setTimeout(() => {
    if (state.scope === 'refs') {
      state.searching = true;
      renderFn();
      vscode.postMessage({ type: 'refsSearch' });
    } else if (state.scope === 'doc') {
      state.searching = true;
      renderFn();
      vscode.postMessage({ type: 'docSearch', query: state.query });
    } else if (state.scope === 'symbols') {
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
        includeFilter: state.includeFilter,
      });
    }
  }, 180);
}
