import { describe, it, expect } from 'vitest';
import { fuzzyScore, parseQueryInput } from '../webviewUtils';

describe('fuzzyScore', () => {
  it('returns null when query characters are not all present', () => {
    expect(fuzzyScore('src/index.ts', 'xyz')).toBeNull();
  });

  it('returns a match for an exact substring', () => {
    const result = fuzzyScore('src/index.ts', 'index');
    expect(result).not.toBeNull();
    expect(result!.positions).toEqual([4, 5, 6, 7, 8]);
  });

  it('matches scattered characters in order', () => {
    const result = fuzzyScore('src/FinderPanel.ts', 'fp');
    expect(result).not.toBeNull();
    // 'F' is at 4, 'P' is at 10
    expect(result!.positions[0]).toBe(4);
  });

  it('scores higher when match starts at basename', () => {
    const inBasename = fuzzyScore('long/deep/path/foo.ts', 'foo');
    const inDir      = fuzzyScore('foo/deep/path/bar.ts', 'foo');
    expect(inBasename!.score).toBeGreaterThan(inDir!.score);
  });

  it('scores higher for consecutive characters', () => {
    const consecutive  = fuzzyScore('FinderPanel', 'Find');
    const scattered    = fuzzyScore('FxixnxdxPanel', 'Find');
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('penalizes more path segments', () => {
    const shallow = fuzzyScore('src/foo.ts', 'foo');
    const deep    = fuzzyScore('a/b/c/d/src/foo.ts', 'foo');
    expect(shallow!.score).toBeGreaterThan(deep!.score);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('FinderPanel.ts', 'finder')).not.toBeNull();
    expect(fuzzyScore('finderpanel.ts', 'FINDER')).not.toBeNull();
  });

  it('returns empty positions for empty query', () => {
    const result = fuzzyScore('anything', '');
    expect(result).not.toBeNull();
    expect(result!.positions).toEqual([]);
  });
});

describe('parseQueryInput', () => {
  it('returns query unchanged when no globs present', () => {
    expect(parseQueryInput('hello world')).toEqual({ query: 'hello world', globFilter: '' });
  });

  it('extracts a glob pattern starting with *', () => {
    expect(parseQueryInput('hello *.ts')).toEqual({ query: 'hello', globFilter: '*.ts' });
  });

  it('extracts a negation glob starting with !', () => {
    expect(parseQueryInput('test !*.test.ts')).toEqual({ query: 'test', globFilter: '!*.test.ts' });
  });

  it('extracts multiple globs', () => {
    const result = parseQueryInput('fn *.ts !*.test.ts');
    expect(result.query).toBe('fn');
    expect(result.globFilter).toBe('*.ts,!*.test.ts');
  });

  it('handles only a glob with no search term', () => {
    expect(parseQueryInput('*.ts')).toEqual({ query: '', globFilter: '*.ts' });
  });

  it('trims leading/trailing whitespace from query', () => {
    expect(parseQueryInput('  hello  ')).toEqual({ query: 'hello', globFilter: '' });
  });

  it('handles empty input', () => {
    expect(parseQueryInput('')).toEqual({ query: '', globFilter: '' });
  });
});
