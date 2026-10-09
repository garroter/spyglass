/**
 * A stand-in for the `vscode` module, installed by side effect: import this file BEFORE any
 * module from ../../src so that their `require('vscode')` resolves to the mock below.
 *
 * It implements just enough of the API for SpyglassController, ripgrep, themeLoader and i18n,
 * and backs the file operations with the real file system (temp copies of the fixture project).
 */
import Module from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class Uri {
  constructor(public readonly fsPath: string) {}
  readonly scheme = 'file';
  static file(p: string): Uri { return new Uri(p); }
  static joinPath(base: Uri, ...segments: string[]): Uri { return new Uri(path.join(base.fsPath, ...segments)); }
  toString(): string { return `file://${this.fsPath}`; }
}

class Range {
  constructor(public startLine: number, public startCharacter: number, public endLine: number, public endCharacter: number) {}
}

class WorkspaceEdit {
  readonly edits: Array<{ uri: Uri; range: Range; text: string }> = [];
  replace(uri: Uri, range: Range, text: string): void { this.edits.push({ uri, range, text }); }
}

/** Mutable state the tests can inspect and change. */
export const mock = {
  settings: {} as Record<string, unknown>,
  folders: undefined as undefined | Array<{ uri: Uri }>,
  activeEditor: undefined as unknown,
  clipboard: '',
  errorMessages: [] as string[],
  infoMessages: [] as string[],
  commands: [] as unknown[][],
  /** Return values for executeCommand, keyed by command id, e.g. 'vscode.executeDocumentSymbolProvider'. */
  commandResults: {} as Record<string, unknown>,
  themeListeners: new Set<() => void>(),
  reset(): void {
    this.settings = {};
    this.folders = undefined;
    this.activeEditor = undefined;
    this.clipboard = '';
    this.errorMessages = [];
    this.infoMessages = [];
    this.commands = [];
    this.commandResults = {};
    this.themeListeners.clear();
  },
};

const vscodeMock = {
  __esModule: true,
  env: {
    language: 'en',
    appRoot: '/mock/vscode',
    clipboard: { writeText: async (text: string) => { mock.clipboard = text; } },
  },
  workspace: {
    get workspaceFolders() { return mock.folders; },
    getConfiguration(section?: string) {
      return {
        get: (key: string, fallback?: unknown) => {
          const full = section ? `${section}.${key}` : key;
          return full in mock.settings ? mock.settings[full] : fallback;
        },
      };
    },
    async openTextDocument(uri: Uri) {
      const text = fs.readFileSync(uri.fsPath, 'utf-8');
      return { uri, getText: () => text };
    },
    // The controller replaces whole files, so applying an edit means writing the new text.
    async applyEdit(edit: WorkspaceEdit) {
      for (const e of edit.edits) { fs.writeFileSync(e.uri.fsPath, e.text); }
      return true;
    },
    async save() { return true; },
  },
  window: {
    get activeTextEditor() { return mock.activeEditor; },
    tabGroups: { all: [] as unknown[] },
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme(listener: () => void) {
      mock.themeListeners.add(listener);
      return { dispose: () => { mock.themeListeners.delete(listener); } };
    },
    showErrorMessage(message: string) { mock.errorMessages.push(message); return Promise.resolve(undefined); },
    showInformationMessage(message: string) { mock.infoMessages.push(message); return Promise.resolve(undefined); },
    withProgress: <T>(_options: unknown, task: () => T) => task(),
  },
  commands: { executeCommand: async (...args: unknown[]) => { mock.commands.push(args); return mock.commandResults[args[0] as string]; } },
  extensions: { all: [] as unknown[] },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  ProgressLocation: { Notification: 15 },
  Position: class { constructor(public line: number, public character: number) {} },
  Uri,
  Range,
  WorkspaceEdit,
};

const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === 'vscode' ? vscodeMock : originalLoad.call(this, request, ...rest);
};
