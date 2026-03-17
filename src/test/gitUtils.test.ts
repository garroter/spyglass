import { describe, it, expect } from 'vitest';
import { parseGitStatus, parseGitDiff } from '../gitUtils';

describe('parseGitStatus', () => {
  const single = ['/workspace'];
  const multi  = ['/workspace/frontend', '/workspace/backend'];

  it('marks modified files as M', () => {
    const out = ' M src/index.ts\n';
    expect(parseGitStatus(out, single, '/workspace')).toEqual({ 'src/index.ts': 'M' });
  });

  it('marks untracked files as U', () => {
    const out = '?? new-file.ts\n';
    expect(parseGitStatus(out, single, '/workspace')).toEqual({ 'new-file.ts': 'U' });
  });

  it('marks staged new files as A', () => {
    const out = 'A  added.ts\n';
    expect(parseGitStatus(out, single, '/workspace')).toEqual({ 'added.ts': 'A' });
  });

  it('marks deleted files as D', () => {
    const out = ' D deleted.ts\n';
    expect(parseGitStatus(out, single, '/workspace')).toEqual({ 'deleted.ts': 'D' });
  });

  it('marks renamed files as R', () => {
    const out = 'R  old.ts -> new.ts\n';
    expect(parseGitStatus(out, single, '/workspace')).toEqual({ 'new.ts': 'R' });
  });

  it('ignores short/empty lines', () => {
    const out = '\n  \nABC\n';
    expect(parseGitStatus(out, single, '/workspace')).toEqual({});
  });

  it('prefixes with folder name in multi-root workspace', () => {
    const out = ' M src/app.ts\n';
    const result = parseGitStatus(out, multi, '/workspace/backend');
    expect(result).toEqual({ 'backend/src/app.ts': 'M' });
  });

  it('parses multiple entries', () => {
    const out = ' M src/a.ts\n?? src/b.ts\nA  src/c.ts\n';
    const result = parseGitStatus(out, single, '/workspace');
    expect(result).toEqual({
      'src/a.ts': 'M',
      'src/b.ts': 'U',
      'src/c.ts': 'A',
    });
  });
});

describe('parseGitDiff', () => {
  it('returns empty array for empty output', () => {
    expect(parseGitDiff('')).toEqual([]);
  });

  it('parses a single-line hunk (no count = 1 line)', () => {
    // @@ -10,3 +12 @@ — one line added at line 12
    expect(parseGitDiff('@@ -10,3 +12 @@')).toEqual([12]);
  });

  it('parses a multi-line hunk', () => {
    // @@ -5 +5,3 @@ — lines 5, 6, 7 changed
    expect(parseGitDiff('@@ -5 +5,3 @@')).toEqual([5, 6, 7]);
  });

  it('ignores hunks with count 0 (pure deletion)', () => {
    // @@ -5,2 +5,0 @@ — nothing added, only deleted
    expect(parseGitDiff('@@ -5,2 +5,0 @@')).toEqual([]);
  });

  it('deduplicates overlapping hunks', () => {
    const out = '@@ -1 +1,2 @@\n@@ -10 +1,3 @@';
    // lines 1,2 from first; lines 1,2,3 from second — deduped: [1,2,3]
    expect(parseGitDiff(out).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('parses multiple non-overlapping hunks', () => {
    const out = '@@ -1 +1,2 @@\n@@ -20 +20,3 @@';
    expect(parseGitDiff(out).sort((a, b) => a - b)).toEqual([1, 2, 20, 21, 22]);
  });

  it('ignores non-hunk lines', () => {
    const out = 'diff --git a/foo b/foo\n--- a/foo\n+++ b/foo\n@@ -1 +1 @@\n+changed';
    expect(parseGitDiff(out)).toEqual([1]);
  });
});
