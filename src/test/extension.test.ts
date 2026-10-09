import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const registered = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const createOrShow = vi.hoisted(() => vi.fn());

const editors = vi.hoisted(() => ({ active: undefined as unknown, listeners: [] as Array<(e: unknown) => void> }));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => { registered.set(id, fn); return { dispose() {} }; },
    executeCommand: vi.fn(),
  },
  window: {
    get activeTextEditor() { return editors.active; },
    onDidChangeActiveTextEditor: (listener: (e: unknown) => void) => { editors.listeners.push(listener); return { dispose() {} }; },
    registerWebviewViewProvider: () => ({ dispose() {} }),
  },
}));
vi.mock('../FinderPanel', () => ({ FinderPanel: { createOrShow } }));
vi.mock('../SpyglassSidebarProvider', () => ({ SpyglassSidebarProvider: class { static viewType = 'spyglass.sidebarView'; } }));
vi.mock('../ripgrep', () => ({ ensureRipgrepPath: async () => true }));
const announceIfUpdated = vi.hoisted(() => vi.fn(async () => {}));
const showWhatsNew = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../whatsNew', () => ({ announceIfUpdated, showWhatsNew }));

import { activate } from '../extension';
import { SCOPE_COMMANDS } from '../scopeCommands';

const context = { subscriptions: [] as unknown[], workspaceState: { get: () => [], update: async () => {} } };

beforeEach(() => {
  editors.active = undefined;
  editors.listeners.length = 0;
  registered.clear();
  createOrShow.mockClear();
  announceIfUpdated.mockClear();
  showWhatsNew.mockClear();
  activate(context as never);
});

describe('activate — commands', () => {
  it('registers the popup, the sidebar, What\'s New, Find in Folder, Resume and one command per scope', () => {
    expect([...registered.keys()].sort()).toEqual(
      ['spyglass.open', 'spyglass.focusSidebar', 'spyglass.showWhatsNew', 'spyglass.findInFolder', 'spyglass.resume',
        'spyglass.keyHandledInWebview', ...SCOPE_COMMANDS.map(c => c.command)].sort(),
    );
  });

  it('spyglass.resume reopens the popup on the last search', () => {
    registered.get('spyglass.resume')!();
    expect(createOrShow).toHaveBeenCalledWith(context, undefined, { resume: true });
  });

  it('the key-swallowing command does nothing', () => {
    expect(registered.get('spyglass.keyHandledInWebview')!()).toBeUndefined();
    expect(createOrShow).not.toHaveBeenCalled();
  });

  it('spyglass.open with no argument opens in the usual scope', () => {
    registered.get('spyglass.open')!();
    expect(createOrShow).toHaveBeenCalledWith(context, undefined);
  });

  it('spyglass.open takes a scope from its keybinding argument', () => {
    registered.get('spyglass.open')!({ scope: 'git' });
    expect(createOrShow).toHaveBeenCalledWith(context, 'git');
  });

  it.each([[{ scope: 'nope' }], ['git'], [42], [null]])('spyglass.open ignores the unusable argument %j', arg => {
    registered.get('spyglass.open')!(arg);
    expect(createOrShow).toHaveBeenCalledWith(context, undefined);
  });

  it.each(SCOPE_COMMANDS.map(c => [c.command, c.scope]))('%s opens in the %s scope', (command, scope) => {
    registered.get(command as string)!();
    expect(createOrShow).toHaveBeenCalledWith(context, scope);
  });

  it('a scope command ignores any argument it is given', () => {
    registered.get('spyglass.findFiles')!({ scope: 'git' });
    expect(createOrShow).toHaveBeenCalledWith(context, 'files');
  });
});

describe('activate — What\'s New', () => {
  it('checks whether the extension was just updated', () => {
    expect(announceIfUpdated).toHaveBeenCalledWith(context);
  });

  it('spyglass.showWhatsNew opens the changelog', () => {
    registered.get('spyglass.showWhatsNew')!();
    expect(showWhatsNew).toHaveBeenCalledWith(context);
  });
});

