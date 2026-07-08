
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
