import { state, saveButtonPrefs } from './state';
import { highlightLines, reinitHighlighter } from './shiki';
import {
  queryEl, regexBtn, caseBtn, wordBtn, groupBtn, replaceBtn, previewBtn,
  replaceRow, replaceAllBtn, tabs, previewHdr,
  sortBtn, includeBtn, includeRow, includeInput,
  bookmarksBtn, moreBtn, moreMenu, ignoredBtn, multilineBtn, tabsBar, tabsWrap, previewCont,
} from './dom';
import { isFileScope, isSymbolScope, isDocScope, isGitScope, isTextScope, isRefsScope, parseQueryInput, triggerSearch, filterFilesLocally, visibleSymbols, parseFileQuery, isGotoLine, isCommandScope, filterCommands } from './search';
import { clearPreview, togglePreview, requestPreview } from './preview';
import { render, navigate, navigateTo, pageSize, rememberSession, openResult, openResultInSplit, openAllSelected,
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
  return scope === 'recent' || scope === 'git' || scope === 'refs' || scope === 'doc' || scope === 'commands';
}

export function updateReplaceRowVisibility(): void {
  replaceRow.style.display = (isTextScope() && state.replaceMode) ? '' : 'none';
}

export function setScope(scope: string, opts: { remember?: boolean } = {}): void {
  if (scope === 'git') { state.gitFiles = null; }
  if (scope === 'doc') { state.symbolResults = []; }
  state.prefixReturnScope = null; // a scope chosen any other way ends the `@` round trip
  state.scope = scope;
  state.selected = 0;
  state.multiSelected = new Set();
  state.historyIndex = -1;
  state.symbolKindFilter = '';
  clearPreview();
  vscode.postMessage(opts.remember === false ? { type: 'scopeChanged', scope, remember: false } : { type: 'scopeChanged', scope });
  if (scope === 'recent') { vscode.postMessage({ type: 'refreshRecent' }); } // files opened since the page was built
  applyScopeChrome();
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

/**
 * Tab / Shift+Tab: the next / previous scope. Commands is not in the cycle; from it, the cycle goes
 * on from the list it was entered from (or Files).
 */
function cycleScope(dir: 1 | -1): void {
  const from = SCOPES.includes(state.scope) ? state.scope : (state.prefixReturnScope ?? 'files');
  setScope(SCOPES[(SCOPES.indexOf(from) + dir + SCOPES.length) % SCOPES.length]);
}

/** Shows the tabs, toolbar buttons and placeholder that belong to the current scope. */
export function applyScopeChrome(): void {
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.scope === state.scope);
    if (t.dataset.scope === 'commands') { t.hidden = state.scope !== 'commands'; } // a tab only while in use
  });
  revealActiveTab();
  const isFile = isFileScope();
  const isSym  = isSymbolScope();
  const isRefs = isRefsScope();
  // Text search options do nothing in the file, symbol and reference lists: hide them there
  // rather than show them greyed out, so those lists look as plain as Quick Open.
  const textOnly = isFile || isSym || isRefs || isCommandScope();
  for (const btn of [regexBtn, caseBtn, wordBtn, groupBtn, replaceBtn, multilineBtn, sortBtn]) {
    btn.disabled = textOnly;
    btn.hidden = textOnly;
  }
  replaceBtn.disabled = textOnly || state.multiline;
  updateReplaceRowVisibility();
  queryEl.placeholder = state.scope === 'files'   ? S.searchFilesByName
                      : state.scope === 'recent'  ? S.filterRecentFiles
                      : state.scope === 'symbols' ? S.searchWorkspaceSymbols
                      : state.scope === 'doc'     ? S.filterDocumentSymbols
                      : state.scope === 'here'    ? S.searchInCurrentDir
                      : state.scope === 'git'     ? S.filterChangedFiles
                      : state.scope === 'refs'    ? S.refsToSymbol
                      : state.scope === 'commands' ? S.runCommandPlaceholder
                      : S.searchInProject;
}

/** Marks the edges of the tab bar where tabs are scrolled out of sight. */
export function updateTabOverflow(): void {
  const { scrollLeft, scrollWidth, clientWidth } = tabsBar;
  tabsWrap.classList.toggle('more-left', scrollLeft > 1);
  tabsWrap.classList.toggle('more-right', scrollLeft + clientWidth < scrollWidth - 1);
}

/** Scrolls the active tab into view, e.g. after Tab moved to one that was out of sight. */
function revealActiveTab(): void {
  const active = tabsBar.querySelector<HTMLElement>('.tab.active');
  if (!active) { return; }
  // the fades cover ~28px at each edge, so keep the tab clear of them
  const pad = 28;
  if (active.offsetLeft - pad < tabsBar.scrollLeft) {
    tabsBar.scrollLeft = Math.max(0, active.offsetLeft - pad);
  } else if (active.offsetLeft + active.offsetWidth + pad > tabsBar.scrollLeft + tabsBar.clientWidth) {
    tabsBar.scrollLeft = active.offsetLeft + active.offsetWidth + pad - tabsBar.clientWidth;
  }
  updateTabOverflow();
}

