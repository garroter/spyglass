import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export const ROOT = path.join(__dirname, '..', '..');

/** Reads a JSON file from the repository root; undefined if it does not exist. */
export function readRootJson<T = Record<string, unknown>>(file: string): T | undefined {
  const full = path.join(ROOT, file);
  return existsSync(full) ? JSON.parse(readFileSync(full, 'utf-8')) as T : undefined;
}

function resolve(value: unknown, strings: Record<string, string>): unknown {
  if (typeof value === 'string') {
    const m = /^%(.+)%$/.exec(value);
    return m && m[1] in strings ? strings[m[1]] : value;
  }
  if (Array.isArray(value)) { return value.map(v => resolve(v, strings)); }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, strings)]));
  }
  return value;
}

/**
 * package.json as VS Code presents it: every "%key%" replaced from package.nls.json (English), or from
 * package.nls.<locale>.json when a locale is given (falling back to English for missing keys).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadManifest(locale?: string): any {
  const manifest = readRootJson('package.json');
  const english = readRootJson<Record<string, string>>('package.nls.json') ?? {};
  const localized = locale ? readRootJson<Record<string, string>>(`package.nls.${locale}.json`) ?? {} : {};
  return resolve(manifest, { ...english, ...localized });
}
