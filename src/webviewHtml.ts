import { ButtonPrefs, KeyBindings, Scope } from './types';
import type { UiStrings } from './i18n';

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

interface FileEntry { file: string; rel: string }

/** Everything the webview script reads from `window.__spyglass`. */
export interface WebviewConfig {
  KB: KeyBindings;
  INITIAL_QUERY: string;
  /** The search to reopen (Resume Last Search): the query as typed and the selected result. */
  RESUME: { query: string; selected: number } | null;
  INITIAL_HISTORY: string[];
  RECENT_FILES: FileEntry[];
  PINNED_FILES: FileEntry[];
  MAX_RESULTS: number;
  DEFAULT_SCOPE: Scope;
  GROUP_RESULTS: boolean;
  BUTTON_PREFS: ButtonPrefs;
  SAVED_SEARCHES: Array<{ query: string; scope: string }>;
  STRINGS: UiStrings;
  THEME: object | null;
}

export interface WebviewHtmlParams {
  cspSource: string;
  cssUri: string;
  jsUri: string;
  nonce: string;
  /** Sidebar layout (narrow, fills the view) instead of the popup card. */
  sidebarMode: boolean;
  config: WebviewConfig;
}

/**
 * JSON for embedding inside an inline <script>. `<` is escaped so text such as a selected
 * "</script>" in INITIAL_QUERY cannot terminate the script element early.
 */
function serializeConfig(config: WebviewConfig): string {
  return JSON.stringify(config).replace(/</g, '\\u003c');
}

