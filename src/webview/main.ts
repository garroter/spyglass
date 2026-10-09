// Webview entry point

window.onerror = (msg, _src, line, _col, err) => {
  document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">'
    + 'JS Error: ' + msg + '\nLine: ' + line + '\n' + (err ? err.stack : '') + '</div>';
};

import { state } from './state';
import { queryEl, regexBtn, caseBtn, wordBtn, groupBtn, replaceBtn, previewBtn, resultInfo, includeBtn, includeRow, ignoredBtn, multilineBtn } from './dom';
import { triggerSearch } from './search';
import { renderPreview, clearPreview } from './preview';
import { render, updateSelection } from './render';
import { initEvents, initMessages, updateReplaceRowVisibility, setScope, scopeLoadsWithoutQuery, applyScopeChrome, showSort, applyQueryInput } from './events';
import { initContextMenu } from './contextMenu';
import { initHighlighter, setHasVscodeTheme } from './shiki';

// Expose renderPreview for the message handler (avoids circular import in events.ts)
(window as any).__renderPreview = renderPreview;

const { KB, INITIAL_QUERY, RESUME } = (window as any).__spyglass;
const S = (window as any).__spyglass.STRINGS;

// Init UI state
regexBtn.dataset.tooltip   = `${S.regex} — ${KB.toggleRegex || 'Shift+Alt+R'}`;
document.getElementById('preview-btn')!.dataset.tooltip =
  `${S.togglePreview} — ${KB.togglePreview || 'Shift+Alt+P'}`;
resultInfo.textContent = '0 results';

// Apply button states from saved preferences
if (state.useRegex) { regexBtn.classList.add('active'); }
if (state.caseSensitive) { caseBtn.classList.add('active'); }
if (state.wholeWord) { wordBtn.classList.add('active'); }
if (state.groupResults) { groupBtn.classList.add('active'); }
if (state.replaceMode) { replaceBtn.classList.add('active'); }
if (!state.showPreview) {
  previewBtn.classList.remove('active');
  document.getElementById('right-panel')!.classList.add('hidden');
  document.getElementById('left-panel')!.classList.add('full');
}
if (state.includeIgnored) {
  ignoredBtn.classList.add('active');
  document.body.classList.add('include-ignored');
}
if (state.multiline) {
  multilineBtn.classList.add('active');
  document.body.classList.add('multiline');
  replaceBtn.disabled = true; // replace is not available in multiline mode
}
if (state.includeMode) {
  includeBtn.classList.add('active');
  includeRow.style.display = '';
}
showSort();

updateReplaceRowVisibility();

// Apply initial scope
applyScopeChrome();

const { THEME } = (window as any).__spyglass;
setHasVscodeTheme(!!THEME);
initHighlighter(THEME ?? null); // warm up Shiki with current VSCode theme
clearPreview();
initContextMenu();
initEvents();
initMessages();

if (RESUME) {
  // Resume Last Search: the query as it was typed (file:line, @, globs) and the selected result
  queryEl.value = RESUME.query;
  state.pendingSelect = RESUME.selected;
  applyQueryInput();
  if (!RESUME.query && scopeLoadsWithoutQuery(state.scope)) { triggerSearch(render); }
} else if (INITIAL_QUERY) {
  queryEl.value = INITIAL_QUERY;
  state.query = INITIAL_QUERY;
  queryEl.select();
  triggerSearch(render);
} else if (scopeLoadsWithoutQuery(state.scope)) {
  triggerSearch(render);
}
queryEl.focus();
