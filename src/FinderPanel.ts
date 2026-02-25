import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsp } from 'fs';
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
  private _cwd: string = '';

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
    this._cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this._panel.webview.html = this._buildHtml(defaultScope);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'search':
          this._scope = msg.scope as Scope;
          await this._runSearch(msg.query as string, msg.useRegex as boolean);
          break;
        case 'preview':
          await this._sendPreview(msg.file as string, msg.line as number);
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

    if (!this._cwd) {
      this._post({ type: 'error', message: 'No workspace folder open.' });
      return;
    }

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
      const results = await searchWithRipgrep(query, this._cwd, useRegex, files);
      this._post({ type: 'results', results: results.slice(0, maxResults), query, took: Date.now() - start });
    } catch {
      this._post({ type: 'error', message: 'Search failed.' });
    }
  }

  private async _sendPreview(filePath: string, targetLine: number): Promise<void> {
    try {
      const stat = await fsp.stat(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      if (stat.size > 512 * 1024) {
        this._post({
          type: 'previewContent',
          lines: ['(file too large to preview)'],
          currentLine: 1,
          relativePath: path.relative(this._cwd, filePath),
          ext,
        });
        return;
      }

      const content = await fsp.readFile(filePath, 'utf-8');
      this._post({
        type: 'previewContent',
        lines: content.split('\n'),
        currentLine: targetLine,
        relativePath: path.relative(this._cwd, filePath),
        ext,
      });
    } catch {
      this._post({
        type: 'previewContent',
        lines: ['(cannot read file)'],
        currentLine: 1,
        relativePath: filePath,
        ext: path.extname(filePath).slice(1).toLowerCase(),
      });
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
    --green:    #a6e3a1;
    --yellow:   #f9e2af;
    --peach:    #fab387;
    --red:      #f38ba8;
    --mauve:    #cba6f7;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--crust);
    color: var(--text);
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 13px;
    height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 7vh;
    overflow: hidden;
  }

  .finder {
    width: min(960px, 95vw);
    height: min(600px, 82vh);
    background: var(--mantle);
    border: 1px solid var(--surface1);
    border-radius: 12px;
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Top bar ─────────────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--surface0);
    flex-shrink: 0;
  }

  .search-icon { color: var(--overlay1); font-size: 15px; flex-shrink: 0; }

  #query {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    caret-color: var(--blue);
    min-width: 0;
  }
  #query::placeholder { color: var(--overlay0); }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--surface1);
    border-radius: 6px;
    color: var(--overlay1);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.12s;
    flex-shrink: 0;
  }
  .icon-btn:hover { border-color: var(--blue); color: var(--blue); }
  .icon-btn.active { background: var(--blue); border-color: var(--blue); color: var(--mantle); font-weight: 700; }

  /* ── Scope tabs ──────────────────────────────────────────── */
  .tabs {
    display: flex;
    gap: 2px;
    padding: 6px 14px 0;
    border-bottom: 1px solid var(--surface0);
    flex-shrink: 0;
  }

  .tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--overlay1);
    font-family: inherit;
    font-size: 11px;
    padding: 3px 10px 7px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .tab:hover { color: var(--subtext1); }
  .tab.active { color: var(--blue); border-bottom-color: var(--blue); }

  /* ── Main layout: left + right ───────────────────────────── */
  .layout {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Left panel (results) ────────────────────────────────── */
  .left-panel {
    display: flex;
    flex-direction: column;
    width: 38%;
    min-width: 240px;
    max-width: 420px;
    border-right: 1px solid var(--surface0);
    overflow: hidden;
    flex-shrink: 0;
  }

  .results-wrap {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface1) transparent;
  }
  .results-wrap::-webkit-scrollbar { width: 5px; }
  .results-wrap::-webkit-scrollbar-thumb { background: var(--surface1); border-radius: 3px; }

  .state-msg {
    padding: 28px 16px;
    text-align: center;
    color: var(--overlay0);
    font-size: 12px;
  }

  .spinner {
    display: inline-block;
    width: 12px; height: 12px;
    border: 2px solid var(--surface1);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .result {
    padding: 7px 14px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: background 0.08s;
  }
  .result:hover { background: var(--surface0); }
  .result.selected { background: var(--surface0); border-left-color: var(--blue); }

  .result-header { display: flex; align-items: baseline; gap: 5px; margin-bottom: 2px; }
  .result-file { color: var(--blue); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .result-line { color: var(--overlay0); font-size: 10px; flex-shrink: 0; }
  .result-text { color: var(--subtext0); font-size: 11px; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .result-text mark { background: transparent; color: var(--yellow); font-weight: 700; }

  /* ── Right panel (preview) ───────────────────────────────── */
  .right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    background: var(--crust);
  }
  .right-panel.hidden { display: none; }
  .left-panel.full { width: 100%; max-width: none; border-right: none; }

  .preview-header {
    padding: 7px 14px;
    border-bottom: 1px solid var(--surface0);
    color: var(--subtext0);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    background: var(--mantle);
  }

  .preview-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--overlay0);
    font-size: 12px;
  }

  .preview-content {
    flex: 1;
    display: none;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--surface1) transparent;
  }
  .preview-content::-webkit-scrollbar { width: 5px; }
  .preview-content::-webkit-scrollbar-thumb { background: var(--surface1); border-radius: 3px; }

  .pline {
    display: flex;
    padding: 0 14px;
    line-height: 1.65;
    white-space: pre;
  }
  .pline--cur { background: var(--surface1); }
  .pnum {
    color: var(--overlay0);
    text-align: right;
    min-width: 4ch;
    margin-right: 16px;
    user-select: none;
    flex-shrink: 0;
    font-size: 11px;
    padding-top: 1px;
  }
  .pline--cur .pnum { color: var(--yellow); }
  .ptext { color: var(--text); font-size: 12px; }

  /* ── Syntax highlighting ─────────────────────────────────── */
  .hl-kw  { color: var(--mauve); }
  .hl-str { color: var(--green); }
  .hl-cmt { color: var(--overlay1); font-style: italic; }
  .hl-num { color: var(--peach); }
  .hl-fn  { color: var(--blue); }
  .hl-op  { color: var(--red); }

  /* ── Footer ──────────────────────────────────────────────── */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    border-top: 1px solid var(--surface0);
    color: var(--overlay0);
    font-size: 10px;
    flex-shrink: 0;
  }
  .kbd-group { display: flex; gap: 10px; flex-wrap: wrap; }
  kbd {
    background: var(--surface0);
    border: 1px solid var(--surface1);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: inherit;
    font-size: 9px;
    color: var(--subtext0);
  }
