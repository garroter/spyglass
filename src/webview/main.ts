// Webview entry point

window.onerror = (msg, _src, line, _col, err) => {
  document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">'
    + 'JS Error: ' + msg + '\nLine: ' + line + '\n' + (err ? err.stack : '') + '</div>';
};

import { state } from './state';
import { queryEl, regexBtn, caseBtn, wordBtn, groupBtn, replaceBtn, previewBtn, resultInfo, tabs, sortBtn, includeBtn, includeRow, includeInput, secondaryToolbar } from './dom';
import { isFileScope, isSymbolScope, triggerSearch } from './search';
import { renderPreview, clearPreview } from './preview';
import { render, updateSelection } from './render';
import { initEvents, initMessages, updateReplaceRowVisibility, setScope } from './events';
import { initContextMenu } from './contextMenu';
import { initHighlighter, setHasVscodeTheme } from './shiki';

// Expose renderPreview for the message handler (avoids circular import in events.ts)
(window as any).__renderPreview = renderPreview;

const { KB, INITIAL_QUERY } = (window as any).__spyglass;

// Init UI state
regexBtn.dataset.tooltip   = 'Regex — ' + (KB.toggleRegex   || 'Shift+Alt+R');
document.getElementById('preview-btn')!.dataset.tooltip =
  'Toggle preview — ' + (KB.togglePreview || 'Shift+Alt+P');
resultInfo.textContent = '0 results';

// Apply button states from saved preferences
if (state.useRegex) regexBtn.classList.add('active');
if (state.caseSensitive) caseBtn.classList.add('active');
if (state.wholeWord) wordBtn.classList.add('active');
if (state.groupResults) groupBtn.classList.add('active');
if (state.replaceMode) replaceBtn.classList.add('active');
if (!state.showPreview) {
  previewBtn.classList.remove('active');
  document.getElementById('right-panel')!.classList.add('hidden');
  document.getElementById('left-panel')!.classList.add('full');
}
if (state.includeMode) {
  includeBtn.classList.add('active');
  includeRow.style.display = '';
}
if (state.sortBy !== 'default') {
  const SORT_LABELS: Record<string, string> = { default: 'Sort: default', filename: 'Sort: by filename', count: 'Sort: by match count' };
  const SORT_ICONS:  Record<string, string> = { default: '⇅', filename: '↓A', count: '↓#' };
  sortBtn.textContent = SORT_ICONS[state.sortBy];
  sortBtn.dataset.tooltip = SORT_LABELS[state.sortBy];
  sortBtn.classList.add('active');
}

updateReplaceRowVisibility();

// Apply initial scope
tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === state.scope));
if (isFileScope() || isSymbolScope()) {
  regexBtn.disabled = true;
  document.getElementById('case-btn')!.setAttribute('disabled', '');
  document.getElementById('word-btn')!.setAttribute('disabled', '');
  document.getElementById('replace-btn')!.setAttribute('disabled', '');
  queryEl.placeholder = state.scope === 'recent'  ? 'Filter recent files...'
                      : state.scope === 'symbols' ? 'Search symbols...'
                      : 'Search files by name...';
}

const { THEME } = (window as any).__spyglass;
setHasVscodeTheme(!!THEME);
initHighlighter(THEME ?? null); // warm up Shiki with current VSCode theme
clearPreview();
initContextMenu();
initEvents();
initMessages();

if (INITIAL_QUERY) {
  queryEl.value = INITIAL_QUERY;
  state.query = INITIAL_QUERY;
  queryEl.select();
  triggerSearch(render);
} else if (state.scope === 'recent') {
  triggerSearch(render);
}
queryEl.focus();
