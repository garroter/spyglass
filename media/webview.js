// @ts-nocheck
/* globals acquireVsCodeApi */

window.onerror = (msg, src, line, col, err) => {
  document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">'
    + 'JS Error: ' + msg + '\nLine: ' + line + '\n' + (err ? err.stack : '') + '</div>';
};

const vscode = acquireVsCodeApi();

// ── Config injected by extension ───────────────────────────────────────────
const { KB, INITIAL_QUERY, INITIAL_HISTORY, RECENT_FILES, MAX_RESULTS, DEFAULT_SCOPE } = window.__spyglass;

function matchKey(e, binding) {
  if (!binding) { return false; }
  const parts = binding.toLowerCase().split('+');
  const key   = parts[parts.length - 1];
  const ctrl  = parts.includes('ctrl');
  const shift = parts.includes('shift');
  const alt   = parts.includes('alt');
  return e.key.toLowerCase() === key
    && e.ctrlKey  === ctrl
    && e.shiftKey === shift
    && e.altKey   === alt;
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  results: [],
  fileResults: [],
  symbolResults: [],
  fileList: null,
  recentFiles: RECENT_FILES,
  gitStatus: {},
  selected: 0,
  scope: DEFAULT_SCOPE,
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  globFilter: '',
  replaceMode: false,
  query: '',
  searching: false,
  showPreview: true,
  multiSelected: new Set(),
  searchHistory: INITIAL_HISTORY.slice(),
  historyIndex: -1,
  historyPreQuery: '',
  currentPreviewFile: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const queryEl      = document.getElementById('query');
const regexBtn     = document.getElementById('regex-btn');
const caseBtn      = document.getElementById('case-btn');
const wordBtn      = document.getElementById('word-btn');
const replaceBtn   = document.getElementById('replace-btn');
const previewBtn   = document.getElementById('preview-btn');
const replaceRow   = document.getElementById('replace-row');
const replaceInput = document.getElementById('replace-input');
const replaceAllBtn= document.getElementById('replace-all-btn');
const wrap         = document.getElementById('results-wrap');
const stateMsg     = document.getElementById('state-msg');
const resultInfo   = document.getElementById('result-info');
const searchTook   = document.getElementById('search-took');
const leftPanel    = document.getElementById('left-panel');
const rightPanel   = document.getElementById('right-panel');
const previewHdr   = document.getElementById('preview-header');
const previewEmpty = document.getElementById('preview-empty');
const previewCont  = document.getElementById('preview-content');
const tabs         = document.querySelectorAll('.tab');

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function gitBadgeHtml(relativePath) {
  const s = state.gitStatus[relativePath];
  if (!s) { return ''; }
  return '<span class="git-badge git-badge--' + s + '">' + s + '</span>';
}

function highlightMatch(text, start, end) {
  return escHtml(text.slice(0, start))
    + '<mark>' + escHtml(text.slice(start, end)) + '</mark>'
    + escHtml(text.slice(end));
}

function highlightPositions(text, positions) {
  const posSet = new Set(positions);
  let html = '';
  for (let i = 0; i < text.length; i++) {
    const c = escHtml(text[i]);
    html += posSet.has(i) ? '<mark>' + c + '</mark>' : c;
  }
  return html;
}

// ── Syntax highlighter ─────────────────────────────────────────────────────
const KW = new Set([
  // JS / TS
  'const','let','var','function','class','interface','type','enum','import',
  'export','from','return','if','else','for','while','do','switch','case',
  'break','continue','new','typeof','instanceof','void','null','undefined',
  'true','false','async','await','extends','implements','static','public',
  'private','protected','readonly','abstract','declare','namespace','default',
  'throw','try','catch','finally','in','of','yield','get','set','this','super',
  // Python
  'def','elif','except','lambda','with','as','pass','del','assert','raise',
  'nonlocal','global','and','or','not','is','None','True','False',
  // Rust
  'fn','mut','struct','impl','trait','use','mod','pub','crate','self','Self',
  'match','loop','where','unsafe','extern','move','ref',
  // Go
  'func','chan','map','range','defer','go','select','make','len','cap',
  'append','copy','delete','close','panic','recover','package',
  // Generic
  'include','require','end','then','begin','module','include',
]);

// Languages where # starts a comment
const HASH_COMMENT_EXTS = new Set([
  'py','rb','sh','bash','zsh','fish','yaml','yml','toml','conf','ini',
  'r','pl','pm','tcl','coffee','cr',
]);

function highlightLine(text, ext) {
  const useHash = HASH_COMMENT_EXTS.has(ext);
  const out = [];
  let i = 0;
  const n = text.length;

  function push(cls, value) {
    const v = escHtml(value);
    out.push(cls ? '<span class="' + cls + '">' + v + '</span>' : v);
  }

  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];

    // Line comment: // or #
    if ((c === '/' && c2 === '/') || (useHash && c === '#')) {
      push('hl-cmt', text.slice(i));
      break;
    }

    // Block comment: /* ... */  (single-line portion)
    if (c === '/' && c2 === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end !== -1) {
        push('hl-cmt', text.slice(i, end + 2)); i = end + 2;
      } else {
        push('hl-cmt', text.slice(i)); break;
      }
      continue;
    }

    // String literals: double quote, single quote, or backtick (char code 96)
    if (c === '"' || c === "'" || c.charCodeAt(0) === 96) {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === c)    { j++; break; }
        j++;
      }
      push('hl-str', text.slice(i, j)); i = j;
      continue;
    }

    // Number
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 || ''))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObB._]/.test(text[j])) { j++; }
      push('hl-num', text.slice(i, j)); i = j;
      continue;
    }

    // Word: keyword or identifier (possibly function call)
    if (/[a-zA-Z_$]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_$]/.test(text[j])) { j++; }
      const word = text.slice(i, j);
      // Peek past whitespace for '('
      let k = j;
      while (k < n && text[k] === ' ') { k++; }
      if (KW.has(word))      { push('hl-kw', word); }
      else if (text[k] === '(') { push('hl-fn', word); }
      else                    { push('', word); }
      i = j;
      continue;
    }

    // Single char (operator / punctuation) — color operators
    if ('+-*/%=!<>&|^~?:'.includes(c)) {
      push('hl-op', c); i++;
    } else {
      push('', c); i++;
    }
  }

  return out.join('');
}

