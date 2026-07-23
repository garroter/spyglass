import * as vscode from 'vscode';
import * as path from 'path';
import { searchWithRipgrep, listFilesWithRipgrep, isRipgrepAvailable, CancellableSearch } from './ripgrep';
import { Scope, KeyBindings, ButtonPrefs } from './types';
import { getUiStrings, UiStrings } from './i18n';
import { cwdForFile, makeRelative } from './workspaceUtils';
import { loadGitStatus, getChangedLines, relToAbsolute } from './gitUtils';
import { runSymbolSearch, runDocSymbolSearch } from './symbolSearch';
import { loadCurrentTheme } from './themeLoader';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class SpyglassSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'spyglass.sidebarView';

  private _view?: vscode.WebviewView;
  private _scope: Scope = 'project';
  private _cwd: string = '';
  private _cwdList: string[] = [];
  private _fileCache: Array<{ file: string; rel: string }> | null = null;
  private _fileCacheTime = 0;
  private static readonly FILE_CACHE_TTL = 60_000;
  private _searchSeq = 0;
  private _currentSearches: CancellableSearch[] = [];
  private _gitCache = new Map<string, number[]>();
  private _recentFiles: string[] = [];
  private _searchHistory: string[] = [];
  private _activeDir: string = '';
  private _activeFile: string = '';
  private _activeCursorFile: string = '';
  private _activeCursorLine: number = 0;
  private _activeCursorChar: number = 0;
  private _pendingReplace: any = null;
  private _rgAvailable: boolean | null = null;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  private async _ensureRg(): Promise<boolean> {
    if (this._rgAvailable === null) { this._rgAvailable = await isRipgrepAvailable(this._context); }
    return this._rgAvailable;
  }

  private _postRgError(): void {
    const s = getUiStrings();
    this._post({ type: 'error', message: s.ripgrepNotFound });
    vscode.window.showErrorMessage(s.ripgrepNotFound, s.openSettings).then(sel => {
      if (sel === s.openSettings) { vscode.commands.executeCommand('workbench.action.openSettings', 'spyglass.ripgrepPath'); }
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    this._cwdList = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
    this._cwd = this._cwdList[0] ?? '';
    this._recentFiles = this._context.workspaceState.get<string[]>('spyglass.recentFiles', []);
    this._searchHistory = this._context.workspaceState.get<string[]>('spyglass.searchHistory', []);

    this._refreshActiveContext();

    const config = vscode.workspace.getConfiguration('spyglass');
    const validScopes: Scope[] = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols', 'git', 'doc', 'refs'];
    const lastScope = this._context.workspaceState.get<string>('spyglass.lastScope');
    const rawScope = lastScope ?? config.get<string>('defaultScope', 'project');
    this._scope = validScopes.includes(rawScope as Scope) ? rawScope as Scope : 'project';

    const kb: KeyBindings = {
      navigateDown:  config.get<string>('keybindings.navigateDown',  'ArrowDown'),
      navigateUp:    config.get<string>('keybindings.navigateUp',    'ArrowUp'),
      open:          config.get<string>('keybindings.open',          'Enter'),
      close:         config.get<string>('keybindings.close',         'Escape'),
      toggleRegex:   config.get<string>('keybindings.toggleRegex',   'shift+alt+r'),
      togglePreview: config.get<string>('keybindings.togglePreview', 'shift+alt+p'),
    };

    const maxResults = config.get<number>('maxResults', 200);
    const pinnedFiles = this._context.workspaceState.get<string[]>('spyglass.pinnedFiles', []);
    const groupResults = this._context.workspaceState.get<boolean>('spyglass.groupResults', false);
    const buttonPrefs = this._context.workspaceState.get<ButtonPrefs>('spyglass.buttonPrefs', {
      useRegex: false, caseSensitive: false, wholeWord: false,
      replaceMode: false, showPreview: true, sortBy: 'default', includeMode: false,
    });
    const savedSearches = this._context.workspaceState.get<Array<{ query: string; scope: string }>>('spyglass.savedSearches', []);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, 'media')],
    };
    webviewView.webview.html = this._buildHtml(webviewView.webview, this._scope, kb, '', this._searchHistory, this._recentFiles, maxResults, pinnedFiles, groupResults, buttonPrefs, savedSearches);

    // Warm file cache in background
    if (this._cwdList.length > 0) {
      const exclude = config.get<string[]>('exclude');
      Promise.all(this._cwdList.map(cwd => listFilesWithRipgrep(cwd, exclude ?? undefined))).then(lists => {
        this._fileCache = lists.flatMap(files => files.map(f => ({ file: f, rel: this._makeRelative(f) })));
        this._fileCacheTime = Date.now();
        this._post({ type: 'fileList', files: this._fileCache });
      });
      this._loadGitStatus();
    }

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._refreshActiveContext();
      }
    });

    vscode.window.onDidChangeActiveColorTheme(() => {
      this._post({ type: 'themeChanged', theme: loadCurrentTheme() });
    }, null, this._context.subscriptions);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'search': {
          this._scope = msg.scope as Scope;
          const query = msg.query as string;
          const includeFilter = (msg.includeFilter as string) || '';
          const rawGlob = (msg.globFilter as string) || '';
          const mergedGlob = [rawGlob, includeFilter].filter(Boolean).join(',');
          const opts = { caseSensitive: !!msg.caseSensitive, wholeWord: !!msg.wholeWord, globFilter: mergedGlob };
          if (query.trim()) {
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
        case 'docSearch':
          await this._runDocSearch();
          break;
        case 'refsSearch':
          await this._runRefsSearch();
          break;
        case 'copyPath':
          await vscode.env.clipboard.writeText(msg.path as string);
          break;
        case 'setPinnedFiles': {
          const files = (msg.files as { file: string; rel: string }[]).map(f => f.file);
          await this._context.workspaceState.update('spyglass.pinnedFiles', files);
          break;
        }
        case 'setGroupResults':
          await this._context.workspaceState.update('spyglass.groupResults', msg.value as boolean);
          break;
        case 'saveButtonPrefs':
          await this._context.workspaceState.update('spyglass.buttonPrefs', msg.prefs as ButtonPrefs);
          break;
        case 'saveSearch': {
          const searches = this._context.workspaceState.get<Array<{ query: string; scope: string }>>('spyglass.savedSearches', []);
          const entry = { query: msg.query as string, scope: msg.scope as string };
          const updated = [entry, ...searches.filter(s => !(s.query === entry.query && s.scope === entry.scope))];
          await this._context.workspaceState.update('spyglass.savedSearches', updated);
          this._post({ type: 'savedSearches', searches: updated });
          break;
        }
        case 'removeSavedSearch': {
          const searches2 = this._context.workspaceState.get<Array<{ query: string; scope: string }>>('spyglass.savedSearches', []);
          const updated2 = searches2.filter((_, idx) => idx !== (msg.index as number));
          await this._context.workspaceState.update('spyglass.savedSearches', updated2);
          this._post({ type: 'savedSearches', searches: updated2 });
          break;
        }
        case 'revealFile':
          await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.file as string));
          break;
        case 'replacePreview':
          await this._buildReplacePreview(msg);
          break;
        case 'replaceAll':
          if (this._pendingReplace) {
            await this._replaceAll(this._pendingReplace);
            this._pendingReplace = null;
          } else {
            await this._replaceAll(msg);
          }
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
          this._context.workspaceState.update('spyglass.lastScope', this._scope);
          break;
        case 'close':
          // Sidebar stays open — do nothing on Esc
          break;
      }
    });
  }

  private _refreshActiveContext(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file') {
      this._activeDir = path.dirname(editor.document.uri.fsPath);
      this._activeFile = editor.document.uri.fsPath;
      this._activeCursorFile = editor.document.uri.fsPath;
      this._activeCursorLine = editor.selection.active.line;
      this._activeCursorChar = editor.selection.active.character;
    }
    this._post({ type: 'focus' });
  }

  private _post(msg: object): void {
    this._view?.webview.postMessage(msg);
  }

  private async _runSearch(query: string, useRegex: boolean, opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string }): Promise<void> {
    this._currentSearches.forEach(s => s.cancel());
    this._currentSearches = [];
    const seq = ++this._searchSeq;
    const config = vscode.workspace.getConfiguration('spyglass');
    const maxResults = config.get<number>('maxResults', 200);
    const exclude = config.get<string[]>('exclude');

    if (!await this._ensureRg()) { this._postRgError(); return; }

    if (!query.trim()) {
      this._post({ type: 'results', results: [], query, took: 0 });
      return;
    }

    if (this._cwdList.length === 0) {
      this._post({ type: 'error', message: getUiStrings().noWorkspace });
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
      this._post({ type: 'error', message: getUiStrings().searchFailed });
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

    if (!await this._ensureRg()) { this._postRgError(); return; }

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
      this._post({ type: 'error', message: getUiStrings().searchFailed });
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
      this._post({ type: 'error', message: getUiStrings().symbolSearchFailed });
    }
  }

  private async _runDocSearch(): Promise<void> {
    const seq = ++this._searchSeq;
    if (!this._activeFile) {
      this._post({ type: 'docResults', results: [] });
      this._post({ type: 'error', message: 'No active file — open a file first.' });
      return;
    }
    try {
      const results = await runDocSymbolSearch(this._activeFile, fp => this._makeRelative(fp));
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'docResults', results });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: getUiStrings().docSymbolSearchFailed });
    }
  }

  private async _runRefsSearch(): Promise<void> {
    const seq = ++this._searchSeq;
    // Always refresh cursor position — sidebar stays open while user moves in the editor
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file') {
      this._activeCursorFile = editor.document.uri.fsPath;
      this._activeCursorLine = editor.selection.active.line;
      this._activeCursorChar = editor.selection.active.character;
    }
    if (!this._activeCursorFile) {
      this._post({ type: 'results', results: [], query: '', took: 0 });
      this._post({ type: 'error', message: 'No active file — open a file first.' });
      return;
    }
    try {
      const { promises: fsp } = await import('fs');

      let symbolName = '';
      try {
        const src = await fsp.readFile(this._activeCursorFile, 'utf-8');
        const line = src.split('\n')[this._activeCursorLine] ?? '';
        const ch = this._activeCursorChar;
        const before = line.slice(0, ch + 1).match(/[\w$]+$/)?.[0] ?? '';
        const after  = line.slice(ch + 1).match(/^[\w$]*/)?.[0] ?? '';
        symbolName = before + after;
      } catch { /* ignore */ }

      const uri = vscode.Uri.file(this._activeCursorFile);
      const position = new vscode.Position(this._activeCursorLine, this._activeCursorChar);
      const locs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider', uri, position
      );
      if (seq !== this._searchSeq) { return; }
      if (!symbolName) {
        this._post({ type: 'results', results: [], query: '', took: 0, refsSymbol: '' });
        this._post({ type: 'error', message: 'Place cursor on a symbol, then switch to Refs.' });
        return;
      }
      if (!locs || locs.length === 0) {
        this._post({ type: 'results', results: [], query: '', took: 0, refsSymbol: symbolName });
        return;
      }
      const results: import('./types').SearchResult[] = [];
      for (const loc of locs) {
        const filePath = loc.uri.fsPath;
        try {
          const content = await fsp.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          const lineNum = loc.range.start.line + 1;
          const text = lines[loc.range.start.line] ?? '';
          results.push({
            file: filePath,
            relativePath: this._makeRelative(filePath),
            line: lineNum,
            text,
            matchStart: loc.range.start.character,
            matchEnd: loc.range.end.character,
          });
        } catch { /* skip */ }
      }
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'results', results, query: '', took: 0, refsSymbol: symbolName });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this._post({ type: 'error', message: getUiStrings().referenceSearchFailed });
    }
  }

  private async _buildReplacePreview(msg: { query: string; replacement: string; useRegex: boolean; caseSensitive: boolean; wholeWord: boolean; globFilter: string; scope: string }): Promise<void> {
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
      vscode.window.showErrorMessage('Spyglass: Replace preview failed — search error.');
      return;
    }
    if (results.length === 0) {
      vscode.window.showInformationMessage('Spyglass: No matches found to replace.');
      return;
    }
    const pattern = msg.useRegex
      ? new RegExp(msg.query, msg.caseSensitive ? 'g' : 'gi')
      : new RegExp(msg.query.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&'), msg.caseSensitive ? 'g' : 'gi');

    const fileGroups = new Map<string, typeof results>();
    for (const r of results) {
      const arr = fileGroups.get(r.file) ?? [];
      arr.push(r);
      fileGroups.set(r.file, arr);
    }
    const { promises: fsp } = await import('fs');
    const previewFiles: Array<{ relativePath: string; changesCount: number; lines: Array<{ line: number; before: string; after: string }> }> = [];
    for (const [filePath, fileResults] of fileGroups) {
      try {
        const content = await fsp.readFile(filePath, 'utf-8');
        const contentLines = content.split('\n');
        const changedLineNums = new Set(fileResults.map(r => r.line));
        const lines: Array<{ line: number; before: string; after: string }> = [];
        for (const lineNum of changedLineNums) {
          const idx = lineNum - 1;
          if (idx >= 0 && idx < contentLines.length) {
            const before = contentLines[idx];
            const after = before.replace(pattern, msg.replacement);
            if (before !== after) { lines.push({ line: lineNum, before, after }); }
          }
        }
        if (lines.length > 0) {
          previewFiles.push({ relativePath: this._makeRelative(filePath), changesCount: lines.length, lines });
        }
      } catch { /* skip */ }
    }
    this._pendingReplace = msg;
    this._post({ type: 'replacePreviewData', files: previewFiles });
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
      this._post({ type: 'error', message: getUiStrings().noWorkspace });
      return;
    }

    const now = Date.now();
    if (!this._fileCache || now - this._fileCacheTime > SpyglassSidebarProvider.FILE_CACHE_TTL) {
      const exclude = vscode.workspace.getConfiguration('spyglass').get<string[]>('exclude');
      const lists = await Promise.all(this._cwdList.map(cwd => listFilesWithRipgrep(cwd, exclude ?? undefined)));
      this._fileCache = lists.flatMap(files => files.map(f => ({ file: f, rel: this._makeRelative(f) })));
      this._fileCacheTime = Date.now();
    }

    this._post({ type: 'fileList', files: this._fileCache });
  }

  private async _openFile(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      // Do NOT dispose — sidebar stays open
    } catch {
      vscode.window.showErrorMessage(`Spyglass: Could not open file ${filePath}`);
    }
  }

  private async _openFileInSplit(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      // Do NOT dispose — sidebar stays open
    } catch {
      vscode.window.showErrorMessage(`Spyglass: Could not open file ${filePath}`);
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
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);

      const content = doc.getText();
      if (content.length > 512 * 1024) {
        this._post({ type: 'previewContent', content: '(file too large to preview)', currentLine: 1, relativePath, ext: '', changedLines: [] });
        return;
      }

      const changedLines = await getChangedLines(filePath, cwdForFile(filePath, this._cwdList, this._cwd), this._gitCache);
      this._post({ type: 'previewContent', content, currentLine: targetLine, relativePath, ext, changedLines });
    } catch {
      this._post({ type: 'previewContent', content: '(cannot read file)', currentLine: 1, relativePath, ext: '', changedLines: [] });
    }
  }

  private _buildHtml(
    webview: vscode.Webview,
    defaultScope: Scope,
    kb: KeyBindings,
    initialQuery: string = '',
    searchHistory: string[] = [],
    recentFiles: string[] = [],
    maxResults: number = 200,
    pinnedFiles: string[] = [],
    groupResults: boolean = false,
    buttonPrefs: ButtonPrefs = { useRegex: false, caseSensitive: false, wholeWord: false, replaceMode: false, showPreview: true, sortBy: 'default', includeMode: false },
    savedSearches: Array<{ query: string; scope: string }> = [],
  ): string {
    const nonce = getNonce();
    const extensionUri = this._context.extensionUri;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
    const jsUri  = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'));

    const s = getUiStrings();

    const config = {
      KB: kb,
      INITIAL_QUERY: initialQuery,
      INITIAL_HISTORY: searchHistory,
      RECENT_FILES: recentFiles.map(f => ({ file: f, rel: this._makeRelative(f) })),
      PINNED_FILES: pinnedFiles.filter(f => require('fs').existsSync(f)).map(f => ({ file: f, rel: this._makeRelative(f) })),
      MAX_RESULTS: maxResults,
      DEFAULT_SCOPE: defaultScope,
      GROUP_RESULTS: groupResults,
      BUTTON_PREFS: buttonPrefs,
      SAVED_SEARCHES: savedSearches,
      THEME: loadCurrentTheme(),
      STRINGS: s,
    };

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spyglass</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body class="sidebar-mode">

<div class="finder">

<!-- Top bar -->
<div class="topbar">
  <span class="search-icon"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="10.2" y1="10.2" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
  <input id="query" type="text" placeholder="${s.searchPlaceholder}" autocomplete="off" spellcheck="false">
  <button type="button" class="icon-btn" id="regex-btn" aria-label="${s.regex}" data-tooltip="${s.regex} — ${kb.toggleRegex || 'Shift+Alt+R'}">.*</button>
  <button type="button" class="icon-btn" id="case-btn" aria-label="${s.caseSensitive}" data-tooltip="${s.caseSensitive} — Alt+C">Aa</button>
  <button type="button" class="icon-btn" id="word-btn" aria-label="${s.wholeWord}" data-tooltip="${s.wholeWord} — Alt+W">\\b</button>
  <button type="button" class="icon-btn" id="replace-btn" aria-label="${s.replaceMode}" data-tooltip="${s.replaceMode} — Alt+R">⇄</button>
  <button type="button" class="icon-btn active" id="preview-btn" aria-label="${s.togglePreview}" data-tooltip="${s.togglePreview} — ${kb.togglePreview || 'Shift+Alt+P'}">⊡</button>
  <div class="secondary-btns" id="secondary-toolbar" style="display:none">
    <button type="button" class="icon-btn" id="group-btn" aria-label="${s.groupByFile}" data-tooltip="${s.groupByFile} — Alt+L">▤</button>
    <button type="button" class="icon-btn" id="sort-btn" aria-label="${s.sortDefault}" data-tooltip="${s.sortDefault} — Alt+S">⇅</button>
    <button type="button" class="icon-btn" id="include-btn" aria-label="${s.includeFilter}" data-tooltip="${s.includeFilter} — Alt+I">⊂</button>
    <button type="button" class="icon-btn" id="bookmarks-btn" aria-label="${s.savedSearches}" data-tooltip="${s.savedSearches} — Alt+B">★</button>
    <button type="button" class="icon-btn" id="help-btn" aria-label="${s.keyboardShortcuts}" data-tooltip="${s.keyboardShortcuts}">?</button>
  </div>
  <button type="button" class="icon-btn" id="more-btn" aria-label="${s.moreOptions}" data-tooltip="${s.moreOptions}">⋯</button>
</div>

<!-- Replace row -->
<div class="replace-row" id="replace-row" style="display:none">
  <span class="filter-label">${s.replaceLabel}</span>
  <input id="replace-input" type="text" placeholder="${s.replacePlaceholder}" spellcheck="false" autocomplete="off">
  <button type="button" class="icon-btn" id="replace-all-btn">${s.replaceAll}</button>
</div>

<!-- Include filter row -->
<div class="replace-row" id="include-row" style="display:none">
  <span class="filter-label">${s.includeLabel}</span>
  <input id="include-input" type="text" placeholder="${s.includePlaceholder}" spellcheck="false" autocomplete="off">
</div>

<!-- Scope tabs -->
<div class="tabs">
  <button type="button" class="tab" data-scope="project">${s.project}</button>
  <button type="button" class="tab" data-scope="openFiles">${s.openFiles}</button>
  <button type="button" class="tab" data-scope="files">${s.files}</button>
  <button type="button" class="tab" data-scope="recent">${s.recent}</button>
  <button type="button" class="tab" data-scope="here">${s.dir}</button>
  <button type="button" class="tab" data-scope="symbols">${s.symbols}</button>
  <button type="button" class="tab" data-scope="git">${s.git}</button>
  <button type="button" class="tab" data-scope="doc">${s.doc}</button>
  <button type="button" class="tab" data-scope="refs">${s.refs}</button>
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
    <button type="button" class="preview-header-btn" id="preview-header" title="Reveal in Explorer">${s.noFileSelected}</button>
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
<div class="shortcuts-overlay" id="shortcuts-overlay">${s.shortcutsContent}</div>

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
