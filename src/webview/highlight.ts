// Lightweight syntax highlighter (no external deps)

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
  'include','require','end','then','begin','module',
]);

// Languages where # starts a comment
const HASH_COMMENT_EXTS = new Set([
  'py','rb','sh','bash','zsh','fish','yaml','yml','toml','conf','ini',
  'r','pl','pm','tcl','coffee','cr',
]);

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightLine(text: string, ext: string): string {
  const useHash = HASH_COMMENT_EXTS.has(ext);
  const out: string[] = [];
  let i = 0;
  const n = text.length;

  function push(cls: string, value: string) {
    const v = escHtml(value);
    out.push(cls ? '<span class="' + cls + '">' + v + '</span>' : v);
  }

  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];

    if ((c === '/' && c2 === '/') || (useHash && c === '#')) {
      push('hl-cmt', text.slice(i));
      break;
    }

    if (c === '/' && c2 === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end !== -1) {
        push('hl-cmt', text.slice(i, end + 2)); i = end + 2;
      } else {
        push('hl-cmt', text.slice(i)); break;
      }
      continue;
    }

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

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 || ''))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObB._]/.test(text[j])) { j++; }
      push('hl-num', text.slice(i, j)); i = j;
      continue;
    }

    if (/[a-zA-Z_$]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_$]/.test(text[j])) { j++; }
      const word = text.slice(i, j);
      let k = j;
      while (k < n && text[k] === ' ') { k++; }
      if (KW.has(word))       { push('hl-kw', word); }
      else if (text[k] === '(') { push('hl-fn', word); }
      else                    { push('', word); }
      i = j;
      continue;
    }

    if ('+-*/%=!<>&|^~?:'.includes(c)) {
      push('hl-op', c); i++;
    } else {
      push('', c); i++;
    }
  }

  return out.join('');
}

export function applyQueryHighlight(html: string, rawText: string, queryRe: RegExp): string {
  queryRe.lastIndex = 0;
  const opens = new Set<number>();
  const closes = new Set<number>();
  let m: RegExpExecArray | null;
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

export function highlightMatch(text: string, start: number, end: number): string {
  return escHtml(text.slice(0, start))
    + '<mark>' + escHtml(text.slice(start, end)) + '</mark>'
    + escHtml(text.slice(end));
}

export function highlightPositions(text: string, positions: number[]): string {
  const posSet = new Set(positions);
  let html = '';
  for (let i = 0; i < text.length; i++) {
    const c = escHtml(text[i]);
    html += posSet.has(i) ? '<mark>' + c + '</mark>' : c;
  }
  return html;
}
