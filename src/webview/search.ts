import { state } from './state';
import type { RecentFile, FileResult, SymbolResult } from './types';

import { vscode } from './vscode';
import { fuzzyRank, fuzzyScore, parseFileQuery, parseQueryInput, rankCommands } from '../webviewUtils';

export function isFileScope(): boolean   { return state.scope === 'files' || state.scope === 'recent' || state.scope === 'git'; }
export function isSymbolScope(): boolean { return state.scope === 'symbols' || state.scope === 'doc'; }
export function isDocScope(): boolean    { return state.scope === 'doc'; }
export function isGitScope(): boolean    { return state.scope === 'git'; }
export function isRefsScope(): boolean   { return state.scope === 'refs'; }
export function isCommandScope(): boolean { return state.scope === 'commands'; }
export function isTextScope(): boolean   { return !isFileScope() && !isSymbolScope() && !isCommandScope(); }

/** The symbols as listed: Doc filters by the query locally, and the kind chips filter both scopes. */
export function visibleSymbols(): SymbolResult[] {
  const q = isDocScope() ? state.query.toLowerCase() : '';
  const byQuery = q ? state.symbolResults.filter(r => r.name.toLowerCase().includes(q)) : state.symbolResults;
  return state.symbolKindFilter ? byQuery.filter(r => r.kindLabel === state.symbolKindFilter) : byQuery;
}

/** Ranks the commands for the current query (recently run first). */
export function filterCommands(): void {
  const maxResults = (window as any).__spyglass.MAX_RESULTS;
  state.commandResults = rankCommands(state.commandEntries ?? [], state.query, state.recentCommands, maxResults);
  state.searching = false;
  state.selected = 0;
}

/** A bare `:line` in Files or Recent: go to that line in the current file. */
export function isGotoLine(): boolean {
  return (state.scope === 'files' || state.scope === 'recent') && state.fileLine !== null && !state.query;
}

// The same functions the unit tests exercise (src/webviewUtils.ts); esbuild bundles them in.
export { parseQueryInput, parseFileQuery, fuzzyScore };

/** The files to list for `query`, at most `limit`; a blank query lists them in their given order. */
function fuzzyFilter(fileList: RecentFile[], query: string, limit: number): FileResult[] {
  if (!query.trim()) {
    return fileList.slice(0, limit).map(({ file, rel }) => ({ file, relativePath: rel, matchPositions: [] }));
  }
  return fuzzyRank(fileList, query, limit).map(({ item, positions }) => ({ file: item.file, relativePath: item.rel, matchPositions: positions }));
}

export function filterFilesLocally(fileList: RecentFile[], query: string): void {
  const maxResults = (window as any).__spyglass.MAX_RESULTS;

  if (state.scope === 'recent' && state.pinnedFiles.length > 0) {
    const pinnedPaths = new Set(state.pinnedFiles.map(f => f.file));
    const pinned  = fuzzyFilter(state.pinnedFiles, query, maxResults)
      .map(r => ({ ...r, isPinned: true }));
    const nonPinned = fuzzyFilter(
      fileList.filter(f => !pinnedPaths.has(f.file)),
      query,
      maxResults,
    );
    state.fileResults = [...pinned, ...nonPinned].slice(0, maxResults);
    state.searching = false;
    state.selected = 0;
    return;
  }

  state.fileResults = fuzzyFilter(fileList, query, maxResults);
  state.searching = false;
  state.selected = 0;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerSearch(renderFn: () => void): void {
  clearTimeout(searchTimer!);
  if (isCommandScope()) {
    if (state.commandEntries) {
      filterCommands();
    } else {
      // the extension sends the list once, on first use ('commands' message)
      state.searching = true;
      vscode.postMessage({ type: 'commandList' });
    }
    renderFn();
    return;
  }
  if (isGotoLine()) {
    // only the extension knows the current file; it answers with an 'activeFile' message
    state.searching = true;
    renderFn();
    vscode.postMessage({ type: 'activeFile' });
    return;
  }
  if (state.scope === 'files') {
    if (state.fileList) {
      filterFilesLocally(state.fileList, state.query);
      renderFn();
    } else {
      state.searching = true;
      renderFn();
      searchTimer = setTimeout(() => vscode.postMessage({ type: 'fileSearch', includeIgnored: state.includeIgnored }), 180);
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
      if (state.symbolResults.length > 0) {
        renderFn(); // already loaded — just re-render with local filter
      } else {
        state.searching = true;
        renderFn();
        vscode.postMessage({ type: 'docSearch' });
      }
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
        includeIgnored: state.includeIgnored,
        multiline: state.multiline,
        // recalled from the history: run it, but do not record it again (that would reorder the list)
        fromHistory: state.historyIndex >= 0,
      });
    }
  }, 180);
}
