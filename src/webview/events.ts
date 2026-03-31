import { state } from './state';
import {
  queryEl, regexBtn, caseBtn, wordBtn, groupBtn, replaceBtn, previewBtn,
  replaceRow, replaceAllBtn, tabs, previewHdr,
  sortBtn, includeBtn, includeRow, includeInput,
  bookmarksBtn,
} from './dom';
import { isFileScope, isSymbolScope, isDocScope, isGitScope, isTextScope, isRefsScope, parseQueryInput, triggerSearch, filterFilesLocally } from './search';
import { clearPreview, togglePreview, requestPreview } from './preview';
import { render, navigate, openResult, openResultInSplit, openAllSelected,
         toggleSelectResult, selectAll, copyCurrentPath, refreshGitScope,
         togglePin, isPinnedFile, showToast, renderBookmarkResults } from './render';
import { hideCtxMenu } from './contextMenu';
import { escHtml } from './highlight';

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
const SCOPES = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols', 'git', 'doc', 'refs'];

export function updateReplaceRowVisibility(): void {
  replaceRow.style.display = (isTextScope() && state.replaceMode) ? '' : 'none';
}

export function setScope(scope: string): void {
  if (scope === 'git') { state.gitFiles = null; }
  if (scope === 'doc') { state.symbolResults = []; }
  state.scope = scope;
  state.selected = 0;
  state.multiSelected = new Set();
  state.historyIndex = -1;
  state.symbolKindFilter = '';
  clearPreview();
  vscode.postMessage({ type: 'scopeChanged', scope });
  tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === scope));
  const isFile = isFileScope();
  const isSym  = isSymbolScope();
  const isRefs = isRefsScope();
  regexBtn.disabled   = isFile || isSym || isRefs;
  caseBtn.disabled    = isFile || isSym || isRefs;
  wordBtn.disabled    = isFile || isSym || isRefs;
  groupBtn.disabled   = isFile || isSym || isRefs;
  replaceBtn.disabled = isFile || isSym || isRefs;
  sortBtn.disabled    = isFile || isSym || isRefs;
  updateReplaceRowVisibility();
  queryEl.placeholder = scope === 'files'   ? 'Search files by name...'
                      : scope === 'recent'  ? 'Filter recent files...'
                      : scope === 'symbols' ? 'Search workspace symbols...'
                      : scope === 'doc'     ? 'Filter document symbols...'
                      : scope === 'here'    ? 'query *.ts  — search in current dir...'
                      : scope === 'git'     ? 'Filter changed files...'
                      : scope === 'refs'    ? 'References to symbol at cursor'
                      : 'query *.ts  — search in project...';
  if (state.query || scope === 'recent' || scope === 'git' || scope === 'refs') {
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

function toggleGroup(): void {
  state.groupResults = !state.groupResults;
  groupBtn.classList.toggle('active', state.groupResults);
  showToast(state.groupResults ? 'Grouped by file' : 'Flat list');
  vscode.postMessage({ type: 'setGroupResults', value: state.groupResults });
  render();
}

function toggleReplaceMode(): void {
  state.replaceMode = !state.replaceMode;
  replaceBtn.classList.toggle('active', state.replaceMode);
  updateReplaceRowVisibility();
  if (state.replaceMode) { (document.getElementById('replace-input') as HTMLInputElement).focus(); }
}

const SORT_CYCLE: Array<'default' | 'filename' | 'count'> = ['default', 'filename', 'count'];
const SORT_LABELS: Record<string, string> = { default: 'Sort: default', filename: 'Sort: by filename', count: 'Sort: by match count' };
const SORT_ICONS:  Record<string, string> = { default: '⇅', filename: '↓A', count: '↓#' };

function toggleSort(): void {
  const next = SORT_CYCLE[(SORT_CYCLE.indexOf(state.sortBy) + 1) % SORT_CYCLE.length];
  state.sortBy = next;
  sortBtn.textContent = SORT_ICONS[next];
  sortBtn.dataset.tooltip = SORT_LABELS[next];
  sortBtn.classList.toggle('active', next !== 'default');
  render();
}

function toggleIncludeMode(): void {
  state.includeMode = !state.includeMode;
  includeBtn.classList.toggle('active', state.includeMode);
  includeRow.style.display = state.includeMode ? '' : 'none';
  if (state.includeMode) {
    includeInput.focus();
  } else if (state.includeFilter) {
    state.includeFilter = '';
    includeInput.value = '';
    if (state.query) { triggerSearch(render); }
  }
}

function applyReplaceAll(): void {
  vscode.postMessage({
    type: 'replacePreview',
    query: state.query,
    replacement: (document.getElementById('replace-input') as HTMLInputElement).value,
    useRegex: state.useRegex,
    caseSensitive: state.caseSensitive,
    wholeWord: state.wholeWord,
    globFilter: state.globFilter,
    scope: state.scope,
  });
}

export function renderReplacePreview(files: Array<{ relativePath: string; changesCount: number; lines: Array<{ line: number; before: string; after: string }> }>): void {
  let overlay = document.getElementById('replace-preview-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'replace-preview-overlay';
    overlay.className = 'replace-preview-overlay';
    document.body.appendChild(overlay);
  }
  const totalChanges = files.reduce((s, f) => s + f.changesCount, 0);
  let html = '<div class="rp-header"><span>Replace preview — ' + totalChanges + ' change' + (totalChanges !== 1 ? 's' : '') + ' in ' + files.length + ' file' + (files.length !== 1 ? 's' : '') + '</span></div>';
  html += '<div class="rp-body">';
  for (const f of files) {
    html += '<div class="rp-file">' + escHtml(f.relativePath) + ' <span class="rp-count">' + f.changesCount + '</span></div>';
    for (const l of f.lines) {
      html += '<div class="rp-line rp-before"><span class="rp-lnum">' + l.line + '</span><span class="rp-text rp-del">- ' + escHtml(l.before.trimEnd()) + '</span></div>';
      html += '<div class="rp-line rp-after"><span class="rp-lnum">' + l.line + '</span><span class="rp-text rp-ins">+ ' + escHtml(l.after.trimEnd()) + '</span></div>';
    }
  }
  html += '</div>';
  html += '<div class="rp-footer"><button type="button" id="rp-apply-btn" class="rp-btn rp-btn-apply">Apply</button><button type="button" id="rp-cancel-btn" class="rp-btn rp-btn-cancel">Cancel</button></div>';
  overlay.innerHTML = html;
  overlay.classList.add('visible');

  document.getElementById('rp-apply-btn')!.addEventListener('click', () => {
    overlay!.classList.remove('visible');
    vscode.postMessage({ type: 'replaceAll' });
  });
  document.getElementById('rp-cancel-btn')!.addEventListener('click', () => {
    overlay!.classList.remove('visible');
  });
  overlay.addEventListener('click', e => e.stopPropagation());
}

function toggleBookmarksMode(): void {
  state.bookmarksMode = !state.bookmarksMode;
  state.selected = 0;
  bookmarksBtn.classList.toggle('active', state.bookmarksMode);
  if (state.bookmarksMode) {
    renderBookmarkResults();
  } else {
    render();
  }
}

function saveCurrentSearch(): void {
  if (!state.query.trim()) { return; }
  vscode.postMessage({ type: 'saveSearch', query: state.query, scope: state.scope });
  showToast('Bookmarked.');
}

export function initEvents(): void {
  queryEl.addEventListener('input', () => {
    if (state.bookmarksMode) {
      state.bookmarksMode = false;
      bookmarksBtn.classList.remove('active');
    }
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
    } else if (e.altKey && e.key === 'p') {
      e.preventDefault(); togglePin();
    } else if (e.altKey && e.key === 'l') {
      e.preventDefault(); toggleGroup();
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
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (state.replaceMode) {
        (document.getElementById('replace-input') as HTMLInputElement).focus();
      } else {
        setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]);
      }
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
    } else if (e.altKey && e.key === 'i') {
      e.preventDefault(); toggleIncludeMode();
    } else if (e.altKey && e.key === 's') {
      e.preventDefault(); toggleSort();
    } else if (e.altKey && e.key === 'b') {
      e.preventDefault(); saveCurrentSearch();
    } else if (matchKey(e, KB.open) && state.bookmarksMode) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('spyglass:applyBookmark', { detail: { index: state.selected } }));
    } else if (matchKey(e, KB.close)) {
      if (state.bookmarksMode) { e.preventDefault(); toggleBookmarksMode(); }
      else if (state.includeMode) { e.preventDefault(); toggleIncludeMode(); }
      else if (state.replaceMode) { e.preventDefault(); toggleReplaceMode(); }
      else { vscode.postMessage({ type: 'close' }); }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (document.activeElement === queryEl) { return; }
    if (state.bookmarksMode) {
      if (matchKey(e, KB.navigateDown)) { e.preventDefault(); navigate(1); }
      else if (matchKey(e, KB.navigateUp)) { e.preventDefault(); navigate(-1); }
      else if (matchKey(e, KB.open)) { e.preventDefault(); document.dispatchEvent(new CustomEvent('spyglass:applyBookmark', { detail: { index: state.selected } })); }
      else if (matchKey(e, KB.close)) { e.preventDefault(); toggleBookmarksMode(); }
      return;
    }
    if (matchKey(e, KB.navigateDown))         { e.preventDefault(); navigate(1); }
    else if (matchKey(e, KB.navigateUp))      { e.preventDefault(); navigate(-1); }
    else if (e.altKey && e.key === 'y')        { e.preventDefault(); copyCurrentPath(); }
    else if (e.key === 'F5' && isGitScope())   { e.preventDefault(); refreshGitScope(render); }
    else if (e.altKey && e.key === 'p')        { e.preventDefault(); togglePin(); }
    else if (e.altKey && e.key === 'l')        { e.preventDefault(); toggleGroup(); }
    else if (e.altKey && e.key === 'i')        { e.preventDefault(); toggleIncludeMode(); }
    else if (e.altKey && e.key === 's')        { e.preventDefault(); toggleSort(); }
    else if (e.altKey && e.key === 'b')        { e.preventDefault(); saveCurrentSearch(); }
    else if (e.ctrlKey && e.key === ' ')       { e.preventDefault(); toggleSelectResult(state.selected); }
    else if (e.shiftKey && e.key === 'Enter')  { e.preventDefault(); openAllSelected(); }
    else if (e.ctrlKey && e.key === 'a')       { e.preventDefault(); selectAll(); }
    else if (e.ctrlKey && e.key === 'Enter')   { e.preventDefault(); openResultInSplit(state.selected); }
    else if (matchKey(e, KB.open))             { e.preventDefault(); openResult(state.selected); }
    else if (matchKey(e, KB.togglePreview))    { e.preventDefault(); togglePreview(); }
    else if (matchKey(e, KB.close)) {
      if (state.includeMode) { toggleIncludeMode(); }
      else if (state.replaceMode) { toggleReplaceMode(); }
      else { vscode.postMessage({ type: 'close' }); }
    }
    else if (e.key === 'Tab')                  { e.preventDefault(); setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]); }
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope!)));

  regexBtn.addEventListener('click', toggleRegex);
  caseBtn.addEventListener('click', toggleCase);
  wordBtn.addEventListener('click', toggleWord);
  groupBtn.addEventListener('click', toggleGroup);
  sortBtn.addEventListener('click', toggleSort);
  replaceBtn.addEventListener('click', toggleReplaceMode);
  includeBtn.addEventListener('click', toggleIncludeMode);
  previewBtn.addEventListener('click', togglePreview);
  replaceAllBtn.addEventListener('click', applyReplaceAll);

  includeInput.addEventListener('input', () => {
    state.includeFilter = includeInput.value.trim();
    if (state.query || isDocScope()) { triggerSearch(render); }
  });

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
    const rpOverlay = document.getElementById('replace-preview-overlay');
    if (rpOverlay) { rpOverlay.classList.remove('visible'); }
    hideCtxMenu();
  });

  document.getElementById('shortcuts-overlay')!.addEventListener('click', e => e.stopPropagation());

  document.getElementById('help-btn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    const overlay = document.getElementById('shortcuts-overlay')!;
    overlay.classList.toggle('visible');
    (e.currentTarget as HTMLElement).classList.toggle('active', overlay.classList.contains('visible'));
  });

  bookmarksBtn.addEventListener('click', () => toggleBookmarksMode());

  document.addEventListener('spyglass:applyBookmark', ((e: CustomEvent) => {
    const idx = e.detail.index as number;
    const s = state.savedSearches[idx];
    if (!s) { return; }
    state.bookmarksMode = false;
    bookmarksBtn.classList.remove('active');
    setScope(s.scope);
    queryEl.value = s.query;
    state.query = s.query;
    triggerSearch(render);
  }) as EventListener);

  document.addEventListener('spyglass:removeBookmark', ((e: CustomEvent) => {
    vscode.postMessage({ type: 'removeSavedSearch', index: e.detail.index as number });
  }) as EventListener);
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
        if (data.refsSymbol !== undefined) { state.refsSymbol = data.refsSymbol as string; }
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
          const n = state.gitFiles!.length;
          showToast(n === 0 ? 'Working tree clean' : n + ' changed file' + (n !== 1 ? 's' : ''));
        }
        break;
      case 'fileResults':
        state.searching = false;
        state.fileResults = data.results;
        state.selected = 0;
        render();
        break;
      case 'symbolResults':
      case 'docResults':
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
        showToast('Replaced in ' + data.fileCount + ' file' + (data.fileCount !== 1 ? 's' : ''));
        triggerSearch(render);
        break;
      case 'savedSearches':
        state.savedSearches = data.searches;
        if (state.bookmarksMode) { renderBookmarkResults(); }
        break;
      case 'replacePreviewData':
        renderReplacePreview(data.files);
        break;
    }
  });
}