/** Applies the text in the query box: updates the parsed query and runs the search. */
export function applyQueryInput(): void {
  if (state.bookmarksMode) {
    state.bookmarksMode = false;
    bookmarksBtn.classList.remove('active');
  }
  const raw = queryEl.value;
  // Like Quick Open: a leading `@` in a file list shows the current file's symbols (Doc), and
  // deleting the `@` goes back to the list it came from.
  // In the same way a leading `>` lists the commands.
  const prefixScope: Record<string, string> = { '@': 'doc', '>': 'commands' };
  const target = prefixScope[raw.charAt(0)];
  if (state.prefixReturnScope && target !== state.scope && (state.scope === 'doc' || state.scope === 'commands')) {
    setScope(state.prefixReturnScope, { remember: false }); // the prefix was deleted (or swapped for the other one)
  }
  if ((state.scope === 'files' || state.scope === 'recent') && target) {
    const from = state.scope;
    setScope(target, { remember: false });
    state.prefixReturnScope = from;
  }

  const { query, globFilter } = parseQueryInput(raw);
  state.fileLine = null;
  state.fileColumn = null;
  if (isDocScope()) {
    state.query = query.startsWith('@') ? query.slice(1) : query;
  } else if (isCommandScope()) {
    state.query = (query.startsWith('>') ? query.slice(1) : query).trim();
  } else if (isFileScope()) {
    const parsed = parseFileQuery(query); // `util.ts:42:7`
    state.query = parsed.query;
    state.fileLine = parsed.line ?? null;
    state.fileColumn = parsed.column ?? null;
  } else {
    state.query = query;
  }
  if (globFilter !== state.globFilter) { state.globFilter = globFilter; }
  state.selected = 0;
  triggerSearch(render);
  rememberSession();
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

/** Names the current sort order in its menu item, marked when it is not the default. */
export function showSort(): void {
  sortBtn.querySelector('.mi-label')!.textContent = SORT_LABELS[state.sortBy];
  sortBtn.classList.toggle('active', state.sortBy !== 'default');
}

function toggleSort(): void {
  state.sortBy = SORT_CYCLE[(SORT_CYCLE.indexOf(state.sortBy) + 1) % SORT_CYCLE.length];
  showSort();
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

// ── The ⋯ menu ──────────────────────────────────────────────────────────────────────────────
// Options used less often, each with its name, shortcut and a check mark when on. It stays open
// while options are switched, and closes on Escape, a click outside or ⋯.

export function setMoreMenu(open: boolean): void {
  moreMenu.hidden = !open;
  moreBtn.classList.toggle('active', open);
  moreBtn.setAttribute('aria-expanded', String(open));
}

/** Menu items show the on/off state of the button they stand for (the toolbar's own, or their own `active` class). */
function syncMenuChecks(): void {
  const twins: Record<string, HTMLElement> = { regex: regexBtn, case: caseBtn, word: wordBtn, replace: replaceBtn };
  moreMenu.querySelectorAll<HTMLElement>('.menu-item').forEach(item => {
    const twin = item.dataset.action ? twins[item.dataset.action] : item;
    // only touch what changed: these elements are observed, so every write would call this again
    const checked = String(twin.classList.contains('active'));
    if (item.getAttribute('role') === 'menuitemcheckbox' && item.getAttribute('aria-checked') !== checked) {
      item.setAttribute('aria-checked', checked);
    }
    if (item.dataset.action && item.hidden !== twin.hidden) { item.hidden = twin.hidden; } // e.g. no regex in the file lists
  });
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

/**
 * Keys that move through the results the same way wherever the focus is (query box or list):
 * Ctrl+J/N and Ctrl+K/P (Telescope, Emacs), PageUp/PageDown, Ctrl+Home/End, Ctrl+D/U to scroll
 * the preview, and Shift+Tab for the previous scope. Returns whether the key was handled.
 */
function handleMoveKeys(e: KeyboardEvent): boolean {
  const ctrlOnly = e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let act: (() => void) | undefined;
  if (ctrlOnly && (key === 'j' || key === 'n'))      { act = () => navigate(1); }
  else if (ctrlOnly && (key === 'k' || key === 'p')) { act = () => navigate(-1); }
  else if (e.key === 'PageDown' && !e.ctrlKey)      { act = () => navigate(pageSize()); }
  else if (e.key === 'PageUp' && !e.ctrlKey)        { act = () => navigate(-pageSize()); }
  else if (ctrlOnly && e.key === 'End')             { act = () => navigateTo(Infinity); }
  else if (ctrlOnly && e.key === 'Home')            { act = () => navigateTo(0); }
  else if (ctrlOnly && key === 'd')                 { act = () => previewCont.scrollBy({ top: previewCont.clientHeight / 2 }); }
  else if (ctrlOnly && key === 'u')                 { act = () => previewCont.scrollBy({ top: -previewCont.clientHeight / 2 }); }
  else if (e.shiftKey && e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
    act = () => cycleScope(-1);
  }
  if (!act) { return false; }
  e.preventDefault();
  act();
  return true;
}

export function initEvents(): void {
  queryEl.addEventListener('input', () => {
    state.historyIndex = -1; // typing ends history browsing
    applyQueryInput();
  });

  queryEl.addEventListener('keydown', (e) => {
    if (handleMoveKeys(e)) { return; }
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
        cycleScope(1);
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
    if (document.activeElement instanceof HTMLInputElement) { return; } // replace / include boxes
    if (handleMoveKeys(e)) { return; }
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
    else if (e.key === 'Tab')                  { e.preventDefault(); cycleScope(1); }
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope!)));
  tabsBar.addEventListener('scroll', updateTabOverflow, { passive: true });
  window.addEventListener('resize', updateTabOverflow);
  // a mouse wheel scrolls the tab bar sideways (it has no scrollbar)
  tabsBar.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabsBar.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  updateTabOverflow();

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
        const r = visibleSymbols()[state.selected];
        if (r) { absFile = r.file; }
      } else {
        const r = state.results[state.selected];
        if (r) { absFile = r.file; }
      }
      if (absFile) { vscode.postMessage({ type: 'revealFile', file: absFile }); }
    }
  });

  document.addEventListener('click', () => {
    setMoreMenu(false);
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
    setMoreMenu(false);
    if (!document.body.classList.contains('sidebar-mode')) {
      // Sidebar mode has its own corner-anchored positioning in CSS
      // (body.sidebar-mode .shortcuts-overlay); inline styles would win over it.
      const rect = moreBtn.getBoundingClientRect();
      overlay.style.top = (rect.bottom + 6) + 'px';
      overlay.style.left = 'auto';
      overlay.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
      overlay.style.transform = 'none';
    }
    overlay.classList.toggle('visible');
    btn.classList.toggle('active', overlay.classList.contains('visible'));
  });

  bookmarksBtn.addEventListener('click', () => { setMoreMenu(false); toggleBookmarksMode(); });
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); setMoreMenu(moreMenu.hidden); });
  moreMenu.addEventListener('click', e => e.stopPropagation());
  // the narrow-only items do what the toolbar buttons they replace do
  // (called directly: a click on the hidden button would bubble to the document and close the menu)
  const actions: Record<string, () => void> = { regex: toggleRegex, case: toggleCase, word: toggleWord, replace: toggleReplaceMode };
  moreMenu.querySelectorAll<HTMLElement>('.menu-item[data-action]').forEach(item => {
    item.addEventListener('click', () => actions[item.dataset.action!]());
  });
  // keep the check marks in step with the buttons, however they were switched (click, Alt+key, restore)
  const checkObserver = new MutationObserver(syncMenuChecks);
  for (const el of [regexBtn, caseBtn, wordBtn, replaceBtn, ...Array.from(moreMenu.querySelectorAll<HTMLElement>('.menu-item'))]) {
    checkObserver.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }
  syncMenuChecks();
  // Escape closes the menu first, before anything else it would do (close the popup, leave a mode)
  document.addEventListener('keydown', e => {
    if (!moreMenu.hidden && matchKey(e, KB.close)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setMoreMenu(false);
    }
  }, true);

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
      // Batches of one search: keep the selection the user may have moved meanwhile (a new search
      // starts at the top, see triggerSearch), only keeping it inside the list.
      case 'resultsChunk':
        state.results = data.results;
        state.selected = Math.min(state.selected, Math.max(0, state.results.length - 1));
        render();
        break;
      case 'results':
        state.searching = false;
        state.results = data.results;
        state.selected = Math.min(state.selected, Math.max(0, state.results.length - 1));
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
      case 'commands':
        state.commandEntries = data.entries;
        state.recentCommands = data.recent ?? [];
        if (isCommandScope()) { filterCommands(); render(); }
        break;
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
      case 'activeFile':
        // the answer to a bare `:line`, if that is still what is typed
        if (!isGotoLine()) { break; }
        state.searching = false;
        state.selected = 0;
        state.fileResults = data.file ? [{ file: data.file, relativePath: data.relativePath, matchPositions: [] }] : [];
        render();
        break;
      case 'previewContent': {
        // a file preview asked for just before switching to Commands: the pane describes commands now
        if (isCommandScope()) { break; }
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
