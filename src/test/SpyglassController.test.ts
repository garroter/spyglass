import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  folders: undefined as undefined | { uri: { fsPath: string } }[],
  rgAvailable: true,
  errorMessages: [] as string[],
  infoMessages: [] as string[],
  clipboard: '',
  rgCalls: [] as Array<{ query: string; cwd: string; files?: string[]; opts?: Record<string, unknown> }>,
  listCalls: [] as Array<{ cwd: string; includeIgnored?: boolean }>,
}));

vi.mock('vscode', () => ({
  env: {
    language: 'en',
    appRoot: '/mock/vscode',
    clipboard: { writeText: async (t: string) => { env.clipboard = t; } },
  },
  workspace: {
    get workspaceFolders() { return env.folders; },
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) => (key in env.settings ? env.settings[key] : fallback),
    }),
  },
  window: {
    activeTextEditor: undefined,
    tabGroups: { all: [] },
    onDidChangeActiveColorTheme: () => ({ dispose() {} }),
    showErrorMessage: (m: string) => { env.errorMessages.push(m); return Promise.resolve(undefined); },
    showInformationMessage: (m: string) => { env.infoMessages.push(m); return Promise.resolve(undefined); },
  },
  commands: { executeCommand: vi.fn() },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
    joinPath: (base: { fsPath: string }, ...seg: string[]) => ({ fsPath: [base.fsPath, ...seg].join('/') }),
  },
}));

vi.mock('../ripgrep', () => ({
  searchWithRipgrep: (query: string, cwd: string, _regex: boolean, files?: string[], opts?: Record<string, unknown>) => {
    env.rgCalls.push({ query, cwd, files, opts });
    return { promise: Promise.resolve([]), cancel() {} };
  },
  listFilesWithRipgrep: async (cwd: string, _exclude?: string[], includeIgnored?: boolean) => {
    env.listCalls.push({ cwd, includeIgnored });
    return [`${cwd}/a.ts`];
  },
  isRipgrepAvailable: async () => env.rgAvailable,
  readSearchLimits: () => ({ maxResults: 200 }),
}));

vi.mock('../themeLoader', () => ({ loadCurrentTheme: () => null }));

import { SpyglassController, SpyglassHost, resolveInitialScope } from '../SpyglassController';
import { getUiStrings } from '../i18n';

// --- test doubles that behave like the real thing where the controller depends on it -------

function makeContext() {
  const store = new Map<string, unknown>();
  return {
    store,
    extensionUri: { fsPath: '/ext' },
    subscriptions: [] as { dispose(): void }[],
    workspaceState: {
      get: <T>(key: string, fallback?: T): T => (store.has(key) ? store.get(key) as T : fallback as T),
      update: async (key: string, value: unknown) => { store.set(key, value); },
    },
  };
}

function makeHost() {
  const posted: Array<Record<string, unknown>> = [];
  const listeners = new Set<(msg: unknown) => unknown>();
  const webview = {
    html: '',
    cspSource: 'vscode-webview://test',
    asWebviewUri: (u: { fsPath: string }) => u.fsPath,
    postMessage: (m: Record<string, unknown>) => { posted.push(m); return Promise.resolve(true); },
    onDidReceiveMessage: (listener: (msg: unknown) => unknown) => {
      listeners.add(listener);
      return { dispose: () => { listeners.delete(listener); } };
    },
  };
  const host = {
    webview,
    openFile: vi.fn(async () => {}),
    openFileInSplit: vi.fn(async () => {}),
    close: vi.fn(),
  };
  const send = async (msg: Record<string, unknown>) => { await Promise.all([...listeners].map(l => l(msg))); };
  return { host: host as unknown as SpyglassHost & typeof host, posted, send, webview, listenerCount: () => listeners.size };
}

function setup(opts: { sidebarMode?: boolean; initialQuery?: string } = {}) {
  const context = makeContext();
  const h = makeHost();
  const controller = new SpyglassController(context as never, h.host, {
    sidebarMode: opts.sidebarMode ?? false,
    initialQuery: opts.initialQuery,
  });
  return { context, controller, ...h };
}

function configOf(html: string): Record<string, unknown> {
  const m = html.match(/window\.__spyglass = (.*?);<\/script>/s);
  if (!m) { throw new Error('config script not found'); }
  return JSON.parse(m[1]);
}

