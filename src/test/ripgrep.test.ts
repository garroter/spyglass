import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { appRoot: '/mock/vscode' },
}));

import { buildRgArgs } from '../ripgrep';

// Helpers
const argPairs = (args: string[], flag: string): string[] => {
  const values: string[] = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) { values.push(args[i + 1]); }
  }
  return values;
};

describe('buildRgArgs — fixed flags', () => {
  it('always includes --json', () => {
    expect(buildRgArgs('q', false)).toContain('--json');
  });

  it('always includes --max-count 10', () => {
    const args = buildRgArgs('q', false);
    const idx = args.indexOf('--max-count');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('10');
  });

  it('always includes --max-filesize 1M', () => {
    const args = buildRgArgs('q', false);
    const idx = args.indexOf('--max-filesize');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('1M');
  });

  it('places query after -- separator', () => {
    const args = buildRgArgs('my query', false);
    const sep = args.indexOf('--');
    expect(sep).toBeGreaterThan(-1);
    expect(args[sep + 1]).toBe('my query');
  });
});

describe('buildRgArgs — regex / fixed-strings', () => {
  it('adds --fixed-strings when useRegex=false', () => {
    expect(buildRgArgs('foo', false)).toContain('--fixed-strings');
  });

  it('omits --fixed-strings when useRegex=true', () => {
    expect(buildRgArgs('foo', true)).not.toContain('--fixed-strings');
  });
});

describe('buildRgArgs — case sensitivity', () => {
  it('defaults to --smart-case', () => {
    expect(buildRgArgs('foo', false)).toContain('--smart-case');
    expect(buildRgArgs('foo', false)).not.toContain('--case-sensitive');
  });

  it('uses --case-sensitive when caseSensitive=true', () => {
    const args = buildRgArgs('foo', false, { caseSensitive: true });
    expect(args).toContain('--case-sensitive');
    expect(args).not.toContain('--smart-case');
  });

  it('still uses --smart-case when caseSensitive=false explicitly', () => {
    const args = buildRgArgs('foo', false, { caseSensitive: false });
    expect(args).toContain('--smart-case');
  });
});

describe('buildRgArgs — whole word', () => {
  it('adds --word-regexp when wholeWord=true', () => {
    expect(buildRgArgs('foo', false, { wholeWord: true })).toContain('--word-regexp');
  });

  it('omits --word-regexp by default', () => {
    expect(buildRgArgs('foo', false)).not.toContain('--word-regexp');
  });
});

describe('buildRgArgs — excludes', () => {
  it('uses default excludes when none supplied', () => {
    const globs = argPairs(buildRgArgs('q', false), '--glob');
    expect(globs).toContain('!.git');
    expect(globs).toContain('!node_modules');
    expect(globs).toContain('!out');
    expect(globs).toContain('!dist');
    expect(globs).toContain('!*.lock');
  });

  it('prefixes exclude patterns with ! if missing', () => {
    const globs = argPairs(buildRgArgs('q', false, { exclude: ['vendor'] }), '--glob');
    expect(globs).toContain('!vendor');
  });

  it('does not double-prefix already-negated patterns', () => {
    const globs = argPairs(buildRgArgs('q', false, { exclude: ['!vendor'] }), '--glob');
    expect(globs).toContain('!vendor');
    expect(globs).not.toContain('!!vendor');
  });

  it('replaces defaults with custom excludes', () => {
    const globs = argPairs(buildRgArgs('q', false, { exclude: ['build'] }), '--glob');
    expect(globs).not.toContain('!node_modules');
    expect(globs).toContain('!build');
  });

  it('supports empty excludes list', () => {
    const globs = argPairs(buildRgArgs('q', false, { exclude: [] }), '--glob');
    // no exclude globs, only possibly a globFilter glob
    expect(globs.every(g => g.startsWith('!'))).toBe(true);
    expect(globs.length).toBe(0);
  });
});

describe('buildRgArgs — glob filter', () => {
  it('adds a single glob filter', () => {
    const globs = argPairs(buildRgArgs('q', false, { globFilter: '*.ts' }), '--glob');
    expect(globs).toContain('*.ts');
  });

  it('adds multiple comma-separated glob filters', () => {
    const globs = argPairs(buildRgArgs('q', false, { globFilter: '*.ts,!*.test.ts' }), '--glob');
    expect(globs).toContain('*.ts');
    expect(globs).toContain('!*.test.ts');
  });

  it('trims whitespace around individual globs', () => {
    const globs = argPairs(buildRgArgs('q', false, { globFilter: ' *.ts , !*.d.ts ' }), '--glob');
    expect(globs).toContain('*.ts');
    expect(globs).toContain('!*.d.ts');
  });

  it('ignores empty globFilter', () => {
    const before = buildRgArgs('q', false).join(' ');
    const after  = buildRgArgs('q', false, { globFilter: '' }).join(' ');
    expect(before).toBe(after);
  });

  it('ignores whitespace-only globFilter', () => {
    const before = buildRgArgs('q', false).join(' ');
    const after  = buildRgArgs('q', false, { globFilter: '   ' }).join(' ');
    expect(before).toBe(after);
  });
});

describe('buildRgArgs — file list', () => {
  it('appends . when no files provided', () => {
    const args = buildRgArgs('q', false);
    expect(args[args.length - 1]).toBe('.');
  });

  it('appends explicit file list instead of .', () => {
    const files = ['/a/b.ts', '/a/c.ts'];
    const args = buildRgArgs('q', false, {}, files);
    expect(args).toContain('/a/b.ts');
    expect(args).toContain('/a/c.ts');
    expect(args).not.toContain('.');
  });

  it('uses . when files is empty array', () => {
    const args = buildRgArgs('q', false, {}, []);
    expect(args[args.length - 1]).toBe('.');
  });
});

describe('buildRgArgs — argument order', () => {
  it('-- separator comes before query and files', () => {
    const args = buildRgArgs('my query', false, {}, ['/file.ts']);
    const sep = args.indexOf('--');
    expect(sep).toBeGreaterThan(-1);
    expect(args[sep + 1]).toBe('my query');
    expect(args[sep + 2]).toBe('/file.ts');
  });
});
