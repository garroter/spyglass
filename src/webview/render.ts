import { state } from './state';
import { escHtml, highlightMatch, highlightPositions } from './highlight';
import { wrap, stateMsg, resultInfo } from './dom';
import { isFileScope, isSymbolScope, isGitScope, triggerSearch } from './search';
import { requestPreview, recentDefault } from './preview';

import { vscode } from './vscode';

export function render(): void {
  if (isFileScope())        { renderFileResults(); }
  else if (isSymbolScope()) { renderSymbolResults(); }
  else                      { renderTextResults(); }
}

export function updateSelection(): void {
  wrap.querySelectorAll('.result').forEach((el, i) => {
    el.classList.toggle('selected', i === state.selected);
  });
  scrollToSelected();
}

function scrollToSelected(): void {
  wrap.querySelector('.result.selected')?.scrollIntoView({ block: 'nearest' });
}

function gitBadgeHtml(relativePath: string): string {
  const s = state.gitStatus[relativePath];
  if (!s) { return ''; }
  return '<span class="git-badge git-badge--' + s + '">' + s + '</span>';
}

export function renderTextResults(): void {
  wrap.querySelectorAll('.result, .file-group-header').forEach(el => el.remove());
  const MAX_RESULTS = (window as any).__spyglass.MAX_RESULTS;

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

  if (state.groupResults) {
    // ── Grouped by file ────────────────────────────────────────
    type Group = { relativePath: string; file: string; indices: number[] };
    const groups: Group[] = [];
    const seen = new Map<string, number>();
    state.results.forEach((r, i) => {
      let gi = seen.get(r.relativePath);
      if (gi === undefined) {
        gi = groups.length;
        seen.set(r.relativePath, gi);
        groups.push({ relativePath: r.relativePath, file: r.file, indices: [] });
      }
      groups[gi].indices.push(i);
    });

    for (const group of groups) {
      const lastSlash = group.relativePath.lastIndexOf('/');
      const basename  = group.relativePath.slice(lastSlash + 1);
      const dir       = group.relativePath.slice(0, lastSlash + 1);
      const cnt       = group.indices.length;

      const hdr = document.createElement('div');
      hdr.className = 'file-group-header';
      const pinned = state.pinnedFiles.some(f => f.file === group.file);
      hdr.innerHTML =
        (pinned ? '<span class="pin-icon">★</span>' : '') +
        '<span class="fgh-name">' + escHtml(basename) + '</span>' +
        (dir ? '<span class="fgh-dir">' + escHtml(dir) + '</span>' : '') +
        gitBadgeHtml(group.relativePath) +
        '<span class="fgh-count">' + cnt + '</span>';
      frag.appendChild(hdr);

      for (const i of group.indices) {
        const r = state.results[i];
        const isMultiSel = state.multiSelected.has(i);
        const div = document.createElement('div');
        div.className = 'result result--grouped' +
          (i === state.selected ? ' selected' : '') +
          (isMultiSel ? ' multi-sel' : '');
        div.dataset.index = String(i);
        div.innerHTML =
          '<span class="result-line">' + r.line + '</span>' +
          '<div class="result-text">' + highlightMatch(r.text, r.matchStart, r.matchEnd) + '</div>';
        div.addEventListener('click', (e) => {
          if (e.ctrlKey) { toggleSelectResult(i); } else { openResult(i); }
        });
        div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
        frag.appendChild(div);
      }
    }
  } else {
    // ── Flat list ──────────────────────────────────────────────
    state.results.forEach((r, i) => {
      const isMultiSel = state.multiSelected.has(i);
      const pinned = state.pinnedFiles.some(f => f.file === r.file);
      const div = document.createElement('div');
      div.className = 'result' + (i === state.selected ? ' selected' : '') + (isMultiSel ? ' multi-sel' : '');
      div.dataset.index = String(i);
      div.innerHTML =
        '<div class="result-header">' +
          (pinned ? '<span class="pin-icon">★</span>' : '') +
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
  }

  wrap.appendChild(frag);
  const n = state.results.length;
  const capped = !state.searching && n >= MAX_RESULTS;
  resultInfo.textContent = n + (state.searching ? '…' : capped ? '+' : '') + ' result' + (n !== 1 ? 's' : '');
  scrollToSelected();
  requestPreview();
}

export function renderFileResults(): void {
  wrap.querySelectorAll('.result').forEach(el => el.remove());
  const MAX_RESULTS = (window as any).__spyglass.MAX_RESULTS;

  if (state.searching) {
    stateMsg.innerHTML = '<span class="spinner"></span>Searching…';
    stateMsg.style.display = '';
    resultInfo.textContent = '…';
    return;
  }

  const GIT_LABEL: Record<string, string> = { M: 'modified', A: 'added', U: 'untracked', D: 'deleted', R: 'renamed' };

  if (state.fileResults.length === 0) {
    stateMsg.textContent = state.query
      ? 'No files found.'
      : state.scope === 'recent' ? 'No recent files yet.'
      : state.scope === 'git'   ? 'Working tree is clean — no changes.'
      : 'Start typing to search files...';
    stateMsg.style.display = '';
    resultInfo.textContent = isGitScope() ? '0 changes' : '0 files';
    return;
  }

  stateMsg.style.display = 'none';
  const frag = document.createDocumentFragment();
  const isRecent = state.scope === 'recent';
  let sectionHeaderShown = false;

  state.fileResults.forEach((r, i) => {
    // Section separator between pinned and recent
    if (isRecent && !r.isPinned && !sectionHeaderShown) {
      sectionHeaderShown = true;
      if (state.fileResults.some(x => x.isPinned)) {
        const sep = document.createElement('div');
        sep.className = 'pin-section-sep';
        sep.textContent = 'recent';
        frag.appendChild(sep);
      }
    }

    const lastSlash = r.relativePath.lastIndexOf('/');
    const basenameStart = lastSlash + 1;
    const basename = r.relativePath.slice(basenameStart);
    const dir      = r.relativePath.slice(0, basenameStart);
    const bnPos    = r.matchPositions.filter(p => p >= basenameStart).map(p => p - basenameStart);
    const dirPos   = r.matchPositions.filter(p => p < basenameStart);

    const div = document.createElement('div');
    div.className = 'result' + (i === state.selected ? ' selected' : '');
    div.dataset.index = String(i);

    if (isGitScope()) {
      const s = state.gitStatus[r.relativePath] ?? 'M';
      const label = GIT_LABEL[s] ?? s;
      div.innerHTML =
        '<div class="result-header">' +
          '<span class="git-status-pill git-badge--' + s + '">' + label + '</span>' +
          '<span class="result-file">' + highlightPositions(basename, bnPos) + '</span>' +
        '</div>' +
        (dir ? '<div class="result-text">' + highlightPositions(dir, dirPos) + '</div>' : '');
    } else {
      const pinIcon = r.isPinned ? '<span class="pin-icon">★</span>' : '';
      div.innerHTML =
        '<div class="result-header">' +
          pinIcon +
          '<span class="result-file">' + highlightPositions(basename, bnPos) + '</span>' +
          gitBadgeHtml(r.relativePath) +
        '</div>' +
        (dir ? '<div class="result-text">' + highlightPositions(dir, dirPos) + '</div>' : '');
    }

    div.addEventListener('click', () => openResult(i));
    div.addEventListener('mouseenter', () => { state.selected = i; updateSelection(); requestPreview(); });
    frag.appendChild(div);
  });

  wrap.appendChild(frag);
  const nf = state.fileResults.length;
  const cappedF = nf >= MAX_RESULTS;
  resultInfo.textContent = nf + (cappedF ? '+' : '') + (
    state.scope === 'recent' ? ' recent file' :
    state.scope === 'git'    ? ' change' :
    ' file'
  ) + (nf !== 1 ? 's' : '');
  scrollToSelected();
  requestPreview();
}

export function renderSymbolResults(): void {
  wrap.querySelectorAll('.result').forEach(el => el.remove());
  const MAX_RESULTS = (window as any).__spyglass.MAX_RESULTS;

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
  const KIND_CLASS: Record<string, string> = {
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

// ── Actions (kept here to avoid circular deps with events.ts) ──────────────

export function openResult(index: number): void {
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

export function openResultInSplit(index: number): void {
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

export function toggleSelectResult(i: number): void {
  if (state.multiSelected.has(i)) { state.multiSelected.delete(i); }
  else { state.multiSelected.add(i); }
  render();
}

export function selectAll(): void {
  const rd = recentDefault();
  const len = rd ? rd.length
            : isFileScope() ? state.fileResults.length
            : isSymbolScope() ? state.symbolResults.length
            : state.results.length;
  for (let i = 0; i < len; i++) { state.multiSelected.add(i); }
  showToast('Selected ' + len + ' result' + (len !== 1 ? 's' : ''));
  render();
}

export function openAllSelected(): void {
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

export function copyCurrentPath(): void {
  if (state.multiSelected.size > 0) {
    const paths: string[] = [];
    if (isFileScope()) {
      for (const i of state.multiSelected) {
        const r = state.fileResults[i];
        if (r) { paths.push(r.file); }
      }
    } else if (isSymbolScope()) {
      for (const i of state.multiSelected) {
        const r = state.symbolResults[i];
        if (r) { paths.push(r.file); }
      }
    } else {
      for (const i of state.multiSelected) {
        const r = state.results[i];
        if (r) { paths.push(r.file); }
      }
    }
    if (paths.length > 0) {
      vscode.postMessage({ type: 'copyPath', path: paths.join('\n') });
      showToast('Copied ' + paths.length + ' path' + (paths.length !== 1 ? 's' : ''));
    }
    return;
  }

  let file: string | null = null;
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
  if (file) {
    vscode.postMessage({ type: 'copyPath', path: file });
    showToast('Copied: ' + file.split('/').pop());
  }
}

export function currentFile(): { file: string; rel: string } | null {
  if (isFileScope()) {
    const r = state.fileResults[state.selected];
    return r ? { file: r.file, rel: r.relativePath } : null;
  }
  if (isSymbolScope()) {
    const r = state.symbolResults[state.selected];
    return r ? { file: r.file, rel: r.relativePath } : null;
  }
  const rd = recentDefault();
  const r = rd ? rd[state.selected] : state.results[state.selected];
  return r ? { file: r.file, rel: 'rel' in r ? (r as any).rel : r.relativePath } : null;
}

export function isPinnedFile(file: string): boolean {
  return state.pinnedFiles.some(f => f.file === file);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
  let el = document.getElementById('spyglass-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'spyglass-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('toast-hide');
  el.classList.add('toast-show');
  clearTimeout(toastTimer!);
  toastTimer = setTimeout(() => {
    el!.classList.remove('toast-show');
    el!.classList.add('toast-hide');
  }, 1800);
}

export function togglePin(): void {
  const cur = currentFile();
  if (!cur) { return; }
  const basename = cur.rel.split('/').pop() ?? cur.rel;
  if (isPinnedFile(cur.file)) {
    state.pinnedFiles = state.pinnedFiles.filter(f => f.file !== cur.file);
    showToast('Unpinned: ' + basename);
  } else {
    state.pinnedFiles = [...state.pinnedFiles, { file: cur.file, rel: cur.rel }];
    showToast('★ Pinned: ' + basename);
  }
  vscode.postMessage({ type: 'setPinnedFiles', files: state.pinnedFiles });
  if (state.scope === 'recent') { triggerSearch(render); } else { render(); }
}

export function refreshGitScope(renderFn: () => void): void {
  state.gitFiles = null;
  state.selected = 0;
  showToast('Refreshing…');
  triggerSearch(renderFn);
}

export function navigate(delta: number): void {
  const rd = recentDefault();
  const len = rd ? rd.length
            : isFileScope() ? state.fileResults.length
            : isSymbolScope() ? state.symbolResults.length
            : state.results.length;
  state.selected = Math.max(0, Math.min(state.selected + delta, len - 1));
  updateSelection();
  requestPreview();
}