beforeEach(() => {
  env.settings = {};
  env.folders = undefined;
  env.rgAvailable = true;
  env.errorMessages = [];
  env.infoMessages = [];
  env.clipboard = '';
  env.rgCalls = [];
  env.listCalls = [];
});

// --------------------------------------------------------------------------------------------

describe('resolveInitialScope', () => {
  it.each([
    ['files', 'symbols', 'files'],          // remembered scope wins over the setting
    [undefined, 'git', 'git'],              // no remembered scope -> setting
    [undefined, undefined, 'project'],      // nothing -> project
    ['bogus', 'git', 'project'],            // an unknown scope is not trusted
    [undefined, 'bogus', 'project'],
  ])('lastScope=%j, default=%j -> %j', (last, configured, expected) => {
    expect(resolveInitialScope(last, configured)).toBe(expected);
  });
});

describe('SpyglassController — mount', () => {
  it('renders the page into the host webview with the remembered scope and initial query', () => {
    const { controller, context, webview } = setup({ initialQuery: 'selected text' });
    context.store.set('spyglass.lastScope', 'files');
    // scope is resolved at construction, so build a second controller after storing it
    const h = makeHost();
    const c2 = new SpyglassController(context as never, h.host, { sidebarMode: false, initialQuery: 'selected text' });
    c2.mount();
    const cfg = configOf(h.webview.html);
    expect(cfg.DEFAULT_SCOPE).toBe('files');
    expect(cfg.INITIAL_QUERY).toBe('selected text');
    expect(cfg.MAX_RESULTS).toBe(200);
    expect(webview.html).toBe('');          // the first controller was never mounted
    controller.dispose(); c2.dispose();
  });

  it('marks the page as sidebar only for the sidebar host', () => {
    const popup = setup({ sidebarMode: false });
    const side = setup({ sidebarMode: true });
    popup.controller.mount();
    side.controller.mount();
    expect(popup.webview.html).not.toContain('sidebar-mode');
    expect(side.webview.html).toContain('<body class="sidebar-mode">');
  });

  it('hands recent files and saved state from workspaceState to the page', () => {
    const context = makeContext();
    context.store.set('spyglass.recentFiles', ['/proj/a.ts', '/proj/b.ts']);
    context.store.set('spyglass.searchHistory', ['old query']);
    context.store.set('spyglass.savedSearches', [{ query: 'todo', scope: 'project' }]);
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false });
    controller.mount();
    const cfg = configOf(h.webview.html) as { RECENT_FILES: { file: string }[]; INITIAL_HISTORY: string[]; SAVED_SEARCHES: unknown[] };
    expect(cfg.RECENT_FILES.map(f => f.file)).toEqual(['/proj/a.ts', '/proj/b.ts']);
    expect(cfg.INITIAL_HISTORY).toEqual(['old query']);
    expect(cfg.SAVED_SEARCHES).toEqual([{ query: 'todo', scope: 'project' }]);
  });
});

describe('SpyglassController — scope commands', () => {
  it('starts in the requested scope, ahead of the remembered one, without remembering it', () => {
    const context = makeContext();
    context.store.set('spyglass.lastScope', 'files');
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false, initialScope: 'git' });
    controller.mount();
    expect(configOf(h.webview.html).DEFAULT_SCOPE).toBe('git');
    expect(context.store.get('spyglass.lastScope')).toBe('files');
    controller.dispose();
  });

  it('ignores an unknown requested scope and keeps the remembered one', () => {
    const context = makeContext();
    context.store.set('spyglass.lastScope', 'files');
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false, initialScope: 'nope' as never });
    controller.mount();
    expect(configOf(h.webview.html).DEFAULT_SCOPE).toBe('files');
    controller.dispose();
  });

  it('showScope asks the page to switch scope', () => {
    const { controller, posted } = setup();
    controller.showScope('doc');
    expect(posted).toContainEqual({ type: 'setScope', scope: 'doc' });
  });

  it('showScope ignores an unknown scope', () => {
    const { controller, posted } = setup();
    controller.showScope('nope' as never);
    expect(posted.filter(m => m.type === 'setScope')).toEqual([]);
  });

  it('does not remember a scope change the page marks as not to be remembered', async () => {
    const { send, context } = setup();
    await send({ type: 'scopeChanged', scope: 'git', remember: false });
    expect(context.store.has('spyglass.lastScope')).toBe(false);
  });

  it('still remembers an ordinary scope change', async () => {
    const { send, context } = setup();
    await send({ type: 'scopeChanged', scope: 'git' });
    expect(context.store.get('spyglass.lastScope')).toBe('git');
  });
});

