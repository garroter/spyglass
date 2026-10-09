import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { searchWithRipgrep, listFilesWithRipgrep, isRipgrepAvailable, CancellableSearch, readSearchLimits } from './ripgrep';
import { Scope, KeyBindings, ButtonPrefs } from './types';
import { getUiStrings, UiStrings } from './i18n';
import { cwdForFile, makeRelative } from './workspaceUtils';
import { loadGitStatus, getChangedLines, relToAbsolute } from './gitUtils';
import { runSymbolSearch, runDocSymbolSearch } from './symbolSearch';
import { loadCurrentTheme } from './themeLoader';
import { getNonce, renderWebviewHtml, WebviewConfig } from './webviewHtml';
import { isScope } from './scopeCommands';
import { getRankedRecentFiles } from './recentFiles';

/** Scope to start in: the one used last time, else the setting, else Project. Unknown values are ignored. */
export function resolveInitialScope(lastScope: string | undefined, configured: string | undefined): Scope {
  const raw = lastScope ?? configured ?? 'project';
  return isScope(raw) ? raw : 'project';
}

/**
 * What differs between the popup and the sidebar: where messages go, and what
 * "open" / "close" mean. Everything else lives in SpyglassController.
 */
export interface SpyglassHost {
  readonly webview: vscode.Webview;
  /** `line` and `column` are 1-based; a missing column means the start of the line. */
  openFile(filePath: string, line: number, column?: number): Promise<void>;
  openFileInSplit(filePath: string, line: number, column?: number): Promise<void>;
  close(): void;
}

/**
 * Puts the cursor at a 1-based line and column and scrolls it into view. Positions past the end of
 * the line or the file are moved back onto it, as `util.ts:9999` does in Quick Open.
 */