</style>
</head>
<body>

<div class="finder">

<!-- Top bar -->
<div class="topbar">
  <span class="search-icon">⌕</span>
  <input id="query" type="text" placeholder="Search in files..." autocomplete="off" spellcheck="false">
  <button type="button" class="icon-btn" id="regex-btn" title="Toggle regex (Ctrl+R)">.*</button>
  <button type="button" class="icon-btn active" id="preview-btn" title="Toggle preview (P)">⊡</button>
</div>

<!-- Scope tabs -->
<div class="tabs">
  <button type="button" class="tab ${defaultScope === 'project' ? 'active' : ''}" data-scope="project">Project</button>
  <button type="button" class="tab ${defaultScope === 'openFiles' ? 'active' : ''}" data-scope="openFiles">Open Files</button>
</div>

<!-- Main layout -->
<div class="layout">

  <!-- Left: results -->
  <div class="left-panel" id="left-panel">
    <div class="results-wrap" id="results-wrap">
      <div class="state-msg" id="state-msg">Start typing to search...</div>
    </div>
  </div>

  <!-- Right: file preview -->
  <div class="right-panel" id="right-panel">
    <div class="preview-header" id="preview-header">No file selected</div>
    <div class="preview-empty" id="preview-empty">Navigate results to preview</div>
    <div class="preview-content" id="preview-content"></div>
  </div>

</div>

<!-- Footer -->
<div class="footer">
  <span id="result-info"></span>
  <span class="kbd-group">
    <span><kbd>↑↓</kbd> <kbd>j</kbd><kbd>k</kbd> nav</span>
    <span><kbd>Enter</kbd> open</span>
    <span><kbd>Tab</kbd> scope</span>
    <span><kbd>Ctrl+R</kbd> regex</span>
    <span><kbd>P</kbd> preview</span>
    <span><kbd>Q</kbd> <kbd>Esc</kbd> close</span>
  </span>
</div>

</div><!-- .finder -->

