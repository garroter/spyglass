export interface KeyBindings {
  navigateDown: string;
  navigateUp: string;
  open: string;
  close: string;
  toggleRegex: string;
  togglePreview: string;
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
  | { type: 'searching' }
  | { type: 'focus' }
  | { type: 'setQuery'; query: string }
  | { type: 'error'; message: string }
  | { type: 'previewContent'; lines: string[]; currentLine: number; relativePath: string; ext: string; changedLines?: number[]; preHighlighted?: boolean }
  | { type: 'fileResults'; results: FileResult[]; query: string }
  | { type: 'symbolResults'; results: SymbolResult[]; query: string };

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
  | { type: 'close' };
