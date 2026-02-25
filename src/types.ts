export interface SearchResult {
  file: string;
  relativePath: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export type Scope = 'project' | 'openFiles';

export type MessageToWebview =
  | { type: 'results'; results: SearchResult[]; query: string; took: number }
  | { type: 'searching' }
  | { type: 'focus' }

  | { type: 'error'; message: string }
  | { type: 'previewContent'; lines: string[]; currentLine: number; relativePath: string; ext: string };

export type MessageFromWebview =
  | { type: 'search'; query: string; useRegex: boolean; scope: Scope }
  | { type: 'open'; file: string; line: number }
  | { type: 'preview'; file: string; line: number }
  | { type: 'close' };