// ── Query highlight in preview ─────────────────────────────────────────────
// Inserts <mark class="qm"> at query match positions in syntax-highlighted HTML.
// Traverses HTML tracking visible-char position, skipping over tags and entities.
function applyQueryHighlight(html, rawText, queryRe) {
  queryRe.lastIndex = 0;
  const opens = new Set(), closes = new Set();
  let m;
  while ((m = queryRe.exec(rawText)) !== null) {
    if (m[0].length === 0) { queryRe.lastIndex++; continue; }
    opens.add(m.index);
    closes.add(m.index + m[0].length);
  }
  if (!opens.size) { return html; }

  let result = '', visPos = 0, i = 0;
  while (i < html.length) {
    if (closes.has(visPos)) { result += '</mark>'; }
    if (opens.has(visPos))  { result += '<mark class="qm">'; }
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      result += html.slice(i, end + 1); i = end + 1;
    } else if (html[i] === '&') {
      const end = html.indexOf(';', i);
      result += html.slice(i, end + 1); i = end + 1; visPos++;
    } else {
      result += html[i++]; visPos++;
    }
  }
  if (closes.has(visPos)) { result += '</mark>'; }
  return result;
}

// ── Preview ────────────────────────────────────────────────────────────────
let previewTimer = null;

function requestPreview() {
  if (isFileScope()) { requestFilePreview(); }
  else if (isSymbolScope()) { requestSymbolPreview(); }
  else { requestTextPreview(); }
}

function requestSymbolPreview() {
  if (!state.showPreview) { return; }
  const r = state.symbolResults[state.selected];
  if (!r) { return; }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    vscode.postMessage({ type: 'preview', file: r.file, line: r.line });
  }, 80);
}

function requestTextPreview() {
  if (!state.showPreview) { return; }
  const rd = recentDefault();
  const r = rd ? rd[state.selected] : state.results[state.selected];
  if (!r) { return; }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    vscode.postMessage({ type: 'preview', file: r.file, line: rd ? 1 : r.line });
  }, 80);
}

function requestFilePreview() {
  if (!state.showPreview) { return; }
  const r = state.fileResults[state.selected];
  if (!r) { return; }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    vscode.postMessage({ type: 'preview', file: r.file, line: 1 });
  }, 80);
}

function renderBreadcrumbs(relativePath) {
  const parts = relativePath.split('/');
  previewHdr.innerHTML = parts.map((part, i) => {
    const isLast = i === parts.length - 1;
    return '<span class="bc-' + (isLast ? 'file' : 'dir') + '">' + escHtml(part) + '</span>'
      + (isLast ? '' : '<span class="bc-sep"> / </span>');
  }).join('');
}

function renderPreview(lines, currentLine, relativePath, ext, changedLines, highlightQuery, useRegex, preHighlighted) {
  renderBreadcrumbs(relativePath);
  state.currentPreviewFile = relativePath;
  previewEmpty.style.display = 'none';
  previewCont.style.display = 'block';

  let queryRe = null;
  if (highlightQuery) {
    try {
      const pattern = useRegex
        ? highlightQuery
        : highlightQuery.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
      queryRe = new RegExp(pattern, 'gi');
    } catch { /* invalid regex — skip highlighting */ }
  }

  const changedSet = new Set(changedLines || []);
  const frag = document.createDocumentFragment();
  lines.forEach((line, i) => {
    const num = i + 1;
    const isCur = num === currentLine;
    const isChanged = changedSet.has(num);
    const div = document.createElement('div');
    div.className = 'pline'
      + (isCur     ? ' pline--cur'     : '')
      + (isChanged ? ' pline--changed' : '');
    // line is already HTML from hljs (preHighlighted) or raw text
    const rawText = preHighlighted ? line.replace(/<[^>]*>/g, '') : line;
    let lineHtml = preHighlighted ? line : highlightLine(line, ext);
    if (queryRe) { lineHtml = applyQueryHighlight(lineHtml, rawText, queryRe); }
    div.innerHTML =
      '<span class="pnum">' + num + '</span>' +
      '<span class="ptext">' + lineHtml + '</span>';
    frag.appendChild(div);
  });

  previewCont.innerHTML = '';
  previewCont.appendChild(frag);

  // Scroll match line into center
  const curEl = previewCont.querySelector('.pline--cur');
  curEl?.scrollIntoView({ block: 'center' });
}

