import { state, saveButtonPrefs } from './state';
import { highlightLines, reinitHighlighter } from './shiki';
import {
  queryEl, regexBtn, caseBtn, wordBtn, groupBtn, replaceBtn, previewBtn,
  replaceRow, replaceAllBtn, tabs, previewHdr,
  sortBtn, includeBtn, includeRow, includeInput,
  bookmarksBtn, moreBtn, secondaryToolbar, ignoredBtn, multilineBtn,
} from './dom';
import { isFileScope, isSymbolScope, isDocScope, isGitScope, isTextScope, isRefsScope, parseQueryInput, triggerSearch, filterFilesLocally } from './search';
import { clearPreview, togglePreview, requestPreview } from './preview';
import { render, navigate, openResult, openResultInSplit, openAllSelected,
         toggleSelectResult, selectAll, copyCurrentPath, refreshGitScope,
         togglePin, isPinnedFile, showToast, renderBookmarkResults } from './render';
import { hideCtxMenu } from './contextMenu';
import { escHtml } from './highlight';

import { vscode } from './vscode';

const S = (window as any).__spyglass.STRINGS;

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

// Bumped for every previewContent message, so only the newest preview is rendered.
let previewSeq = 0;

/** Scopes whose list is worth showing as soon as they are entered, before anything is typed. */
export function scopeLoadsWithoutQuery(scope: string): boolean {
  return scope === 'recent' || scope === 'git' || scope === 'refs' || scope === 'doc';
}

export function updateReplaceRowVisibility(): void {
  replaceRow.style.display = (isTextScope() && state.replaceMode) ? '' : 'none';
}

export function setScope(scope: string, opts: { remember?: boolean } = {}): void {
  if (scope === 'git') { state.gitFiles = null; }
  if (scope === 'doc') { state.symbolResults = []; }
  state.scope = scope;
  state.selected = 0;
  state.multiSelected = new Set();
  state.historyIndex = -1;
  state.symbolKindFilter = '';
  clearPreview();
  vscode.postMessage(opts.remember === false ? { type: 'scopeChanged', scope, remember: false } : { type: 'scopeChanged', scope });
  if (scope === 'recent') { vscode.postMessage({ type: 'refreshRecent' }); } // files opened since the page was built
  tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === scope));
  const isFile = isFileScope();
  const isSym  = isSymbolScope();
  const isRefs = isRefsScope();
  regexBtn.disabled   = isFile || isSym || isRefs;
  caseBtn.disabled    = isFile || isSym || isRefs;
  wordBtn.disabled    = isFile || isSym || isRefs;
  groupBtn.disabled   = isFile || isSym || isRefs;
  replaceBtn.disabled = isFile || isSym || isRefs || state.multiline;
  multilineBtn.disabled = isFile || isSym || isRefs;
  sortBtn.disabled    = isFile || isSym || isRefs;
  updateReplaceRowVisibility();
  queryEl.placeholder = scope === 'files'   ? S.searchFilesByName
                      : scope === 'recent'  ? S.filterRecentFiles
                      : scope === 'symbols' ? S.searchWorkspaceSymbols
                      : scope === 'doc'     ? S.filterDocumentSymbols
                      : scope === 'here'    ? S.searchInCurrentDir
                      : scope === 'git'     ? S.filterChangedFiles
                      : scope === 'refs'    ? S.refsToSymbol
                      : S.searchInProject;
  if (state.query || scopeLoadsWithoutQuery(scope)) {
    triggerSearch(render);
  } else {
    state.results = [];
    state.fileResults = [];
    state.symbolResults = [];
    state.searching = false;
    render();
  }
}

/** Applies the text in the query box: updates the parsed query and runs the search. */
function applyQueryInput(): void {
  if (state.bookmarksMode) {
    state.bookmarksMode = false;
    bookmarksBtn.classList.remove('active');
  }
  const { query, globFilter } = parseQueryInput(queryEl.value);
  state.query = query;
  if (globFilter !== state.globFilter) { state.globFilter = globFilter; }
  state.selected = 0;
  triggerSearch(render);
}

