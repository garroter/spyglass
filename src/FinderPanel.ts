import * as vscode from 'vscode';
import * as path from 'path';
import { searchWithRipgrep, listFilesWithRipgrep, isRipgrepAvailable, CancellableSearch } from './ripgrep';
import hljs from 'highlight.js';
import { Scope, KeyBindings } from './types';
import { cwdForFile, makeRelative } from './workspaceUtils';
import { loadGitStatus, getChangedLines, relToAbsolute } from './gitUtils';
import { runSymbolSearch } from './symbolSearch';

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
  private _cwdList: string[] = [];
  private _fileCache: Array<{file: string, rel: string}> | null = null;
  private _fileCacheTime = 0;
  private static readonly FILE_CACHE_TTL = 60_000;
  private _searchSeq = 0;
  private _currentSearches: CancellableSearch[] = [];
  private _gitCache = new Map<string, number[]>();
  private _recentFiles: string[] = [];
  private _searchHistory: string[] = [];
  private _activeDir: string = '';
  private _context: vscode.ExtensionContext | null = null;

  public static async createOrShow(context: vscode.ExtensionContext): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const selectedText = editor && !editor.selection.isEmpty
      ? editor.document.getText(editor.selection).trim().split('\n')[0].trim()
      : '';

    if (FinderPanel.currentPanel) {
      FinderPanel.currentPanel._panel.reveal();
      if (selectedText) {
        FinderPanel.currentPanel._post({ type: 'setQuery', query: selectedText });
      } else {
        FinderPanel.currentPanel._post({ type: 'focus' });
      }
      return;
    }

    const rgOk = await isRipgrepAvailable();
    if (!rgOk) {
      vscode.window.showErrorMessage('Spyglass: bundled ripgrep failed to start. Try reinstalling the extension.');
      return;
    }

    const recentFiles = context.workspaceState.get<string[]>('spyglass.recentFiles', []);
    const searchHistory = context.workspaceState.get<string[]>('spyglass.searchHistory', []);
    const activeDir = editor?.document.uri.fsPath
      ? path.dirname(editor.document.uri.fsPath)
      : '';

    const config = vscode.workspace.getConfiguration('spyglass');
    const validScopes: Scope[] = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols'];
    const lastScope = context.workspaceState.get<string>('spyglass.lastScope');
    const rawScope = lastScope ?? config.get<string>('defaultScope', 'project');
    const defaultScope: Scope = validScopes.includes(rawScope as Scope) ? rawScope as Scope : 'project';
    const kb: KeyBindings = {
      navigateDown:   config.get<string>('keybindings.navigateDown',   'ArrowDown'),
      navigateUp:     config.get<string>('keybindings.navigateUp',     'ArrowUp'),
      open:           config.get<string>('keybindings.open',           'Enter'),
      close:          config.get<string>('keybindings.close',          'Escape'),
      toggleRegex:    config.get<string>('keybindings.toggleRegex',    'shift+alt+r'),
      togglePreview:  config.get<string>('keybindings.togglePreview',  'shift+alt+p'),
    };

    const panel = vscode.window.createWebviewPanel(
      'spyglass',
      'Spyglass',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    FinderPanel.currentPanel = new FinderPanel(panel, defaultScope, kb, selectedText, recentFiles, searchHistory, activeDir, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    defaultScope: Scope,
    kb: KeyBindings,
    initialQuery: string,
    recentFiles: string[],
    searchHistory: string[],
    activeDir: string,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._scope = defaultScope;
    this._cwdList = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
    this._cwd = this._cwdList[0] ?? '';
    this._recentFiles = recentFiles;
    this._searchHistory = searchHistory;
    this._activeDir = activeDir;
    this._context = context;
    const maxResults = vscode.workspace.getConfiguration('spyglass').get<number>('maxResults', 200);
    const pinnedFiles = context.workspaceState.get<string[]>('spyglass.pinnedFiles', []);
    this._panel.webview.html = this._buildHtml(defaultScope, kb, initialQuery, this._searchHistory, this._recentFiles, maxResults, pinnedFiles);

    // Warm file cache in background so Files tab is instant on first use
    if (this._cwdList.length > 0) {
      const exclude = vscode.workspace.getConfiguration('spyglass').get<string[]>('exclude');
      Promise.all(this._cwdList.map(cwd => listFilesWithRipgrep(cwd, exclude ?? undefined))).then(lists => {
        this._fileCache = lists.flatMap(files => files.map(f => ({ file: f, rel: this._makeRelative(f) })));
        this._fileCacheTime = Date.now();
        this._post({ type: 'fileList', files: this._fileCache });
      });
      this._loadGitStatus();
    }

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'search': {
          this._scope = msg.scope as Scope;
          const query = msg.query as string;
          const opts = { caseSensitive: !!msg.caseSensitive, wholeWord: !!msg.wholeWord, globFilter: (msg.globFilter as string) || '' };
          if (query.trim() && this._context) {
            const hist = [query, ...this._searchHistory.filter(h => h !== query)].slice(0, 50);
            this._searchHistory = hist;
            this._context.workspaceState.update('spyglass.searchHistory', hist);
          }
          if (msg.scope === 'here') {
            await this._runHereSearch(query, msg.useRegex as boolean, opts);
          } else {
            await this._runSearch(query, msg.useRegex as boolean, opts);
          }
          break;
        }
        case 'fileSearch':
          await this._runFileSearch();
          break;
        case 'gitSearch':
          await this._runGitSearch();
          break;
        case 'symbolSearch':
          await this._runSymbolSearch(msg.query as string);
          break;
        case 'copyPath':
          await vscode.env.clipboard.writeText(msg.path as string);
          break;
        case 'setPinnedFiles': {
          const files = (msg.files as { file: string; rel: string }[]).map(f => f.file);
          await this._context!.workspaceState.update('spyglass.pinnedFiles', files);
          break;
        }
        case 'revealFile':
          await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.file as string));
          break;
        case 'replaceAll':
          await this._replaceAll(msg);
          break;
        case 'openInSplit':
          await this._openFileInSplit(msg.file as string, msg.line as number);
          break;
        case 'preview':
          await this._sendPreview(msg.file as string, msg.line as number);
          break;
        case 'open':
          await this._openFile(msg.file as string, msg.line as number);
          break;
        case 'scopeChanged':
          this._scope = msg.scope as Scope;
          this._context?.workspaceState.update('spyglass.lastScope', this._scope);
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

  private async _runSearch(query: string, useRegex: boolean, opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string }): Promise<void> {
    this._currentSearches.forEach(s => s.cancel());
    this._currentSearches = [];
    const seq = ++this._searchSeq;
    const config = vscode.workspace.getConfiguration('spyglass');
    const maxResults = config.get<number>('maxResults', 200);
    const exclude = config.get<string[]>('exclude');

    if (!query.trim()) {
      this._post({ type: 'results', results: [], query, took: 0 });
      return;
    }

    if (this._cwdList.length === 0) {
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
      // openFiles uses absolute paths — single search suffices; otherwise search all folders
      const cwds = this._scope === 'openFiles' ? [this._cwd] : this._cwdList;
      const accumulated = new Map<string, import('./types').SearchResult[]>();

      const searches = cwds.map(cwd => searchWithRipgrep(query, cwd, useRegex, files, { ...opts, exclude: exclude ?? undefined }, (chunk) => {
        if (seq !== this._searchSeq) { return; }
        accumulated.set(cwd, this._cwdList.length > 1 ? chunk.map(r => ({ ...r, relativePath: this._makeRelative(r.file) })) : chunk);
        const merged = [...accumulated.values()].flat().slice(0, maxResults);
        this._post({ type: 'resultsChunk', results: merged, query });
      }));

      this._currentSearches = searches;
      const allResults = await Promise.all(searches.map(s => s.promise));
      this._currentSearches = [];
      if (seq !== this._searchSeq) { return; }

      let merged = allResults.flat();
      if (this._cwdList.length > 1) {
        merged = merged.map(r => ({ ...r, relativePath: this._makeRelative(r.file) }));
      }
      this._post({ type: 'results', results: merged.slice(0, maxResults), query, took: Date.now() - start });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: 'Search failed.' });
    }
  }

  private async _runHereSearch(query: string, useRegex: boolean, opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string }): Promise<void> {
    this._currentSearches.forEach(s => s.cancel());
    this._currentSearches = [];
    const seq = ++this._searchSeq;
    const cwd = this._activeDir || this._cwd;
    const config = vscode.workspace.getConfiguration('spyglass');
    const maxResults = config.get<number>('maxResults', 200);
    const exclude = config.get<string[]>('exclude');

    if (!query.trim()) {
      this._post({ type: 'results', results: [], query, took: 0 });
      return;
    }

    if (!cwd) {
      this._post({ type: 'error', message: 'No active directory.' });
      return;
    }

    this._post({ type: 'searching' });

    const start = Date.now();
    try {
      const search = searchWithRipgrep(query, cwd, useRegex, undefined, { ...opts, exclude: exclude ?? undefined }, (chunk) => {
        if (seq !== this._searchSeq) { return; }
        this._post({ type: 'resultsChunk', results: chunk.slice(0, maxResults), query });
      });
      this._currentSearches = [search];
      const results = await search.promise;
      this._currentSearches = [];
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'results', results: results.slice(0, maxResults), query, took: Date.now() - start });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: 'Search failed.' });
    }
  }

  private async _runSymbolSearch(query: string): Promise<void> {
    const seq = ++this._searchSeq;
    try {
      const results = await runSymbolSearch(query, fp => this._makeRelative(fp));
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'symbolResults', results, query });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: 'Symbol search failed.' });
    }
  }

  private async _replaceAll(msg: { query: string; replacement: string; useRegex: boolean; caseSensitive: boolean; wholeWord: boolean; globFilter: string; scope: string }): Promise<void> {
    let files: string[] | undefined;
    if (msg.scope === 'openFiles') {
      files = vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .map(t => (t.input as { uri?: vscode.Uri })?.uri?.fsPath)
        .filter((f): f is string => typeof f === 'string');
    }

    const cwds = msg.scope === 'here'
      ? [this._activeDir || this._cwd]
      : msg.scope === 'openFiles' ? [this._cwd] : this._cwdList;

    const exclude = vscode.workspace.getConfiguration('spyglass').get<string[]>('exclude');
    let results;
    try {
      const allResults = await Promise.all(cwds.map(cwd =>
        searchWithRipgrep(msg.query, cwd, msg.useRegex, files, {
          caseSensitive: msg.caseSensitive,
          wholeWord: msg.wholeWord,
          globFilter: msg.globFilter,
          exclude: exclude ?? undefined,
        }).promise
      ));
      results = allResults.flat();
    } catch {
      vscode.window.showErrorMessage('Spyglass: Replace failed — search error.');
      return;
    }

    if (results.length === 0) {
      vscode.window.showInformationMessage('Spyglass: No matches found to replace.');
      return;
    }

    const fileSet = new Set(results.map(r => r.file));
    const edit = new vscode.WorkspaceEdit();
    const pattern = msg.useRegex
      ? new RegExp(msg.query, msg.caseSensitive ? 'g' : 'gi')
      : new RegExp(msg.query.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&'), msg.caseSensitive ? 'g' : 'gi');

    const { promises: fsp2 } = await import('fs');
    for (const filePath of fileSet) {
      try {
        const content = await fsp2.readFile(filePath, 'utf-8');
        const newContent = content.replace(pattern, msg.replacement);
        if (newContent !== content) {
          const uri = vscode.Uri.file(filePath);
          edit.replace(uri, new vscode.Range(0, 0, content.split('\n').length, 0), newContent);
        }
      } catch { /* skip unreadable files */ }
    }

    await vscode.workspace.applyEdit(edit);
    for (const filePath of fileSet) {
      try { await vscode.workspace.save(vscode.Uri.file(filePath)); } catch { /* skip */ }
    }
    this._gitCache.clear();
    this._post({ type: 'replaceApplied', fileCount: fileSet.size } as any);
  }

  private async _runGitSearch(): Promise<void> {
    if (this._cwdList.length === 0) {
      this._post({ type: 'gitFiles', files: [] });
      return;
    }
    const statuses = await loadGitStatus(this._cwdList);
    const files = Object.keys(statuses).map(rel => ({
      file: relToAbsolute(rel, this._cwdList, this._cwd),
      rel,
    }));
    this._post({ type: 'gitFiles', files });
    this._post({ type: 'gitStatus', status: statuses });
  }

  private async _runFileSearch(): Promise<void> {
    if (this._cwdList.length === 0) {
      this._post({ type: 'error', message: 'No workspace folder open.' });
      return;
    }

    const now = Date.now();
    if (!this._fileCache || now - this._fileCacheTime > FinderPanel.FILE_CACHE_TTL) {
      const exclude = vscode.workspace.getConfiguration('spyglass').get<string[]>('exclude');
      const lists = await Promise.all(this._cwdList.map(cwd => listFilesWithRipgrep(cwd, exclude ?? undefined)));
      this._fileCache = lists.flatMap(files => files.map(f => ({ file: f, rel: this._makeRelative(f) })));
      this._fileCacheTime = Date.now();
    }

    this._post({ type: 'fileList', files: this._fileCache });
  }

  private async _openFileInSplit(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      this.dispose();
    } catch {
      vscode.window.showErrorMessage(`Finder: Could not open file ${filePath}`);
    }
  }

  private _makeRelative(filePath: string): string {
    return makeRelative(filePath, this._cwdList, this._cwd);
  }

  private _loadGitStatus(): void {
    loadGitStatus(this._cwdList).then(status => {
      this._post({ type: 'gitStatus', status });
    });
  }

  private async _sendPreview(filePath: string, targetLine: number): Promise<void> {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const relativePath = this._makeRelative(filePath);
    try {
      // Use VSCode's document API so we see in-memory edits (e.g. after WorkspaceEdit)
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);

      if (doc.getText().length > 512 * 1024) {
        this._post({ type: 'previewContent', lines: ['(file too large to preview)'], currentLine: 1, relativePath, ext, changedLines: [] });
        return;
      }

      const content = doc.getText();
      const changedLines = await getChangedLines(filePath, cwdForFile(filePath, this._cwdList, this._cwd), this._gitCache);

      let highlighted: string[];
      try {
        const lang = hljs.getLanguage(ext) ? ext : undefined;
        const result = lang
          ? hljs.highlight(content, { language: lang, ignoreIllegals: true })
          : hljs.highlightAuto(content, undefined);
        highlighted = result.value.split('\n');
      } catch {
        highlighted = content.split('\n').map(l =>
          l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        );
      }

      this._post({
        type: 'previewContent',
        lines: highlighted,
        currentLine: targetLine,
        relativePath,
        ext,
        changedLines,
        preHighlighted: true,
      });
    } catch {
      this._post({ type: 'previewContent', lines: ['(cannot read file)'], currentLine: 1, relativePath, ext, changedLines: [] });
    }
  }

  private async _openFile(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      this.dispose();
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

  private _buildHtml(defaultScope: Scope, kb: KeyBindings, initialQuery: string = '', searchHistory: string[] = [], recentFiles: string[] = [], maxResults: number = 200, pinnedFiles: string[] = []): string {
    const nonce = getNonce();
    const webview = this._panel.webview;
    const extensionUri = this._context!.extensionUri;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
    const jsUri  = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'));

    const config = {
      KB: kb,
      INITIAL_QUERY: initialQuery,
      INITIAL_HISTORY: searchHistory,
      RECENT_FILES: recentFiles.map(f => ({ file: f, rel: this._makeRelative(f) })),
      PINNED_FILES: pinnedFiles.filter(f => require('fs').existsSync(f)).map(f => ({ file: f, rel: this._makeRelative(f) })),
      MAX_RESULTS: maxResults,
      DEFAULT_SCOPE: defaultScope,
    };

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Finder</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body>

<div class="finder">

<!-- Top bar -->
<div class="topbar">
  <span class="search-icon">⌕</span>
  <input id="query" type="text" placeholder="Search in files..." autocomplete="off" spellcheck="false">
  <button type="button" class="icon-btn" id="regex-btn" aria-label="Toggle regex">.*</button>
  <button type="button" class="icon-btn" id="case-btn" aria-label="Case sensitive" data-tooltip="Case sensitive — Alt+C">Aa</button>
  <button type="button" class="icon-btn" id="word-btn" aria-label="Whole word" data-tooltip="Whole word — Alt+W">\\b</button>
  <button type="button" class="icon-btn" id="replace-btn" aria-label="Replace mode" data-tooltip="Replace mode — Alt+R">⇄</button>
  <button type="button" class="icon-btn active" id="preview-btn" aria-label="Toggle preview">⊡</button>
  <button type="button" class="icon-btn" id="help-btn" aria-label="Keyboard shortcuts" data-tooltip="Keyboard shortcuts">?</button>
</div>

<!-- Replace row -->
<div class="replace-row" id="replace-row" style="display:none">
  <span class="filter-label">replace:</span>
  <input id="replace-input" type="text" placeholder="replacement text" spellcheck="false" autocomplete="off">
  <button type="button" class="icon-btn" id="replace-all-btn">Replace all</button>
</div>

<!-- Scope tabs -->
<div class="tabs">
  <button type="button" class="tab" data-scope="project">Project</button>
  <button type="button" class="tab" data-scope="openFiles">Open Files</button>
  <button type="button" class="tab" data-scope="files">Files</button>
  <button type="button" class="tab" data-scope="recent">Recent</button>
  <button type="button" class="tab" data-scope="here">Dir</button>
  <button type="button" class="tab" data-scope="symbols">Symbols</button>
  <button type="button" class="tab" data-scope="git">Git</button>
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
    <button type="button" class="preview-header-btn" id="preview-header" title="Reveal in Explorer">No file selected</button>
    <div class="preview-empty" id="preview-empty">Navigate results to preview</div>
    <div class="preview-content" id="preview-content"></div>
  </div>

</div>

<!-- Status bar -->
<div class="statusbar">
  <span id="result-info"></span>
  <span id="search-took"></span>
</div>

</div><!-- .finder -->

<!-- Shortcuts overlay (outside .finder to avoid overflow:hidden clipping) -->
<div class="shortcuts-overlay" id="shortcuts-overlay">
  <h4>Navigation</h4>
  <div class="shortcut-row"><span>Navigate results</span><div class="shortcut-keys"><kbd>↑</kbd><kbd>↓</kbd></div></div>
  <div class="shortcut-row"><span>Open file</span><div class="shortcut-keys"><kbd>Enter</kbd></div></div>
  <div class="shortcut-row"><span>Open in split</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Enter</kbd></div></div>
  <div class="shortcut-row"><span>Switch scope</span><div class="shortcut-keys"><kbd>Tab</kbd></div></div>
  <div class="shortcut-row"><span>Close</span><div class="shortcut-keys"><kbd>Esc</kbd></div></div>
  <h4>Search</h4>
  <div class="shortcut-row"><span>Glob filter inline</span><div class="shortcut-keys"><kbd>query *.ts</kbd></div></div>
  <div class="shortcut-row"><span>Toggle regex</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Alt</kbd><kbd>R</kbd></div></div>
  <div class="shortcut-row"><span>Case sensitive</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>C</kbd></div></div>
  <div class="shortcut-row"><span>Whole word</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>W</kbd></div></div>
  <div class="shortcut-row"><span>Replace mode</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>R</kbd></div></div>
  <div class="shortcut-row"><span>History prev / next</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>↑</kbd><kbd>↓</kbd></div></div>
  <h4>Selection</h4>
  <div class="shortcut-row"><span>Multi-select toggle</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Click</kbd></div></div>
  <div class="shortcut-row"><span>Multi-select (keyboard)</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Space</kbd></div></div>
  <div class="shortcut-row"><span>Select all</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>A</kbd></div></div>
  <div class="shortcut-row"><span>Open all selected</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Enter</kbd></div></div>
  <div class="shortcut-row"><span>Copy path</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>Y</kbd></div></div>
  <div class="shortcut-row"><span>Reveal in Explorer</span><div class="shortcut-keys"><kbd>click preview header</kbd></div></div>
  <h4>View</h4>
  <div class="shortcut-row"><span>Toggle preview</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Alt</kbd><kbd>P</kbd></div></div>
</div>

<!-- Context menu -->
<div class="ctx-menu" id="ctx-menu">
  <div class="ctx-item" id="ctx-open"><span>Open</span><span class="ctx-hint">Enter</span></div>
  <div class="ctx-item" id="ctx-open-split"><span>Open in split</span><span class="ctx-hint">Ctrl+Enter</span></div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" id="ctx-copy-abs"><span>Copy absolute path</span><span class="ctx-hint">Alt+Y</span></div>
  <div class="ctx-item" id="ctx-copy-rel"><span>Copy relative path</span></div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" id="ctx-reveal"><span>Reveal in Explorer</span></div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" id="ctx-pin"><span>Pin file</span><span class="ctx-hint">Alt+P</span></div>
</div>

<script nonce="${nonce}">window.__spyglass = ${JSON.stringify(config)};</script>
<script src="${jsUri}"></script>
</body>
</html>`;
  }
}
