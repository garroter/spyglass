import { describe, it, expect } from 'vitest';
import { buildCatalog, defaultKeybinding, formatKeybinding, resolveNls, type ExtensionInfo } from '../commandCatalog';
import type { CoreCommand } from '../coreCommands';

describe('resolveNls (manifest strings that may still be %placeholders%)', () => {
  it('replaces a %key% from the extension\'s strings', () => {
    expect(resolveNls('%cmd.title%', { 'cmd.title': 'Commit' })).toBe('Commit');
  });

  it('keeps an unknown %key% as it is', () => {
    expect(resolveNls('%x%', { 'cmd.title': 'Commit' })).toBe('%x%');
    expect(resolveNls('%x%', undefined)).toBe('%x%');
  });

  it('leaves a plain string alone', () => {
    expect(resolveNls('Commit', { Commit: 'nope' })).toBe('Commit');
  });

  it('takes the value of a { value, original } title', () => {
    expect(resolveNls({ value: 'Zatwierdź', original: 'Commit' }, undefined)).toBe('Zatwierdź');
  });

  it('gives undefined for anything that is not text', () => {
    expect(resolveNls(42, undefined)).toBeUndefined();
    expect(resolveNls(undefined, undefined)).toBeUndefined();
  });
});

describe('defaultKeybinding', () => {
  const bindings = [
    { command: 'a', key: 'ctrl+k ctrl+w', mac: 'cmd+k cmd+w' },
    { command: 'b', key: 'ctrl+b', linux: 'ctrl+alt+b' },
  ];

  it('uses the mac key on macOS', () => {
    expect(defaultKeybinding(bindings, 'a', 'darwin')).toBe('cmd+k cmd+w');
  });

  it('uses the plain key elsewhere', () => {
    expect(defaultKeybinding(bindings, 'a', 'linux')).toBe('ctrl+k ctrl+w');
    expect(defaultKeybinding(bindings, 'a', 'win32')).toBe('ctrl+k ctrl+w');
  });

  it('prefers the platform\'s own field over the plain key', () => {
    expect(defaultKeybinding(bindings, 'b', 'linux')).toBe('ctrl+alt+b');
    expect(defaultKeybinding(bindings, 'b', 'win32')).toBe('ctrl+b');
  });

  it('gives undefined when the command has no binding, or the bindings are not a list', () => {
    expect(defaultKeybinding(bindings, 'zzz', 'linux')).toBeUndefined();
    expect(defaultKeybinding({ command: 'a' }, 'a', 'linux')).toBeUndefined();
  });
});

describe('formatKeybinding', () => {
  it('capitalises each key on Windows and Linux', () => {
    expect(formatKeybinding('ctrl+shift+p', 'linux')).toBe('Ctrl+Shift+P');
    expect(formatKeybinding('f12', 'win32')).toBe('F12');
    expect(formatKeybinding('ctrl+`', 'linux')).toBe('Ctrl+`');
  });

  it('keeps chords as separate presses', () => {
    expect(formatKeybinding('ctrl+k ctrl+w', 'linux')).toBe('Ctrl+K Ctrl+W');
  });

  it('uses the macOS symbols, in the macOS order', () => {
    expect(formatKeybinding('cmd+shift+p', 'darwin')).toBe('⇧⌘P');
    expect(formatKeybinding('alt+z', 'darwin')).toBe('⌥Z');
    expect(formatKeybinding('cmd+k cmd+w', 'darwin')).toBe('⌘K ⌘W');
  });
});

