import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { cwdForFile, makeRelative } from '../workspaceUtils';

const SEP = path.sep;

describe('cwdForFile', () => {
  it('returns the matching root for a file inside it', () => {
    const cwdList = ['/workspace/frontend', '/workspace/backend'];
    expect(cwdForFile('/workspace/backend/src/main.ts', cwdList, '/workspace/frontend'))
      .toBe('/workspace/backend');
  });

  it('returns the fallback when no root matches', () => {
    const cwdList = ['/workspace/frontend'];
    expect(cwdForFile('/other/place/file.ts', cwdList, '/workspace/frontend'))
      .toBe('/workspace/frontend');
  });

  it('returns the single root for a file inside it', () => {
    const cwdList = ['/workspace'];
    expect(cwdForFile('/workspace/src/index.ts', cwdList, '/workspace'))
      .toBe('/workspace');
  });

  it('does not match a root that is a prefix but not a parent', () => {
    // /workspace/foo should NOT match /workspace/foobar/file.ts
    const cwdList = ['/workspace/foo', '/workspace/foobar'];
    expect(cwdForFile('/workspace/foobar/file.ts', cwdList, '/workspace/foo'))
      .toBe('/workspace/foobar');
  });
});

describe('makeRelative', () => {
  it('returns relative path in a single-root workspace', () => {
    const cwdList = ['/workspace'];
    expect(makeRelative('/workspace/src/index.ts', cwdList, '/workspace'))
      .toBe('src/index.ts');
  });

  it('prefixes with folder name in a multi-root workspace', () => {
    const cwdList = ['/workspace/frontend', '/workspace/backend'];
    expect(makeRelative('/workspace/backend/src/main.ts', cwdList, '/workspace/frontend'))
      .toBe('backend/src/main.ts');
  });

  it('uses forward slashes even on Windows-style paths', () => {
    // path.relative on Windows would use backslashes, makeRelative normalizes them
    const cwdList = ['/workspace'];
    const result = makeRelative('/workspace/src/components/Button.tsx', cwdList, '/workspace');
    expect(result).not.toContain('\\');
  });

  it('returns basename/rel for multi-root with correct prefix', () => {
    const cwdList = ['/projects/api', '/projects/web'];
    expect(makeRelative('/projects/api/routes/users.ts', cwdList, '/projects/web'))
      .toBe('api/routes/users.ts');
  });
});
