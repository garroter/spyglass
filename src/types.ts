export interface KeyBindings {
  navigateDown: string;
  navigateUp: string;
  open: string;
  close: string;
  toggleRegex: string;
  togglePreview: string;
}

export interface ButtonPrefs {
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  replaceMode: boolean;
  showPreview: boolean;
  sortBy: 'default' | 'filename' | 'count';
  includeMode: boolean;
}

export interface SearchResult {
  file: string;
  relativePath: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export type Scope = 'project' | 'openFiles' | 'files' | 'recent' | 'here' | 'symbols' | 'git' | 'doc' | 'refs';

export interface FileResult {
  file: string;
  relativePath: string;
  matchPositions: number[];
}

export interface SymbolResult {
  name: string;
  kindLabel: string;   // 'class', 'function', 'variable', etc.
  file: string;
  relativePath: string;
  line: number;
  container?: string;  // e.g. containing class
}

export type MessageToWebview =
  | { type: 'results'; results: SearchResult[]; query: string; took: number }
  | { type: 'resultsChunk'; results: SearchResult[]; query: string }
  | { type: 'searching' }
  | { type: 'focus' }
  | { type: 'setQuery'; query: string }
  | { type: 'error'; message: string }
  | { type: 'previewContent'; content: string; currentLine: number; relativePath: string; ext: string; changedLines?: number[] }
  | { type: 'themeChanged'; theme: object | null }
  | { type: 'fileResults'; results: FileResult[]; query: string }
  | { type: 'symbolResults'; results: SymbolResult[]; query: string }
  | { type: 'fileList'; files: { file: string; rel: string }[] }
  | { type: 'savedSearches'; searches: { query: string; scope: string }[] }
  | { type: 'replacePreview'; files: { relativePath: string; changesCount: number; lines: { line: number; before: string; after: string }[] }[] };

export type MessageFromWebview =
  | { type: 'search'; query: string; useRegex: boolean; scope: Scope; caseSensitive: boolean; wholeWord: boolean; globFilter: string }
  | { type: 'open'; file: string; line: number }
  | { type: 'openInSplit'; file: string; line: number }
  | { type: 'preview'; file: string; line: number }
  | { type: 'fileSearch'; query: string }
  | { type: 'recentSearch'; query: string }
  | { type: 'symbolSearch'; query: string }
  | { type: 'copyPath'; path: string }
  | { type: 'revealFile'; file: string }
  | { type: 'replaceAll'; query: string; replacement: string; useRegex: boolean; caseSensitive: boolean; wholeWord: boolean; globFilter: string; scope: Scope }
  | { type: 'close' }
  | { type: 'scopeChanged'; scope: string }
  | { type: 'setPinnedFiles'; files: { file: string; rel: string }[] }
  | { type: 'setGroupResults'; value: boolean }
  | { type: 'saveButtonPrefs'; prefs: ButtonPrefs }
  | { type: 'saveSearch'; query: string; scope: string }
  | { type: 'removeSavedSearch'; index: number }
  | { type: 'replacePreview'; query: string; replacement: string; useRegex: boolean; caseSensitive: boolean; wholeWord: boolean; globFilter: string; scope: string }
  | { type: 'gitSearch' }
  | { type: 'docSearch' }
  | { type: 'refsSearch' }
  | { type: 'includeSearch'; query: string; includeFilter: string };