describe('SpyglassController — recent files', () => {
  const fileOf = (e: { file: string }) => e.file;

  it('hands the page its recent files ordered by frecency', () => {
    const context = makeContext();
    context.store.set('spyglass.recentFiles', ['/p/a.ts', '/p/b.ts', '/p/c.ts']);
    context.store.set('spyglass.fileFrecency', { '/p/c.ts': { score: 5, last: Date.now() } });
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false });
    controller.mount();
    expect((configOf(h.webview.html).RECENT_FILES as { file: string }[]).map(fileOf)).toEqual(['/p/c.ts', '/p/a.ts', '/p/b.ts']);
    controller.dispose();
  });

  it('sends a fresh, ranked list when the page asks, e.g. on entering the Recent scope', async () => {
    const { send, posted, context } = setup();
    context.store.set('spyglass.recentFiles', ['/p/a.ts', '/p/b.ts']);
    context.store.set('spyglass.fileFrecency', { '/p/b.ts': { score: 4, last: Date.now() } });
    await send({ type: 'refreshRecent' });
    const msg = posted.filter(m => m.type === 'recentFiles').at(-1) as { files: { file: string; rel: string }[] };
    expect(msg.files.map(fileOf)).toEqual(['/p/b.ts', '/p/a.ts']);
    expect(msg.files.every(f => typeof f.rel === 'string')).toBe(true);
  });

  it('reflects files opened after the page was built', async () => {
    const { send, posted, context } = setup();
    context.store.set('spyglass.recentFiles', ['/p/old.ts']);
    await send({ type: 'refreshRecent' });
    context.store.set('spyglass.recentFiles', ['/p/new.ts', '/p/old.ts']);
    await send({ type: 'refreshRecent' });
    const last = posted.filter(m => m.type === 'recentFiles').at(-1) as { files: { file: string }[] };
    expect(last.files.map(fileOf)).toEqual(['/p/new.ts', '/p/old.ts']);
  });
});

describe('SpyglassController — messages that only touch state', () => {
  it('remembers the scope the user switched to', async () => {
    const { send, context } = setup();
    await send({ type: 'scopeChanged', scope: 'git' });
    expect(context.store.get('spyglass.lastScope')).toBe('git');
  });

  it('stores only the file paths of pinned files', async () => {
    const { send, context } = setup();
    await send({ type: 'setPinnedFiles', files: [{ file: '/a.ts', rel: 'a.ts' }, { file: '/b.ts', rel: 'b.ts' }] });
    expect(context.store.get('spyglass.pinnedFiles')).toEqual(['/a.ts', '/b.ts']);
  });

  it('persists group-results and button preferences', async () => {
    const { send, context } = setup();
    const prefs = { useRegex: true, caseSensitive: false, wholeWord: true, replaceMode: false, showPreview: false, sortBy: 'count', includeMode: true };
    await send({ type: 'setGroupResults', value: true });
    await send({ type: 'saveButtonPrefs', prefs });
    expect(context.store.get('spyglass.groupResults')).toBe(true);
    expect(context.store.get('spyglass.buttonPrefs')).toEqual(prefs);
  });

  it('copies a path to the clipboard', async () => {
    const { send } = setup();
    await send({ type: 'copyPath', path: '/proj/src/a.ts' });
    expect(env.clipboard).toBe('/proj/src/a.ts');
  });
});

