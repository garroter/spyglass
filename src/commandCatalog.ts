// The commands the Commands scope offers: those contributed by extensions (read from their
// manifests) plus a curated list of VS Code's own (coreCommands.ts). Pure functions, so the whole
// catalog can be tested without VS Code; SpyglassController feeds them the live data.

import type { CoreCommand } from './coreCommands';

export type Platform = 'linux' | 'win32' | 'darwin';

export interface CommandEntry {
  id: string;
  title: string;
  category?: string;
  source: 'core' | 'extension';
  /** Display name of the extension that contributes the command. */
  extensionName?: string;
  /** The default keybinding, formatted for the platform. */
  keybinding?: string;
}

/** The part of a `vscode.Extension` the catalog reads. */
export interface ExtensionInfo {
  id: string;
  packageJSON: unknown;
}

/** The extension's localized manifest strings (package.nls*.json), if any. */
export type NlsLookup = (extensionId: string) => Record<string, string> | undefined;

/**
 * A manifest string as shown to the user: a `%key%` placeholder is looked up in the extension's
 * strings (kept as it is when missing), a `{ value, original }` title gives its value.
 */
export function resolveNls(value: unknown, strings: Record<string, string> | undefined): string | undefined {
  if (value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string') {
    return (value as { value: string }).value;
  }
  if (typeof value !== 'string') { return undefined; }
  const m = /^%(.+)%$/.exec(value);
  return m && strings && typeof strings[m[1]] === 'string' ? strings[m[1]] : value;
}

/** The raw default key of `command` among `contributes.keybindings`, for the platform. */
export function defaultKeybinding(bindings: unknown, command: string, platform: Platform): string | undefined {
  if (!Array.isArray(bindings)) { return undefined; }
  const field = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux';
  for (const b of bindings as Array<Record<string, unknown>>) {
    if (!b || b.command !== command) { continue; }
    const key = typeof b[field] === 'string' ? b[field] : b.key;
    if (typeof key === 'string' && key) { return key; }
  }
  return undefined;
}

const MAC_SYMBOLS: Record<string, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘', meta: '⌘' };
const MAC_ORDER = ['ctrl', 'alt', 'shift', 'cmd', 'meta'];

function keyName(k: string): string {
  return k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
}

/** `ctrl+shift+p` → `Ctrl+Shift+P`; on macOS `cmd+shift+p` → `⇧⌘P`. Chords stay space-separated. */
export function formatKeybinding(key: string, platform: Platform): string {
  return key.trim().split(/\s+/).map(press => {
    // split on '+' but keep a literal '+' key (e.g. "ctrl++")
    const parts = press.split(/\+(?!$)/).map(p => p.toLowerCase());
    if (platform !== 'darwin') { return parts.map(keyName).join('+'); }
    const mods = parts.filter(p => p in MAC_SYMBOLS).sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    const rest = parts.filter(p => !(p in MAC_SYMBOLS));
    return mods.map(m => MAC_SYMBOLS[m]).join('') + rest.map(keyName).join('+');
  }).join(' ');
}

function label(e: { title: string; category?: string }): string {
  return (e.category ? e.category + ': ' + e.title : e.title).toLowerCase();
}

/**
 * All commands to offer, sorted by "Category: Title". Extension commands come from each manifest
 * (commands hidden from the Command Palette and untitled ones are skipped); core commands are kept
 * only when `existingIds` (from `vscode.commands.getCommands()`) has them, or when it is unknown.
 * A command named by both keeps the extension's description.
 */
export function buildCatalog(
  extensions: readonly ExtensionInfo[],
  existingIds: ReadonlySet<string> | undefined,
  platform: Platform,
  core: readonly CoreCommand[],
  nls: NlsLookup,
): CommandEntry[] {
  const byId = new Map<string, CommandEntry>();

  for (const c of core) {
    if (existingIds && !existingIds.has(c.id)) { continue; }
    const key = platform === 'darwin' ? (c.mac ?? c.key) : c.key;
    byId.set(c.id, {
      id: c.id, title: c.title, source: 'core',
      ...(c.category ? { category: c.category } : {}),
      ...(key ? { keybinding: formatKeybinding(key, platform) } : {}),
    });
  }

  for (const ext of extensions) {
    const pkg = ext.packageJSON as Record<string, unknown> | undefined;
    const contributes = pkg?.contributes as Record<string, unknown> | undefined;
    const commands = contributes?.commands;
    if (!Array.isArray(commands)) { continue; }
    let strings: Record<string, string> | undefined;
    try { strings = nls(ext.id); } catch { strings = undefined; }

    const menus = contributes?.menus as Record<string, unknown> | undefined;
    const palette = Array.isArray(menus?.commandPalette) ? menus!.commandPalette as Array<Record<string, unknown>> : [];
    const hidden = new Set(palette.filter(m => m && m.when === 'false').map(m => m.command));
    const extensionName = resolveNls(pkg?.displayName, strings) ?? resolveNls(pkg?.name, strings) ?? ext.id;

    for (const raw of commands as Array<Record<string, unknown>>) {
      if (!raw || typeof raw.command !== 'string' || hidden.has(raw.command)) { continue; }
      const title = resolveNls(raw.title, strings);
      if (!title) { continue; }
      const category = resolveNls(raw.category, strings);
      const key = defaultKeybinding(contributes?.keybindings, raw.command, platform);
      byId.set(raw.command, {
        id: raw.command, title, source: 'extension', extensionName,
        ...(category ? { category } : {}),
        ...(key ? { keybinding: formatKeybinding(key, platform) } : {}),
      });
    }
  }

  return [...byId.values()].sort((a, b) => label(a).localeCompare(label(b)));
}