// dir -1 (Ctrl+Up) goes to an older query, +1 (Ctrl+Down) back towards the newest and finally to
// what was typed before browsing started (the "draft", historyIndex -1). searchHistory[0] is the
// newest entry. Entries identical to the draft are skipped: typing a query records it, so without
// this the first Ctrl+Up would just show the text that is already there.
function navigateHistory(dir: number): void {
  const history = state.searchHistory;
  if (history.length === 0) { return; }
  if (state.historyIndex === -1) {
    if (dir > 0) { return; } // already on the typed text: nothing newer to go to
    state.historyPreQuery = queryEl.value;
  }
  const draft = state.historyPreQuery;
  const step = -dir;
  let next = state.historyIndex + step;
  while (next >= 0 && next < history.length && history[next] === draft) { next += step; }
  if (next >= history.length) { return; } // already at the oldest entry
  state.historyIndex = Math.max(-1, next);
  queryEl.value = state.historyIndex >= 0 ? history[state.historyIndex] : draft;
  applyQueryInput();
}

function toggleRegex(): void {
  state.useRegex = !state.useRegex;
  regexBtn.classList.toggle('active', state.useRegex);
  saveButtonPrefs();
  if (state.query) { triggerSearch(render); }
}

function toggleCase(): void {
  state.caseSensitive = !state.caseSensitive;
  caseBtn.classList.toggle('active', state.caseSensitive);
  saveButtonPrefs();
  if (state.query) { triggerSearch(render); }
}

function toggleWord(): void {
  state.wholeWord = !state.wholeWord;
  wordBtn.classList.toggle('active', state.wholeWord);
  saveButtonPrefs();
  if (state.query) { triggerSearch(render); }
}

function toggleGroup(): void {
  state.groupResults = !state.groupResults;
  groupBtn.classList.toggle('active', state.groupResults);
  showToast(state.groupResults ? S.groupedByFile : S.flatList);
  vscode.postMessage({ type: 'setGroupResults', value: state.groupResults });
  render();
}

function toggleReplaceMode(): void {
  if (state.multiline && !state.replaceMode) { showToast(S.replaceNotInMultiline); return; }
  state.replaceMode = !state.replaceMode;
  replaceBtn.classList.toggle('active', state.replaceMode);
  saveButtonPrefs();
  updateReplaceRowVisibility();
  if (state.replaceMode) { (document.getElementById('replace-input') as HTMLInputElement).focus(); }
}

const SORT_CYCLE: Array<'default' | 'filename' | 'count'> = ['default', 'filename', 'count'];
const SORT_LABELS: Record<string, string> = { default: S.sortDefault, filename: S.sortFilename, count: S.sortCount };
const SORT_ICONS:  Record<string, string> = { default: '⇅', filename: '↓A', count: '↓#' };

function toggleSort(): void {
  const next = SORT_CYCLE[(SORT_CYCLE.indexOf(state.sortBy) + 1) % SORT_CYCLE.length];
  state.sortBy = next;
  sortBtn.textContent = SORT_ICONS[next];
  sortBtn.dataset.tooltip = SORT_LABELS[next];
  sortBtn.classList.toggle('active', next !== 'default');
  saveButtonPrefs();
  render();
}

function toggleIncludeMode(): void {
  state.includeMode = !state.includeMode;
  includeBtn.classList.toggle('active', state.includeMode);
  saveButtonPrefs();
  includeRow.style.display = state.includeMode ? '' : 'none';
  if (state.includeMode) {
    includeInput.focus();
  } else if (state.includeFilter) {
    state.includeFilter = '';
    includeInput.value = '';
    if (state.query) { triggerSearch(render); }
  }
}