<script nonce="${nonce}">
  window.onerror = (msg, src, line, col, err) => {
    document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">'
      + 'JS Error: ' + msg + '\\nLine: ' + line + '\\n' + (err ? err.stack : '') + '</div>';
  };

  const vscode = acquireVsCodeApi();

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    results: [],
    selected: 0,
    scope: '${defaultScope}',
    useRegex: false,
    query: '',
    searching: false,
    showPreview: true,
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const queryEl      = document.getElementById('query');
  const regexBtn     = document.getElementById('regex-btn');
  const previewBtn   = document.getElementById('preview-btn');
  const wrap         = document.getElementById('results-wrap');
  const stateMsg     = document.getElementById('state-msg');
  const resultInfo   = document.getElementById('result-info');
  const leftPanel    = document.getElementById('left-panel');
  const rightPanel   = document.getElementById('right-panel');
  const previewHdr   = document.getElementById('preview-header');
  const previewEmpty = document.getElementById('preview-empty');
  const previewCont  = document.getElementById('preview-content');
  const tabs         = document.querySelectorAll('.tab');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlightMatch(text, start, end) {
    return escHtml(text.slice(0, start))
      + '<mark>' + escHtml(text.slice(start, end)) + '</mark>'
      + escHtml(text.slice(end));
  }

  // ── Syntax highlighter ─────────────────────────────────────────────────────
  const KW = new Set([
    // JS / TS
    'const','let','var','function','class','interface','type','enum','import',
    'export','from','return','if','else','for','while','do','switch','case',
    'break','continue','new','typeof','instanceof','void','null','undefined',
    'true','false','async','await','extends','implements','static','public',
    'private','protected','readonly','abstract','declare','namespace','default',
    'throw','try','catch','finally','in','of','yield','get','set','this','super',
    // Python
    'def','elif','except','lambda','with','as','pass','del','assert','raise',
    'nonlocal','global','and','or','not','is','None','True','False',
    // Rust
    'fn','mut','struct','impl','trait','use','mod','pub','crate','self','Self',
    'match','loop','where','unsafe','extern','move','ref',
    // Go
    'func','chan','map','range','defer','go','select','make','len','cap',
    'append','copy','delete','close','panic','recover','package',
    // Generic
    'include','require','end','then','begin','module','include',
  ]);

  // Languages where # starts a comment
  const HASH_COMMENT_EXTS = new Set([
    'py','rb','sh','bash','zsh','fish','yaml','yml','toml','conf','ini',
    'r','pl','pm','tcl','coffee','cr',
  ]);

  function highlightLine(text, ext) {
    const useHash = HASH_COMMENT_EXTS.has(ext);
    const out = [];
    let i = 0;
    const n = text.length;

    function push(cls, value) {
      const v = escHtml(value);
      out.push(cls ? '<span class="' + cls + '">' + v + '</span>' : v);
    }

    while (i < n) {
      const c = text[i];
      const c2 = text[i + 1];

      // Line comment: // or #
      if ((c === '/' && c2 === '/') || (useHash && c === '#')) {
        push('hl-cmt', text.slice(i));
        break;
      }

      // Block comment: /* ... */  (single-line portion)
      if (c === '/' && c2 === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end !== -1) {
          push('hl-cmt', text.slice(i, end + 2)); i = end + 2;
        } else {
          push('hl-cmt', text.slice(i)); break;
        }
        continue;
      }

      // String literals: double quote, single quote, or backtick (char code 96)
      if (c === '"' || c === "'" || c.charCodeAt(0) === 96) {
        let j = i + 1;
        while (j < n) {
          if (text[j] === '\\\\') { j += 2; continue; }
          if (text[j] === c)    { j++; break; }
          j++;
        }
        push('hl-str', text.slice(i, j)); i = j;
        continue;
      }

      // Number
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 || ''))) {
        let j = i;
        while (j < n && /[0-9a-fA-FxXoObB._]/.test(text[j])) { j++; }
        push('hl-num', text.slice(i, j)); i = j;
        continue;
      }

      // Word: keyword or identifier (possibly function call)
      if (/[a-zA-Z_$]/.test(c)) {
        let j = i;
        while (j < n && /[a-zA-Z0-9_$]/.test(text[j])) { j++; }
        const word = text.slice(i, j);
        // Peek past whitespace for '('
        let k = j;
        while (k < n && text[k] === ' ') { k++; }
        if (KW.has(word))      { push('hl-kw', word); }
        else if (text[k] === '(') { push('hl-fn', word); }
        else                    { push('', word); }
        i = j;
        continue;
      }

      // Single char (operator / punctuation) — color operators
      if ('+-*/%=!<>&|^~?:'.includes(c)) {
        push('hl-op', c); i++;
      } else {
        push('', c); i++;
      }
    }

    return out.join('');
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  let previewTimer = null;

  function requestPreview() {
    if (!state.showPreview) { return; }
    const r = state.results[state.selected];
    if (!r) { return; }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: 'preview', file: r.file, line: r.line });
    }, 80);
  }

  function renderPreview(lines, currentLine, relativePath, ext) {
    previewHdr.textContent = relativePath;
    previewEmpty.style.display = 'none';
    previewCont.style.display = 'block';

    const frag = document.createDocumentFragment();
    lines.forEach((line, i) => {
      const num = i + 1;
      const isCur = num === currentLine;
      const div = document.createElement('div');
      div.className = 'pline' + (isCur ? ' pline--cur' : '');
      div.innerHTML =
        '<span class="pnum">' + num + '</span>' +
        '<span class="ptext">' + highlightLine(line, ext) + '</span>';
      frag.appendChild(div);
    });

    previewCont.innerHTML = '';
    previewCont.appendChild(frag);

    // Scroll match line into center
    const curEl = previewCont.querySelector('.pline--cur');
    curEl?.scrollIntoView({ block: 'center' });
  }

  function togglePreview() {
    state.showPreview = !state.showPreview;
    previewBtn.classList.toggle('active', state.showPreview);
    rightPanel.classList.toggle('hidden', !state.showPreview);
    leftPanel.classList.toggle('full', !state.showPreview);
    if (state.showPreview) { requestPreview(); }
  }

  // ── Results render ─────────────────────────────────────────────────────────
  function render() {
    wrap.querySelectorAll('.result').forEach(el => el.remove());

    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }

    if (state.results.length === 0) {
      stateMsg.textContent = state.query ? 'No results.' : 'Start typing to search...';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }

    stateMsg.style.display = 'none';

    const frag = document.createDocumentFragment();
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
        requestPreview();
      });
      frag.appendChild(div);
    });

    wrap.appendChild(frag);
    resultInfo.textContent = state.results.length + ' result' + (state.results.length !== 1 ? 's' : '');
    scrollToSelected();
    requestPreview();
  }

  function updateSelection() {
    wrap.querySelectorAll('.result').forEach((el, i) => {
      el.classList.toggle('selected', i === state.selected);
    });
    scrollToSelected();
  }

  function scrollToSelected() {
    wrap.querySelector('.result.selected')?.scrollIntoView({ block: 'nearest' });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function openResult(index) {
    const r = state.results[index];
    if (r) { vscode.postMessage({ type: 'open', file: r.file, line: r.line }); }
  }

  function navigate(delta) {
    state.selected = Math.max(0, Math.min(state.selected + delta, state.results.length - 1));
    updateSelection();
    requestPreview();
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  let searchTimer = null;
  function triggerSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      vscode.postMessage({ type: 'search', query: state.query, useRegex: state.useRegex, scope: state.scope });
    }, 180);
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
    if (e.key === 'ArrowDown' || (e.key === 'j' && !queryEl.value)) {
      e.preventDefault(); navigate(1);
    } else if (e.key === 'ArrowUp' || (e.key === 'k' && !queryEl.value)) {
      e.preventDefault(); navigate(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault(); openResult(state.selected);
    } else if (e.key === 'Escape') {
      vscode.postMessage({ type: 'close' });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setScope(state.scope === 'project' ? 'openFiles' : 'project');
    } else if ((e.key === 'r' || e.key === 'R') && e.ctrlKey) {
      e.preventDefault(); toggleRegex();
    }
  });

  // Global keys (when input not focused or empty)
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === queryEl) { return; }
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); navigate(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); openResult(state.selected); }
    else if (e.key === 'p' || e.key === 'P') { togglePreview(); }
    else if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape') {
      vscode.postMessage({ type: 'close' });
    }
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope)));

  function toggleRegex() {
    state.useRegex = !state.useRegex;
    regexBtn.classList.toggle('active', state.useRegex);
    if (state.query) { triggerSearch(); }
  }

  regexBtn.addEventListener('click', toggleRegex);
  previewBtn.addEventListener('click', togglePreview);

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
      case 'previewContent':
        renderPreview(data.lines, data.currentLine, data.relativePath, data.ext);
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
  // regex OFF by default
  state.useRegex = false;
  regexBtn.classList.remove('active');
  queryEl.focus();
</script>
</body>
</html>`;
  }
}
