import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { appRoot: '/mock/vscode' },
}));

import { buildRgArgs, buildFilesArgs } from '../ripgrep';

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

  it('defaults to --max-count 10 when no limit is configured', () => {
    expect(argPairs(buildRgArgs('q', false), '--max-count')).toEqual(['10']);
  });

  it('defaults to --max-filesize 1M when no limit is configured', () => {
    expect(argPairs(buildRgArgs('q', false), '--max-filesize')).toEqual(['1M']);
  });

  it('passes maxMatchesPerFile to --max-count', () => {
    expect(argPairs(buildRgArgs('q', false, { maxMatchesPerFile: 25 }), '--max-count')).toEqual(['25']);
  });

  it('passes maxFileSize to --max-filesize', () => {
    expect(argPairs(buildRgArgs('q', false, { maxFileSize: '5M' }), '--max-filesize')).toEqual(['5M']);
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

describe('buildRgArgs — include ignored and hidden files', () => {
  it('leaves ripgrep ignore rules alone by default', () => {
    const args = buildRgArgs('q', false);
    expect(args).not.toContain('--hidden');
    expect(args).not.toContain('--no-ignore');
  });

  it('asks ripgrep for hidden and ignored files when includeIgnored is set', () => {
    const args = buildRgArgs('q', false, { includeIgnored: true });
    expect(args).toContain('--hidden');
    expect(args).toContain('--no-ignore');
  });

  it('lifts the configured excludes, but never searches inside .git', () => {
    const globs = argPairs(buildRgArgs('q', false, { includeIgnored: true, exclude: ['vendor', 'node_modules', '*.min.js'] }), '--glob');
    expect(globs).toEqual(['!.git']);
  });

  it('still applies the glob filter typed in the query', () => {
    const globs = argPairs(buildRgArgs('q', false, { includeIgnored: true, globFilter: '*.ts' }), '--glob');
    expect(globs).toEqual(['!.git', '*.ts']);
  });

  it('treats includeIgnored: false like the default', () => {
    expect(buildRgArgs('q', false, { includeIgnored: false })).toEqual(buildRgArgs('q', false));
  });
});

describe('buildFilesArgs (file listing)', () => {
  it('lists files with the configured excludes by default', () => {
    expect(buildFilesArgs(['vendor'])).toEqual(['--files', '--glob', '!vendor']);
  });

  it('falls back to the default excludes', () => {
    const globs = argPairs(buildFilesArgs(), '--glob');
    expect(globs).toEqual(['!.git', '!node_modules', '!out', '!dist', '!*.lock']);
  });

  it('includes hidden and ignored files, keeping only the .git exclude', () => {
    const args = buildFilesArgs(['vendor', 'node_modules'], true);
    expect(args).toEqual(['--files', '--glob', '!.git', '--hidden', '--no-ignore']);
  });
});

describe('buildRgArgs — multiline', () => {
  it('does not enable multiline by default', () => {
    expect(buildRgArgs('q', true)).not.toContain('--multiline');
  });

  it('adds --multiline when asked', () => {
    expect(buildRgArgs('q', true, { multiline: true })).toContain('--multiline');
  });

  it('treats the query as a regex in multiline mode even when regex mode is off', () => {
    expect(buildRgArgs('a\\nb', false, { multiline: true })).not.toContain('--fixed-strings');
  });

  it('still searches for a literal string when neither regex nor multiline is on', () => {
    expect(buildRgArgs('a.b', false, { multiline: false })).toContain('--fixed-strings');
  });
});

