import { describe, it, expect } from 'vitest';
import { loadManifest } from './manifest';
import { SCOPE_COMMANDS, isScope, scopeFromCommandArg, directoryFromCommandArg } from '../scopeCommands';

const ALL_SCOPES = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols', 'git', 'doc', 'refs', 'commands'];

const manifest = loadManifest(); // package.json with its %keys% resolved, as VS Code shows it
const contributedCommands: Array<{ command: string; title: string }> = manifest.contributes.commands;

describe('SCOPE_COMMANDS', () => {
  it('has exactly one command for every scope', () => {
    expect(SCOPE_COMMANDS.map(c => c.scope).sort()).toEqual([...ALL_SCOPES].sort());
  });

  it('uses unique spyglass.* command ids', () => {
    const ids = SCOPE_COMMANDS.map(c => c.command);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => /^spyglass\.[a-zA-Z]+$/.test(id))).toBe(true);
  });

  it('is fully contributed by package.json, each with a "Spyglass: " title', () => {
    for (const { command } of SCOPE_COMMANDS) {
      const contributed = contributedCommands.find(c => c.command === command);
      expect(contributed, `${command} is missing from contributes.commands`).toBeDefined();
      expect(contributed!.title.startsWith('Spyglass: ')).toBe(true);
    }
  });

  it('does not take over any default keybinding', () => {
    const ids = new Set(SCOPE_COMMANDS.map(c => c.command));
    const bound = (manifest.contributes.keybindings as Array<{ command: string }>).filter(k => ids.has(k.command));
    expect(bound).toEqual([]);
  });
});

describe('isScope', () => {
  it.each(ALL_SCOPES)('accepts %s', scope => {
    expect(isScope(scope)).toBe(true);
  });

  it.each([['nope'], [''], [undefined], [null], [42], [{}], ['Project']])('rejects %j', value => {
    expect(isScope(value)).toBe(false);
  });
});

describe('scopeFromCommandArg (the argument of spyglass.open in a keybinding)', () => {
  it('reads the scope from { scope }', () => {
    expect(scopeFromCommandArg({ scope: 'files' })).toBe('files');
  });

  it('accepts the Commands scope', () => {
    expect(scopeFromCommandArg({ scope: 'commands' })).toBe('commands');
  });

  it.each([
    [undefined], [null], ['files'], [42], [{}], [{ scope: 'nope' }], [{ scope: 3 }], [[]],
  ])('ignores %j', arg => {
    expect(scopeFromCommandArg(arg)).toBeUndefined();
  });
});

describe('directoryFromCommandArg (the folder an Explorer menu passes to a command)', () => {
  it('reads the file-system path of a Uri', () => {
    expect(directoryFromCommandArg({ fsPath: '/proj/src', scheme: 'file' })).toBe('/proj/src');
  });

  it.each([
    [undefined], [null], ['/proj/src'], [42], [{}], [{ fsPath: '' }], [{ fsPath: 3 }], [[]],
  ])('ignores %j', arg => {
    expect(directoryFromCommandArg(arg)).toBeUndefined();
  });
});

describe('context menus', () => {
  const menus = manifest.contributes.menus as Record<string, Array<{ command: string; when?: string; group?: string }>>;
  const entry = (menu: string, command: string) => menus[menu]?.find(m => m.command === command);

  it('contributes "Find in Folder", titled like the other commands', () => {
    const cmd = contributedCommands.find(c => c.command === 'spyglass.findInFolder');
    expect(cmd?.title).toBe('Spyglass: Find in Folder');
  });

  it('offers "Find in Folder" on folders in the Explorer, and only on folders', () => {
    const item = entry('explorer/context', 'spyglass.findInFolder');
    expect(item).toBeDefined();
    expect(item!.when).toContain('explorerResourceIsFolder');
  });

  it('does not list "Find in Folder" in the Command Palette, where there is no folder to pass', () => {
    expect(entry('commandPalette', 'spyglass.findInFolder')?.when).toBe('false');
  });

  it('offers "Find in Project" in the editor menu only when text is selected', () => {
    const item = entry('editor/context', 'spyglass.findInProject');
    expect(item).toBeDefined();
    expect(item!.when).toContain('editorHasSelection');
  });

  it('only references commands that the extension contributes', () => {
    const known = new Set(contributedCommands.map(c => c.command));
    for (const items of Object.values(menus)) {
      for (const item of items) { expect(known.has(item.command), item.command).toBe(true); }
    }
  });
});

