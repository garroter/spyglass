import { state } from './state';
import {
  queryEl, regexBtn, caseBtn, wordBtn, replaceBtn, previewBtn,
  replaceRow, replaceAllBtn, tabs, previewHdr,
} from './dom';
import { isFileScope, isSymbolScope, isGitScope, isTextScope, parseQueryInput, triggerSearch, filterFilesLocally } from './search';
import { clearPreview, togglePreview, requestPreview } from './preview';
import { render, navigate, openResult, openResultInSplit, openAllSelected,
         toggleSelectResult, selectAll, copyCurrentPath, refreshGitScope } from './render';
import { hideCtxMenu } from './contextMenu';

import { vscode } from './vscode';

function matchKey(e: KeyboardEvent, binding: string): boolean {
  if (!binding) { return false; }
  const parts = binding.toLowerCase().split('+');
  const key   = parts[parts.length - 1];
  const ctrl  = parts.includes('ctrl');
  const shift = parts.includes('shift');
  const alt   = parts.includes('alt');
  return e.key.toLowerCase() === key
    && e.ctrlKey  === ctrl
    && e.shiftKey === shift
    && e.altKey   === alt;
}

const KB = (window as any).__spyglass.KB;
const SCOPES = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols', 'git'];

export function updateReplaceRowVisibility(): void {
  replaceRow.style.display = (isTextScope() && state.replaceMode) ? '' : 'none';
}

export function setScope(scope: string): void {
  if (scope === 'git') { state.gitFiles = null; }
  state.scope = scope;
  state.selected = 0;
  state.multiSelected = new Set();
  state.historyIndex = -1;
  clearPreview();
  vscode.postMessage({ type: 'scopeChanged', scope });
  tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === scope));
  const isFile = isFileScope();
  const isSym  = isSymbolScope();
  regexBtn.disabled   = isFile || isSym;
  caseBtn.disabled    = isFile || isSym;
  wordBtn.disabled    = isFile || isSym;
  replaceBtn.disabled = isFile || isSym;
  updateReplaceRowVisibility();
  queryEl.placeholder = scope === 'files'   ? 'Search files by name...'
                      : scope === 'recent'  ? 'Filter recent files...'
                      : scope === 'symbols' ? 'Search symbols...'
                      : scope === 'here'    ? 'query *.ts  — search in current dir...'
                      : scope === 'git'     ? 'Filter changed files...'
                      : 'query *.ts  — search in project...';
  if (state.query || scope === 'recent' || scope === 'git') {
    triggerSearch(render);
  } else {
    state.results = [];
    state.fileResults = [];
    state.symbolResults = [];
    state.searching = false;
    render();
  }
}

function navigateHistory(dir: number): void {
  if (state.searchHistory.length === 0) { return; }
  if (state.historyIndex === -1 && dir < 0) {
    state.historyPreQuery = queryEl.value;
  }
  state.historyIndex = Math.max(-1, Math.min(state.searchHistory.length - 1, state.historyIndex + dir));
  queryEl.value = state.historyIndex >= 0 ? state.searchHistory[state.historyIndex] : state.historyPreQuery;
  state.query = queryEl.value;
}

function toggleRegex(): void {
  state.useRegex = !state.useRegex;
  regexBtn.classList.toggle('active', state.useRegex);
  if (state.query) { triggerSearch(render); }
}

function toggleCase(): void {
  state.caseSensitive = !state.caseSensitive;
  caseBtn.classList.toggle('active', state.caseSensitive);
  if (state.query) { triggerSearch(render); }
}

function toggleWord(): void {
  state.wholeWord = !state.wholeWord;
  wordBtn.classList.toggle('active', state.wholeWord);
  if (state.query) { triggerSearch(render); }
}

function toggleReplaceMode(): void {
  state.replaceMode = !state.replaceMode;
  replaceBtn.classList.toggle('active', state.replaceMode);
  updateReplaceRowVisibility();
  if (state.replaceMode) { (document.getElementById('replace-input') as HTMLInputElement).focus(); }
}

function applyReplaceAll(): void {
  vscode.postMessage({
    type: 'replaceAll',
    query: state.query,
    replacement: (document.getElementById('replace-input') as HTMLInputElement).value,
    useRegex: state.useRegex,
    caseSensitive: state.caseSensitive,
    wholeWord: state.wholeWord,
    globFilter: state.globFilter,
    scope: state.scope,
  });
}