/** Search hidden files, ignored files and the spyglass.exclude folders too (never .git). */
function toggleIgnored(): void {
  state.includeIgnored = !state.includeIgnored;
  ignoredBtn.classList.toggle('active', state.includeIgnored);
  document.body.classList.toggle('include-ignored', state.includeIgnored); // marks the collapsed toolbar's ⋯ button
  saveButtonPrefs();
  state.fileList = null; // the listed files depend on it
  if (state.query || state.scope === 'files') { triggerSearch(render); }
}

/** Let a pattern match across lines (always as a regular expression). Replace is unavailable while it is on. */
function toggleMultiline(): void {
  if (!state.multiline && state.replaceMode) { toggleReplaceMode(); }
  state.multiline = !state.multiline;
  multilineBtn.classList.toggle('active', state.multiline);
  document.body.classList.toggle('multiline', state.multiline); // marks the collapsed toolbar's ⋯ button
  replaceBtn.disabled = isFileScope() || isSymbolScope() || isRefsScope() || state.multiline;
  saveButtonPrefs();
  if (state.query) { triggerSearch(render); }
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
    includeIgnored: state.includeIgnored,
    multiline: state.multiline,
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

function toggleSecondaryToolbar(): void {
  const visible = secondaryToolbar.style.display === 'flex';
  secondaryToolbar.style.display = visible ? 'none' : 'flex';
  moreBtn.classList.toggle('active', !visible);
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
    state.historyIndex = -1; // typing ends history browsing
    applyQueryInput();
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
    } else if (e.ctrlKey && e.key === ' ') {
      e.preventDefault(); toggleSelectResult(state.selected);
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
    } else if (e.altKey && e.key === 'm') {
      e.preventDefault(); toggleMultiline();
    } else if (e.altKey && e.key === 'h') {
      e.preventDefault(); toggleIgnored();
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
    else if (e.altKey && e.key === 'm')        { e.preventDefault(); toggleMultiline(); }
    else if (e.altKey && e.key === 'h')        { e.preventDefault(); toggleIgnored(); }
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
  ignoredBtn.addEventListener('click', toggleIgnored);
  multilineBtn.addEventListener('click', toggleMultiline);
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
    const btn = e.currentTarget as HTMLElement;
    if (!document.body.classList.contains('sidebar-mode')) {
      // Sidebar mode has its own corner-anchored positioning in CSS
      // (body.sidebar-mode .shortcuts-overlay); inline styles would win over it.
      const rect = btn.getBoundingClientRect();
      overlay.style.top = (rect.bottom + 6) + 'px';
      overlay.style.left = 'auto';
      overlay.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
      overlay.style.transform = 'none';
    }
    overlay.classList.toggle('visible');
    btn.classList.toggle('active', overlay.classList.contains('visible'));
  });

  bookmarksBtn.addEventListener('click', () => toggleBookmarksMode());
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSecondaryToolbar(); });

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
      case 'searchHistory':
        state.searchHistory = data.history as string[];
        break;
      case 'recentFiles':
        state.recentFiles = data.files;
        if (state.scope === 'recent') {
          filterFilesLocally(state.recentFiles, state.query);
          render();
        }
        break;
      case 'setScope':
        if (SCOPES.includes(data.scope)) {
          setScope(data.scope, { remember: false });
          queryEl.focus();
        }
        break;
      case 'fileList':
        if (data.includeIgnored !== undefined && data.includeIgnored !== state.includeIgnored) { break; }
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
      case 'themeChanged':
        reinitHighlighter(data.theme).then(() => {
          if (state.currentPreviewFile) { requestPreview(); }
        });
        break;
      case 'previewContent': {
        const { content, currentLine, relativePath, ext, changedLines } = data;
        const query = (isFileScope() || isSymbolScope()) ? '' : state.query;
        // Highlighting can wait for a grammar to load; by then a newer preview may have arrived.
        const seq = ++previewSeq;
        highlightLines(content, ext).then(lines => {
          if (seq !== previewSeq) { return; }
          (window as any).__renderPreview(lines, currentLine, relativePath, ext, changedLines, query, state.useRegex);
        });
        break;
      }
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
