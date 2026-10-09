import { describe, it, expect } from 'vitest';
import { escHtml, applyQueryHighlight, highlightMatch, highlightPositions, firstLineMatch, trimIndent } from '../webview/highlight';

describe('escHtml', () => {
  it('escapes ampersand', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than and greater-than', () => {
    expect(escHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes greater-than', () => {
    expect(escHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes all three in one string', () => {
    expect(escHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });

  it('leaves plain text unchanged', () => {
    expect(escHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escHtml('')).toBe('');
  });

  it('handles multiple ampersands', () => {
    expect(escHtml('a && b')).toBe('a &amp;&amp; b');
  });
});

describe('highlightMatch', () => {
  it('wraps the matched range in <mark>', () => {
    expect(highlightMatch('hello world', 6, 11)).toBe('hello <mark>world</mark>');
  });

  it('escapes HTML in the surrounding text', () => {
    expect(highlightMatch('<b>hello</b>', 3, 8)).toBe('&lt;b&gt;<mark>hello</mark>&lt;/b&gt;');
  });

  it('escapes HTML inside the match', () => {
    expect(highlightMatch('a<b>c', 1, 4)).toBe('a<mark>&lt;b&gt;</mark>c');
  });

  it('handles match at start', () => {
    expect(highlightMatch('foobar', 0, 3)).toBe('<mark>foo</mark>bar');
  });

  it('handles match at end', () => {
    expect(highlightMatch('foobar', 3, 6)).toBe('foo<mark>bar</mark>');
  });

  it('handles full string match', () => {
    expect(highlightMatch('abc', 0, 3)).toBe('<mark>abc</mark>');
  });
});

describe('highlightPositions', () => {
  it('wraps individual characters at given positions', () => {
    expect(highlightPositions('abcde', [0, 2, 4])).toBe('<mark>a</mark>b<mark>c</mark>d<mark>e</mark>');
  });

  it('handles consecutive positions', () => {
    expect(highlightPositions('hello', [1, 2, 3])).toBe('h<mark>e</mark><mark>l</mark><mark>l</mark>o');
  });

  it('returns plain escaped html when no positions', () => {
    expect(highlightPositions('a<b', [])).toBe('a&lt;b');
  });

  it('escapes HTML characters at highlighted positions', () => {
    expect(highlightPositions('a<c', [1])).toBe('a<mark>&lt;</mark>c');
  });

  it('handles empty string', () => {
    expect(highlightPositions('', [])).toBe('');
  });
});

describe('applyQueryHighlight', () => {
  it('wraps a single match in <mark class="qm">', () => {
    const re = /world/gi;
    expect(applyQueryHighlight('hello world', 'hello world', re))
      .toBe('hello <mark class="qm">world</mark>');
  });

  it('wraps multiple matches', () => {
    const re = /a/gi;
    // 'banana' → b at pos 0, a at 1, n at 2, a at 3, n at 4, a at 5
    expect(applyQueryHighlight('banana', 'banana', re))
      .toBe('b<mark class="qm">a</mark>n<mark class="qm">a</mark>n<mark class="qm">a</mark>');
  });

  it('returns html unchanged when query has no match', () => {
    const re = /xyz/gi;
    const html = 'hello world';
    expect(applyQueryHighlight(html, 'hello world', re)).toBe(html);
  });

  it('skips zero-length matches to avoid infinite loop', () => {
    const re = /x*/gi;
    const result = applyQueryHighlight('abc', 'abc', re);
    // zero-length matches should be skipped — output unchanged
    expect(result).toBe('abc');
  });

  it('preserves HTML tags intact — does not split tag attributes with marks', () => {
    // html contains a span around "class", rawText is "class Person"
    const html = '<span style="color:red">class</span> Person';
    const rawText = 'class Person';
    const re = /class/gi;
    const result = applyQueryHighlight(html, rawText, re);
    // The span tag and its attributes must be preserved intact
    expect(result).toContain('<span style="color:red">');
    // The matched text must be wrapped in a mark somewhere
    expect(result).toContain('<mark class="qm">class</mark>');
    // No mark should split inside a tag attribute (e.g. style="<mark>...")
    expect(result).not.toMatch(/="[^"]*<mark/);
  });

  it('handles HTML entities correctly — counts entity as one character', () => {
    // rawText has "<" at position 2, html has "&lt;" there
    const html = 'a &amp; b';
    const rawText = 'a & b';
    const re = /&/gi;
    const result = applyQueryHighlight(html, rawText, re);
    // The "&" in rawText is at position 2; should wrap &amp; in html
    expect(result).toBe('a <mark class="qm">&amp;</mark> b');
  });

  it('match at start of string', () => {
    const re = /foo/gi;
    expect(applyQueryHighlight('foobar', 'foobar', re)).toBe('<mark class="qm">foo</mark>bar');
  });

  it('match at end of string', () => {
    const re = /bar/gi;
    expect(applyQueryHighlight('foobar', 'foobar', re)).toBe('foo<mark class="qm">bar</mark>');
  });

  it('resets lastIndex before searching (prevents stale state from global regex)', () => {
    const re = /test/gi;
    re.lastIndex = 999; // simulate stale state
    const result = applyQueryHighlight('test this', 'test this', re);
    expect(result).toBe('<mark class="qm">test</mark> this');
  });
});

describe('firstLineMatch (how a multiline match is shown in one result row)', () => {
  it('leaves a single-line match alone', () => {
    expect(firstLineMatch('foo needle bar', 4, 10)).toEqual({ text: 'foo needle bar', start: 4, end: 10, extraLines: 0 });
  });

  it('shows only the first line of a multiline match, counting the rest', () => {
    expect(firstLineMatch('const a = 1;\nconst b = 2;\nconst c = 3;', 6, 30)).toEqual({
      text: 'const a = 1;', start: 6, end: 12, extraLines: 2,
    });
  });

  it('cuts the highlight at the end of the first line', () => {
    const r = firstLineMatch('ab\ncd', 1, 5);
    expect(r).toEqual({ text: 'ab', start: 1, end: 2, extraLines: 1 });
  });

  it('drops the carriage return of a CRLF line', () => {
    expect(firstLineMatch('foo\r\nbar', 0, 8)).toEqual({ text: 'foo', start: 0, end: 3, extraLines: 1 });
  });

  it('never returns a highlight outside the line', () => {
    const r = firstLineMatch('ab\ncd', 9, 12);
    expect(r.start).toBeLessThanOrEqual(r.text.length);
    expect(r.end).toBeLessThanOrEqual(r.text.length);
  });
});


describe('trimIndent (result rows do not repeat the code indentation)', () => {
  it('drops leading whitespace and moves the match with it', () => {
    expect(trimIndent('    return needle;', 11, 17)).toEqual({ text: 'return needle;', start: 7, end: 13 });
  });

  it('drops tabs too', () => {
    expect(trimIndent('\t\tx = 1', 2, 3)).toEqual({ text: 'x = 1', start: 0, end: 1 });
  });

  it('leaves a line without indentation alone', () => {
    expect(trimIndent('needle', 0, 6)).toEqual({ text: 'needle', start: 0, end: 6 });
  });

  it('keeps whitespace that is part of the match', () => {
    expect(trimIndent('    x', 2, 5)).toEqual({ text: '  x', start: 0, end: 3 });
  });
});