function togglePreview() {
  state.showPreview = !state.showPreview;
  previewBtn.classList.toggle('active', state.showPreview);
  rightPanel.classList.toggle('hidden', !state.showPreview);
  leftPanel.classList.toggle('full', !state.showPreview);
  if (state.showPreview) { requestPreview(); }
}

// ── Results render ─────────────────────────────────────────────────────────
function render() {
  if (isFileScope()) { renderFileResults(); }
  else if (isSymbolScope()) { renderSymbolResults(); }
  else { renderTextResults(); }
}

function renderTextResults() {
  wrap.querySelectorAll('.result').forEach(el => el.remove());

  if (state.searching && state.results.length === 0) {
    stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
    stateMsg.style.display = '';
    resultInfo.textContent = '…';
    return;
  }

  if (!state.searching && state.results.length === 0) {
    if (state.query) {
      stateMsg.textContent = 'No results.';
      stateMsg.style.display = '';
      resultInfo.textContent = '0 results';
      return;
    }
    // No query — show recent files as default
    const recent = state.recentFiles.slice(0, 12);
    if (recent.length === 0) {
      stateMsg.textContent = 'Start typing to search...';
      stateMsg.style.display = '';
      resultInfo.textContent = '';
      return;
    }
    stateMsg.style.display = 'none';
    const frag = document.createDocumentFragment();
    recent.forEach((r, i) => {
      const lastSlash = r.rel.lastIndexOf('/');
      const basename = r.rel.slice(lastSlash + 1);
      const dir = r.rel.slice(0, lastSlash + 1);
      const div = document.createElement('div');
      div.className = 'result' + (i === state.selected ? ' selected' : '');
      div.dataset.index = String(i);
      div.innerHTML =
        '<div class="result-header">' +
          '<span class="result-file">' + escHtml(basename) + '</span>' +
          gitBadgeHtml(r.rel) +
        '</div>' +
        (dir ? '<div class="result-text">' + escHtml(dir) + '</div>' : '');
      div.addEventListener('click', () => vscode.postMessage({ type: 'open', file: r.file, line: 1 }));
      div.addEventListener('mouseenter', () => {
        state.selected = i; updateSelection();
        vscode.postMessage({ type: 'preview', file: r.file, line: 1 });
      });
      frag.appendChild(div);
    });
    wrap.appendChild(frag);
    resultInfo.textContent = 'recent';
    scrollToSelected();
    if (state.showPreview && recent[0]) {
      vscode.postMessage({ type: 'preview', file: recent[0].file, line: 1 });
    }
    return;
  }

  if (state.searching) {
    stateMsg.innerHTML = '<span class="spinner"></span>';
    stateMsg.style.display = '';
  } else {
    stateMsg.style.display = 'none';
  }

  const frag = document.createDocumentFragment();
  state.results.forEach((r, i) => {
    const isMultiSel = state.multiSelected.has(i);
    const div = document.createElement('div');
    div.className = 'result' + (i === state.selected ? ' selected' : '') + (isMultiSel ? ' multi-sel' : '');
    div.dataset.index = String(i);
    div.innerHTML =
      '<div class="result-header">' +
        '<span class="result-file">' + escHtml(r.relativePath) + '</span>' +
        gitBadgeHtml(r.relativePath) +
        '<span class="result-line">:' + r.line + '</span>' +
      '</div>' +
      '<div class="result-text">' + highlightMatch(r.text, r.matchStart, r.matchEnd) + '</div>';

    div.addEventListener('click', (e) => {
      if (e.ctrlKey) { toggleSelectResult(i); } else { openResult(i); }
    });
    div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
    frag.appendChild(div);
  });

  wrap.appendChild(frag);
  const n = state.results.length;
  const capped = !state.searching && n >= MAX_RESULTS;
  resultInfo.textContent = n + (state.searching ? '…' : capped ? '+' : '') + ' result' + (n !== 1 ? 's' : '');
  scrollToSelected();
  requestPreview();
}

