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
  RESUME: { query: string; selected: number } | null;
  INITIAL_HISTORY: string[];
  RECENT_FILES: RecentFile[];
  PINNED_FILES: RecentFile[];
  MAX_RESULTS: number;
  DEFAULT_SCOPE: string;
  GROUP_RESULTS: boolean;
  BUTTON_PREFS: ButtonPrefs;
  SAVED_SEARCHES: Array<{ query: string; scope: string }>;
  THEME: object | null;
  STRINGS: Record<string, string>;
}

export interface ButtonPrefs {
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  replaceMode: boolean;
  showPreview: boolean;
  sortBy: 'default' | 'filename' | 'count';
  includeMode: boolean;
  includeIgnored: boolean;
  multiline: boolean;
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
  sortBy: 'default' | 'filename' | 'count';
  includeFilter: string;
  includeMode: boolean;
  includeIgnored: boolean;
  multiline: boolean;
  symbolKindFilter: string;
  savedSearches: Array<{ query: string; scope: string }>;
  bookmarksMode: boolean;
  refsSymbol: string;
  /** Line (and column) typed after a file query in a file list: `util.ts:42:7`; null when none. */
  fileLine: number | null;
  fileColumn: number | null;
  /** The file list a leading `@` switched to Doc from, to go back to when the `@` is deleted. */
  atReturnScope: string | null;
  /** A result to select once the list has loaded (Resume Last Search); null when none. */
  pendingSelect: number | null;
}