export function initEvents(): void {
  queryEl.addEventListener('input', () => {
    const { query, globFilter } = parseQueryInput(queryEl.value);
    state.query = query;
    if (globFilter !== state.globFilter) { state.globFilter = globFilter; }
    state.selected = 0;
    state.historyIndex = -1;
    triggerSearch(render);
  });

  queryEl.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'ArrowUp') {
      e.preventDefault(); navigateHistory(-1);
    } else if (e.ctrlKey && e.key === 'ArrowDown') {
      e.preventDefault(); navigateHistory(1);
    } else if (e.altKey && e.key === 'y') {
      e.preventDefault(); copyCurrentPath();
    } else if (e.key === 'F5' && isGitScope()) {
      e.preventDefault(); refreshGitScope(render);
    } else if (matchKey(e, KB.navigateDown)) {
      e.preventDefault(); navigate(1);
    } else if (matchKey(e, KB.navigateUp)) {
      e.preventDefault(); navigate(-1);
    } else if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault(); openAllSelected();
    } else if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault(); openResultInSplit(state.selected);
    } else if (matchKey(e, KB.open)) {
      e.preventDefault(); openResult(state.selected);
    } else if (matchKey(e, KB.close)) {
      vscode.postMessage({ type: 'close' });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]);
    } else if (matchKey(e, KB.toggleRegex)) {
      e.preventDefault(); toggleRegex();
    } else if (matchKey(e, KB.togglePreview)) {
      e.preventDefault(); togglePreview();
    } else if (e.altKey && e.key === 'c') {
      e.preventDefault(); toggleCase();
    } else if (e.altKey && e.key === 'w') {
      e.preventDefault(); toggleWord();
    } else if (e.altKey && e.key === 'r') {
      e.preventDefault(); toggleReplaceMode();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (document.activeElement === queryEl) { return; }
    if (matchKey(e, KB.navigateDown))         { e.preventDefault(); navigate(1); }
    else if (matchKey(e, KB.navigateUp))      { e.preventDefault(); navigate(-1); }
    else if (e.altKey && e.key === 'y')        { e.preventDefault(); copyCurrentPath(); }
    else if (e.key === 'F5' && isGitScope())   { e.preventDefault(); refreshGitScope(render); }
    else if (e.ctrlKey && e.key === ' ')       { e.preventDefault(); toggleSelectResult(state.selected); }
    else if (e.shiftKey && e.key === 'Enter')  { e.preventDefault(); openAllSelected(); }
    else if (e.ctrlKey && e.key === 'a')       { e.preventDefault(); selectAll(); }
    else if (e.ctrlKey && e.key === 'Enter')   { e.preventDefault(); openResultInSplit(state.selected); }
    else if (matchKey(e, KB.open))             { e.preventDefault(); openResult(state.selected); }
    else if (matchKey(e, KB.togglePreview))    { e.preventDefault(); togglePreview(); }
    else if (matchKey(e, KB.close))            { vscode.postMessage({ type: 'close' }); }
    else if (e.key === 'Tab')                  { e.preventDefault(); setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]); }
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope!)));

  regexBtn.addEventListener('click', toggleRegex);
  caseBtn.addEventListener('click', toggleCase);
  wordBtn.addEventListener('click', toggleWord);
  replaceBtn.addEventListener('click', toggleReplaceMode);
  previewBtn.addEventListener('click', togglePreview);
  replaceAllBtn.addEventListener('click', applyReplaceAll);

  previewHdr.addEventListener('click', () => {
    if (state.currentPreviewFile) {
      let absFile: string | null = null;
      if (isFileScope()) {
        const r = state.fileResults[state.selected];
        if (r) { absFile = r.file; }
      } else if (isSymbolScope()) {
        const r = state.symbolResults[state.selected];
        if (r) { absFile = r.file; }
      } else {
        const r = state.results[state.selected];
        if (r) { absFile = r.file; }
      }
      if (absFile) { vscode.postMessage({ type: 'revealFile', file: absFile }); }
    }
  });

  document.addEventListener('click', () => {
    const shortcutsOverlay = document.getElementById('shortcuts-overlay')!;
    const helpBtn = document.getElementById('help-btn')!;
    shortcutsOverlay.classList.remove('visible');
    helpBtn.classList.remove('active');
    hideCtxMenu();
  });

  document.getElementById('shortcuts-overlay')!.addEventListener('click', e => e.stopPropagation());

  document.getElementById('help-btn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    const overlay = document.getElementById('shortcuts-overlay')!;
    overlay.classList.toggle('visible');
    (e.currentTarget as HTMLElement).classList.toggle('active', overlay.classList.contains('visible'));
  });
}

export function initMessages(): void {
  const searchTook = document.getElementById('search-took')!;
  window.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'searching':
        state.searching = true;
        searchTook.textContent = '';
        render();
        break;
      case 'resultsChunk':
        state.results = data.results;
        state.selected = 0;
        render();
        break;
      case 'results':
        state.searching = false;
        state.results = data.results;
        state.selected = 0;
        if (data.took > 0) { searchTook.textContent = data.took + 'ms'; }
        render();
        break;
      case 'gitStatus':
        state.gitStatus = data.status;
        render();
        break;
      case 'fileList':
        state.fileList = data.files;
        if (state.scope === 'files') {
          filterFilesLocally(state.fileList!, state.query);
          render();
        }
        break;
      case 'gitFiles':
        state.gitFiles = data.files;
        if (isGitScope()) {
          filterFilesLocally(state.gitFiles!, state.query);
          render();
        }
        break;
      case 'fileResults':
        state.searching = false;
        state.fileResults = data.results;
        state.selected = 0;
        render();
        break;
      case 'symbolResults':
        state.searching = false;
        state.symbolResults = data.results;
        state.selected = 0;
        render();
        break;
      case 'previewContent':
        (window as any).__renderPreview(
          data.lines, data.currentLine, data.relativePath, data.ext, data.changedLines,
          (isFileScope() || isSymbolScope()) ? '' : state.query, state.useRegex, data.preHighlighted,
        );
        break;
      case 'error':
        state.searching = false;
        document.getElementById('state-msg')!.textContent = data.message;
        document.getElementById('state-msg')!.style.display = '';
        break;
      case 'focus':
        queryEl.focus();
        queryEl.select();
        break;
      case 'setQuery':
        queryEl.value = data.query;
        state.query = data.query;
        state.selected = 0;
        queryEl.focus();
        queryEl.select();
        triggerSearch(render);
        break;
      case 'replaceApplied':
        state.selected = 0;
        triggerSearch(render);
        break;
    }
  });
}