function renderFileResults() {
  wrap.querySelectorAll('.result').forEach(el => el.remove());

  if (state.searching) {
    stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
    stateMsg.style.display = '';
    resultInfo.textContent = '…';
    return;
  }

  if (state.fileResults.length === 0) {
    stateMsg.textContent = state.query
      ? 'No files found.'
      : state.scope === 'recent' ? 'No recent files yet.' : 'Start typing to search files...';
    stateMsg.style.display = '';
    resultInfo.textContent = '0 files';
    return;
  }

  stateMsg.style.display = 'none';

  const frag = document.createDocumentFragment();
  state.fileResults.forEach((r, i) => {
    const lastSlash = r.relativePath.lastIndexOf('/');
    const basenameStart = lastSlash + 1;
    const basename = r.relativePath.slice(basenameStart);
    const dir      = r.relativePath.slice(0, basenameStart);
    const bnPos    = r.matchPositions.filter(p => p >= basenameStart).map(p => p - basenameStart);
    const dirPos   = r.matchPositions.filter(p => p < basenameStart);

    const div = document.createElement('div');
    div.className = 'result' + (i === state.selected ? ' selected' : '');
    div.dataset.index = String(i);
    div.innerHTML =
      '<div class="result-header">' +
        '<span class="result-file">' + highlightPositions(basename, bnPos) + '</span>' +
        gitBadgeHtml(r.relativePath) +
      '</div>' +
      (dir ? '<div class="result-text">' + highlightPositions(dir, dirPos) + '</div>' : '');

    div.addEventListener('click', () => openResult(i));
    div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
    frag.appendChild(div);
  });

  wrap.appendChild(frag);
  const nf = state.fileResults.length;
  const cappedF = nf >= MAX_RESULTS;
  resultInfo.textContent = nf + (cappedF ? '+' : '') + (state.scope === 'recent' ? ' recent file' : ' file') + (nf !== 1 ? 's' : '');
  scrollToSelected();
  requestPreview();
}

function renderSymbolResults() {
  wrap.querySelectorAll('.result').forEach(el => el.remove());

  if (state.searching) {
    stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
    stateMsg.style.display = '';
    resultInfo.textContent = '…';
    return;
  }

  if (state.symbolResults.length === 0) {
    stateMsg.textContent = state.query ? 'No symbols found.' : 'Start typing to search symbols...';
    stateMsg.style.display = '';
    resultInfo.textContent = '0 symbols';
    return;
  }

  stateMsg.style.display = 'none';

  const KIND_CLASS = {
    'function': 'fn', 'method': 'fn', 'constructor': 'fn',
    'class': 'cls', 'interface': 'cls', 'struct': 'cls',
    'variable': 'var', 'constant': 'var', 'field': 'var', 'property': 'var', 'key': 'var',
    'enum': 'enum', 'enum member': 'enum',
    'type param': 'kw', 'boolean': 'kw',
    'operator': 'op', 'event': 'op',
  };

  const frag = document.createDocumentFragment();
  state.symbolResults.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'result' + (i === state.selected ? ' selected' : '');
    div.dataset.index = String(i);
    const kindCls = KIND_CLASS[r.kindLabel] ? ' sym-kind--' + KIND_CLASS[r.kindLabel] : '';
    div.innerHTML =
      '<div class="result-header">' +
        '<span class="sym-kind' + kindCls + '">' + escHtml(r.kindLabel) + '</span>' +
        '<span class="sym-name">' + escHtml(r.name) + '</span>' +
      '</div>' +
      (r.container ? '<div class="sym-container">' + escHtml(r.container) + '</div>' : '') +
      '<div class="result-text">' + escHtml(r.relativePath) + ':' + r.line + '</div>';

    div.addEventListener('click', () => openResult(i));
    div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
    frag.appendChild(div);
  });

  wrap.appendChild(frag);
  const ns = state.symbolResults.length;
  const cappedS = ns >= MAX_RESULTS;
  resultInfo.textContent = ns + (cappedS ? '+' : '') + ' symbol' + (ns !== 1 ? 's' : '');
  scrollToSelected();
  requestPreview();
}

function updateSelection() {
  wrap.querySelectorAll('.result').forEach((el, i) => {
    el.classList.toggle('selected', i === state.selected);
  });
  scrollToSelected();
}

function scrollToSelected() {
  wrap.querySelector('.result.selected')?.scrollIntoView({ block: 'nearest' });
}

// ── Multi-select ───────────────────────────────────────────────────────────
function toggleSelectResult(i) {
  if (state.multiSelected.has(i)) { state.multiSelected.delete(i); }
  else { state.multiSelected.add(i); }
  render();
}

function selectAll() {
  const rd = recentDefault();
  const len = rd ? rd.length
            : isFileScope() ? state.fileResults.length
            : isSymbolScope() ? state.symbolResults.length
            : state.results.length;
  for (let i = 0; i < len; i++) { state.multiSelected.add(i); }
  render();
}

function openAllSelected() {
  if (state.multiSelected.size === 0) { openResult(state.selected); return; }
  if (isFileScope()) {
    for (const i of state.multiSelected) {
      const r = state.fileResults[i];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: 1 }); }
    }
  } else if (isSymbolScope()) {
    for (const i of state.multiSelected) {
      const r = state.symbolResults[i];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: r.line }); }
    }
  } else {
    const rd = recentDefault();
    for (const i of state.multiSelected) {
      const r = rd ? rd[i] : state.results[i];
      if (r) { vscode.postMessage({ type: 'open', file: r.file, line: rd ? 1 : r.line }); }
    }
  }
}

