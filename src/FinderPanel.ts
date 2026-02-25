import * as vscode from 'vscode';
import { searchWithRipgrep, isRipgrepAvailable } from './ripgrep';
import { SearchResult, Scope } from './types';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class FinderPanel {
  public static currentPanel: FinderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _scope: Scope;

  public static async createOrShow(context: vscode.ExtensionContext): Promise<void> {
    if (FinderPanel.currentPanel) {
      FinderPanel.currentPanel._panel.reveal();
      FinderPanel.currentPanel._post({ type: 'focus' });
      return;
    }

    const rgOk = await isRipgrepAvailable();
    if (!rgOk) {
      vscode.window.showErrorMessage(
        'Finder: ripgrep (rg) not found. Install it: https://github.com/BurntSushi/ripgrep'
      );
      return;
    }

    const config = vscode.workspace.getConfiguration('finder');
    const defaultScope = config.get<Scope>('defaultScope', 'project');

    const panel = vscode.window.createWebviewPanel(
      'finder',
      'Finder',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, localResourceRoots: [] }
    );

    FinderPanel.currentPanel = new FinderPanel(panel, defaultScope, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    defaultScope: Scope,
    _context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._scope = defaultScope;
    this._panel.webview.html = this._buildHtml(defaultScope);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'search':
          this._scope = msg.scope as Scope;
          await this._runSearch(msg.query as string, msg.useRegex as boolean);
          break;
        case 'open':
          await this._openFile(msg.file as string, msg.line as number);
          break;
        case 'close':
          this.dispose();
          break;
      }
    }, null, this._disposables);
  }

  private _post(msg: object): void {
    this._panel.webview.postMessage(msg);
  }

  private async _runSearch(query: string, useRegex: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('finder');
    const maxResults = config.get<number>('maxResults', 200);

    if (!query.trim()) {
      this._post({ type: 'results', results: [], query, took: 0 });
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      this._post({ type: 'error', message: 'No workspace folder open.' });
      return;
    }

    const cwd = folders[0].uri.fsPath;
    let files: string[] | undefined;

    if (this._scope === 'openFiles') {
      files = vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .map(t => (t.input as { uri?: vscode.Uri })?.uri?.fsPath)
        .filter((f): f is string => typeof f === 'string');
    }

    this._post({ type: 'searching' });

    const start = Date.now();
    try {
      const results = await searchWithRipgrep(query, cwd, useRegex, files);
      this._post({
        type: 'results',
        results: results.slice(0, maxResults),
        query,
        took: Date.now() - start,
      });
    } catch {
      this._post({ type: 'error', message: 'Search failed.' });
    }
  }

  private async _openFile(filePath: string, line: number): Promise<void> {
    this.dispose();
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch {
      vscode.window.showErrorMessage(`Finder: Could not open file ${filePath}`);
    }
  }

  public dispose(): void {
    FinderPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  private _buildHtml(defaultScope: Scope): string {
    const nonce = getNonce();
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Finder</title>
<style nonce="${nonce}">
  :root {
    --base:     #1e1e2e;
    --mantle:   #181825;
    --crust:    #11111b;
    --surface0: #313244;
    --surface1: #45475a;
    --surface2: #585b70;
    --overlay0: #6c7086;
    --overlay1: #7f849c;
    --text:     #cdd6f4;
    --subtext0: #a6adc8;
    --subtext1: #bac2de;
    --blue:     #89b4fa;
    --lavender: #b4befe;
    --green:    #a6e3a1;
    --yellow:   #f9e2af;
    --peach:    #fab387;
    --red:      #f38ba8;
    --mauve:    #cba6f7;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--base);
    color: var(--text);
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 13px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 12vh;
    overflow: hidden;
  }

  .finder {
    width: min(720px, 92vw);
    background: var(--mantle);
    border: 1px solid var(--surface1);
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    max-height: 70vh;
    overflow: hidden;
  }

  /* ── Search bar ── */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--surface0);
  }

  .search-icon {
    color: var(--overlay1);
    font-size: 15px;
    flex-shrink: 0;
  }

  #query {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 15px;
    caret-color: var(--blue);
  }

  #query::placeholder { color: var(--overlay0); }

  .regex-btn {
    background: transparent;
    border: 1px solid var(--surface1);
    border-radius: 6px;
    color: var(--overlay1);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .regex-btn:hover { border-color: var(--blue); color: var(--blue); }
  .regex-btn.active { background: var(--blue); border-color: var(--blue); color: var(--mantle); font-weight: 600; }

  /* ── Tabs ── */
  .tabs {
    display: flex;
    gap: 2px;
    padding: 8px 16px 0;
    border-bottom: 1px solid var(--surface0);
  }

  .tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--overlay1);
    font-family: inherit;
    font-size: 12px;
    padding: 4px 10px 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover { color: var(--subtext1); }
  .tab.active { color: var(--blue); border-bottom-color: var(--blue); }

  /* ── Results ── */
  .results-wrap {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface1) transparent;
  }

  .results-wrap::-webkit-scrollbar { width: 6px; }
  .results-wrap::-webkit-scrollbar-thumb { background: var(--surface1); border-radius: 3px; }

  .state-msg {
    padding: 32px 20px;
    text-align: center;
    color: var(--overlay0);
    font-size: 13px;
  }

  .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid var(--surface1);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .result {
    padding: 8px 16px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: background 0.1s;
  }

  .result:hover { background: var(--surface0); }

  .result.selected {
    background: var(--surface0);
    border-left-color: var(--blue);
  }

  .result-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 3px;
  }

  .result-file {
    color: var(--blue);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .result-line {
    color: var(--overlay0);
    font-size: 11px;
    flex-shrink: 0;
  }

  .result-text {
    color: var(--subtext0);
    font-size: 12px;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-text mark {
    background: transparent;
    color: var(--yellow);
    font-weight: 600;
  }

  /* ── Footer ── */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-top: 1px solid var(--surface0);
    color: var(--overlay0);
    font-size: 11px;
  }

  .kbd-group { display: flex; gap: 12px; }

  kbd {
    background: var(--surface0);
    border: 1px solid var(--surface1);
    border-radius: 4px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 10px;
    color: var(--subtext0);
  }
</style>
</head>
<body>

<div class="finder">
  <div class="search-bar">
    <span class="search-icon">⌕</span>
    <input id="query" type="text" placeholder="Search in files..." autocomplete="off" spellcheck="false">
    <button class="regex-btn" id="regex-btn" title="Toggle regex (Ctrl+R)">.*</button>
  </div>

  <div class="tabs">
    <button class="tab ${defaultScope === 'project' ? 'active' : ''}" data-scope="project">Project</button>
    <button class="tab ${defaultScope === 'openFiles' ? 'active' : ''}" data-scope="openFiles">Open Files</button>
  </div>

  <div class="results-wrap" id="results-wrap">
    <div class="state-msg" id="state-msg">Start typing to search...</div>
  </div>

  <div class="footer">
    <span id="result-info"></span>
    <span class="kbd-group">
      <span><kbd>↑↓</kbd> / <kbd>j</kbd><kbd>k</kbd> navigate</span>
      <span><kbd>Enter</kbd> open</span>
      <span><kbd>Ctrl+R</kbd> regex</span>
      <span><kbd>Tab</kbd> scope</span>
      <span><kbd>Q</kbd> / <kbd>Esc</kbd> close</span>
    </span>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    results: [],
    selected: 0,
    scope: '${defaultScope}',
    useRegex: false,
    query: '',
    searching: false,
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const queryEl   = document.getElementById('query');
  const regexBtn  = document.getElementById('regex-btn');
  const wrap      = document.getElementById('results-wrap');
  const stateMsg  = document.getElementById('state-msg');
  const resultInfo = document.getElementById('result-info');
  const tabs      = document.querySelectorAll('.tab');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlightMatch(text, start, end) {
    const safe = escHtml(text);
    // Recalculate positions after escaping is complex; use raw offsets on safe string
    // Simple approach: split on the match in original, then escape each part
    const pre  = escHtml(text.slice(0, start));
    const match = escHtml(text.slice(start, end));
    const post = escHtml(text.slice(end));
    return pre + '<mark>' + match + '</mark>' + post;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
      stateMsg.style.display = '';
      wrap.querySelectorAll('.result').forEach(el => el.remove());
      resultInfo.textContent = '';
      return;
    }

    if (state.results.length === 0) {
      stateMsg.textContent = state.query ? 'No results found.' : 'Start typing to search...';
      stateMsg.style.display = '';
      wrap.querySelectorAll('.result').forEach(el => el.remove());
      resultInfo.textContent = '';
      return;
    }

    stateMsg.style.display = 'none';

    // Build result items
    const frag = document.createDocumentFragment();

    // Remove old results
    wrap.querySelectorAll('.result').forEach(el => el.remove());

    state.results.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'result' + (i === state.selected ? ' selected' : '');
      div.dataset.index = String(i);
      div.innerHTML =
        '<div class="result-header">' +
          '<span class="result-file">' + escHtml(r.relativePath) + '</span>' +
          '<span class="result-line">:' + r.line + '</span>' +
        '</div>' +
        '<div class="result-text">' + highlightMatch(r.text, r.matchStart, r.matchEnd) + '</div>';

      div.addEventListener('click', () => openResult(i));
      div.addEventListener('mouseenter', () => {
        state.selected = i;
        updateSelection();
      });

      frag.appendChild(div);
    });

    wrap.appendChild(frag);

    resultInfo.textContent = state.results.length + ' result' + (state.results.length === 1 ? '' : 's');

    scrollToSelected();
  }

  function updateSelection() {
    wrap.querySelectorAll('.result').forEach((el, i) => {
      el.classList.toggle('selected', i === state.selected);
    });
    scrollToSelected();
  }

  function scrollToSelected() {
    const sel = wrap.querySelector('.result.selected');
    if (sel) { sel.scrollIntoView({ block: 'nearest' }); }
  }

  // ── Search (debounced) ─────────────────────────────────────────────────────
  let searchTimer = null;

  function triggerSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      vscode.postMessage({
        type: 'search',
        query: state.query,
        useRegex: state.useRegex,
        scope: state.scope,
      });
    }, 180);
  }

  // ── Open result ────────────────────────────────────────────────────────────
  function openResult(index) {
    const r = state.results[index];
    if (!r) { return; }
    vscode.postMessage({ type: 'open', file: r.file, line: r.line });
  }

  // ── Scope ──────────────────────────────────────────────────────────────────
  function setScope(scope) {
    state.scope = scope;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === scope));
    if (state.query) { triggerSearch(); }
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  queryEl.addEventListener('input', () => {
    state.query = queryEl.value;
    state.selected = 0;
    triggerSearch();
  });

  queryEl.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        if (e.key === 'j' && e.target === queryEl && queryEl.value) { break; }
        e.preventDefault();
        state.selected = Math.min(state.selected + 1, state.results.length - 1);
        updateSelection();
        break;

      case 'ArrowUp':
      case 'k':
        if (e.key === 'k' && e.target === queryEl && queryEl.value) { break; }
        e.preventDefault();
        state.selected = Math.max(state.selected - 1, 0);
        updateSelection();
        break;

      case 'Enter':
        e.preventDefault();
        openResult(state.selected);
        break;

      case 'Escape':
        vscode.postMessage({ type: 'close' });
        break;

      case 'Tab':
        e.preventDefault();
        setScope(state.scope === 'project' ? 'openFiles' : 'project');
        break;

      case 'r':
      case 'R':
        if (e.ctrlKey) {
          e.preventDefault();
          toggleRegex();
        }
        break;
    }
  });

  // j/k navigation when input is empty (neovim-style)
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === queryEl) { return; }

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        state.selected = Math.min(state.selected + 1, state.results.length - 1);
        updateSelection();
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        state.selected = Math.max(state.selected - 1, 0);
        updateSelection();
        break;
      case 'Enter':
        e.preventDefault();
        openResult(state.selected);
        break;
      case 'q':
      case 'Q':
      case 'Escape':
        vscode.postMessage({ type: 'close' });
        break;
    }
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => setScope(tab.dataset.scope));
  });

  function toggleRegex() {
    state.useRegex = !state.useRegex;
    regexBtn.classList.toggle('active', state.useRegex);
    if (state.query) { triggerSearch(); }
  }

  regexBtn.addEventListener('click', toggleRegex);

  // ── Messages from extension ────────────────────────────────────────────────
  window.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'searching':
        state.searching = true;
        render();
        break;

      case 'results':
        state.searching = false;
        state.results = data.results;
        state.selected = 0;
        render();
        break;

      case 'error':
        state.searching = false;
        stateMsg.textContent = data.message;
        stateMsg.style.display = '';
        break;

      case 'focus':
        queryEl.focus();
        queryEl.select();
        break;
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  queryEl.focus();
</script>
</body>
</html>`;
  }
}
