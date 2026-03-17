import { state } from './state';
import { escHtml, highlightLine, applyQueryHighlight } from './highlight';
import { previewHdr, previewEmpty, previewCont, rightPanel, leftPanel, previewBtn } from './dom';
import { isFileScope, isSymbolScope } from './search';

let previewTimer: ReturnType<typeof setTimeout> | null = null;

import { vscode } from './vscode';

export function renderBreadcrumbs(relativePath: string): void {
  const parts = relativePath.split('/');
  previewHdr.innerHTML = parts.map((part, i) => {
    const isLast = i === parts.length - 1;
    return '<span class="bc-' + (isLast ? 'file' : 'dir') + '">' + escHtml(part) + '</span>'
      + (isLast ? '' : '<span class="bc-sep"> / </span>');
  }).join('');
}

export function clearPreview(): void {
  previewHdr.innerHTML = '<span class="bc-dim">No file selected</span>';
  previewEmpty.style.display = '';
  previewCont.style.display = 'none';
  previewCont.innerHTML = '';
  state.currentPreviewFile = null;
}

export function renderPreview(
  lines: string[],
  currentLine: number,
  relativePath: string,
  ext: string,
  changedLines: number[],
  highlightQuery: string,
  useRegex: boolean,
  preHighlighted: boolean,
): void {
  renderBreadcrumbs(relativePath);
  state.currentPreviewFile = relativePath;
  previewEmpty.style.display = 'none';
  previewCont.style.display = 'block';

  let queryRe: RegExp | null = null;
  if (highlightQuery) {
    try {
      const pattern = useRegex
        ? highlightQuery
        : highlightQuery.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
      queryRe = new RegExp(pattern, 'gi');
    } catch { /* invalid regex — skip */ }
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
  previewCont.querySelector('.pline--cur')?.scrollIntoView({ block: 'center' });
}

export function requestPreview(): void {
  if (isFileScope())   { requestFilePreview(); }
  else if (isSymbolScope()) { requestSymbolPreview(); }
  else                 { requestTextPreview(); }
}

function requestTextPreview(): void {
  if (!state.showPreview) { return; }
  const rd = recentDefault();
  const r = rd ? rd[state.selected] : state.results[state.selected];
  if (!r) { return; }
  clearTimeout(previewTimer!);
  previewTimer = setTimeout(() => {
    vscode.postMessage({ type: 'preview', file: r.file, line: rd ? 1 : r.line });
  }, 80);
}

function requestFilePreview(): void {
  if (!state.showPreview) { return; }
  const r = state.fileResults[state.selected];
  if (!r) { return; }
  clearTimeout(previewTimer!);
  previewTimer = setTimeout(() => {
    vscode.postMessage({ type: 'preview', file: r.file, line: 1 });
  }, 80);
}

function requestSymbolPreview(): void {
  if (!state.showPreview) { return; }
  const r = state.symbolResults[state.selected];
  if (!r) { return; }
  clearTimeout(previewTimer!);
  previewTimer = setTimeout(() => {
    vscode.postMessage({ type: 'preview', file: r.file, line: r.line });
  }, 80);
}

export function togglePreview(): void {
  state.showPreview = !state.showPreview;
  previewBtn.classList.toggle('active', state.showPreview);
  rightPanel.classList.toggle('hidden', !state.showPreview);
  leftPanel.classList.toggle('full', !state.showPreview);
  if (state.showPreview) { requestPreview(); }
}

// Circular-dep helper — re-exported from actions
export function recentDefault() {
  return (!state.query && !state.searching && state.results.length === 0 && !isFileScope() && !isSymbolScope())
    ? state.recentFiles.slice(0, 12) : null;
}
