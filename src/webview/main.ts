// Webview entry point

window.onerror = (msg, _src, line, _col, err) => {
  document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">'
    + 'JS Error: ' + msg + '\nLine: ' + line + '\n' + (err ? err.stack : '') + '</div>';
};

import { state } from './state';
import { queryEl, regexBtn, resultInfo, tabs } from './dom';
import { isFileScope, isSymbolScope, triggerSearch } from './search';
import { renderPreview, clearPreview } from './preview';
import { render, updateSelection } from './render';
import { initEvents, initMessages, updateReplaceRowVisibility, setScope } from './events';
import { initContextMenu } from './contextMenu';

// Expose renderPreview for the message handler (avoids circular import in events.ts)
(window as any).__renderPreview = renderPreview;

const { KB, INITIAL_QUERY } = (window as any).__spyglass;

// Init UI state
regexBtn.dataset.tooltip   = 'Regex — ' + (KB.toggleRegex   || 'Shift+Alt+R');
document.getElementById('preview-btn')!.dataset.tooltip =
  'Toggle preview — ' + (KB.togglePreview || 'Shift+Alt+P');
resultInfo.textContent = '0 results';
regexBtn.classList.remove('active');
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
