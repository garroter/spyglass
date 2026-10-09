import type { AppState, SpyglassConfig } from './types';
import { vscode } from './vscode';

declare const window: Window & { __spyglass: SpyglassConfig };

const { INITIAL_HISTORY, RECENT_FILES, PINNED_FILES, DEFAULT_SCOPE, GROUP_RESULTS, BUTTON_PREFS, SAVED_SEARCHES } = window.__spyglass;

const bp = BUTTON_PREFS || {} as any;

export const state: AppState = {
  results: [],
  fileResults: [],
  symbolResults: [],
  fileList: null,
  gitFiles: null,
  recentFiles: RECENT_FILES,
  pinnedFiles: PINNED_FILES.slice(),
  gitStatus: {},
  selected: 0,
  scope: DEFAULT_SCOPE,
  useRegex: bp.useRegex ?? false,
  caseSensitive: bp.caseSensitive ?? false,
  wholeWord: bp.wholeWord ?? false,
  globFilter: '',
  // replace is not available in multiline mode, so a saved combination of both keeps only multiline
  replaceMode: (bp.replaceMode ?? false) && !(bp.multiline ?? false),
  groupResults: GROUP_RESULTS,
  query: '',
  searching: false,
  showPreview: bp.showPreview ?? true,
  multiSelected: new Set(),
  searchHistory: INITIAL_HISTORY.slice(),
  historyIndex: -1,
  historyPreQuery: '',
  currentPreviewFile: null,
  sortBy: bp.sortBy ?? 'default' as 'default' | 'filename' | 'count',
  includeFilter: '',
  includeMode: bp.includeMode ?? false,
  includeIgnored: bp.includeIgnored ?? false,
  multiline: bp.multiline ?? false,
  symbolKindFilter: '',
  savedSearches: (SAVED_SEARCHES ?? []).slice(),
  bookmarksMode: false,
  refsSymbol: '',
  fileLine: null,
  fileColumn: null,
  prefixReturnScope: null,
  commandEntries: null,
  recentCommands: [],
  commandResults: [],
  pendingSelect: null,
};

export function saveButtonPrefs(): void {
  vscode.postMessage({
    type: 'saveButtonPrefs',
    prefs: {
      useRegex: state.useRegex,
      caseSensitive: state.caseSensitive,
      wholeWord: state.wholeWord,
      replaceMode: state.replaceMode,
      showPreview: state.showPreview,
      sortBy: state.sortBy,
      includeMode: state.includeMode,
      includeIgnored: state.includeIgnored,
      multiline: state.multiline,
    },
  });
}