function copyCurrentPath() {
  let file = null;
  if (isFileScope()) {
    const r = state.fileResults[state.selected];
    if (r) { file = r.file; }
  } else if (isSymbolScope()) {
    const r = state.symbolResults[state.selected];
    if (r) { file = r.file; }
  } else {
    const rd = recentDefault();
    const r = rd ? rd[state.selected] : state.results[state.selected];
    if (r) { file = r.file; }
  }
  if (file) { vscode.postMessage({ type: 'copyPath', path: file }); }
}

// ── History ────────────────────────────────────────────────────────────────
function navigateHistory(dir) {
  if (state.searchHistory.length === 0) { return; }
  if (state.historyIndex === -1 && dir < 0) {
    state.historyPreQuery = queryEl.value;
  }
  state.historyIndex = Math.max(-1, Math.min(state.searchHistory.length - 1, state.historyIndex + dir));
  if (state.historyIndex >= 0) {
    queryEl.value = state.searchHistory[state.historyIndex];
  } else {
    queryEl.value = state.historyPreQuery;
  }
  state.query = queryEl.value;
}

// ── Replace ────────────────────────────────────────────────────────────────
function applyReplaceAll() {
  vscode.postMessage({
    type: 'replaceAll',
    query: state.query,
    replacement: replaceInput.value,
    useRegex: state.useRegex,
    caseSensitive: state.caseSensitive,
    wholeWord: state.wholeWord,
    globFilter: state.globFilter,
    scope: state.scope,
  });
}

// ── Actions ────────────────────────────────────────────────────────────────
function openResult(index) {
  if (isFileScope()) {
    const r = state.fileResults[index];
    if (r) { vscode.postMessage({ type: 'open', file: r.file, line: 1 }); }
  } else if (isSymbolScope()) {
    const r = state.symbolResults[index];
    if (r) { vscode.postMessage({ type: 'open', file: r.file, line: r.line }); }
  } else {
    const rd = recentDefault();
    const r = rd ? rd[index] : state.results[index];
    if (r) { vscode.postMessage({ type: 'open', file: r.file, line: rd ? 1 : r.line }); }
  }
}

function openResultInSplit(index) {
  if (isFileScope()) {
    const r = state.fileResults[index];
    if (r) { vscode.postMessage({ type: 'openInSplit', file: r.file, line: 1 }); }
  } else if (isSymbolScope()) {
    const r = state.symbolResults[index];
    if (r) { vscode.postMessage({ type: 'openInSplit', file: r.file, line: r.line }); }
  } else {
    const rd = recentDefault();
    const r = rd ? rd[index] : state.results[index];
    if (r) { vscode.postMessage({ type: 'openInSplit', file: r.file, line: rd ? 1 : r.line }); }
  }
}

// Returns recent files being shown as default (no query, no results) or null
function recentDefault() {
  return (!state.query && !state.searching && state.results.length === 0 && !isFileScope() && !isSymbolScope())
    ? state.recentFiles.slice(0, 12) : null;
}

function navigate(delta) {
  const rd = recentDefault();
  const len = rd ? rd.length
            : isFileScope() ? state.fileResults.length
            : isSymbolScope() ? state.symbolResults.length
            : state.results.length;
  state.selected = Math.max(0, Math.min(state.selected + delta, len - 1));
  updateSelection();
  requestPreview();
}

// ── Client-side fuzzy file search ──────────────────────────────────────────
function fuzzyScore(str, query) {
  const lStr = str.toLowerCase();
  const lQuery = query.toLowerCase();
  const positions = [];
  let si = 0, qi = 0;
  while (si < lStr.length && qi < lQuery.length) {
    if (lStr[si] === lQuery[qi]) { positions.push(si); qi++; }
    si++;
  }
  if (qi < lQuery.length) { return null; }
  let score = 0, consecutive = 1;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] === positions[i-1] + 1) { score += consecutive * 10; consecutive++; }
    else { consecutive = 1; }
  }
  const basenameStart = str.lastIndexOf('/') + 1;
  if (positions[0] >= basenameStart) { score += 50; }
  if (positions[0] === basenameStart) { score += 30; }
  score -= positions[positions.length - 1] - positions[0];
  let slashes = 0;
  for (let i = 0; i < str.length; i++) { if (str[i] === '/') { slashes++; } }
  score -= slashes * 2;
  return { score, positions };
}