describe('SpyglassController — saved searches', () => {
  it('puts the newest first, de-duplicates and tells the page', async () => {
    const { send, posted, context } = setup();
    await send({ type: 'saveSearch', query: 'a', scope: 'project' });
    await send({ type: 'saveSearch', query: 'b', scope: 'files' });
    await send({ type: 'saveSearch', query: 'a', scope: 'project' });
    const expected = [{ query: 'a', scope: 'project' }, { query: 'b', scope: 'files' }];
    expect(context.store.get('spyglass.savedSearches')).toEqual(expected);
    expect(posted.filter(m => m.type === 'savedSearches').at(-1)).toEqual({ type: 'savedSearches', searches: expected });
  });

  it('keeps the same query saved separately for different scopes', async () => {
    const { send, context } = setup();
    await send({ type: 'saveSearch', query: 'a', scope: 'project' });
    await send({ type: 'saveSearch', query: 'a', scope: 'files' });
    expect(context.store.get('spyglass.savedSearches')).toHaveLength(2);
  });

  it('removes a saved search by index', async () => {
    const { send, posted, context } = setup();
    context.store.set('spyglass.savedSearches', [
      { query: 'a', scope: 'project' }, { query: 'b', scope: 'project' }, { query: 'c', scope: 'project' },
    ]);
    await send({ type: 'removeSavedSearch', index: 1 });
    const expected = [{ query: 'a', scope: 'project' }, { query: 'c', scope: 'project' }];
    expect(context.store.get('spyglass.savedSearches')).toEqual(expected);
    expect(posted.at(-1)).toEqual({ type: 'savedSearches', searches: expected });
  });
});

describe('SpyglassController — host-specific actions are delegated', () => {
  it('asks the host to open a file at a line', async () => {
    const { send, host } = setup();
    await send({ type: 'open', file: '/proj/a.ts', line: 42 });
    expect(host.openFile).toHaveBeenCalledWith('/proj/a.ts', 42, undefined);
    expect(host.openFileInSplit).not.toHaveBeenCalled();
  });

  it('passes a column on to the host (file:line:column)', async () => {
    const { send, host } = setup();
    await send({ type: 'open', file: '/proj/a.ts', line: 42, column: 7 });
    expect(host.openFile).toHaveBeenCalledWith('/proj/a.ts', 42, 7);
  });

  it('tells the page which file is active, for a bare :line', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send, controller, posted } = setup();
    controller.setActiveContext({ dir: '/proj/src', file: '/proj/src/x.ts', line: 0, character: 0 });
    await send({ type: 'activeFile' });
    expect(posted.filter(m => m.type === 'activeFile')).toEqual([{ type: 'activeFile', file: '/proj/src/x.ts', relativePath: 'src/x.ts' }]);
  });

  it('answers a bare :line with no file when none is active', async () => {
    const { send, posted } = setup();
    await send({ type: 'activeFile' });
    expect(posted.filter(m => m.type === 'activeFile')).toEqual([{ type: 'activeFile', file: '' }]);
  });

  it('asks the host to open a file in a split', async () => {
    const { send, host } = setup();
    await send({ type: 'openInSplit', file: '/proj/a.ts', line: 7 });
    expect(host.openFileInSplit).toHaveBeenCalledWith('/proj/a.ts', 7, undefined);
    expect(host.openFile).not.toHaveBeenCalled();
  });

  it('asks the host to close', async () => {
    const { send, host } = setup();
    await send({ type: 'close' });
    expect(host.close).toHaveBeenCalledTimes(1);
  });
});

describe('SpyglassController — search history', () => {
  it('records queries newest first without duplicates', async () => {
    const { send, context } = setup();
    for (const q of ['a', 'b', 'a']) {
      await send({ type: 'search', query: q, scope: 'project', useRegex: false });
    }
    expect(context.store.get('spyglass.searchHistory')).toEqual(['a', 'b']);
  });

  it('ignores blank queries', async () => {
    const { send, context } = setup();
    await send({ type: 'search', query: '   ', scope: 'project', useRegex: false });
    expect(context.store.get('spyglass.searchHistory')).toBeUndefined();
  });

  it('keeps at most 50 entries', async () => {
    const { send, context } = setup();
    for (let i = 0; i < 60; i++) {
      await send({ type: 'search', query: `q${i}`, scope: 'project', useRegex: false });
    }
    const history = context.store.get('spyglass.searchHistory') as string[];
    expect(history).toHaveLength(50);
    expect(history[0]).toBe('q59');
  });
});

