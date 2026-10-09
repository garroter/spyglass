#!/usr/bin/env node
// Prints the CHANGELOG.md section of one version, for the notes of a GitHub Release:
//   node scripts/changelog.mjs 0.3.0 > release-notes.md
// Exits with an error if the version has no section (or an empty one), so a release cannot go out
// without release notes.
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The body of the "## [version]" section of a Keep a Changelog file, without its heading, or
 * undefined when the version is missing or has nothing under it.
 */
export function changelogSection(markdown, version) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+\\[${escaped}\\](\\s|$)`);
  const start = lines.findIndex(line => heading.test(line));
  if (start === -1) { return undefined; }

  let end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  if (end === -1) { end = lines.length; }

  const body = lines.slice(start + 1, end).join('\n').trim();
  return body === '' ? undefined : body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = (process.argv[2] ?? '').replace(/^v/, '');
  const file = process.argv[3] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md');
  if (!version) {
    console.error('usage: node scripts/changelog.mjs <version> [CHANGELOG.md]');
    process.exit(2);
  }
  const section = changelogSection(readFileSync(file, 'utf-8'), version);
  if (section === undefined) {
    console.error(`CHANGELOG.md has no (or an empty) "## [${version}]" section - add release notes before releasing.`);
    process.exit(1);
  }
  process.stdout.write(section + '\n');
}