function filterFilesLocally(fileList, query) {
  const maxResults = 200;
  let results;
  if (!query.trim()) {
    results = fileList.slice(0, maxResults).map(({ file, rel }) => ({ file, relativePath: rel, matchPositions: [] }));
  } else {
    const scored = [];
    for (const { file, rel } of fileList) {
      const match = fuzzyScore(rel, query);
      if (match) { scored.push({ file, relativePath: rel, matchPositions: match.positions, score: match.score }); }
    }
    scored.sort((a, b) => b.score - a.score);
    results = scored.slice(0, maxResults).map(({ file, relativePath, matchPositions }) => ({ file, relativePath, matchPositions }));
  }
  state.searching = false;
  state.fileResults = results;
  state.selected = 0;
  render();
}

// ── Search ─────────────────────────────────────────────────────────────────
function isFileScope() { return state.scope === 'files' || state.scope === 'recent'; }
function isSymbolScope() { return state.scope === 'symbols'; }
function isTextScope() { return !isFileScope() && !isSymbolScope(); }

let searchTimer = null;
function triggerSearch() {
  clearTimeout(searchTimer);
  if (state.scope === 'files') {
    if (state.fileList) {
      filterFilesLocally(state.fileList, state.query);
    } else {
      state.searching = true;
      render();
      searchTimer = setTimeout(() => vscode.postMessage({ type: 'fileSearch' }), 180);
    }
    return;
  }
  if (state.scope === 'recent') {
    filterFilesLocally(state.recentFiles, state.query);
    return;
  }
  searchTimer = setTimeout(() => {
    if (state.scope === 'symbols') {
      state.searching = true;
      render();
      vscode.postMessage({ type: 'symbolSearch', query: state.query });
    } else {
      vscode.postMessage({
        type: 'search',
        query: state.query,
        useRegex: state.useRegex,
        scope: state.scope,
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        globFilter: state.globFilter,
      });
    }
  }, 180);
}

// ── Scope ──────────────────────────────────────────────────────────────────
const SCOPES = ['project', 'openFiles', 'files', 'recent', 'here', 'symbols'];

function updateReplaceRowVisibility() {
  replaceRow.style.display = (isTextScope() && state.replaceMode) ? '' : 'none';
}

function clearPreview() {
  previewHdr.innerHTML = '<span class="bc-dim">No file selected</span>';
  previewEmpty.style.display = '';
  previewCont.style.display = 'none';
  previewCont.innerHTML = '';
  state.currentPreviewFile = null;
}

function setScope(scope) {
  state.scope = scope;
  state.selected = 0;
  state.multiSelected = new Set();
  state.historyIndex = -1;
  clearPreview();
  vscode.postMessage({ type: 'scopeChanged', scope });
  tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === scope));
  const isFile = isFileScope();
  const isSym = isSymbolScope();
  regexBtn.disabled = isFile || isSym;
  caseBtn.disabled = isFile || isSym;
  wordBtn.disabled = isFile || isSym;
  replaceBtn.disabled = isFile || isSym;
  updateReplaceRowVisibility();
  queryEl.placeholder = scope === 'files'    ? 'Search files by name...'
                      : scope === 'recent'   ? 'Filter recent files...'
                      : scope === 'symbols'  ? 'Search symbols...'
                      : scope === 'here'     ? 'query *.ts  — search in current dir...'
                      : 'query *.ts  — search in project...';
  if (state.query || scope === 'recent') {
    triggerSearch();
  } else {
    state.results = [];
    state.fileResults = [];
    state.symbolResults = [];
    state.searching = false;
    render();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
function parseQueryInput(raw) {
  const words = raw.split(/\s+/);
  const globs = [], terms = [];
  for (const w of words) {
    if (w && (w.startsWith('*') || w.startsWith('!'))) { globs.push(w); }
    else { terms.push(w); }
  }
  const query = terms.join(' ').trim();
  const globFilter = globs.join(',');
  return { query, globFilter };
}

queryEl.addEventListener('input', () => {
  const { query, globFilter } = parseQueryInput(queryEl.value);
  state.query = query;
  if (globFilter !== state.globFilter) {
    state.globFilter = globFilter;
  }
  state.selected = 0;
  state.historyIndex = -1;
  triggerSearch();
});

queryEl.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'ArrowUp') {
    e.preventDefault(); navigateHistory(-1);
  } else if (e.ctrlKey && e.key === 'ArrowDown') {
    e.preventDefault(); navigateHistory(1);
  } else if (e.altKey && e.key === 'y') {
    e.preventDefault(); copyCurrentPath();
  } else if (matchKey(e, KB.navigateDown)) {
    e.preventDefault(); navigate(1);
  } else if (matchKey(e, KB.navigateUp)) {
    e.preventDefault(); navigate(-1);
  } else if (e.shiftKey && e.key === 'Enter') {
    e.preventDefault(); openAllSelected();
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault(); openResultInSplit(state.selected);
  } else if (matchKey(e, KB.open)) {
    e.preventDefault(); openResult(state.selected);
  } else if (matchKey(e, KB.close)) {
    vscode.postMessage({ type: 'close' });
  } else if (e.key === 'Tab') {
    e.preventDefault();
    setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]);
  } else if (matchKey(e, KB.toggleRegex)) {
    e.preventDefault(); toggleRegex();
  } else if (matchKey(e, KB.togglePreview)) {
    e.preventDefault(); togglePreview();
  } else if (e.altKey && e.key === 'c') {
    e.preventDefault(); toggleCase();
  } else if (e.altKey && e.key === 'w') {
    e.preventDefault(); toggleWord();
  } else if (e.altKey && e.key === 'r') {
    e.preventDefault(); toggleReplaceMode();
  }
});

