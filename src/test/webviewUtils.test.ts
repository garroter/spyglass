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

// ---------------------------------------------------------------------------------------------------
// fuzzyRank: the fast path behind the Files / Recent / Git lists. It must return exactly what the
// original "score everything, sort everything, take the first N" algorithm did.
// ---------------------------------------------------------------------------------------------------
import { fuzzyRank } from '../webviewUtils';

interface Entry { file: string; rel: string }

/** The algorithm fuzzyRank replaced, kept here as the oracle (it uses the untouched fuzzyScore). */
function referenceRank(list: Entry[], query: string, limit: number) {
  const scored: Array<{ item: Entry; positions: number[]; score: number }> = [];
  for (const item of list) {
    const m = fuzzyScore(item.rel, query);
    if (m) { scored.push({ item, positions: m.positions, score: m.score }); }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ item, positions }) => ({ item, positions }));
}

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a small alphabet on purpose: lots of matches, lots of equal scores
const ALPHABET = ['a', 'b', 'c', 'A', 'B', '/', '/', '.', '_', '-', '1', 'é', 'İ'];
function randomList(rand: () => number, size: number): Entry[] {
  return Array.from({ length: size }, (_, i) => {
    const len = 1 + Math.floor(rand() * 30);
    let rel = '';
    for (let k = 0; k < len; k++) { rel += ALPHABET[Math.floor(rand() * ALPHABET.length)]; }
    return { file: `/p/${i}`, rel };
  });
}
function randomQuery(rand: () => number, max = 5): string {
  const len = 1 + Math.floor(rand() * max);
  let q = '';
  for (let k = 0; k < len; k++) { q += ALPHABET[Math.floor(rand() * ALPHABET.length)]; }
  return q;
}
const view = (rows: Array<{ item: Entry; positions: number[] }>) => rows.map(r => ({ file: r.item.file, positions: r.positions }));

