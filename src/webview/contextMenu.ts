import { state } from './state';
import { ctxMenu, ctxOpen, ctxOpenSplit, ctxCopyAbs, ctxCopyRel, ctxReveal, ctxPin, wrap } from './dom';
import { isFileScope, isSymbolScope } from './search';
import { recentDefault } from './preview';
import { openResult, openResultInSplit, updateSelection, togglePin, isPinnedFile } from './render';

import { vscode } from './vscode';

interface CtxData { file: string; rel: string; line: number }
let ctxTarget: CtxData | null = null;

function getResultData(i: number): CtxData | null {
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

export function showCtxMenu(x: number, y: number, index: number): void {
  const data = getResultData(index);
  if (!data) { return; }
  ctxTarget = data;
  ctxPin.querySelector('span')!.textContent = isPinnedFile(data.file) ? 'Unpin file' : 'Pin file';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.add('visible');
  const rect = ctxMenu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  { ctxMenu.style.left = (x - rect.width)  + 'px'; }
  if (rect.bottom > window.innerHeight) { ctxMenu.style.top  = (y - rect.height) + 'px'; }
}

export function hideCtxMenu(): void {
  ctxMenu.classList.remove('visible');
  ctxTarget = null;
}

export function initContextMenu(): void {
  wrap.addEventListener('contextmenu', (e) => {
    const el = (e.target as Element).closest('.result') as HTMLElement | null;
    if (!el) { return; }
    e.preventDefault();
    const i = parseInt(el.dataset.index!);
    state.selected = i;
    updateSelection();
    showCtxMenu(e.clientX, e.clientY, i);
  });

  ctxOpen.addEventListener('click',      () => { if (ctxTarget) { openResult(state.selected); }        hideCtxMenu(); });
  ctxOpenSplit.addEventListener('click', () => { if (ctxTarget) { openResultInSplit(state.selected); } hideCtxMenu(); });
  ctxCopyAbs.addEventListener('click',   () => { if (ctxTarget) { vscode.postMessage({ type: 'copyPath', path: ctxTarget.file }); } hideCtxMenu(); });
  ctxCopyRel.addEventListener('click',   () => { if (ctxTarget) { vscode.postMessage({ type: 'copyPath', path: ctxTarget.rel });  } hideCtxMenu(); });
  ctxReveal.addEventListener('click',    () => { if (ctxTarget) { vscode.postMessage({ type: 'revealFile', file: ctxTarget.file }); } hideCtxMenu(); });
  ctxPin.addEventListener('click',       () => { togglePin(); hideCtxMenu(); });

  ctxMenu.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as Element).closest('#ctx-menu') && !(e.target as Element).closest('.result')) { hideCtxMenu(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideCtxMenu(); } }, true);
}
