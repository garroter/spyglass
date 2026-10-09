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

import { searchWithRipgrep, listFilesWithRipgrep } from '../ripgrep';

function findRg(): string {
  const candidates = [path.join(__dirname, '..', '..', 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg'), 'rg'];
  return candidates.find(c => spawnSync(c, ['--version']).status === 0) ?? '';
}
const rg = findRg();

// Project: a normal file, a hidden one, one hidden by an .ignore rule, one in a folder the
// spyglass.exclude setting lists, and a fake .git directory that must never be searched.
describe.skipIf(!rg)('including ignored and hidden files (real ripgrep)', () => {
  let dir: string;
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };

  beforeAll(() => {
    testEnv.rgPath = rg;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spyglass-ignored-'));
    write('visible.txt', 'needle visible\n');
    write('.hidden.txt', 'needle hidden\n');
    write('.ignore', 'skipped.txt\n');
    write('skipped.txt', 'needle skipped by .ignore\n');
    write('vendor/lib.txt', 'needle in an excluded folder\n');
    write('.git/config', 'needle inside .git\n');
  });

  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const found = async (opts: Parameters<typeof searchWithRipgrep>[4]) => {
    const results = await searchWithRipgrep('needle', dir, false, undefined, { exclude: ['vendor'], ...opts }).promise;
    return results.map(r => r.relativePath).sort();
  };
  const listed = async (includeIgnored: boolean) =>
    (await listFilesWithRipgrep(dir, ['vendor'], includeIgnored)).map(f => path.relative(dir, f)).sort();

  it('by default searches only what ignore rules, hidden-file rules and the excludes let through', async () => {
    expect(await found({})).toEqual(['visible.txt']);
  });

  it('with includeIgnored also searches hidden, ignored and excluded files', async () => {
    expect(await found({ includeIgnored: true })).toEqual(['.hidden.txt', 'skipped.txt', 'vendor/lib.txt', 'visible.txt']);
  });

  it('never searches inside .git, even with includeIgnored', async () => {
    expect(await found({ includeIgnored: true })).not.toContain('.git/config');
  });

  it('lists only ordinary files by default', async () => {
    expect(await listed(false)).toEqual(['visible.txt']);
  });

  it('lists hidden, ignored and excluded files with includeIgnored, but not .git contents', async () => {
    expect(await listed(true)).toEqual(['.hidden.txt', '.ignore', 'skipped.txt', 'vendor/lib.txt', 'visible.txt']);
  });
});