describe('fuzzyRank', () => {
  it('matches the original algorithm on random data, whatever the limit', () => {
    const rand = rng(12345);
    for (let trial = 0; trial < 300; trial++) {
      const list = randomList(rand, 1 + Math.floor(rand() * 400));
      const query = randomQuery(rand);
      const limit = [1, 3, 10, 50, 1000][Math.floor(rand() * 5)];
      expect(view(fuzzyRank(list, query, limit)), `trial ${trial}: ${JSON.stringify(query)} limit ${limit}`)
        .toEqual(view(referenceRank(list, query, limit)));
    }
  });

  it('matches the original algorithm while a query is typed and deleted on the same list', () => {
    const rand = rng(777);
    const list = randomList(rand, 3000);
    for (let session = 0; session < 40; session++) {
      const target = randomQuery(rand, 6);
      // type it letter by letter, then delete it letter by letter, then type another prefix
      const steps = [
        ...Array.from({ length: target.length }, (_, i) => target.slice(0, i + 1)),
        ...Array.from({ length: target.length - 1 }, (_, i) => target.slice(0, target.length - 1 - i)),
        target.slice(0, 1) + randomQuery(rand, 3),
      ];
      for (const q of steps) {
        expect(view(fuzzyRank(list, q, 200)), `session ${session}: ${JSON.stringify(q)}`).toEqual(view(referenceRank(list, q, 200)));
      }
    }
  });

  it('matches the original algorithm on mostly-ASCII paths, the common case', () => {
    const rand = rng(2024);
    const ascii = ['a', 'b', 'c', 'd', 'A', 'B', 'C', '/', '/', '.', '_', '-', '0', '1', 'x', 'X'];
    for (let trial = 0; trial < 200; trial++) {
      const size = 1 + Math.floor(rand() * 500);
      const list: Entry[] = Array.from({ length: size }, (_, i) => {
        let rel = '';
        const len = 1 + Math.floor(rand() * 40);
        for (let k = 0; k < len; k++) { rel += ascii[Math.floor(rand() * ascii.length)]; }
        return { file: `/p/${i}`, rel };
      });
      let query = '';
      const qlen = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < qlen; k++) { query += ascii[Math.floor(rand() * ascii.length)]; }
      const limit = [1, 5, 25, 1000][Math.floor(rand() * 4)];
      expect(view(fuzzyRank(list, query, limit)), `trial ${trial}: ${JSON.stringify(query)} limit ${limit}`)
        .toEqual(view(referenceRank(list, query, limit)));
    }
  });

  it.each([
    ['a non-ASCII letter after the query is already matched', ['abc/über.ts', 'abc/uber.ts'], 'abc'],
    ['a non-ASCII letter before the match', ['ü/abc.ts', 'u/abc.ts', 'ÜBER/abc.ts'], 'abc'],
    ['a non-ASCII letter inside the match', ['aébc.ts', 'abc.ts', 'aEbc.ts'], 'abc'],
    ['a non-ASCII query', ['src/über.ts', 'src/uber.ts', 'src/ÜBER.ts'], 'über'],
    ['the Kelvin sign, which lowercases to an ASCII k', ['\u212Aey.ts', 'key.ts', 'Key.ts'], 'key'],
    ['a dotted capital I, which lowercases to two code units', ['İstanbul/x.ts', 'istanbul/x.ts', 'a/İ/x.ts'], 'ix'],
    ['CJK paths', ['源码/搜索.ts', 'src/搜索.ts', '搜索'], '搜索'],
    ['upper-case ASCII in the query', ['src/README.md', 'src/readme.md'], 'README'],
  ])('matches the original algorithm with %s', (_name, rels, query) => {
    const list: Entry[] = (rels as string[]).map((rel, i) => ({ file: `/p/${i}`, rel }));
    expect(view(fuzzyRank(list, query as string, 10))).toEqual(view(referenceRank(list, query as string, 10)));
  });

  it('folds exactly the ASCII capitals: the characters next to A-Z and a-z behave as in the original', () => {
    // '@' and '[' sit just outside A-Z, '`' and '{' just outside a-z
    const chars = ['@', 'A', 'M', 'Z', '[', '`', 'a', 'm', 'z', '{'];
    const list: Entry[] = chars.map((ch, i) => ({ file: `/p/${i}`, rel: `x${ch}y.ts` }));
    for (const ch of chars) {
      for (const query of [`x${ch}y`, `x${ch.toLowerCase()}y`, `X${ch}Y`, ch, ch.toLowerCase()]) {
        expect(view(fuzzyRank(list, query, 20)), JSON.stringify(query)).toEqual(view(referenceRank(list, query, 20)));
      }
    }
  });

  it('keeps files with equal scores in their original order, even when the limit cuts through them', () => {
    const list: Entry[] = Array.from({ length: 50 }, (_, i) => ({ file: `/p/${i}`, rel: `dir/file${i}.ts` })).map(e => ({ ...e, rel: 'dir/same.ts' }));
    expect(fuzzyRank(list, 'same', 7).map(r => r.item.file)).toEqual(list.slice(0, 7).map(e => e.file));
  });

  it('returns nothing for a query nothing matches', () => {
    expect(fuzzyRank([{ file: '/a', rel: 'src/app.ts' }], 'zzz', 10)).toEqual([]);
  });

  it('returns nothing for a limit of zero', () => {
    expect(fuzzyRank([{ file: '/a', rel: 'src/app.ts' }], 'app', 0)).toEqual([]);
  });

  it('is case-insensitive in both directions', () => {
    const list: Entry[] = [{ file: '/a', rel: 'src/README.md' }, { file: '/b', rel: 'src/readme.txt' }];
    expect(fuzzyRank(list, 'readme', 10).map(r => r.item.file).sort()).toEqual(['/a', '/b']);
    expect(fuzzyRank(list, 'README', 10).map(r => r.item.file).sort()).toEqual(['/a', '/b']);
  });

  it('gives each call its own positions arrays', () => {
    const list: Entry[] = [{ file: '/a', rel: 'src/app.ts' }];
    const first = fuzzyRank(list, 'app', 5);
    first[0].positions.length = 0;
    expect(fuzzyRank(list, 'app', 5)[0].positions).toEqual(fuzzyScore('src/app.ts', 'app')!.positions);
  });

  it('notices when the same array has grown', () => {
    const list: Entry[] = [{ file: '/a', rel: 'src/app.ts' }];
    expect(fuzzyRank(list, 'ts', 10)).toHaveLength(1);
    list.push({ file: '/b', rel: 'src/util.ts' });
    expect(fuzzyRank(list, 'ts', 10)).toHaveLength(2);
  });

  it('gives a different list its own results, even for the same query', () => {
    const a: Entry[] = [{ file: '/a', rel: 'src/app.ts' }];
    const b: Entry[] = [{ file: '/b', rel: 'lib/util.ts' }];
    expect(fuzzyRank(a, 'ts', 10).map(r => r.item.file)).toEqual(['/a']);
    expect(fuzzyRank(b, 'ts', 10).map(r => r.item.file)).toEqual(['/b']);
  });

  it('prefers a match at the start of the file name, then closer and more consecutive letters', () => {
    const list: Entry[] = [
      { file: '/1', rel: 'a/b/c/xyzapp.ts' },
      { file: '/2', rel: 'app.ts' },
      { file: '/3', rel: 'src/application.ts' },
    ];
    expect(fuzzyRank(list, 'app', 10).map(r => r.item.file)).toEqual(['/2', '/3', '/1']);
  });
});