// Global keys (when input not focused)
document.addEventListener('keydown', (e) => {
  if (document.activeElement === queryEl) { return; }
  if (matchKey(e, KB.navigateDown))           { e.preventDefault(); navigate(1); }
  else if (matchKey(e, KB.navigateUp))        { e.preventDefault(); navigate(-1); }
  else if (e.altKey && e.key === 'y') { e.preventDefault(); copyCurrentPath(); }
  else if (e.ctrlKey && e.key === ' ')        { e.preventDefault(); toggleSelectResult(state.selected); }
  else if (e.shiftKey && e.key === 'Enter')   { e.preventDefault(); openAllSelected(); }
  else if (e.ctrlKey && e.key === 'a')        { e.preventDefault(); selectAll(); }
  else if (e.ctrlKey && e.key === 'Enter')    { e.preventDefault(); openResultInSplit(state.selected); }
  else if (matchKey(e, KB.open))              { e.preventDefault(); openResult(state.selected); }
  else if (matchKey(e, KB.togglePreview))     { e.preventDefault(); togglePreview(); }
  else if (matchKey(e, KB.close))             { vscode.postMessage({ type: 'close' }); }
  else if (e.key === 'Tab')                   { e.preventDefault(); setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]); }
});

tabs.forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope)));

function toggleRegex() {
  state.useRegex = !state.useRegex;
  regexBtn.classList.toggle('active', state.useRegex);
  if (state.query) { triggerSearch(); }
}

function toggleCase() {
  state.caseSensitive = !state.caseSensitive;
  caseBtn.classList.toggle('active', state.caseSensitive);
  if (state.query) { triggerSearch(); }
}

function toggleWord() {
  state.wholeWord = !state.wholeWord;
  wordBtn.classList.toggle('active', state.wholeWord);
  if (state.query) { triggerSearch(); }
}

function toggleReplaceMode() {
  state.replaceMode = !state.replaceMode;
  replaceBtn.classList.toggle('active', state.replaceMode);
  updateReplaceRowVisibility();
  if (state.replaceMode) { replaceInput.focus(); }
}

regexBtn.addEventListener('click', toggleRegex);
caseBtn.addEventListener('click', toggleCase);
wordBtn.addEventListener('click', toggleWord);
replaceBtn.addEventListener('click', toggleReplaceMode);
previewBtn.addEventListener('click', togglePreview);
replaceAllBtn.addEventListener('click', applyReplaceAll);

previewHdr.addEventListener('click', () => {
  if (state.currentPreviewFile) {
    let absFile = null;
    if (isFileScope()) {
      const r = state.fileResults[state.selected];
      if (r) { absFile = r.file; }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[state.selected];
      if (r) { absFile = r.file; }
    } else {
      const r = state.results[state.selected];
      if (r) { absFile = r.file; }
    }
    if (absFile) { vscode.postMessage({ type: 'revealFile', file: absFile }); }
  }
});

// ── Messages from extension ────────────────────────────────────────────────
window.addEventListener('message', ({ data }) => {
  switch (data.type) {
    case 'searching':
      state.searching = true;
      searchTook.textContent = '';
      render();
      break;
    case 'resultsChunk':
      state.results = data.results;
      state.selected = 0;
      render();
      break;
    case 'results':
      state.searching = false;
      state.results = data.results;
      state.selected = 0;
      if (data.took > 0) { searchTook.textContent = data.took + 'ms'; }
      render();
      break;
    case 'gitStatus':
      state.gitStatus = data.status;
      render();
      break;
    case 'fileList':
      state.fileList = data.files;
      if (state.scope === 'files') {
        filterFilesLocally(state.fileList, state.query);
      }
      break;
    case 'fileResults':
      state.searching = false;
      state.fileResults = data.results;
      state.selected = 0;
      render();
      break;
    case 'symbolResults':
      state.searching = false;
      state.symbolResults = data.results;
      state.selected = 0;
      render();
      break;
    case 'previewContent':
      renderPreview(data.lines, data.currentLine, data.relativePath, data.ext, data.changedLines,
        (isFileScope() || isSymbolScope()) ? '' : state.query, state.useRegex, data.preHighlighted);
      break;
    case 'error':
      state.searching = false;
      stateMsg.textContent = data.message;
      stateMsg.style.display = '';
      break;
    case 'focus':
      queryEl.focus();
      queryEl.select();
      break;
    case 'setQuery':
      queryEl.value = data.query;
      state.query = data.query;
      state.selected = 0;
      queryEl.focus();
      queryEl.select();
      triggerSearch();
      break;
    case 'replaceApplied':
      state.selected = 0;
      triggerSearch();
      break;
  }
});