describe('buildCatalog', () => {
  const git: ExtensionInfo = {
    id: 'vscode.git',
    packageJSON: {
      name: 'git',
      displayName: '%displayName%',
      contributes: {
        commands: [
          { command: 'git.commit', title: '%command.commit%', category: 'Git' },
          { command: 'git.internal', title: 'Internal', category: 'Git' },
          { command: 'git.noTitle', category: 'Git' },
        ],
        menus: { commandPalette: [{ command: 'git.internal', when: 'false' }, { command: 'git.commit', when: 'scmProvider == git' }] },
        keybindings: [{ command: 'git.commit', key: 'ctrl+enter', mac: 'cmd+enter' }],
      },
    },
  };
  const nls = (id: string) => (id === 'vscode.git' ? { displayName: 'Git', 'command.commit': 'Commit' } : undefined);
  const core: CoreCommand[] = [
    { id: 'workbench.action.toggleSidebarVisibility', category: 'View', title: 'Toggle Primary Side Bar Visibility', key: 'ctrl+b', mac: 'cmd+b' },
    { id: 'workbench.action.gone', category: 'View', title: 'Gone In This Version' },
  ];
  const existing = new Set(['workbench.action.toggleSidebarVisibility', 'git.commit']);

  it('lists extension commands with their translated title, category, source and key', () => {
    const entries = buildCatalog([git], existing, 'linux', [], nls);
    expect(entries).toEqual([
      { id: 'git.commit', title: 'Commit', category: 'Git', source: 'extension', extensionName: 'Git', keybinding: 'Ctrl+Enter' },
    ]);
  });

  it('skips commands hidden from the Command Palette and commands without a title', () => {
    const ids = buildCatalog([git], existing, 'linux', [], nls).map(e => e.id);
    expect(ids).not.toContain('git.internal');
    expect(ids).not.toContain('git.noTitle');
  });

  it('lists core commands that exist in this VS Code, with the platform\'s key', () => {
    const entries = buildCatalog([], existing, 'darwin', core, nls);
    expect(entries).toEqual([
      { id: 'workbench.action.toggleSidebarVisibility', title: 'Toggle Primary Side Bar Visibility', category: 'View', source: 'core', keybinding: '⌘B' },
    ]);
  });

  it('keeps every core command when the list of existing commands is not known', () => {
    expect(buildCatalog([], undefined, 'linux', core, nls)).toHaveLength(2);
  });

  it('skips an extension whose commands are not a list, and keeps the others', () => {
    const broken: ExtensionInfo = { id: 'x.broken', packageJSON: { name: 'broken', contributes: { commands: { command: 'b.x', title: 'X' } } } };
    const ids = buildCatalog([broken, git], existing, 'linux', [], nls).map(e => e.id);
    expect(ids).toEqual(['git.commit']);
  });

  it('survives an extension without a manifest', () => {
    expect(buildCatalog([{ id: 'x.none', packageJSON: undefined }, git], existing, 'linux', [], nls).map(e => e.id)).toEqual(['git.commit']);
  });

  it('lists a command once when both VS Code and an extension name it, as the extension describes it', () => {
    const dup: CoreCommand[] = [{ id: 'git.commit', category: 'Git', title: 'Commit (core)' }];
    const entries = buildCatalog([git], existing, 'linux', dup, nls);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('extension');
  });

  it('falls back to the extension name when it has no display name', () => {
    const plain: ExtensionInfo = { id: 'me.plain', packageJSON: { name: 'plain', contributes: { commands: [{ command: 'plain.go', title: 'Go' }] } } };
    expect(buildCatalog([plain], undefined, 'linux', [], () => undefined)[0].extensionName).toBe('plain');
  });

  it('sorts by "Category: Title", ignoring case', () => {
    const many: ExtensionInfo = {
      id: 'me.many',
      packageJSON: { name: 'many', contributes: { commands: [
        { command: 'm.b', title: 'beta', category: 'Zed' },
        { command: 'm.a', title: 'Alpha' },
        { command: 'm.c', title: 'gamma', category: 'Abc' },
      ] } },
    };
    expect(buildCatalog([many], undefined, 'linux', [], () => undefined).map(e => e.id)).toEqual(['m.c', 'm.a', 'm.b']);
  });
});