describe('SpyglassController — history is pushed to the page', () => {
  it('sends the updated history after every recorded search', async () => {
    const { send, posted } = setup();
    for (const q of ['a', 'b', 'a']) {
      await send({ type: 'search', query: q, scope: 'project', useRegex: false });
    }
    const updates = posted.filter(m => m.type === 'searchHistory');
    expect(updates.map(m => m.history)).toEqual([['a'], ['b', 'a'], ['a', 'b']]);
  });

  it('still runs, but does not record, a search that was recalled from the history', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const context = makeContext();
    context.store.set('spyglass.searchHistory', ['a', 'b']); // read when the controller is created
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false });

    await h.send({ type: 'search', query: 'b', scope: 'project', useRegex: false, fromHistory: true });

    expect(env.rgCalls.map(c => c.query)).toEqual(['b']);
    expect(context.store.get('spyglass.searchHistory')).toEqual(['a', 'b']);
    expect(h.posted.filter(m => m.type === 'searchHistory')).toEqual([]);
    controller.dispose();
  });

  it('does not send anything for a blank query', async () => {
    const { send, posted } = setup();
    await send({ type: 'search', query: '  ', scope: 'project', useRegex: false });
    expect(posted.filter(m => m.type === 'searchHistory')).toEqual([]);
  });
});

describe('SpyglassController — where searches run', () => {
  it('searches every workspace folder for project scope', async () => {
    env.folders = [{ uri: { fsPath: '/a' } }, { uri: { fsPath: '/b' } }];
    const { send } = setup();
    await send({ type: 'search', query: 'needle', scope: 'project', useRegex: false });
    expect(env.rgCalls.map(c => c.cwd).sort()).toEqual(['/a', '/b']);
  });

  it('searches the directory of the active file for here scope', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send, controller } = setup();
    controller.setActiveContext({ dir: '/proj/src/deep', file: '/proj/src/deep/x.ts', line: 3, character: 1 });
    await send({ type: 'search', query: 'needle', scope: 'here', useRegex: false });
    expect(env.rgCalls.map(c => [c.query, c.cwd])).toEqual([['needle', '/proj/src/deep']]);
  });

  it('searches a folder picked explicitly for here scope, whatever file is active', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send, controller } = setup();
    controller.setActiveContext({ dir: '/proj/src/deep', file: '/proj/src/deep/x.ts', line: 3, character: 1 });
    controller.setActiveDirectory('/proj/docs');
    await send({ type: 'search', query: 'needle', scope: 'here', useRegex: false });
    expect(env.rgCalls.map(c => c.cwd)).toEqual(['/proj/docs']);
  });

  it('falls back to the first workspace folder for here scope when no file is active', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send({ type: 'search', query: 'needle', scope: 'here', useRegex: false });
    expect(env.rgCalls.map(c => c.cwd)).toEqual(['/proj']);
  });

  it('reports a missing workspace instead of searching', async () => {
    env.folders = undefined;
    const { send, posted } = setup();
    await send({ type: 'search', query: 'needle', scope: 'project', useRegex: false });
    expect(env.rgCalls).toHaveLength(0);
    expect(posted).toContainEqual({ type: 'error', message: getUiStrings().noWorkspace });
  });
});

