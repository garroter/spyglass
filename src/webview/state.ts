import type { AppState, SpyglassConfig } from './types';

declare const window: Window & { __spyglass: SpyglassConfig };

const { INITIAL_HISTORY, RECENT_FILES, PINNED_FILES, DEFAULT_SCOPE } = window.__spyglass;

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
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  globFilter: '',
  replaceMode: false,
  groupResults: false,
  query: '',
  searching: false,
  showPreview: true,
  multiSelected: new Set(),
  searchHistory: INITIAL_HISTORY.slice(),
  historyIndex: -1,
  historyPreQuery: '',
  currentPreviewFile: null,
};
