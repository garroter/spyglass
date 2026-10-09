import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const env = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  choice: undefined as string | undefined,
  messages: [] as Array<{ text: string; buttons: string[] }>,
  configUpdates: [] as Array<{ key: string; value: unknown; target: unknown }>,
  commands: [] as unknown[][],
}));

vi.mock('vscode', () => ({
  env: { language: 'en' },
  ConfigurationTarget: { Global: 1 },
  Uri: { joinPath: (base: { fsPath: string }, ...seg: string[]) => ({ fsPath: [base.fsPath, ...seg].join('/') }) },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) => (key in env.settings ? env.settings[key] : fallback),
      update: async (key: string, value: unknown, target: unknown) => { env.configUpdates.push({ key, value, target }); },
    }),
  },
  window: {
    showInformationMessage: async (text: string, ...buttons: string[]) => {
      env.messages.push({ text, buttons });
      return env.choice;
    },
  },
  commands: { executeCommand: async (...args: unknown[]) => { env.commands.push(args); } },
}));

import { parseVersion, shouldAnnounce, announceIfUpdated, showWhatsNew } from '../whatsNew';
import { getUiStrings } from '../i18n';
import { loadManifest } from './manifest';

function makeContext(version: string, stored?: string) {
  const store = new Map<string, unknown>();
  if (stored !== undefined) { store.set('spyglass.lastSeenVersion', stored); }
  return {
    store,
    extension: { packageJSON: { version } },
    extensionUri: { fsPath: '/ext' },
    globalState: {
      get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
      update: async (key: string, value: unknown) => { store.set(key, value); },
    },
  };
}

beforeEach(() => {
  env.settings = {};
  env.choice = undefined;
  env.messages = [];
  env.configUpdates = [];
  env.commands = [];
});

describe('parseVersion', () => {
  it.each([
    ['0.2.10', [0, 2, 10]],
    ['1.0.0', [1, 0, 0]],
    ['0.3.0-beta.1', [0, 3, 0]],
    [' 2.4.6 ', [2, 4, 6]],
  ])('%j -> %j', (input, expected) => {
    expect(parseVersion(input)).toEqual(expected);
  });

  it.each([[''], ['abc'], ['1.2'], ['v1.2.3'], ['1.2.x']])('rejects %j', input => {
    expect(parseVersion(input)).toBeUndefined();
  });
});

describe('shouldAnnounce', () => {
  it.each([
    ['0.2.10', '0.3.0', true],     // new minor
    ['0.2.10', '1.0.0', true],     // new major
    ['0.9.4', '1.0.0', true],
    ['0.3.0', '0.3.1', false],     // patch only
    ['0.2.9', '0.2.10', false],
    ['0.3.0', '0.3.0', false],     // same version (a restart)
    ['0.3.0', '0.2.10', false],    // downgrade
    ['1.0.0', '0.9.9', false],
    [undefined, '0.3.0', false],   // fresh install
    ['garbage', '0.3.0', false],
    ['0.2.10', 'garbage', false],
  ])('%j -> %j : %j', (previous, current, expected) => {
    expect(shouldAnnounce(previous as string | undefined, current as string)).toBe(expected);
  });
});

describe('announceIfUpdated', () => {
  it('stays quiet on a fresh install, but remembers the version', async () => {
    const context = makeContext('0.3.0');
    await announceIfUpdated(context as never);
    expect(env.messages).toEqual([]);
    expect(context.store.get('spyglass.lastSeenVersion')).toBe('0.3.0');
  });

  it('tells the user about a new minor version, offering the changelog and a way to stop', async () => {
    const context = makeContext('0.3.0', '0.2.10');
    await announceIfUpdated(context as never);
    const s = getUiStrings();
    expect(env.messages).toHaveLength(1);
    expect(env.messages[0].text).toContain('0.3.0');
    expect(env.messages[0].buttons).toEqual([s.whatsNewAction, s.dontShowAgain]);
  });

  it('is quiet for a patch release, but remembers it', async () => {
    const context = makeContext('0.2.11', '0.2.10');
    await announceIfUpdated(context as never);
    expect(env.messages).toEqual([]);
    expect(context.store.get('spyglass.lastSeenVersion')).toBe('0.2.11');
  });

  it('does not repeat itself after a restart on the same version', async () => {
    const context = makeContext('0.3.0', '0.2.10');
    await announceIfUpdated(context as never);
    await announceIfUpdated(context as never);
    expect(env.messages).toHaveLength(1);
  });

  it('remembers the version before the message is answered, so a dismissed one is not shown again', async () => {
    const context = makeContext('0.3.0', '0.2.10');
    env.choice = undefined; // dismissed
    await announceIfUpdated(context as never);
    expect(context.store.get('spyglass.lastSeenVersion')).toBe('0.3.0');
    await announceIfUpdated(context as never);
    expect(env.messages).toHaveLength(1);
  });

  it('respects spyglass.showWhatsNew = false, while still remembering the version', async () => {
    env.settings = { showWhatsNew: false };
    const context = makeContext('0.3.0', '0.2.10');
    await announceIfUpdated(context as never);
    expect(env.messages).toEqual([]);
    expect(context.store.get('spyglass.lastSeenVersion')).toBe('0.3.0');
  });

  it('opens the changelog when the user asks for it', async () => {
    env.choice = getUiStrings().whatsNewAction;
    await announceIfUpdated(makeContext('0.3.0', '0.2.10') as never);
    expect(env.commands).toEqual([['markdown.showPreview', { fsPath: '/ext/CHANGELOG.md' }]]);
  });

  it('turns the setting off, for all workspaces, when the user chooses "don\'t show again"', async () => {
    env.choice = getUiStrings().dontShowAgain;
    await announceIfUpdated(makeContext('0.3.0', '0.2.10') as never);
    expect(env.configUpdates).toEqual([{ key: 'showWhatsNew', value: false, target: 1 }]);
    expect(env.commands).toEqual([]);
  });

  it('does nothing more when the message is dismissed', async () => {
    env.choice = undefined;
    await announceIfUpdated(makeContext('0.3.0', '0.2.10') as never);
    expect(env.configUpdates).toEqual([]);
    expect(env.commands).toEqual([]);
  });
});

describe('showWhatsNew', () => {
  it('previews the CHANGELOG shipped with the extension', async () => {
    await showWhatsNew(makeContext('0.3.0') as never);
    expect(env.commands).toEqual([['markdown.showPreview', { fsPath: '/ext/CHANGELOG.md' }]]);
  });
});

describe('manifest', () => {
  const manifest = loadManifest();

  it('contributes the What\'s New command', () => {
    const cmd = manifest.contributes.commands.find((c: { command: string }) => c.command === 'spyglass.showWhatsNew');
    expect(cmd?.title).toBe("Spyglass: What's New");
  });

  it('contributes spyglass.showWhatsNew as a boolean that defaults to on', () => {
    const setting = manifest.contributes.configuration.properties['spyglass.showWhatsNew'];
    expect(setting.type).toBe('boolean');
    expect(setting.default).toBe(true);
  });

  it('ships the CHANGELOG that the command opens', () => {
    const ignore = readFileSync(path.join(__dirname, '..', '..', '.vscodeignore'), 'utf-8').split('\n').map(l => l.trim());
    expect(ignore.some(l => /^\**\/?CHANGELOG(\.md)?$/i.test(l))).toBe(false);
  });
});
