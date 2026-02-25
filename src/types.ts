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

export type Scope = 'project' | 'openFiles' | 'files' | 'recent';

export interface FileResult {
  file: string;
  relativePath: string;
  matchPositions: number[];
}

export type MessageToWebview =
  | { type: 'results'; results: SearchResult[]; query: string; took: number }
  | { type: 'searching' }
  | { type: 'focus' }
  | { type: 'setQuery'; query: string }
  | { type: 'error'; message: string }
  | { type: 'previewContent'; lines: string[]; currentLine: number; relativePath: string; ext: string }
  | { type: 'fileResults'; results: FileResult[]; query: string };

export type MessageFromWebview =
  | { type: 'search'; query: string; useRegex: boolean; scope: Scope }
  | { type: 'open'; file: string; line: number }
  | { type: 'openInSplit'; file: string; line: number }
  | { type: 'preview'; file: string; line: number }
  | { type: 'fileSearch'; query: string }
  | { type: 'recentSearch'; query: string }
  | { type: 'close' };
