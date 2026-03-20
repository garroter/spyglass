// Shared type definitions for the webview

export interface SearchResult {
  file: string;
  relativePath: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface FileResult {
  file: string;
  relativePath: string;
  matchPositions: number[];
  score?: number;
  isPinned?: boolean;
}

export interface RecentFile {
  file: string;
  rel: string;
}

export interface SymbolResult {
  file: string;
  relativePath: string;
  name: string;
  kindLabel: string;
  container?: string;
  line: number;
}

export interface KeyBindings {
  navigateDown: string;
  navigateUp: string;
  open: string;
  close: string;
  toggleRegex: string;
  togglePreview: string;
}

export interface SpyglassConfig {
  KB: KeyBindings;
  INITIAL_QUERY: string;
  INITIAL_HISTORY: string[];
  RECENT_FILES: RecentFile[];
  PINNED_FILES: RecentFile[];
  MAX_RESULTS: number;
  DEFAULT_SCOPE: string;
  GROUP_RESULTS: boolean;
}

export interface AppState {
  results: SearchResult[];
  fileResults: FileResult[];
  symbolResults: SymbolResult[];
  fileList: RecentFile[] | null;
  gitFiles: RecentFile[] | null;
  recentFiles: RecentFile[];
  pinnedFiles: RecentFile[];
  gitStatus: Record<string, string>;
  selected: number;
  scope: string;
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  globFilter: string;
  replaceMode: boolean;
  groupResults: boolean;
  query: string;
  searching: boolean;
  showPreview: boolean;
  multiSelected: Set<number>;
  searchHistory: string[];
  historyIndex: number;
  historyPreQuery: string;
  currentPreviewFile: string | null;
}
