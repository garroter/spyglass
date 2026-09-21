import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// The mocked `vscode` reads these lazily, so tests can point Spyglass at a real rg binary
// and change settings per test.
const testEnv = vi.hoisted(() => ({
  rgPath: '',
  settings: {} as Record<string, unknown>,
}));

vi.mock('vscode', () => ({
  env: { appRoot: '/mock/vscode' },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) => {
        if (key === 'ripgrepPath') { return testEnv.rgPath; }
        return key in testEnv.settings ? testEnv.settings[key] : fallback;
      },
    }),
  },
}));

import { normalizeSearchLimits, readSearchLimits, searchWithRipgrep } from '../ripgrep';

const DEFAULTS = { maxResults: 200, maxMatchesPerFile: 10, maxFileSize: '1M' };

describe('normalizeSearchLimits', () => {
  it('falls back to the historical defaults when nothing is configured', () => {
    expect(normalizeSearchLimits({})).toEqual(DEFAULTS);
  });

  it('keeps valid values', () => {
    expect(normalizeSearchLimits({ maxResults: 500, maxMatchesPerFile: 25, maxFileSize: '5M' }))
      .toEqual({ maxResults: 500, maxMatchesPerFile: 25, maxFileSize: '5M' });
  });

  it.each([
    [0, 200],
    [-5, 200],
    [NaN, 200],
    ['abc', 200],
    [null, 200],
    [undefined, 200],
    [1.9, 1],
    [1, 1],
    [5000, 5000],
    [5001, 5000],
    [1_000_000, 5000],
  ])('maxResults %j -> %j', (input, expected) => {
    expect(normalizeSearchLimits({ maxResults: input }).maxResults).toBe(expected);
  });

  it.each([
    [0, 10],
    [-1, 10],
    [NaN, 10],
    ['many', 10],
    [3.7, 3],
    [100000, 100000],
  ])('maxMatchesPerFile %j -> %j', (input, expected) => {
    expect(normalizeSearchLimits({ maxMatchesPerFile: input }).maxMatchesPerFile).toBe(expected);
  });

  it.each([
    ['500K', '500K'],
    ['2M', '2M'],
    ['1G', '1G'],
    ['1048576', '1048576'],
    [' 2m ', '2M'],
    ['3k', '3K'],
    ['0', '1M'],
    ['0M', '1M'],
    ['', '1M'],
    ['1.5M', '1M'],
    ['-1M', '1M'],
    ['10MB', '1M'],
    ['M', '1M'],
    [5, '1M'],
    [null, '1M'],
  ])('maxFileSize %j -> %j', (input, expected) => {
    expect(normalizeSearchLimits({ maxFileSize: input }).maxFileSize).toBe(expected);
  });
});

describe('readSearchLimits', () => {
  it('returns the defaults when no spyglass.* limits are set', () => {
    testEnv.settings = {};
    expect(readSearchLimits()).toEqual(DEFAULTS);
  });

  it('reads spyglass.maxResults, spyglass.maxMatchesPerFile and spyglass.maxFileSize', () => {
    testEnv.settings = { maxResults: 750, maxMatchesPerFile: 40, maxFileSize: '4M' };
    expect(readSearchLimits()).toEqual({ maxResults: 750, maxMatchesPerFile: 40, maxFileSize: '4M' });
  });

  it('sanitizes bad user values instead of passing them to ripgrep', () => {
    testEnv.settings = { maxResults: -1, maxMatchesPerFile: 'lots', maxFileSize: 'huge' };
    expect(readSearchLimits()).toEqual(DEFAULTS);
  });
});

// --- Behaviour against a real ripgrep -------------------------------------------------------

function findRg(): string {
  const candidates = [path.join(__dirname, '..', '..', 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg'), 'rg'];
  return candidates.find(c => spawnSync(c, ['--version']).status === 0) ?? '';
}

const rg = findRg();

describe.skipIf(!rg)('searchWithRipgrep limits (real ripgrep)', () => {
  let dir: string;

  beforeAll(() => {
    testEnv.rgPath = rg;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spyglass-limits-'));

    // wide/: 30 files x 10 matching lines = 300 matches (each file stays within the default per-file cap)
    fs.mkdirSync(path.join(dir, 'wide'));
    for (let f = 0; f < 30; f++) {
      const lines = Array.from({ length: 10 }, (_, l) => `needle ${f}-${l}`);
      fs.writeFileSync(path.join(dir, 'wide', `f${String(f).padStart(2, '0')}.txt`), lines.join('\n') + '\n');
    }

    // deep/: one file with 30 matching lines
    fs.mkdirSync(path.join(dir, 'deep'));
    fs.writeFileSync(
      path.join(dir, 'deep', 'many.txt'),
      Array.from({ length: 30 }, (_, l) => `needle line ${l}`).join('\n') + '\n',
    );

    // big/: a ~3 KB file that contains a match
    fs.mkdirSync(path.join(dir, 'big'));
    fs.writeFileSync(path.join(dir, 'big', 'large.txt'), 'bignail\n' + 'x'.repeat(3000) + '\n');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const search = (query: string, sub: string, opts: Parameters<typeof searchWithRipgrep>[4] = {}) =>
    searchWithRipgrep(query, path.join(dir, sub), false, undefined, { exclude: [], ...opts }).promise;

  it('still caps at 200 results when maxResults is not given', async () => {
    expect(await search('needle', 'wide')).toHaveLength(200);
  });

  it('returns more than 200 results when maxResults allows it', async () => {
    expect(await search('needle', 'wide', { maxResults: 250 })).toHaveLength(250);
  });

  it('returns every match when maxResults exceeds the number of matches', async () => {
    expect(await search('needle', 'wide', { maxResults: 5000 })).toHaveLength(300);
  });

  it('honours a maxResults smaller than 200', async () => {
    expect(await search('needle', 'wide', { maxResults: 50 })).toHaveLength(50);
  });

  it('returns at most 10 matches per file by default', async () => {
    expect(await search('needle', 'deep')).toHaveLength(10);
  });

  it('returns more matches per file when maxMatchesPerFile is raised', async () => {
    expect(await search('needle', 'deep', { maxMatchesPerFile: 25 })).toHaveLength(25);
  });

  it('finds a small file with the default maxFileSize', async () => {
    expect(await search('bignail', 'big')).toHaveLength(1);
  });

  it('skips files larger than maxFileSize', async () => {
    expect(await search('bignail', 'big', { maxFileSize: '1K' })).toHaveLength(0);
  });

  it('finds the same file again once maxFileSize is large enough', async () => {
    expect(await search('bignail', 'big', { maxFileSize: '10K' })).toHaveLength(1);
  });
});