describe('activate — Find in Folder', () => {
  it('opens the Dir scope on the folder chosen in the Explorer', () => {
    registered.get('spyglass.findInFolder')!({ fsPath: '/proj/src', scheme: 'file' });
    expect(createOrShow).toHaveBeenCalledWith(context, 'here', { directory: '/proj/src' });
  });

  it.each([[undefined], [null], ['/proj/src'], [{}], [{ fsPath: '' }]])('falls back to the Dir scope as usual when given %j', arg => {
    registered.get('spyglass.findInFolder')!(arg);
    expect(createOrShow).toHaveBeenCalledWith(context, 'here', undefined);
  });
});

describe('activate — recent files', () => {
  const fileEditor = (fsPath: string) => ({ document: { uri: { scheme: 'file', fsPath } } });
  const withStore = () => {
    const store = new Map<string, unknown>();
    return {
      store,
      ctx: {
        subscriptions: [] as unknown[],
        workspaceState: {
          get: <T>(key: string, fallback?: T): T => (store.has(key) ? store.get(key) as T : fallback as T),
          update: async (key: string, value: unknown) => { store.set(key, value); },
        },
      },
    };
  };

  it('records the file that is open when Spyglass starts', async () => {
    editors.active = fileEditor('/proj/a.ts');
    const { store, ctx } = withStore();
    activate(ctx as never);
    await Promise.resolve();
    expect(store.get('spyglass.recentFiles')).toEqual(['/proj/a.ts']);
    expect(Object.keys(store.get('spyglass.fileFrecency') as object)).toEqual(['/proj/a.ts']);
  });

  it('records each real file you switch to, newest first', async () => {
    const { store, ctx } = withStore();
    activate(ctx as never);
    editors.listeners.forEach(l => l(fileEditor('/proj/a.ts')));
    await new Promise(r => setTimeout(r, 0));
    editors.listeners.forEach(l => l(fileEditor('/proj/b.ts')));
    await new Promise(r => setTimeout(r, 0));
    expect(store.get('spyglass.recentFiles')).toEqual(['/proj/b.ts', '/proj/a.ts']);
  });

  it('ignores editors that are not real files (output panels, untitled documents) and closed editors', async () => {
    const { store, ctx } = withStore();
    activate(ctx as never);
    editors.listeners.forEach(l => l({ document: { uri: { scheme: 'output', fsPath: 'x' } } }));
    editors.listeners.forEach(l => l({ document: { uri: { scheme: 'untitled', fsPath: 'Untitled-1' } } }));
    editors.listeners.forEach(l => l(undefined));
    await new Promise(r => setTimeout(r, 0));
    expect(store.has('spyglass.recentFiles')).toBe(false);
  });
});


describe('manifest — keys Spyglass handles itself', () => {
  // A webview hands every key press on to VS Code as well, so without these Ctrl+P would also open
  // Quick Open, Ctrl+J toggle the panel and Ctrl+K start a chord while you move through results.
  const manifest = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
  const swallowed = manifest.contributes.keybindings.filter((k: { command: string }) => k.command === 'spyglass.keyHandledInWebview');

  it.each(['ctrl+j', 'ctrl+k', 'ctrl+n', 'ctrl+p'])('keeps %s inside Spyglass', key => {
    const binding = swallowed.find((k: { key: string }) => k.key === key);
    expect(binding).toBeDefined();
    expect(binding.when).toBe("activeWebviewPanelId == 'spyglass' || focusedView == 'spyglass.sidebarView'");
  });

  it('hides the key-swallowing command from the Command Palette', () => {
    const entry = manifest.contributes.menus.commandPalette.find((m: { command: string }) => m.command === 'spyglass.keyHandledInWebview');
    expect(entry?.when).toBe('false');
  });

  it('contributes Resume Last Search to the Command Palette', () => {
    expect(manifest.contributes.commands.map((c: { command: string }) => c.command)).toContain('spyglass.resume');
  });
});
