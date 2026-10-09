import { Scope } from './types';

/**
 * One "Find …" command per search scope. They open Spyglass straight in that scope, so each can be
 * bound to its own key (e.g. "Find Files" on Ctrl+P). Named after what they do rather than after the
 * scope id, because the "openFiles" scope means "search inside the open tabs", not "open files".
 */
export const SCOPE_COMMANDS: ReadonlyArray<{ command: string; scope: Scope }> = [
  { command: 'spyglass.findInProject',       scope: 'project' },
  { command: 'spyglass.findFiles',           scope: 'files' },
  { command: 'spyglass.findInOpenFiles',     scope: 'openFiles' },
  { command: 'spyglass.findRecent',          scope: 'recent' },
  { command: 'spyglass.findInDirectory',     scope: 'here' },
  { command: 'spyglass.findSymbols',         scope: 'symbols' },
  { command: 'spyglass.findGitChanges',      scope: 'git' },
  { command: 'spyglass.findDocumentSymbols', scope: 'doc' },
  { command: 'spyglass.findReferences',      scope: 'refs' },
  { command: 'spyglass.findCommands',        scope: 'commands' },
];

export function isScope(value: unknown): value is Scope {
  return SCOPE_COMMANDS.some(c => c.scope === value);
}

/** Reads the scope from the argument of `spyglass.open` in a keybinding: { "scope": "files" }. */
export function scopeFromCommandArg(arg: unknown): Scope | undefined {
  if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) { return undefined; }
  const scope = (arg as { scope?: unknown }).scope;
  return isScope(scope) ? scope : undefined;
}

/** Reads the folder from the Uri an Explorer context menu passes to a command. */
export function directoryFromCommandArg(arg: unknown): string | undefined {
  if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) { return undefined; }
  const fsPath = (arg as { fsPath?: unknown }).fsPath;
  return typeof fsPath === 'string' && fsPath !== '' ? fsPath : undefined;
}