// ── Context menu ───────────────────────────────────────────────────────────
const ctxMenu      = document.getElementById('ctx-menu');
const ctxOpen      = document.getElementById('ctx-open');
const ctxOpenSplit = document.getElementById('ctx-open-split');
const ctxCopyAbs   = document.getElementById('ctx-copy-abs');
const ctxCopyRel   = document.getElementById('ctx-copy-rel');
const ctxReveal    = document.getElementById('ctx-reveal');

let ctxTarget = null; // { file, rel, line }

function getResultData(i) {
  const rd = recentDefault();
  if (rd) {
    const r = rd[i];
    return r ? { file: r.file, rel: r.rel, line: 1 } : null;
  }
  if (isFileScope()) {
    const r = state.fileResults[i];
    return r ? { file: r.file, rel: r.relativePath, line: 1 } : null;
  }
  if (isSymbolScope()) {
    const r = state.symbolResults[i];
    return r ? { file: r.file, rel: r.relativePath, line: r.line } : null;
  }
  const r = state.results[i];
  return r ? { file: r.file, rel: r.relativePath, line: r.line } : null;
}

function showCtxMenu(x, y, index) {
  const data = getResultData(index);
  if (!data) { return; }
  ctxTarget = data;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.add('visible');
  // Adjust if menu goes off-screen
  const rect = ctxMenu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  { ctxMenu.style.left = (x - rect.width)  + 'px'; }
  if (rect.bottom > window.innerHeight) { ctxMenu.style.top  = (y - rect.height) + 'px'; }
}

function hideCtxMenu() {
  ctxMenu.classList.remove('visible');
  ctxTarget = null;
}

wrap.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.result');
  if (!el) { return; }
  e.preventDefault();
  const i = parseInt(el.dataset.index);
  state.selected = i;
  updateSelection();
  showCtxMenu(e.clientX, e.clientY, i);
});

ctxOpen.addEventListener('click',      () => { if (ctxTarget) { openResult(state.selected); }                                                      hideCtxMenu(); });
ctxOpenSplit.addEventListener('click', () => { if (ctxTarget) { openResultInSplit(state.selected); }                                               hideCtxMenu(); });
ctxCopyAbs.addEventListener('click',   () => { if (ctxTarget) { vscode.postMessage({ type: 'copyPath', path: ctxTarget.file }); }                  hideCtxMenu(); });
ctxCopyRel.addEventListener('click',   () => { if (ctxTarget) { vscode.postMessage({ type: 'copyPath', path: ctxTarget.rel }); }                   hideCtxMenu(); });
ctxReveal.addEventListener('click',    () => { if (ctxTarget) { vscode.postMessage({ type: 'revealFile', file: ctxTarget.file }); }                hideCtxMenu(); });

ctxMenu.addEventListener('click', e => e.stopPropagation());

document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#ctx-menu') && !e.target.closest('.result')) { hideCtxMenu(); } });
document.addEventListener('keydown',     (e) => { if (e.key === 'Escape') { hideCtxMenu(); } }, true);

// ── Shortcuts overlay ──────────────────────────────────────────────────────
const helpBtn      = document.getElementById('help-btn');
const shortcutsOverlay = document.getElementById('shortcuts-overlay');

helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  shortcutsOverlay.classList.toggle('visible');
  helpBtn.classList.toggle('active', shortcutsOverlay.classList.contains('visible'));
});

document.addEventListener('click', () => {
  shortcutsOverlay.classList.remove('visible');
  helpBtn.classList.remove('active');
  hideCtxMenu();
});

shortcutsOverlay.addEventListener('click', e => e.stopPropagation());

// ── Init ───────────────────────────────────────────────────────────────────
regexBtn.dataset.tooltip   = 'Regex — ' + (KB.toggleRegex || 'Shift+Alt+R');
previewBtn.dataset.tooltip = 'Toggle preview — ' + (KB.togglePreview || 'Shift+Alt+P');
resultInfo.textContent = '0 results';
state.useRegex = false;
regexBtn.classList.remove('active');
updateReplaceRowVisibility();

// Apply initial scope (sets active tab, disables irrelevant buttons, etc.)
tabs.forEach(t => t.classList.toggle('active', t.dataset.scope === state.scope));
if (isFileScope() || isSymbolScope()) {
  regexBtn.disabled = true;
  caseBtn.disabled = true;
  wordBtn.disabled = true;
  replaceBtn.disabled = true;
  queryEl.placeholder = state.scope === 'recent'  ? 'Filter recent files...'
                      : state.scope === 'symbols' ? 'Search symbols...'
                      : 'Search files by name...';
}

if (INITIAL_QUERY) {
  queryEl.value = INITIAL_QUERY;
  state.query = INITIAL_QUERY;
  queryEl.select();
  triggerSearch();
} else if (state.scope === 'recent') {
  triggerSearch(); // show all recent files immediately
}
queryEl.focus();
