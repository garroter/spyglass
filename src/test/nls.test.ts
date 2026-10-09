import { describe, it, expect } from 'vitest';
import { readRootJson, loadManifest } from './manifest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = readRootJson('package.json') as any;
const en = readRootJson<Record<string, string>>('package.nls.json');
const zh = readRootJson<Record<string, string>>('package.nls.zh-cn.json');

/** Every "%key%" string in package.json, with where it sits. */
function placeholders(value: unknown, where = '$'): Array<{ where: string; key: string }> {
  if (typeof value === 'string') {
    const m = /^%(.+)%$/.exec(value);
    return m ? [{ where, key: m[1] }] : [];
  }
  if (Array.isArray(value)) { return value.flatMap((v, i) => placeholders(v, `${where}[${i}]`)); }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => placeholders(v, `${where}.${k}`));
  }
  return [];
}

describe('package.nls files', () => {
  it('exist for English (the default) and Simplified Chinese', () => {
    expect(en, 'package.nls.json').toBeDefined();
    expect(zh, 'package.nls.zh-cn.json').toBeDefined();
  });

  it('give every "%key%" in package.json an English string', () => {
    const missing = placeholders(raw).filter(p => !(p.key in (en ?? {})));
    expect(missing).toEqual([]);
  });

  it('have no English string that package.json does not use', () => {
    const used = new Set(placeholders(raw).map(p => p.key));
    expect(Object.keys(en ?? {}).filter(k => !used.has(k))).toEqual([]);
  });

  it('have exactly the same keys in Chinese as in English', () => {
    expect(Object.keys(zh ?? {}).sort()).toEqual(Object.keys(en ?? {}).sort());
  });

  it('have no empty strings', () => {
    for (const [name, file] of [['English', en], ['Chinese', zh]] as const) {
      const empty = Object.entries(file ?? {}).filter(([, v]) => v.trim() === '').map(([k]) => k);
      expect(empty, `${name}: empty strings`).toEqual([]);
    }
  });

  it('cover every command title and every setting description', () => {
    const untranslated: string[] = [];
    for (const c of raw.contributes.commands) {
      if (!/^%.+%$/.test(c.title)) { untranslated.push(`command ${c.command}`); }
    }
    for (const [name, prop] of Object.entries<{ description?: string }>(raw.contributes.configuration.properties)) {
      if (!/^%.+%$/.test(prop.description ?? '')) { untranslated.push(`setting ${name}`); }
    }
    expect(untranslated).toEqual([]);
  });

  it('keep the "Spyglass: " prefix on every command title, in both languages', () => {
    for (const locale of [undefined, 'zh-cn']) {
      const titles = loadManifest(locale).contributes.commands.map((c: { title: string }) => c.title);
      expect(titles.filter((t: string) => !t.startsWith('Spyglass: ')), locale ?? 'en').toEqual([]);
    }
  });

  it('leave commands and settings identical apart from the wording', () => {
    const stripText = (m: ReturnType<typeof loadManifest>) => ({
      commands: m.contributes.commands.map((c: { command: string }) => c.command),
      settings: Object.keys(m.contributes.configuration.properties),
    });
    expect(stripText(loadManifest('zh-cn'))).toEqual(stripText(loadManifest()));
  });
});

// Things that must survive translation untouched: shortcuts, setting ids, glob and value examples.
const LITERALS = [
  /(?:Ctrl|Alt|Shift|Cmd)\+[\w+]+/gi,
  /spyglass\.[A-Za-z.]+/g,
  /\.git\b/g,
  /\*\.[a-z.]+/g,
  /\b\d+[KMG]\b/g,
  /\b(?:ArrowDown|ArrowUp|Enter|Escape)\b/g,
];

describe('Chinese strings keep what must not be translated', () => {
  const pairs = Object.entries(en ?? {}).map(([key, english]) => [key, english, (zh ?? {})[key]] as const);

  it.each(pairs)('%s', (_key, english, chinese) => {
    const tokens = LITERALS.flatMap(re => english.match(re) ?? []);
    for (const token of tokens) {
      expect(chinese, `"${token}" from the English text`).toContain(token);
    }
  });
});
