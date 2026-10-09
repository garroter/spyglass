import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const testEnv = vi.hoisted(() => ({ rgPath: '' }));

vi.mock('vscode', () => ({
  env: { appRoot: '/mock/vscode' },
  workspace: {
    getConfiguration: () => ({ get: (key: string, fallback?: unknown) => (key === 'ripgrepPath' ? testEnv.rgPath : fallback) }),
  },
}));

import { toSearchResult, searchWithRipgrep } from '../ripgrep';

const CWD = '/proj';
// `lines.text` and the submatch offsets are what `rg --json` reports; offsets count UTF-8 BYTES.
const match = (text: string, start: number, end: number, line = 1) => ({
  path: { text: 'src/a.ts' },
  lines: { text },
  line_number: line,
  submatches: [{ start, end }],
});

describe('toSearchResult', () => {
  it('turns a single-line match into a result', () => {
    expect(toSearchResult(match('foo needle\n', 4, 10, 7), CWD)).toEqual({
      file: path.join(CWD, 'src/a.ts'),
      relativePath: 'src/a.ts',
      line: 7,
      text: 'foo needle',
      matchStart: 4,
      matchEnd: 10,
    });
  });

  it('has no lineCount for a single-line match', () => {
    expect(toSearchResult(match('foo needle\n', 4, 10), CWD)).not.toHaveProperty('lineCount');
  });

  it('returns nothing when there is no submatch', () => {
    expect(toSearchResult({ ...match('x\n', 0, 1), submatches: [] }, CWD)).toBeUndefined();
  });

  it('keeps an absolute path as it is', () => {
    const r = toSearchResult({ ...match('x needle\n', 2, 8), path: { text: '/elsewhere/b.ts' } }, CWD)!;
    expect(r.file).toBe('/elsewhere/b.ts');
  });

  it('converts UTF-8 byte offsets to character offsets (Polish text)', () => {
    // "zażółć " is 7 characters but 11 bytes; "gęślą" is 5 characters, 9 bytes
    const text = 'zażółć gęślą jaźń';
    const start = Buffer.byteLength('zażółć ');
    const end = start + Buffer.byteLength('gęślą');
    const r = toSearchResult(match(text + '\n', start, end), CWD)!;
    expect(text.slice(r.matchStart, r.matchEnd)).toBe('gęślą');
  });

  it('converts offsets in text with characters outside the BMP (emoji)', () => {
    const text = '😀 needle';
    const start = Buffer.byteLength('😀 ');
    const r = toSearchResult(match(text + '\n', start, start + 6), CWD)!;
    expect(text.slice(r.matchStart, r.matchEnd)).toBe('needle');
  });

  it('converts offsets in CJK text', () => {
    const text = '搜索 needle 结果';
    const start = Buffer.byteLength('搜索 ');
    const r = toSearchResult(match(text + '\n', start, start + 6), CWD)!;
    expect(text.slice(r.matchStart, r.matchEnd)).toBe('needle');
  });

  it('keeps every line of a multiline match and counts them', () => {
    const r = toSearchResult(match('const a = 1;\nconst b = 2;\nconst c = 3;\n', 6, 33, 4), CWD)!;
    expect(r.text).toBe('const a = 1;\nconst b = 2;\nconst c = 3;');
    expect(r.line).toBe(4);
    expect(r.lineCount).toBe(3);
  });

  it('does not let the match run past the trimmed text when it ends with the newline', () => {
    const r = toSearchResult(match('foo\nbar\n', 0, 8), CWD)!;
    expect(r.matchEnd).toBeLessThanOrEqual(r.text.length);
  });

  it('counts a CRLF file\'s lines the same way', () => {
    const r = toSearchResult(match('foo\r\nbar\r\n', 0, 5), CWD)!;
    expect(r.lineCount).toBe(2);
  });
});

function findRg(): string {
  const candidates = [path.join(__dirname, '..', '..', 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg'), 'rg'];
  return candidates.find(c => spawnSync(c, ['--version']).status === 0) ?? '';
}
const rg = findRg();

describe.skipIf(!rg)('searching with real ripgrep', () => {
  let dir: string;
  beforeAll(() => {
    testEnv.rgPath = rg;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spyglass-results-'));
    fs.writeFileSync(path.join(dir, 'blocks.txt'), 'start\nmiddle\nend\nother\n');
    fs.writeFileSync(path.join(dir, 'pl.txt'), 'zażółć gęślą jaźń\n');
  });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const run = (query: string, useRegex: boolean, opts: Parameters<typeof searchWithRipgrep>[4] = {}) =>
    searchWithRipgrep(query, dir, useRegex, undefined, { exclude: [], ...opts }).promise;

  it('finds a match that spans lines when multiline is on', async () => {
    const results = await run('start\\nmiddle', true, { multiline: true });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ relativePath: 'blocks.txt', line: 1, lineCount: 2 });
    expect(results[0].text).toBe('start\nmiddle');
  });

  it('finds nothing for the same pattern without multiline', async () => {
    expect(await run('start\\nmiddle', true)).toEqual([]);
  });

  it('uses regular-expression matching in multiline mode even with the regex toggle off', async () => {
    const results = await run('start.middle|mid\\w+\\nend', false, { multiline: true });
    expect(results.map(r => r.line)).toEqual([2]);
  });

  it('lets a dot-all pattern span several lines', async () => {
    const results = await run('(?s)start.*?end', true, { multiline: true });
    expect(results[0].lineCount).toBe(3);
  });

  it('reports offsets that point at the right characters in non-ASCII text', async () => {
    const [r] = await run('gęślą', false);
    expect(r.text.slice(r.matchStart, r.matchEnd)).toBe('gęślą');
  });
});