describe('SpyglassController — including ignored files', () => {
  const searchMsg = (over: Record<string, unknown> = {}) => ({ type: 'search', query: 'needle', scope: 'project', useRegex: false, ...over });

  it('searches normally unless the page asks for ignored files', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send(searchMsg());
    expect(env.rgCalls[0].opts?.includeIgnored).toBe(false);
  });

  it('passes the page\'s includeIgnored choice to ripgrep for project and directory searches', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send(searchMsg({ includeIgnored: true }));
    await send(searchMsg({ scope: 'here', includeIgnored: true }));
    expect(env.rgCalls.map(c => c.opts?.includeIgnored)).toEqual([true, true]);
  });

  it('lists files with the page\'s includeIgnored choice', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send({ type: 'fileSearch', includeIgnored: true });
    expect(env.listCalls).toEqual([{ cwd: '/proj', includeIgnored: true }]);
  });

  it('tags the file list it sends back, so the page can drop a stale one', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send, posted } = setup();
    await send({ type: 'fileSearch', includeIgnored: true });
    expect(posted.filter(m => m.type === 'fileList').at(-1)).toMatchObject({ includeIgnored: true });
  });

  it('reuses the cached file list while the choice stays the same, and refetches when it flips', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send({ type: 'fileSearch', includeIgnored: false });
    await send({ type: 'fileSearch', includeIgnored: false });
    expect(env.listCalls).toHaveLength(1);
    await send({ type: 'fileSearch', includeIgnored: true });
    expect(env.listCalls.map(c => c.includeIgnored)).toEqual([false, true]);
    await send({ type: 'fileSearch', includeIgnored: true });
    expect(env.listCalls).toHaveLength(2);
  });

  it('warms the file list at start with the remembered choice', () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const context = makeContext();
    context.store.set('spyglass.buttonPrefs', { includeIgnored: true });
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false });
    controller.mount();
    expect(env.listCalls).toEqual([{ cwd: '/proj', includeIgnored: true }]);
    controller.dispose();
  });

  it('hands the remembered choice to the page with the other button preferences', () => {
    const context = makeContext();
    context.store.set('spyglass.buttonPrefs', { includeIgnored: true, useRegex: true });
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false });
    controller.mount();
    expect((configOf(h.webview.html).BUTTON_PREFS as Record<string, unknown>).includeIgnored).toBe(true);
    controller.dispose();
  });

  it('defaults to not including ignored files when nothing was remembered', () => {
    const { controller, webview } = setup();
    controller.mount();
    expect((configOf(webview.html).BUTTON_PREFS as Record<string, unknown>).includeIgnored).toBe(false);
  });
});

describe('SpyglassController — multiline', () => {
  const searchMsg = (over: Record<string, unknown> = {}) => ({ type: 'search', query: 'a\\nb', scope: 'project', useRegex: false, ...over });

  it('searches line by line unless the page asks for multiline', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send(searchMsg());
    expect(env.rgCalls[0].opts?.multiline).toBe(false);
  });

  it('passes the page\'s multiline choice to ripgrep', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send } = setup();
    await send(searchMsg({ multiline: true }));
    await send(searchMsg({ scope: 'here', multiline: true }));
    expect(env.rgCalls.map(c => c.opts?.multiline)).toEqual([true, true]);
  });

  it('hands the remembered choice to the page, off by default', () => {
    const context = makeContext();
    context.store.set('spyglass.buttonPrefs', { multiline: true });
    const h = makeHost();
    const controller = new SpyglassController(context as never, h.host, { sidebarMode: false });
    controller.mount();
    expect((configOf(h.webview.html).BUTTON_PREFS as Record<string, unknown>).multiline).toBe(true);
    const plain = setup();
    plain.controller.mount();
    expect((configOf(plain.webview.html).BUTTON_PREFS as Record<string, unknown>).multiline).toBe(false);
    controller.dispose();
  });

  it('refuses to replace in multiline mode, and says why, instead of guessing', async () => {
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send, posted } = setup();
    await send({ type: 'replacePreview', query: 'a\\nb', replacement: 'x', useRegex: true, caseSensitive: false, wholeWord: false, globFilter: '', scope: 'project', multiline: true });
    expect(env.rgCalls).toEqual([]);
    expect(posted.filter(m => m.type === 'replacePreviewData')).toEqual([]);
    expect(env.infoMessages).toEqual([getUiStrings().replaceNotInMultiline]);
  });
});

describe('SpyglassController — ripgrep unavailable', () => {
  it('tells the page and the user instead of searching', async () => {
    env.rgAvailable = false;
    env.folders = [{ uri: { fsPath: '/proj' } }];
    const { send, posted } = setup();
    await send({ type: 'search', query: 'needle', scope: 'project', useRegex: false });
    const s = getUiStrings();
    expect(env.rgCalls).toHaveLength(0);
    expect(posted).toContainEqual({ type: 'error', message: s.ripgrepNotFound });
    expect(env.errorMessages).toContain(s.ripgrepNotFound);
  });
});

describe('SpyglassController — dispose', () => {
  it('stops reacting to webview messages', async () => {
    const { send, controller, context, listenerCount } = setup();
    expect(listenerCount()).toBe(1);
    controller.dispose();
    expect(listenerCount()).toBe(0);
    await send({ type: 'scopeChanged', scope: 'git' });
    expect(context.store.has('spyglass.lastScope')).toBe(false);
  });
});
