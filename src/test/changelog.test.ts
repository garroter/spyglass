import { describe, it, expect } from 'vitest';
import { changelogSection } from '../../scripts/changelog.mjs';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added
- something new

## [0.3.0] - 2026-10-01

### Added
- **A feature** — with \`code\` and a [link](https://example.com)

### Fixed
- a bug

## [0.2.10] - 2026-09-08

### Fixed
- Marketplace description

## [0.2.1] - 2026-04-01
- old
`;

describe('changelogSection', () => {
  it('returns the body of a version, without its heading', () => {
    expect(changelogSection(CHANGELOG, '0.2.10')).toBe('### Fixed\n- Marketplace description');
  });

  it('keeps the ### subheadings and everything up to the next ## heading', () => {
    expect(changelogSection(CHANGELOG, '0.3.0')).toBe(
      '### Added\n- **A feature** — with `code` and a [link](https://example.com)\n\n### Fixed\n- a bug',
    );
  });

  it('reads the last section, which has no heading after it', () => {
    expect(changelogSection(CHANGELOG, '0.2.1')).toBe('- old');
  });

  it('finds the Unreleased section too', () => {
    expect(changelogSection(CHANGELOG, 'Unreleased')).toBe('### Added\n- something new');
  });

  it('does not mistake a version for another that starts with the same digits', () => {
    expect(changelogSection(CHANGELOG, '0.2.1')).toBe('- old');
    expect(changelogSection(CHANGELOG, '0.2')).toBeUndefined();
    expect(changelogSection(CHANGELOG, '0.3')).toBeUndefined();
  });

  it('accepts a heading without a date', () => {
    expect(changelogSection('## [1.0.0]\n\n- first\n', '1.0.0')).toBe('- first');
  });

  it('returns undefined for a version that is not there', () => {
    expect(changelogSection(CHANGELOG, '9.9.9')).toBeUndefined();
  });

  it('returns undefined for a section with nothing in it, so an empty release is not published', () => {
    expect(changelogSection('## [1.0.0] - 2026-01-01\n\n\n## [0.9.0]\n- x\n', '1.0.0')).toBeUndefined();
  });

  it('handles Windows line endings', () => {
    const crlf = '## [1.0.0] - 2026-01-01\r\n\r\n### Added\r\n- a\r\n\r\n## [0.9.0]\r\n- b\r\n';
    expect(changelogSection(crlf, '1.0.0')).toBe('### Added\n- a');
  });

  it('treats dots in the version literally', () => {
    expect(changelogSection('## [1x0x0]\n- wrong\n', '1.0.0')).toBeUndefined();
  });
});