export function revealPosition(editor: vscode.TextEditor, line: number, column?: number): void {
  const pos = editor.document.validatePosition(new vscode.Position(Math.max(0, line - 1), Math.max(0, (column ?? 1) - 1)));
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

export interface ActiveContext {
  dir: string;
  file: string;
  line: number;
  character: number;
}

export interface ControllerOptions {
  /** Render the sidebar layout instead of the popup card. */
  sidebarMode: boolean;
  /** Pre-filled query (e.g. the editor selection when the popup was opened). */
  initialQuery?: string;
  /** Start in this scope instead of the remembered one (what a "Find …" command asks for). It is not remembered. */
  initialScope?: Scope;
}

// Messages arrive from the webview script and are only shape-checked by the casts below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebviewMessage = { type: string; [key: string]: any };

interface ReplaceRequest extends WebviewMessage {
  query: string;
  replacement: string;
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  globFilter: string;
  scope: string;
  includeIgnored?: boolean;
  multiline?: boolean;
}

/**
 * Search state and behaviour shared by the popup (FinderPanel) and the sidebar
 * (SpyglassSidebarProvider): it renders the page into the host's webview, answers
 * the webview's messages, and runs the searches.
 */
export class SpyglassController {
  private static readonly FILE_CACHE_TTL = 60_000;

  private readonly _disposables: vscode.Disposable[] = [];
  private _scope: Scope;
  private _cwd: string;
  private _cwdList: string[];
  private _fileCache: Array<{ file: string; rel: string }> | null = null;
  private _fileCacheTime = 0;
  /** Whether the cached file list includes ignored and hidden files. */
  private _fileCacheIgnored = false;
  private _searchSeq = 0;
  private _currentSearches: CancellableSearch[] = [];
  private _gitCache = new Map<string, number[]>();
  private _searchHistory: string[];
  private _activeDir = '';
  private _activeFile = '';
  private _activeCursorFile = '';
  private _activeCursorLine = 0;
  private _activeCursorChar = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _pendingReplace: any = null;
  private _rgAvailable: boolean | null = null;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _host: SpyglassHost,
    private readonly _options: ControllerOptions,
  ) {
    const state = _context.workspaceState;
    this._cwdList = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
    this._cwd = this._cwdList[0] ?? '';
    this._searchHistory = state.get<string[]>('spyglass.searchHistory', []);
    this._scope = isScope(_options.initialScope)
      ? _options.initialScope
      : resolveInitialScope(
        state.get<string>('spyglass.lastScope'),
        vscode.workspace.getConfiguration('spyglass').get<string>('defaultScope', 'project'),
      );

    this._disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.post({ type: 'themeChanged', theme: loadCurrentTheme() });
      }),
      _host.webview.onDidReceiveMessage((msg: WebviewMessage) => this._handleMessage(msg)),
    );
  }

  /** Renders the page into the host's webview and warms the file and git caches in the background. */
  public mount(): void {
    this._host.webview.html = this._buildHtml();

    if (this._cwdList.length > 0) {
      const exclude = vscode.workspace.getConfiguration('spyglass').get<string[]>('exclude');
      const includeIgnored = this._buttonPrefs().includeIgnored;
      Promise.all(this._cwdList.map(cwd => listFilesWithRipgrep(cwd, exclude ?? undefined, includeIgnored))).then(lists => {
        this._fileCache = lists.flatMap(files => files.map(f => ({ file: f, rel: this._makeRelative(f) })));
        this._fileCacheTime = Date.now();
        this._fileCacheIgnored = includeIgnored;
        this.post({ type: 'fileList', files: this._fileCache, includeIgnored });
      });
      this._loadGitStatus();
    }
  }

  public post(msg: object): void {
    this._host.webview.postMessage(msg);
  }

  /** Asks the page to switch to `scope`, e.g. a "Find …" command while the popup is already open. Not remembered. */
  public showScope(scope: Scope): void {
    if (!isScope(scope)) { return; }
    this.post({ type: 'setScope', scope });
  }

  /** Records which file/directory/cursor the "Dir" and "Refs" scopes should work from. */
  public setActiveContext(ctx: ActiveContext): void {
    this._activeDir = ctx.dir;
    this._activeFile = ctx.file;
    this._activeCursorFile = ctx.file;
    this._activeCursorLine = ctx.line;
    this._activeCursorChar = ctx.character;
  }

  /** Points the "Dir" scope at a folder picked explicitly (e.g. in the Explorer), leaving the active file alone. */
  public setActiveDirectory(dir: string): void {
    this._activeDir = dir;
  }

  /** Re-reads the active editor (if it is a real file) and asks the page to focus its input. */
  public refreshActiveContext(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file') {
      this.setActiveContext({
        dir: path.dirname(editor.document.uri.fsPath),
        file: editor.document.uri.fsPath,
        line: editor.selection.active.line,
        character: editor.selection.active.character,
      });
    }
    this.post({ type: 'focus' });
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  private _strings(): UiStrings { return getUiStrings(); }

  /** Recent files, best first (see recentFiles.ts). Read fresh each time: they change while the popup or sidebar is open. */
  private _rankedRecent(): string[] {
    return getRankedRecentFiles(this._context.workspaceState);
  }

  /** The remembered toolbar toggles; anything missing (e.g. saved by an older version) gets its default. */
  private _buttonPrefs(): ButtonPrefs {
    return {
      useRegex: false, caseSensitive: false, wholeWord: false,
      replaceMode: false, showPreview: true, sortBy: 'default', includeMode: false, includeIgnored: false, multiline: false,
      ...this._context.workspaceState.get<Partial<ButtonPrefs>>('spyglass.buttonPrefs', {}),
    };
  }

  private async _ensureRg(): Promise<boolean> {
    if (this._rgAvailable === null) { this._rgAvailable = await isRipgrepAvailable(this._context); }
    return this._rgAvailable;
  }

  private _postRgError(): void {
    const s = getUiStrings();
    this.post({ type: 'error', message: s.ripgrepNotFound });
    vscode.window.showErrorMessage(s.ripgrepNotFound, s.openSettings).then(sel => {
      if (sel === s.openSettings) { vscode.commands.executeCommand('workbench.action.openSettings', 'spyglass.ripgrepPath'); }
    });
  }

  private _buildHtml(): string {
    const config = vscode.workspace.getConfiguration('spyglass');
    const state = this._context.workspaceState;
    const kb: KeyBindings = {
      navigateDown:   config.get<string>('keybindings.navigateDown',   'ArrowDown'),
      navigateUp:     config.get<string>('keybindings.navigateUp',     'ArrowUp'),
      open:           config.get<string>('keybindings.open',           'Enter'),
      close:          config.get<string>('keybindings.close',          'Escape'),
      toggleRegex:    config.get<string>('keybindings.toggleRegex',    'shift+alt+r'),
      togglePreview:  config.get<string>('keybindings.togglePreview',  'shift+alt+p'),
    };
    const buttonPrefs = this._buttonPrefs();
    const toEntry = (f: string) => ({ file: f, rel: this._makeRelative(f) });
    const pageConfig: WebviewConfig = {
      KB: kb,
      INITIAL_QUERY: this._options.initialQuery ?? '',
      INITIAL_HISTORY: this._searchHistory,
      RECENT_FILES: this._rankedRecent().map(toEntry),
      PINNED_FILES: state.get<string[]>('spyglass.pinnedFiles', []).filter(f => fs.existsSync(f)).map(toEntry),
      MAX_RESULTS: readSearchLimits().maxResults,
      DEFAULT_SCOPE: this._scope,
      GROUP_RESULTS: state.get<boolean>('spyglass.groupResults', false),
      BUTTON_PREFS: buttonPrefs,
      SAVED_SEARCHES: state.get<Array<{ query: string; scope: string }>>('spyglass.savedSearches', []),
      STRINGS: getUiStrings(),
      THEME: loadCurrentTheme(),
    };

    const webview = this._host.webview;
    const mediaUri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', file)).toString();
    return renderWebviewHtml({
      cspSource: webview.cspSource,
      cssUri: mediaUri('webview.css'),
      jsUri: mediaUri('webview.js'),
      nonce: getNonce(),
      sidebarMode: this._options.sidebarMode,
      config: pageConfig,
    });
  }

  private async _handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'search': {
        this._scope = msg.scope as Scope;
        const query = msg.query as string;
        const includeFilter = (msg.includeFilter as string) || '';
        const rawGlob = (msg.globFilter as string) || '';
        const mergedGlob = [rawGlob, includeFilter].filter(Boolean).join(',');
        const opts = { caseSensitive: !!msg.caseSensitive, wholeWord: !!msg.wholeWord, globFilter: mergedGlob, includeIgnored: !!msg.includeIgnored, multiline: !!msg.multiline };
        if (query.trim() && !msg.fromHistory) {
          const hist = [query, ...this._searchHistory.filter(h => h !== query)].slice(0, 50);
          this._searchHistory = hist;
          this._context.workspaceState.update('spyglass.searchHistory', hist);
          this.post({ type: 'searchHistory', history: hist });
        }
        if (msg.scope === 'here') {
          await this._runHereSearch(query, msg.useRegex as boolean, opts);
        } else {
          await this._runSearch(query, msg.useRegex as boolean, opts);
        }
        break;
      }
      case 'refreshRecent':
        this.post({ type: 'recentFiles', files: this._rankedRecent().map(f => ({ file: f, rel: this._makeRelative(f) })) });
        break;
      case 'fileSearch':
        await this._runFileSearch(!!msg.includeIgnored);
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
        const searches = this._context.workspaceState.get<Array<{query: string; scope: string}>>('spyglass.savedSearches', []);
        const entry = { query: msg.query as string, scope: msg.scope as string };
        // Deduplicate
        const updated = [entry, ...searches.filter(s => !(s.query === entry.query && s.scope === entry.scope))];
        await this._context.workspaceState.update('spyglass.savedSearches', updated);
        this.post({ type: 'savedSearches', searches: updated });
        break;
      }
      case 'removeSavedSearch': {
        const searches2 = this._context.workspaceState.get<Array<{query: string; scope: string}>>('spyglass.savedSearches', []);
        const updated2 = searches2.filter((_, idx) => idx !== (msg.index as number));
        await this._context.workspaceState.update('spyglass.savedSearches', updated2);
        this.post({ type: 'savedSearches', searches: updated2 });
        break;
      }
      case 'revealFile':
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.file as string));
        break;
      case 'replacePreview':
        await this._buildReplacePreview(msg as ReplaceRequest);
        break;
      case 'replaceAll':
        if (this._pendingReplace) {
          await this._replaceAll(this._pendingReplace);
          this._pendingReplace = null;
        } else {
          await this._replaceAll(msg as ReplaceRequest);
        }
        break;
      case 'openInSplit':
        await this._host.openFileInSplit(msg.file as string, msg.line as number, msg.column as number | undefined);
        break;
      case 'preview':
        await this._sendPreview(msg.file as string, msg.line as number);
        break;
      case 'open':
        await this._host.openFile(msg.file as string, msg.line as number, msg.column as number | undefined);
        break;
      case 'activeFile':
        // a bare `:line` in a file list goes to that line in the current file
        this.post(this._activeFile
          ? { type: 'activeFile', file: this._activeFile, relativePath: this._makeRelative(this._activeFile) }
          : { type: 'activeFile', file: '' });
        break;
      case 'scopeChanged':
        this._scope = msg.scope as Scope;
        // a switch made by a command rather than by the user is not "the scope you last used"
        if (msg.remember !== false) { this._context.workspaceState.update('spyglass.lastScope', this._scope); }
        break;
      case 'close':
        this._host.close();
        break;
    }
  }

  private async _runSearch(query: string, useRegex: boolean, opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string; includeIgnored?: boolean; multiline?: boolean }): Promise<void> {
    this._currentSearches.forEach(s => s.cancel());
    this._currentSearches = [];
    const seq = ++this._searchSeq;
    const config = vscode.workspace.getConfiguration('spyglass');
    const limits = readSearchLimits();
    const maxResults = limits.maxResults;
    const exclude = config.get<string[]>('exclude');

    if (!await this._ensureRg()) { this._postRgError(); return; }

    if (!query.trim()) {
      this.post({ type: 'results', results: [], query, took: 0 });
      return;
    }

    if (this._cwdList.length === 0) {
      this.post({ type: 'error', message: this._strings().noWorkspace });
      return;
    }

    let files: string[] | undefined;
    if (this._scope === 'openFiles') {
      files = vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .map(t => (t.input as { uri?: vscode.Uri })?.uri?.fsPath)
        .filter((f): f is string => typeof f === 'string');
    }

    this.post({ type: 'searching' });

    const start = Date.now();
    try {
      // openFiles uses absolute paths — single search suffices; otherwise search all folders
      const cwds = this._scope === 'openFiles' ? [this._cwd] : this._cwdList;
      const accumulated = new Map<string, import('./types').SearchResult[]>();

      const searches = cwds.map(cwd => searchWithRipgrep(query, cwd, useRegex, files, { ...opts, ...limits, exclude: exclude ?? undefined }, (chunk) => {
        if (seq !== this._searchSeq) { return; }
        accumulated.set(cwd, this._cwdList.length > 1 ? chunk.map(r => ({ ...r, relativePath: this._makeRelative(r.file) })) : chunk);
        const merged = [...accumulated.values()].flat().slice(0, maxResults);
        this.post({ type: 'resultsChunk', results: merged, query });
      }));

      this._currentSearches = searches;
      const allResults = await Promise.all(searches.map(s => s.promise));
      this._currentSearches = [];
      if (seq !== this._searchSeq) { return; }

      let merged = allResults.flat();
      if (this._cwdList.length > 1) {
        merged = merged.map(r => ({ ...r, relativePath: this._makeRelative(r.file) }));
      }
      this.post({ type: 'results', results: merged.slice(0, maxResults), query, took: Date.now() - start });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'error', message: this._strings().searchFailed });
    }
  }

  private async _runHereSearch(query: string, useRegex: boolean, opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string; includeIgnored?: boolean; multiline?: boolean }): Promise<void> {
    this._currentSearches.forEach(s => s.cancel());
    this._currentSearches = [];
    const seq = ++this._searchSeq;
    const cwd = this._activeDir || this._cwd;
    const config = vscode.workspace.getConfiguration('spyglass');
    const limits = readSearchLimits();
    const maxResults = limits.maxResults;
    const exclude = config.get<string[]>('exclude');

    if (!await this._ensureRg()) { this._postRgError(); return; }

    if (!query.trim()) {
      this.post({ type: 'results', results: [], query, took: 0 });
      return;
    }

    if (!cwd) {
      this.post({ type: 'error', message: 'No active directory.' });
      return;
    }

    this.post({ type: 'searching' });

    const start = Date.now();
    try {
      const search = searchWithRipgrep(query, cwd, useRegex, undefined, { ...opts, ...limits, exclude: exclude ?? undefined }, (chunk) => {
        if (seq !== this._searchSeq) { return; }
        this.post({ type: 'resultsChunk', results: chunk.slice(0, maxResults), query });
      });
      this._currentSearches = [search];
      const results = await search.promise;
      this._currentSearches = [];
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'results', results: results.slice(0, maxResults), query, took: Date.now() - start });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'error', message: this._strings().searchFailed });
    }
  }

  private async _runSymbolSearch(query: string): Promise<void> {
    const seq = ++this._searchSeq;
    try {
      const results = await runSymbolSearch(query, fp => this._makeRelative(fp));
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'symbolResults', results, query });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'error', message: this._strings().symbolSearchFailed });
    }
  }

  private async _runDocSearch(): Promise<void> {
    const seq = ++this._searchSeq;
    if (!this._activeFile) {
      this.post({ type: 'docResults', results: [] });
      this.post({ type: 'error', message: 'No active file — open a file first.' });
      return;
    }
    try {
      const results = await runDocSymbolSearch(this._activeFile, fp => this._makeRelative(fp));
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'docResults', results });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'error', message: this._strings().docSymbolSearchFailed });
    }
  }

  /**
   * Replace works line by line, and a JavaScript regex reads `.`, `^` and `$` differently from
   * ripgrep's across lines, so a multiline replace could silently change the wrong text.
   */
  private _replaceUnavailable(msg: ReplaceRequest): boolean {
    if (!msg.multiline) { return false; }
    vscode.window.showInformationMessage(this._strings().replaceNotInMultiline);
    return true;
  }

  private async _buildReplacePreview(msg: ReplaceRequest): Promise<void> {
    if (this._replaceUnavailable(msg)) { return; }
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
          includeIgnored: !!msg.includeIgnored,
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

    // Group by file
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
    this.post({ type: 'replacePreviewData', files: previewFiles });
  }

  private async _runRefsSearch(): Promise<void> {
    const seq = ++this._searchSeq;
    // Refresh cursor position — activeTextEditor may be undefined when popup has focus,
    // so fall back to the value captured at panel-open time only if refresh fails.
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file') {
      this._activeCursorFile = editor.document.uri.fsPath;
      this._activeCursorLine = editor.selection.active.line;
      this._activeCursorChar = editor.selection.active.character;
    }
    if (!this._activeCursorFile) {
      this.post({ type: 'results', results: [], query: '', took: 0 });
      this.post({ type: 'error', message: 'No active file — open a file first.' });
      return;
    }
    try {
      const { promises: fsp } = await import('fs');

      // Extract word at cursor to show as label
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
        this.post({ type: 'results', results: [], query: '', took: 0, refsSymbol: '' });
        this.post({ type: 'error', message: 'Place cursor on a symbol, then switch to Refs.' });
        return;
      }
      if (!locs || locs.length === 0) {
        this.post({ type: 'results', results: [], query: '', took: 0, refsSymbol: symbolName });
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
      this.post({ type: 'results', results, query: '', took: 0, refsSymbol: symbolName });
    } catch {
      if (seq !== this._searchSeq) { return; }
      this.post({ type: 'error', message: this._strings().referenceSearchFailed });
    }
  }

  private async _replaceAll(msg: ReplaceRequest): Promise<void> {
    if (this._replaceUnavailable(msg)) { return; }
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
          includeIgnored: !!msg.includeIgnored,
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
    this.post({ type: 'replaceApplied', fileCount: fileSet.size } as any);
  }

  private async _runGitSearch(): Promise<void> {
    if (this._cwdList.length === 0) {
      this.post({ type: 'gitFiles', files: [] });
      return;
    }
    const statuses = await loadGitStatus(this._cwdList);
    const files = Object.keys(statuses).map(rel => ({
      file: relToAbsolute(rel, this._cwdList, this._cwd),
      rel,
    }));
    this.post({ type: 'gitFiles', files });
    this.post({ type: 'gitStatus', status: statuses });
  }

  private async _runFileSearch(includeIgnored: boolean): Promise<void> {
    if (this._cwdList.length === 0) {
      this.post({ type: 'error', message: this._strings().noWorkspace });
      return;
    }

    const now = Date.now();
    if (!this._fileCache || includeIgnored !== this._fileCacheIgnored || now - this._fileCacheTime > SpyglassController.FILE_CACHE_TTL) {
      const exclude = vscode.workspace.getConfiguration('spyglass').get<string[]>('exclude');
      const lists = await Promise.all(this._cwdList.map(cwd => listFilesWithRipgrep(cwd, exclude ?? undefined, includeIgnored)));
      this._fileCache = lists.flatMap(files => files.map(f => ({ file: f, rel: this._makeRelative(f) })));
      this._fileCacheTime = Date.now();
      this._fileCacheIgnored = includeIgnored;
    }

    this.post({ type: 'fileList', files: this._fileCache, includeIgnored: this._fileCacheIgnored });
  }

  private _makeRelative(filePath: string): string {
    return makeRelative(filePath, this._cwdList, this._cwd);
  }

  private _loadGitStatus(): void {
    loadGitStatus(this._cwdList).then(status => {
      this.post({ type: 'gitStatus', status });
    });
  }

  private async _sendPreview(filePath: string, targetLine: number): Promise<void> {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const relativePath = this._makeRelative(filePath);
    try {
      // Use VSCode's document API so we see in-memory edits (e.g. after WorkspaceEdit)
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);

      const content = doc.getText();
      if (content.length > 512 * 1024) {
        this.post({ type: 'previewContent', content: '(file too large to preview)', currentLine: 1, relativePath, ext: '', changedLines: [] });
        return;
      }

      const changedLines = await getChangedLines(filePath, cwdForFile(filePath, this._cwdList, this._cwd), this._gitCache);
      const lineCount = content.split('\n').length;
      this.post({ type: 'previewContent', content, currentLine: Math.min(targetLine, lineCount), relativePath, ext, changedLines });
    } catch {
      this.post({ type: 'previewContent', content: '(cannot read file)', currentLine: 1, relativePath, ext: '', changedLines: [] });
    }
  }
}
