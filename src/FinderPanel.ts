import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { searchWithRipgrep, listFilesWithRipgrep, isRipgrepAvailable } from './ripgrep';
import { Scope, KeyBindings, FileResult, SymbolResult } from './types';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function fuzzyScore(str: string, query: string): { score: number; positions: number[] } | null {
  const lStr = str.toLowerCase();
  const lQuery = query.toLowerCase();
  const positions: number[] = [];
  let si = 0, qi = 0;

  while (si < lStr.length && qi < lQuery.length) {
    if (lStr[si] === lQuery[qi]) { positions.push(si); qi++; }
    si++;
  }
  if (qi < lQuery.length) { return null; }

  let score = 0;
  let consecutive = 1;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] === positions[i - 1] + 1) { score += consecutive * 10; consecutive++; }
    else { consecutive = 1; }
  }
  const basenameStart = str.lastIndexOf('/') + 1;
  if (positions[0] >= basenameStart) { score += 50; }
  if (positions[0] === basenameStart) { score += 30; }
  score -= positions[positions.length - 1] - positions[0]; // penalty for spread
  score -= (str.match(/\//g) ?? []).length * 2;            // penalty for depth

  return { score, positions };
}

export class FinderPanel {
  public static currentPanel: FinderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _scope: Scope;
  private _cwd: string = '';
  private _fileCache: string[] | null = null;
  private _fileCacheTime = 0;
  private static readonly FILE_CACHE_TTL = 15_000;
  private _searchSeq = 0;
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
    const rawScope = config.get<string>('defaultScope', 'project');
    const defaultScope: Scope = (rawScope === 'project' || rawScope === 'openFiles' || rawScope === 'files' || rawScope === 'recent')
      ? rawScope : 'project';
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
      { enableScripts: true, localResourceRoots: [] }
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
    this._cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this._recentFiles = recentFiles;
    this._searchHistory = searchHistory;
    this._activeDir = activeDir;
    this._context = context;
    this._panel.webview.html = this._buildHtml(defaultScope, kb, initialQuery, this._searchHistory);

    // Warm file cache in background so Files tab is instant on first use
    if (this._cwd) {
      listFilesWithRipgrep(this._cwd).then(files => {
        this._fileCache = files;
        this._fileCacheTime = Date.now();
      });
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
          await this._runFileSearch(msg.query as string);
          break;
        case 'recentSearch':
          this._runRecentSearch(msg.query as string);
          break;
        case 'symbolSearch':
          await this._runSymbolSearch(msg.query as string);
          break;
        case 'copyPath':
          await vscode.env.clipboard.writeText(msg.path as string);
          break;
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
    const seq = ++this._searchSeq;
    const config = vscode.workspace.getConfiguration('spyglass');
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
      const results = await searchWithRipgrep(query, this._cwd, useRegex, files, opts);
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'results', results: results.slice(0, maxResults), query, took: Date.now() - start });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: 'Search failed.' });
    }
  }

  private async _runHereSearch(query: string, useRegex: boolean, opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string }): Promise<void> {
    const seq = ++this._searchSeq;
    const cwd = this._activeDir || this._cwd;
    const config = vscode.workspace.getConfiguration('spyglass');
    const maxResults = config.get<number>('maxResults', 200);

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
      const results = await searchWithRipgrep(query, cwd, useRegex, undefined, opts);
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
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider', query
      );
      if (seq !== this._searchSeq) { return; }

      const kindLabels: Record<number, string> = {
        [vscode.SymbolKind.File]: 'file',
        [vscode.SymbolKind.Module]: 'module',
        [vscode.SymbolKind.Namespace]: 'namespace',
        [vscode.SymbolKind.Package]: 'package',
        [vscode.SymbolKind.Class]: 'class',
        [vscode.SymbolKind.Method]: 'method',
        [vscode.SymbolKind.Property]: 'property',
        [vscode.SymbolKind.Field]: 'field',
        [vscode.SymbolKind.Constructor]: 'constructor',
        [vscode.SymbolKind.Enum]: 'enum',
        [vscode.SymbolKind.Interface]: 'interface',
        [vscode.SymbolKind.Function]: 'function',
        [vscode.SymbolKind.Variable]: 'variable',
        [vscode.SymbolKind.Constant]: 'constant',
        [vscode.SymbolKind.String]: 'string',
        [vscode.SymbolKind.Number]: 'number',
        [vscode.SymbolKind.Boolean]: 'boolean',
        [vscode.SymbolKind.Array]: 'array',
        [vscode.SymbolKind.Object]: 'object',
        [vscode.SymbolKind.Key]: 'key',
        [vscode.SymbolKind.Null]: 'null',
        [vscode.SymbolKind.EnumMember]: 'enum member',
        [vscode.SymbolKind.Struct]: 'struct',
        [vscode.SymbolKind.Event]: 'event',
        [vscode.SymbolKind.Operator]: 'operator',
        [vscode.SymbolKind.TypeParameter]: 'type param',
      };

      const results: SymbolResult[] = (symbols || []).slice(0, 200).map(s => ({
        name: s.name,
        kindLabel: kindLabels[s.kind] ?? 'symbol',
        file: s.location.uri.fsPath,
        relativePath: path.relative(this._cwd, s.location.uri.fsPath).replace(/\\/g, '/'),
        line: s.location.range.start.line + 1,
        container: s.containerName || undefined,
      }));

      this._post({ type: 'symbolResults', results, query });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: 'Symbol search failed.' });
    }
  }

  private async _replaceAll(msg: { query: string; replacement: string; useRegex: boolean; caseSensitive: boolean; wholeWord: boolean; globFilter: string; scope: string }): Promise<void> {
    const cwd = msg.scope === 'here' ? (this._activeDir || this._cwd) : this._cwd;
    let files: string[] | undefined;
    if (msg.scope === 'openFiles') {
      files = vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .map(t => (t.input as { uri?: vscode.Uri })?.uri?.fsPath)
        .filter((f): f is string => typeof f === 'string');
    }

    let results;
    try {
      results = await searchWithRipgrep(msg.query, cwd, msg.useRegex, files, {
        caseSensitive: msg.caseSensitive,
        wholeWord: msg.wholeWord,
        globFilter: msg.globFilter,
      });
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
    this._post({ type: 'replaceApplied' });
  }

  private async _runFileSearch(query: string): Promise<void> {
    const seq = ++this._searchSeq;

    if (!this._cwd) {
      this._post({ type: 'error', message: 'No workspace folder open.' });
      return;
    }

    this._post({ type: 'searching' });

    const now = Date.now();
    if (!this._fileCache || now - this._fileCacheTime > FinderPanel.FILE_CACHE_TTL) {
      this._fileCache = await listFilesWithRipgrep(this._cwd);
      this._fileCacheTime = Date.now();
    }

    if (seq !== this._searchSeq) { return; }

    if (!query.trim()) {
      this._post({ type: 'fileResults', results: [], query });
      return;
    }

    const scored: Array<FileResult & { score: number }> = [];
    for (const f of this._fileCache) {
      const rel = path.relative(this._cwd, f).replace(/\\/g, '/');
      const match = fuzzyScore(rel, query);
      if (match) {
        scored.push({ file: f, relativePath: rel, matchPositions: match.positions, score: match.score });
      }
    }
    scored.sort((a, b) => b.score - a.score);

    const config = vscode.workspace.getConfiguration('spyglass');
    const maxResults = config.get<number>('maxResults', 200);
    const results: FileResult[] = scored.slice(0, maxResults).map(({ file, relativePath, matchPositions }) => ({
      file, relativePath, matchPositions,
    }));

    this._post({ type: 'fileResults', results, query });
  }

  private _runRecentSearch(query: string): void {
    const seq = ++this._searchSeq;
    const config = vscode.workspace.getConfiguration('spyglass');
    const maxResults = config.get<number>('maxResults', 200);

    if (!query.trim()) {
      const results: FileResult[] = this._recentFiles.slice(0, maxResults).map(f => ({
        file: f,
        relativePath: path.relative(this._cwd, f).replace(/\\/g, '/'),
        matchPositions: [],
      }));
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'fileResults', results, query });
      return;
    }

    const scored: Array<FileResult & { score: number }> = [];
    for (const f of this._recentFiles) {
      const rel = path.relative(this._cwd, f).replace(/\\/g, '/');
      const match = fuzzyScore(rel, query);
      if (match) {
        scored.push({ file: f, relativePath: rel, matchPositions: match.positions, score: match.score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    if (seq !== this._searchSeq) { return; }
    const results: FileResult[] = scored.slice(0, maxResults).map(({ file, relativePath, matchPositions }) => ({
      file, relativePath, matchPositions,
    }));
    this._post({ type: 'fileResults', results, query });
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

  private _getChangedLines(filePath: string): Promise<number[]> {
    return new Promise((resolve) => {
      if (!this._cwd) { resolve([]); return; }
      const git = spawn('git', ['diff', 'HEAD', '--unified=0', '--', filePath], { cwd: this._cwd });
      let out = '';
      git.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      git.on('error', () => resolve([]));
      git.on('close', () => {
        const changed = new Set<number>();
        for (const line of out.split('\n')) {
          // Parse: @@ -old +new_start[,new_count] @@
          const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
          if (m) {
            const start = parseInt(m[1], 10);
            const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
            for (let i = 0; i < count; i++) { changed.add(start + i); }
          }
        }
        resolve(Array.from(changed));
      });
    });
  }

  private async _sendPreview(filePath: string, targetLine: number): Promise<void> {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const relativePath = path.relative(this._cwd, filePath).replace(/\\/g, '/');
    try {
      // Use VSCode's document API so we see in-memory edits (e.g. after WorkspaceEdit)
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);

      if (doc.getText().length > 512 * 1024) {
        this._post({ type: 'previewContent', lines: ['(file too large to preview)'], currentLine: 1, relativePath, ext, changedLines: [] });
        return;
      }

      const content = doc.getText();
      const changedLines = await this._getChangedLines(filePath);
      this._post({
        type: 'previewContent',
        lines: content.split('\n'),
        currentLine: targetLine,
        relativePath,
        ext,
        changedLines,
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

  private _buildHtml(defaultScope: Scope, kb: KeyBindings, initialQuery: string = '', searchHistory: string[] = []): string {
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
    /* ── Theme-adaptive: VSCode injects these for every theme ── */
    --f-bg:        var(--vscode-editor-background);
    --f-raised:    var(--vscode-editorWidget-background,    var(--vscode-editor-background));
    --f-border:    var(--vscode-editorWidget-border,        var(--vscode-widget-border, #454545));
    --f-border-s:  var(--vscode-editorGroup-border,         var(--vscode-editorWidget-border, #313244));
    --f-text:      var(--vscode-editor-foreground);
    --f-dim:       var(--vscode-descriptionForeground,      #888);
    --f-ph:        var(--vscode-input-placeholderForeground,var(--vscode-descriptionForeground, #666));
    --f-hover:     var(--vscode-list-hoverBackground);
    --f-sel:       var(--vscode-list-activeSelectionBackground);
    --f-sel-fg:    var(--vscode-list-activeSelectionForeground, var(--vscode-editor-foreground));
    --f-accent:    var(--vscode-focusBorder);
    --f-scrollbar: var(--vscode-scrollbarSlider-background);
    --f-shadow:    var(--vscode-widget-shadow,              rgba(0,0,0,0.5));
    --f-line-hl:   var(--vscode-editor-lineHighlightBackground);
    --f-btn-fg:    var(--vscode-button-foreground,          #fff);

    /* ── Fixed decorative: syntax + match highlights ─────────── */
    --f-match: var(--vscode-editor-findMatchHighlightBackground, rgba(249,226,175,.35));
    --f-kw:    #cba6f7;
    --f-str:   #a6e3a1;
    --f-cmt:   #7f849c;
    --f-num:   #fab387;
    --f-fn:    #89b4fa;
    --f-op:    #f38ba8;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--f-bg);
    color: var(--f-text);
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
    background: var(--f-raised);
    border: 1px solid var(--f-border);
    border-radius: 12px;
    box-shadow: 0 24px 72px var(--f-shadow);
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
    border-bottom: 1px solid var(--f-border-s);
    flex-shrink: 0;
  }

  .search-icon { color: var(--f-dim); font-size: 15px; flex-shrink: 0; }

  #query {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--f-text);
    font-family: inherit;
    font-size: 14px;
    caret-color: var(--f-accent);
    min-width: 0;
  }
  #query::placeholder { color: var(--f-ph); }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--f-border);
    border-radius: 6px;
    color: var(--f-dim);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.12s;
    flex-shrink: 0;
  }
  .icon-btn:hover  { border-color: var(--f-accent); color: var(--f-accent); }
  .icon-btn.active { background: var(--f-accent); border-color: var(--f-accent); color: var(--f-btn-fg); font-weight: 700; }
  .icon-btn:disabled { opacity: 0.3; cursor: default; pointer-events: none; }

  /* ── Scope tabs ──────────────────────────────────────────── */
  .tabs {
    display: flex;
    gap: 2px;
    padding: 6px 14px 0;
    border-bottom: 1px solid var(--f-border-s);
    flex-shrink: 0;
  }

  .tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--f-dim);
    font-family: inherit;
    font-size: 11px;
    padding: 3px 10px 7px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .tab:hover  { color: var(--f-text); }
  .tab.active { color: var(--f-accent); border-bottom-color: var(--f-accent); }

  /* ── Main layout: left + right ───────────────────────────── */
  .layout { display: flex; flex: 1; overflow: hidden; min-height: 0; }

  /* ── Left panel (results) ────────────────────────────────── */
  .left-panel {
    display: flex;
    flex-direction: column;
    width: 38%;
    min-width: 240px;
    max-width: 420px;
    border-right: 1px solid var(--f-border-s);
    overflow: hidden;
    flex-shrink: 0;
  }

  .results-wrap {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--f-scrollbar) transparent;
  }
  .results-wrap::-webkit-scrollbar { width: 5px; }
  .results-wrap::-webkit-scrollbar-thumb { background: var(--f-scrollbar); border-radius: 3px; }

  .state-msg { padding: 28px 16px; text-align: center; color: var(--f-dim); font-size: 12px; }

  .spinner {
    display: inline-block;
    width: 12px; height: 12px;
    border: 2px solid var(--f-border);
    border-top-color: var(--f-accent);
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
  .result:hover    { background: var(--f-hover); }
  .result.selected { background: var(--f-sel);   border-left-color: var(--f-accent); color: var(--f-sel-fg); }

  .result-header { display: flex; align-items: baseline; gap: 5px; margin-bottom: 2px; }
  .result-file   { color: var(--f-accent); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .result-line   { color: var(--f-dim); font-size: 10px; flex-shrink: 0; }
  .result-text   { color: var(--f-dim); font-size: 11px; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .result-text mark { background: var(--f-match); color: inherit; font-weight: 700; border-radius: 2px; padding: 0 1px; }
  .qm { background: var(--f-match); color: inherit; font-weight: 700; border-radius: 2px; padding: 0 1px; }

  .result.selected .result-file { color: var(--f-sel-fg); }
  .result.selected .result-line,
  .result.selected .result-text { color: var(--f-sel-fg); opacity: 0.8; }

  /* ── Right panel (preview) ───────────────────────────────── */
  .right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    background: var(--f-bg);
  }
  .right-panel.hidden { display: none; }
  .left-panel.full    { width: 100%; max-width: none; border-right: none; }

  .preview-header {
    padding: 7px 14px;
    border-bottom: 1px solid var(--f-border-s);
    color: var(--f-dim);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    background: var(--f-raised);
  }

  .preview-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--f-dim);
    font-size: 12px;
  }

  .preview-content {
    flex: 1;
    display: none;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--f-scrollbar) transparent;
  }
  .preview-content::-webkit-scrollbar { width: 5px; }
  .preview-content::-webkit-scrollbar-thumb { background: var(--f-scrollbar); border-radius: 3px; }

  .pline { display: flex; padding: 0 14px; line-height: 1.65; white-space: pre; }
  .pline--cur     { background: var(--f-line-hl); }
  .pline--changed { box-shadow: inset 3px 0 0 var(--vscode-editorGutter-modifiedBackground, #1b81a8); }
  .pnum {
    color: var(--f-dim);
    text-align: right;
    min-width: 4ch;
    margin-right: 16px;
    user-select: none;
    flex-shrink: 0;
    font-size: 11px;
    padding-top: 1px;
  }
  .pline--cur .pnum { color: var(--vscode-editorLineNumber-activeForeground, var(--f-accent)); }
  .ptext { color: var(--f-text); font-size: 12px; }

  /* ── Syntax highlighting (fixed decorative colors) ───────── */
  .hl-kw  { color: var(--f-kw); }
  .hl-str { color: var(--f-str); }
  .hl-cmt { color: var(--f-cmt); font-style: italic; }
  .hl-num { color: var(--f-num); }
  .hl-fn  { color: var(--f-fn); }
  .hl-op  { color: var(--f-op); }

  /* ── Light theme overrides ───────────────────────────────── */
  body.vscode-light { --f-kw: #7c3aed; --f-str: #16a34a; --f-cmt: #6b7280; --f-num: #c2410c; --f-fn: #1d4ed8; --f-op: #dc2626; }

  /* ── High-contrast theme overrides ──────────────────────── */
  body.vscode-high-contrast { --f-kw: #e040fb; --f-str: #80ff80; --f-cmt: #a0a0a0; --f-num: #ffb74d; --f-fn: #81d4fa; --f-op: #ff6e6e; }

  /* ── Filter / replace rows ───────────────────────────────── */
  .filter-row, .replace-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-bottom: 1px solid var(--f-border-s);
    flex-shrink: 0;
  }
  .filter-label {
    color: var(--f-dim);
    font-size: 11px;
    flex-shrink: 0;
    user-select: none;
  }
  #glob-input, #replace-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--f-text);
    font-family: inherit;
    font-size: 13px;
    caret-color: var(--f-accent);
    min-width: 0;
  }
  #glob-input::placeholder, #replace-input::placeholder { color: var(--f-ph); }

  /* ── Multiselect indicator (left accent stripe) ──────────── */
  .result.multi-sel {
    background: color-mix(in srgb, var(--f-accent) 12%, transparent);
    border-left-color: color-mix(in srgb, var(--f-accent) 60%, transparent);
  }
  .result.multi-sel .result-file { opacity: 0.9; }

  /* ── Symbol results ───────────────────────────────────────── */
  .sym-kind {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--f-hover);
    color: var(--f-dim);
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sym-name { color: var(--f-text); font-size: 12px; }
  .sym-container { color: var(--f-dim); font-size: 10px; }

  /* ── Preview header as button ─────────────────────────────── */
  .preview-header-btn {
    padding: 7px 14px;
    border: none;
    border-bottom: 1px solid var(--f-border-s);
    color: var(--f-dim);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    background: var(--f-raised);
    font-family: inherit;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: color 0.12s;
  }
  .preview-header-btn:hover { color: var(--f-accent); }

  /* ── Footer ──────────────────────────────────────────────── */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    border-top: 1px solid var(--f-border-s);
    color: var(--f-dim);
    font-size: 10px;
    flex-shrink: 0;
  }
  .kbd-group { display: flex; gap: 10px; flex-wrap: wrap; }
  kbd {
    background: var(--f-hover);
    border: 1px solid var(--f-border);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: inherit;
    font-size: 9px;
    color: var(--f-dim);
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
  <button type="button" class="icon-btn" id="case-btn" title="Case sensitive (Alt+C)">Aa</button>
  <button type="button" class="icon-btn" id="word-btn" title="Whole word (Alt+W)">\\b</button>
  <button type="button" class="icon-btn" id="replace-btn" title="Replace mode (Alt+R)">⇄</button>
  <button type="button" class="icon-btn active" id="preview-btn" title="Toggle preview (P)">⊡</button>
</div>

<!-- Filter row -->
<div class="filter-row" id="filter-row" style="display:none">
  <span class="filter-label">filter:</span>
  <input id="glob-input" type="text" placeholder="*.ts, !*.test.ts" spellcheck="false" autocomplete="off">
</div>

<!-- Replace row -->
<div class="replace-row" id="replace-row" style="display:none">
  <span class="filter-label">replace:</span>
  <input id="replace-input" type="text" placeholder="replacement text" spellcheck="false" autocomplete="off">
  <button type="button" class="icon-btn" id="replace-all-btn">Replace all</button>
</div>

<!-- Scope tabs -->
<div class="tabs">
  <button type="button" class="tab ${defaultScope === 'project' ? 'active' : ''}" data-scope="project">Project</button>
  <button type="button" class="tab ${defaultScope === 'openFiles' ? 'active' : ''}" data-scope="openFiles">Open Files</button>
  <button type="button" class="tab ${defaultScope === 'files' ? 'active' : ''}" data-scope="files">Files</button>
  <button type="button" class="tab ${defaultScope === 'recent' ? 'active' : ''}" data-scope="recent">Recent</button>
  <button type="button" class="tab ${defaultScope === 'here' ? 'active' : ''}" data-scope="here">Dir</button>
  <button type="button" class="tab ${defaultScope === 'symbols' ? 'active' : ''}" data-scope="symbols">Symbols</button>
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

<!-- Footer -->
<div class="footer">
  <span id="result-info"></span>
  <span class="kbd-group" id="kbd-group"></span>
</div>

</div><!-- .finder -->

<script nonce="${nonce}">
  window.onerror = (msg, src, line, col, err) => {
    document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">'
      + 'JS Error: ' + msg + '\\nLine: ' + line + '\\n' + (err ? err.stack : '') + '</div>';
  };

  const vscode = acquireVsCodeApi();

  // ── Keybindings (from settings) ────────────────────────────────────────────
  const KB = ${JSON.stringify(kb)};
  const INITIAL_QUERY = ${JSON.stringify(initialQuery)};
  const INITIAL_HISTORY = ${JSON.stringify(searchHistory)};

  function matchKey(e, binding) {
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

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    results: [],
    fileResults: [],
    symbolResults: [],
    selected: 0,
    scope: '${defaultScope}',
    useRegex: false,
    caseSensitive: false,
    wholeWord: false,
    globFilter: '',
    replaceMode: false,
    query: '',
    searching: false,
    showPreview: true,
    multiSelected: new Set(),
    searchHistory: INITIAL_HISTORY.slice(),
    historyIndex: -1,
    currentPreviewFile: null,
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const queryEl      = document.getElementById('query');
  const regexBtn     = document.getElementById('regex-btn');
  const caseBtn      = document.getElementById('case-btn');
  const wordBtn      = document.getElementById('word-btn');
  const replaceBtn   = document.getElementById('replace-btn');
  const previewBtn   = document.getElementById('preview-btn');
  const globInput    = document.getElementById('glob-input');
  const filterRow    = document.getElementById('filter-row');
  const replaceRow   = document.getElementById('replace-row');
  const replaceInput = document.getElementById('replace-input');
  const replaceAllBtn= document.getElementById('replace-all-btn');
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

  function highlightPositions(text, positions) {
    const posSet = new Set(positions);
    let html = '';
    for (let i = 0; i < text.length; i++) {
      const c = escHtml(text[i]);
      html += posSet.has(i) ? '<mark>' + c + '</mark>' : c;
    }
    return html;
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

  // ── Query highlight in preview ─────────────────────────────────────────────
  // Inserts <mark class="qm"> at query match positions in syntax-highlighted HTML.
  // Traverses HTML tracking visible-char position, skipping over tags and entities.
  function applyQueryHighlight(html, rawText, queryRe) {
    queryRe.lastIndex = 0;
    const opens = new Set(), closes = new Set();
    let m;
    while ((m = queryRe.exec(rawText)) !== null) {
      if (m[0].length === 0) { queryRe.lastIndex++; continue; }
      opens.add(m.index);
      closes.add(m.index + m[0].length);
    }
    if (!opens.size) { return html; }

    let result = '', visPos = 0, i = 0;
    while (i < html.length) {
      if (closes.has(visPos)) { result += '</mark>'; }
      if (opens.has(visPos))  { result += '<mark class="qm">'; }
      if (html[i] === '<') {
        const end = html.indexOf('>', i);
        result += html.slice(i, end + 1); i = end + 1;
      } else if (html[i] === '&') {
        const end = html.indexOf(';', i);
        result += html.slice(i, end + 1); i = end + 1; visPos++;
      } else {
        result += html[i++]; visPos++;
      }
    }
    if (closes.has(visPos)) { result += '</mark>'; }
    return result;
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  let previewTimer = null;

  function requestPreview() {
    if (isFileScope()) { requestFilePreview(); }
    else if (isSymbolScope()) { requestSymbolPreview(); }
    else { requestTextPreview(); }
  }

  function requestSymbolPreview() {
    if (!state.showPreview) { return; }
    const r = state.symbolResults[state.selected];
    if (!r) { return; }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: 'preview', file: r.file, line: r.line });
    }, 80);
  }

  function requestTextPreview() {
    if (!state.showPreview) { return; }
    const r = state.results[state.selected];
    if (!r) { return; }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: 'preview', file: r.file, line: r.line });
    }, 80);
  }

  function requestFilePreview() {
    if (!state.showPreview) { return; }
    const r = state.fileResults[state.selected];
    if (!r) { return; }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: 'preview', file: r.file, line: 1 });
    }, 80);
  }

  function renderPreview(lines, currentLine, relativePath, ext, changedLines, highlightQuery, useRegex) {
    previewHdr.textContent = relativePath;
    state.currentPreviewFile = relativePath;
    previewEmpty.style.display = 'none';
    previewCont.style.display = 'block';

    let queryRe = null;
    if (highlightQuery) {
      try {
        const pattern = useRegex
          ? highlightQuery
          : highlightQuery.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
        queryRe = new RegExp(pattern, 'gi');
      } catch { /* invalid regex — skip highlighting */ }
    }

    const changedSet = new Set(changedLines || []);
    const frag = document.createDocumentFragment();
    lines.forEach((line, i) => {
      const num = i + 1;
      const isCur = num === currentLine;
      const isChanged = changedSet.has(num);
      const div = document.createElement('div');
      div.className = 'pline'
        + (isCur     ? ' pline--cur'     : '')
        + (isChanged ? ' pline--changed' : '');
      let lineHtml = highlightLine(line, ext);
      if (queryRe) { lineHtml = applyQueryHighlight(lineHtml, line, queryRe); }
      div.innerHTML =
        '<span class="pnum">' + num + '</span>' +
        '<span class="ptext">' + lineHtml + '</span>';
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
    if (isFileScope()) { renderFileResults(); }
    else if (isSymbolScope()) { renderSymbolResults(); }
    else { renderTextResults(); }
  }

  function renderTextResults() {
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
      const isMultiSel = state.multiSelected.has(i);
      const div = document.createElement('div');
      div.className = 'result' + (i === state.selected ? ' selected' : '') + (isMultiSel ? ' multi-sel' : '');
      div.dataset.index = String(i);
      div.innerHTML =
        '<div class="result-header">' +
          '<span class="result-file">' + escHtml(r.relativePath) + '</span>' +
          '<span class="result-line">:' + r.line + '</span>' +
        '</div>' +
        '<div class="result-text">' + highlightMatch(r.text, r.matchStart, r.matchEnd) + '</div>';

      div.addEventListener('click', (e) => {
        if (e.ctrlKey) { toggleSelectResult(i); } else { openResult(i); }
      });
      div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
      frag.appendChild(div);
    });

    wrap.appendChild(frag);
    resultInfo.textContent = state.results.length + ' result' + (state.results.length !== 1 ? 's' : '');
    scrollToSelected();
    requestPreview();
  }

  function renderFileResults() {
    wrap.querySelectorAll('.result').forEach(el => el.remove());

    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }

    if (state.fileResults.length === 0) {
      stateMsg.textContent = state.query
        ? 'No files found.'
        : state.scope === 'recent' ? 'No recent files yet.' : 'Start typing to search files...';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }

    stateMsg.style.display = 'none';

    const frag = document.createDocumentFragment();
    state.fileResults.forEach((r, i) => {
      const lastSlash = r.relativePath.lastIndexOf('/');
      const basenameStart = lastSlash + 1;
      const basename = r.relativePath.slice(basenameStart);
      const dir      = r.relativePath.slice(0, basenameStart);
      const bnPos    = r.matchPositions.filter(p => p >= basenameStart).map(p => p - basenameStart);
      const dirPos   = r.matchPositions.filter(p => p < basenameStart);

      const div = document.createElement('div');
      div.className = 'result' + (i === state.selected ? ' selected' : '');
      div.dataset.index = String(i);
      div.innerHTML =
        '<div class="result-header">' +
          '<span class="result-file">' + highlightPositions(basename, bnPos) + '</span>' +
        '</div>' +
        (dir ? '<div class="result-text">' + highlightPositions(dir, dirPos) + '</div>' : '');

      div.addEventListener('click', () => openResult(i));
      div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
      frag.appendChild(div);
    });

    wrap.appendChild(frag);
    resultInfo.textContent = state.fileResults.length
      + (state.scope === 'recent' ? ' recent file' : ' file')
      + (state.fileResults.length !== 1 ? 's' : '');
    scrollToSelected();
    requestPreview();
  }

  function renderSymbolResults() {
    wrap.querySelectorAll('.result').forEach(el => el.remove());

    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }

    if (state.symbolResults.length === 0) {
      stateMsg.textContent = state.query ? 'No symbols found.' : 'Start typing to search symbols...';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }

    stateMsg.style.display = 'none';

    const frag = document.createDocumentFragment();
    state.symbolResults.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'result' + (i === state.selected ? ' selected' : '');
      div.dataset.index = String(i);
      div.innerHTML =
        '<div class="result-header">' +
          '<span class="sym-kind">' + escHtml(r.kindLabel) + '</span>' +
          '<span class="sym-name">' + escHtml(r.name) + '</span>' +
        '</div>' +
        (r.container ? '<div class="sym-container">' + escHtml(r.container) + '</div>' : '') +
        '<div class="result-text">' + escHtml(r.relativePath) + ':' + r.line + '</div>';

      div.addEventListener('click', () => openResult(i));
      div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
      frag.appendChild(div);
    });

    wrap.appendChild(frag);
    resultInfo.textContent = state.symbolResults.length + ' symbol' + (state.symbolResults.length !== 1 ? 's' : '');
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

  // ── Multi-select ───────────────────────────────────────────────────────────
  function toggleSelectResult(i) {
    if (state.multiSelected.has(i)) { state.multiSelected.delete(i); }
    else { state.multiSelected.add(i); }
    render();
  }

  function selectAll() {
    const len = isTextScope() ? state.results.length : 0;
    for (let i = 0; i < len; i++) { state.multiSelected.add(i); }
    render();
  }

  function openAllSelected() {
    if (state.multiSelected.size === 0) { openResult(state.selected); return; }
    for (const i of state.multiSelected) {
      const r = state.results[i];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: r.line }); }
    }
  }

  function copyCurrentPath() {
    let file = null;
    if (isFileScope()) {
      const r = state.fileResults[state.selected];
      if (r) { file = r.file; }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[state.selected];
      if (r) { file = r.file; }
    } else {
      const r = state.results[state.selected];
      if (r) { file = r.file; }
    }
    if (file) { vscode.postMessage({ type: 'copyPath', path: file }); }
  }

  // ── History ────────────────────────────────────────────────────────────────
  function navigateHistory(dir) {
    if (state.searchHistory.length === 0) { return; }
    state.historyIndex = Math.max(-1, Math.min(state.searchHistory.length - 1, state.historyIndex + dir));
    if (state.historyIndex >= 0) {
      queryEl.value = state.searchHistory[state.historyIndex];
      state.query = queryEl.value;
    }
  }

  // ── Replace ────────────────────────────────────────────────────────────────
  function applyReplaceAll() {
    vscode.postMessage({
      type: 'replaceAll',
      query: state.query,
      replacement: replaceInput.value,
      useRegex: state.useRegex,
      caseSensitive: state.caseSensitive,
      wholeWord: state.wholeWord,
      globFilter: state.globFilter,
      scope: state.scope,
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function openResult(index) {
    if (isFileScope()) {
      const r = state.fileResults[index];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: 1 }); }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[index];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: r.line }); }
    } else {
      const r = state.results[index];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: r.line }); }
    }
  }

  function openResultInSplit(index) {
    if (isFileScope()) {
      const r = state.fileResults[index];
      if (r) { vscode.postMessage({ type: 'openInSplit', file: r.file, line: 1 }); }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[index];
      if (r) { vscode.postMessage({ type: 'openInSplit', file: r.file, line: r.line }); }
    } else {
      const r = state.results[index];
      if (r) { vscode.postMessage({ type: 'openInSplit', file: r.file, line: r.line }); }
    }
  }

  function navigate(delta) {
    const len = isFileScope() ? state.fileResults.length
              : isSymbolScope() ? state.symbolResults.length
              : state.results.length;
    state.selected = Math.max(0, Math.min(state.selected + delta, len - 1));
    updateSelection();
    requestPreview();
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  function isFileScope() { return state.scope === 'files' || state.scope === 'recent'; }
  function isSymbolScope() { return state.scope === 'symbols'; }
  function isTextScope() { return !isFileScope() && !isSymbolScope(); }

  let searchTimer = null;
  function triggerSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (state.scope === 'files') {
        vscode.postMessage({ type: 'fileSearch', query: state.query });
      } else if (state.scope === 'recent') {
        vscode.postMessage({ type: 'recentSearch', query: state.query });
      } else if (state.scope === 'symbols') {
        state.searching = true;
        render();
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

  // ── Scope ──────────────────────────────────────────────────────────────────
  const SCOPES = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols'];

  function updateFilterRowVisibility() {
    const showFilter = isTextScope() && !isSymbolScope();
    filterRow.style.display = showFilter ? '' : 'none';
    replaceRow.style.display = (showFilter && state.replaceMode) ? '' : 'none';
  }

  function setScope(scope) {
    state.scope = scope;
    state.selected = 0;
    state.multiSelected = new Set();
    tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === scope));
    const isFile = isFileScope();
    const isSym = isSymbolScope();
    regexBtn.disabled = isFile || isSym;
    caseBtn.disabled = isFile || isSym;
    wordBtn.disabled = isFile || isSym;
    replaceBtn.disabled = isFile || isSym;
    updateFilterRowVisibility();
    queryEl.placeholder = scope === 'files'    ? 'Search files by name...'
                        : scope === 'recent'   ? 'Filter recent files...'
                        : scope === 'symbols'  ? 'Search symbols...'
                        : scope === 'here'     ? 'Search in current directory...'
                        : 'Search in files...';
    if (state.query || scope === 'recent') {
      triggerSearch();
    } else {
      state.results = [];
      state.fileResults = [];
      state.symbolResults = [];
      state.searching = false;
      render();
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  queryEl.addEventListener('input', () => {
    state.query = queryEl.value;
    state.selected = 0;
    triggerSearch();
  });

  queryEl.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'ArrowUp') {
      e.preventDefault(); navigateHistory(-1);
    } else if (e.ctrlKey && e.key === 'ArrowDown') {
      e.preventDefault(); navigateHistory(1);
    } else if (e.altKey && e.key === 'y') {
      e.preventDefault(); copyCurrentPath();
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

  // Global keys (when input not focused)
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === queryEl) { return; }
    if (matchKey(e, KB.navigateDown))           { e.preventDefault(); navigate(1); }
    else if (matchKey(e, KB.navigateUp))        { e.preventDefault(); navigate(-1); }
    else if (e.altKey && e.key === 'y') { e.preventDefault(); copyCurrentPath(); }
    else if (e.ctrlKey && e.key === ' ')        { e.preventDefault(); toggleSelectResult(state.selected); }
    else if (e.shiftKey && e.key === 'Enter')   { e.preventDefault(); openAllSelected(); }
    else if (e.ctrlKey && e.key === 'a')        { e.preventDefault(); selectAll(); }
    else if (e.ctrlKey && e.key === 'Enter')    { e.preventDefault(); openResultInSplit(state.selected); }
    else if (matchKey(e, KB.open))              { e.preventDefault(); openResult(state.selected); }
    else if (matchKey(e, KB.togglePreview))     { e.preventDefault(); togglePreview(); }
    else if (matchKey(e, KB.close))             { vscode.postMessage({ type: 'close' }); }
    else if (e.key === 'Tab')                   { e.preventDefault(); setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]); }
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope)));

  function toggleRegex() {
    state.useRegex = !state.useRegex;
    regexBtn.classList.toggle('active', state.useRegex);
    if (state.query) { triggerSearch(); }
  }

  function toggleCase() {
    state.caseSensitive = !state.caseSensitive;
    caseBtn.classList.toggle('active', state.caseSensitive);
    if (state.query) { triggerSearch(); }
  }

  function toggleWord() {
    state.wholeWord = !state.wholeWord;
    wordBtn.classList.toggle('active', state.wholeWord);
    if (state.query) { triggerSearch(); }
  }

  function toggleReplaceMode() {
    state.replaceMode = !state.replaceMode;
    replaceBtn.classList.toggle('active', state.replaceMode);
    updateFilterRowVisibility();
    if (state.replaceMode) { replaceInput.focus(); }
  }

  regexBtn.addEventListener('click', toggleRegex);
  caseBtn.addEventListener('click', toggleCase);
  wordBtn.addEventListener('click', toggleWord);
  replaceBtn.addEventListener('click', toggleReplaceMode);
  previewBtn.addEventListener('click', togglePreview);
  replaceAllBtn.addEventListener('click', applyReplaceAll);

  globInput.addEventListener('input', () => {
    state.globFilter = globInput.value;
    if (state.query) { triggerSearch(); }
  });

  previewHdr.addEventListener('click', () => {
    if (state.currentPreviewFile) {
      let absFile = null;
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
        renderPreview(data.lines, data.currentLine, data.relativePath, data.ext, data.changedLines,
          (isFileScope() || isSymbolScope()) ? '' : state.query, state.useRegex);
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
      case 'setQuery':
        queryEl.value = data.query;
        state.query = data.query;
        state.selected = 0;
        queryEl.focus();
        queryEl.select();
        triggerSearch();
        break;
      case 'replaceApplied':
        state.selected = 0;
        triggerSearch();
        break;
    }
  });

  // ── Footer kbd hints ───────────────────────────────────────────────────────
  (function buildFooter() {
    const KEY_NAMES = {
      arrowdown: '↓', arrowup: '↑', arrowleft: '←', arrowright: '→',
      escape: 'Esc', enter: '↵', tab: 'Tab', backspace: 'BS', delete: 'Del',
    };
    function fmtKey(k) {
      return k.split('+').map(function(p) {
        const d = KEY_NAMES[p.toLowerCase()] || (p.charAt(0).toUpperCase() + p.slice(1));
        return '<kbd>' + escHtml(d) + '</kbd>';
      }).join('');
    }
    document.getElementById('kbd-group').innerHTML =
      '<span>' + fmtKey(KB.navigateDown) + ' nav</span>' +
      '<span>' + fmtKey(KB.open)         + ' open</span>' +
      '<span><kbd>Ctrl</kbd><kbd>↵</kbd> split</span>' +
      '<span><kbd>Tab</kbd> scope</span>' +
      '<span>' + fmtKey(KB.toggleRegex)  + ' regex</span>' +
      '<span><kbd>Alt</kbd><kbd>C</kbd> case</span>' +
      '<span><kbd>Alt</kbd><kbd>W</kbd> word</span>' +
      '<span><kbd>Ctrl</kbd><kbd>↑</kbd> history</span>' +
      '<span><kbd>Alt</kbd><kbd>Y</kbd> copy path</span>' +
      '<span><kbd>Ctrl</kbd><kbd>Space</kbd> select</span>' +
      '<span>' + fmtKey(KB.togglePreview)+ ' preview</span>' +
      '<span>' + fmtKey(KB.close)        + ' close</span>';

    regexBtn.title   = 'Toggle regex (' + KB.toggleRegex + ')';
    previewBtn.title = 'Toggle preview (' + KB.togglePreview + ')';
  })();

  // ── Init ───────────────────────────────────────────────────────────────────
  state.useRegex = false;
  regexBtn.classList.remove('active');
  updateFilterRowVisibility();
  if (isFileScope() || isSymbolScope()) {
    regexBtn.disabled = true;
    caseBtn.disabled = true;
    wordBtn.disabled = true;
    replaceBtn.disabled = true;
    queryEl.placeholder = state.scope === 'recent'  ? 'Filter recent files...'
                        : state.scope === 'symbols' ? 'Search symbols...'
                        : 'Search files by name...';
  }
  if (INITIAL_QUERY) {
    queryEl.value = INITIAL_QUERY;
    state.query = INITIAL_QUERY;
    queryEl.select();
    triggerSearch();
  } else if (state.scope === 'recent') {
    triggerSearch(); // show all recent files immediately
  }
  queryEl.focus();
</script>
</body>
</html>`;
  }
}