export function renderWebviewHtml(params: WebviewHtmlParams): string {
  const { cspSource, cssUri, jsUri, nonce, sidebarMode, config } = params;
  const s = config.STRINGS;
  const kb = config.KB;
  const bodyClass = sidebarMode ? ' class="sidebar-mode"' : '';
  const tipRegex = s.regex + ' — ' + (kb.toggleRegex || 'Shift+Alt+R');
  const tipPreview = s.togglePreview + ' — ' + (kb.togglePreview || 'Shift+Alt+P');

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spyglass</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body${bodyClass}>

<div class="finder">

<!-- Top bar -->
<div class="topbar">
  <span class="search-icon"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="10.2" y1="10.2" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
  <input id="query" type="text" placeholder="${s.searchPlaceholder}" autocomplete="off" spellcheck="false">
  <button type="button" class="icon-btn" id="regex-btn" aria-label="${s.regex}" data-tooltip="${tipRegex}">.*</button>
  <button type="button" class="icon-btn" id="case-btn" aria-label="${s.caseSensitive}" data-tooltip="${s.caseSensitive} — Alt+C">Aa</button>
  <button type="button" class="icon-btn" id="word-btn" aria-label="${s.wholeWord}" data-tooltip="${s.wholeWord} — Alt+W">\\b</button>
  <button type="button" class="icon-btn" id="replace-btn" aria-label="${s.replaceMode}" data-tooltip="${s.replaceMode} — Alt+R">⇄</button>
  <button type="button" class="icon-btn active" id="preview-btn" aria-label="${s.togglePreview}" data-tooltip="${tipPreview}">⊡</button>
  <button type="button" class="icon-btn" id="more-btn" aria-label="${s.moreOptions}" aria-haspopup="menu" aria-expanded="false">⋯</button>
  <div class="more-menu" id="more-menu" role="menu" hidden>
    <!-- In a narrow sidebar the search toggles leave the bar and are offered here instead -->
    <button type="button" class="menu-item narrow-only" role="menuitemcheckbox" aria-checked="false" data-action="regex"><span class="mi-check"></span><span class="mi-label">${s.regex}</span><kbd class="mi-key">${kb.toggleRegex || 'Shift+Alt+R'}</kbd></button>
    <button type="button" class="menu-item narrow-only" role="menuitemcheckbox" aria-checked="false" data-action="case"><span class="mi-check"></span><span class="mi-label">${s.caseSensitive}</span><kbd class="mi-key">Alt+C</kbd></button>
    <button type="button" class="menu-item narrow-only" role="menuitemcheckbox" aria-checked="false" data-action="word"><span class="mi-check"></span><span class="mi-label">${s.wholeWord}</span><kbd class="mi-key">Alt+W</kbd></button>
    <button type="button" class="menu-item narrow-only" role="menuitemcheckbox" aria-checked="false" data-action="replace"><span class="mi-check"></span><span class="mi-label">${s.replaceMode}</span><kbd class="mi-key">Alt+R</kbd></button>
    <div class="menu-sep narrow-only"></div>
    <button type="button" class="menu-item" id="group-btn" role="menuitemcheckbox" aria-checked="false"><span class="mi-check"></span><span class="mi-label">${s.groupByFile}</span><kbd class="mi-key">Alt+L</kbd></button>
    <button type="button" class="menu-item" id="sort-btn" role="menuitem"><span class="mi-check"></span><span class="mi-label">${s.sortDefault}</span><kbd class="mi-key">Alt+S</kbd></button>
    <button type="button" class="menu-item" id="multiline-btn" role="menuitemcheckbox" aria-checked="false"><span class="mi-check"></span><span class="mi-label">${s.multiline}</span><kbd class="mi-key">Alt+M</kbd></button>
    <button type="button" class="menu-item" id="ignored-btn" role="menuitemcheckbox" aria-checked="false"><span class="mi-check"></span><span class="mi-label">${s.includeIgnored}</span><kbd class="mi-key">Alt+H</kbd></button>
    <button type="button" class="menu-item" id="include-btn" role="menuitemcheckbox" aria-checked="false"><span class="mi-check"></span><span class="mi-label">${s.includeFilter}</span><kbd class="mi-key">Alt+I</kbd></button>
    <div class="menu-sep"></div>
    <button type="button" class="menu-item" id="bookmarks-btn" role="menuitemcheckbox" aria-checked="false"><span class="mi-check"></span><span class="mi-label">${s.savedSearches}</span><kbd class="mi-key">Alt+B</kbd></button>
    <button type="button" class="menu-item" id="help-btn" role="menuitem"><span class="mi-check"></span><span class="mi-label">${s.keyboardShortcuts}</span><kbd class="mi-key">?</kbd></button>
  </div>
</div>

<!-- Replace row -->
<div class="replace-row" id="replace-row" style="display:none">
  <span class="filter-label">${s.replaceLabel}</span>
  <input id="replace-input" type="text" placeholder="${s.replacePlaceholder}" spellcheck="false" autocomplete="off">
  <button type="button" class="icon-btn" id="replace-all-btn">${s.replaceAll}</button>
</div>

<!-- Include filter row -->
<div class="replace-row" id="include-row" style="display:none">
  <span class="filter-label">${s.includeLabel}</span>
  <input id="include-input" type="text" placeholder="${s.includePlaceholder}" spellcheck="false" autocomplete="off">
</div>

<!-- Scope tabs -->
<div class="tabs-wrap">
<div class="tabs">
  <button type="button" class="tab" data-scope="project">${s.project}</button>
  <button type="button" class="tab" data-scope="openFiles">${s.openFiles}</button>
  <button type="button" class="tab" data-scope="files">${s.files}</button>
  <button type="button" class="tab" data-scope="recent">${s.recent}</button>
  <button type="button" class="tab" data-scope="here">${s.dir}</button>
  <button type="button" class="tab" data-scope="symbols">${s.symbols}</button>
  <button type="button" class="tab" data-scope="git">${s.git}</button>
  <button type="button" class="tab" data-scope="doc">${s.doc}</button>
  <button type="button" class="tab" data-scope="refs">${s.refs}</button>
  <!-- shown only while the Commands list is (entered with ">" or Spyglass: Find Commands) -->
  <button type="button" class="tab" data-scope="commands" hidden>${s.commands}</button>
</div>
</div>

<!-- Main layout -->
<div class="layout">

  <!-- Left: results -->
  <div class="left-panel" id="left-panel">
    <div class="results-wrap" id="results-wrap">
      <div class="state-msg" id="state-msg">Start typing to search...</div>
    </div>
  </div>

  <!-- Right: file preview -->
  <div class="right-panel" id="right-panel">
    <button type="button" class="preview-header-btn" id="preview-header" title="Reveal in Explorer">${s.noFileSelected}</button>
    <div class="preview-empty" id="preview-empty">Navigate results to preview</div>
    <div class="preview-content" id="preview-content"></div>
  </div>

</div>

<!-- Status bar -->
<div class="statusbar">
  <span id="result-info"></span>
  <span id="search-took"></span>
</div>

</div><!-- .finder -->

<!-- Shortcuts overlay (outside .finder to avoid overflow:hidden clipping) -->
<div class="shortcuts-overlay" id="shortcuts-overlay">${s.shortcutsContent}</div>

<!-- Context menu -->
<div class="ctx-menu" id="ctx-menu">
  <div class="ctx-item" id="ctx-open"><span>Open</span><span class="ctx-hint">Enter</span></div>
  <div class="ctx-item" id="ctx-open-split"><span>Open in split</span><span class="ctx-hint">Ctrl+Enter</span></div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" id="ctx-copy-abs"><span>Copy absolute path</span><span class="ctx-hint">Alt+Y</span></div>
  <div class="ctx-item" id="ctx-copy-rel"><span>Copy relative path</span></div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" id="ctx-reveal"><span>Reveal in Explorer</span></div>
  <div class="ctx-sep"></div>
  <div class="ctx-item" id="ctx-pin"><span>Pin file</span><span class="ctx-hint">Alt+P</span></div>
</div>

<script nonce="${nonce}">window.__spyglass = ${serializeConfig(config)};</script>
<script type="module" src="${jsUri}"></script>
</body>
</html>`;
}
