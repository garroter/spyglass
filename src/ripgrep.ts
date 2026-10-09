import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { SearchResult } from './types';
import { downloadRipgrep, testRgPath } from './ripgrepInstaller';

// Populated by ensureRipgrepPath() once a working binary is found (or downloaded), so the
// synchronous resolveRgPath() used by every search call doesn't need to re-probe candidates.
let resolvedRgPath: string | undefined;
let downloadAttempted = false;

function rgCandidates(): string[] {
  const ext = process.platform === 'win32' ? '.exe' : '';
  // VS Code >= 1.9x ships @vscode/ripgrep-universal instead of @vscode/ripgrep, with binaries
  // split per platform-arch (see microsoft/vscode@c4471e2). Older VS Code still uses the single-
  // binary @vscode/ripgrep layout, so we probe both.
  const arch = process.arch === 'arm' ? 'armhf' : process.arch;
  const platformArch = `${process.platform}-${arch}`;
  const candidates = [
    path.join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', platformArch, `rg${ext}`),
    path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep-universal', 'bin', platformArch, `rg${ext}`),
    path.join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', `rg${ext}`),
    path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', `rg${ext}`),
  ];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    candidates.push((require('@vscode/ripgrep') as { rgPath: string }).rgPath);
  } catch { /* not bundled */ }
  return candidates;
}

function resolveRgPath(): string {
  if (resolvedRgPath) { return resolvedRgPath; }

  const ext = process.platform === 'win32' ? '.exe' : '';
  const configured = vscode.workspace.getConfiguration('spyglass').get<string>('ripgrepPath')?.trim();
  if (configured) { return configured; }

  for (const candidate of rgCandidates()) {
    if (fs.existsSync(candidate)) { return candidate; }
  }
  return `rg${ext}`;
}

/**
 * Makes sure a working rg binary is available, downloading one (matching this machine's
 * platform/arch) as a last resort if none of the bundled/system candidates run. Safe to call
 * repeatedly — resolves instantly once a working path has been found or a download attempted.
 */
export async function ensureRipgrepPath(context: vscode.ExtensionContext): Promise<boolean> {
  if (resolvedRgPath) { return true; }

  const configured = vscode.workspace.getConfiguration('spyglass').get<string>('ripgrepPath')?.trim();
  if (configured) {
    resolvedRgPath = configured;
    return testRgPath(configured);
  }

  const downloadDir = path.join(context.globalStorageUri.fsPath, 'ripgrep-bin');
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [...rgCandidates(), path.join(downloadDir, `rg${ext}`)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && (await testRgPath(candidate))) {
      resolvedRgPath = candidate;
      return true;
    }
  }

  if (downloadAttempted) { return false; }
  downloadAttempted = true;

  const downloaded = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Spyglass: setting up ripgrep (one-time download)…' },
    () => downloadRipgrep(downloadDir)
  );
  if (downloaded) {
    resolvedRgPath = downloaded;
    return true;
  }
  return false;
}

interface RgSubmatch {
  start: number;
  end: number;
}

interface RgMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: RgSubmatch[];
  };
}

/**
 * Turns the `data` of an `rg --json` match message into a result. ripgrep reports match offsets in
 * UTF-8 bytes, which are converted to character offsets here so that highlighting is right for text
 * with accents, CJK or emoji. A multiline match keeps all its lines and gets a `lineCount`.
 */
export function toSearchResult(data: RgMatch['data'], cwd: string): SearchResult | undefined {
  const { path: filePath, lines, line_number, submatches } = data;
  if (submatches.length === 0) { return undefined; }

  const raw = Buffer.from(lines.text, 'utf8');
  const toChars = (byteOffset: number) => raw.subarray(0, byteOffset).toString('utf8').length;
  const text = lines.text.trimEnd();
  const lineCount = text.split('\n').length;

  const absPath = path.isAbsolute(filePath.text) ? filePath.text : path.join(cwd, filePath.text);
  return {
    file: absPath,
    relativePath: path.relative(cwd, absPath).replace(/\\/g, '/'),
    line: line_number,
    text,
    matchStart: Math.min(toChars(submatches[0].start), text.length),
    matchEnd: Math.min(toChars(submatches[0].end), text.length),
    ...(lineCount > 1 ? { lineCount } : {}),
  };
}

export interface CancellableSearch {
  promise: Promise<SearchResult[]>;
  cancel: () => void;
}

const DEFAULT_EXCLUDES = ['.git', 'node_modules', 'out', 'dist', '*.lock'];

export interface SearchLimits {
  /** Maximum number of results returned to the UI. */
  maxResults: number;
  /** Maximum number of matches ripgrep reports per file (--max-count). */
  maxMatchesPerFile: number;
  /** Files larger than this are skipped (--max-filesize), e.g. "1M". */
  maxFileSize: string;
}

export interface SearchOptions extends Partial<SearchLimits> {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  globFilter?: string;
  exclude?: string[];
  /** Also search hidden files, files hidden by .gitignore-style rules and the spyglass.exclude folders. */
  includeIgnored?: boolean;
  /** Let a pattern match across line breaks (rg --multiline). The query is then always a regular expression. */
  multiline?: boolean;
}

// Never useful to search, and enormous, so it stays excluded even when everything else is included.
const ALWAYS_EXCLUDED = ['.git'];

/** Exclude globs (`--glob !x`) for a search or file listing. */
function excludeGlobs(exclude: string[] | undefined, includeIgnored: boolean | undefined): string[] {
  const excludes = includeIgnored ? ALWAYS_EXCLUDED : (exclude ?? DEFAULT_EXCLUDES);
  return excludes.flatMap(e => ['--glob', e.startsWith('!') ? e : `!${e}`]);
}

const DEFAULT_LIMITS: SearchLimits = { maxResults: 200, maxMatchesPerFile: 10, maxFileSize: '1M' };
// Every result is posted to the webview, so an unbounded maxResults would freeze the UI.
const MAX_RESULTS_CEILING = 5000;

function toPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

/** Turns raw (user-editable) setting values into limits that are safe to hand to ripgrep. */
export function normalizeSearchLimits(raw: { maxResults?: unknown; maxMatchesPerFile?: unknown; maxFileSize?: unknown }): SearchLimits {
  const size = typeof raw.maxFileSize === 'string' ? raw.maxFileSize.trim().toUpperCase() : '';
  return {
    maxResults: Math.min(toPositiveInt(raw.maxResults, DEFAULT_LIMITS.maxResults), MAX_RESULTS_CEILING),
    maxMatchesPerFile: toPositiveInt(raw.maxMatchesPerFile, DEFAULT_LIMITS.maxMatchesPerFile),
    maxFileSize: /^[1-9]\d*[KMG]?$/.test(size) ? size : DEFAULT_LIMITS.maxFileSize,
  };
}

export function readSearchLimits(): SearchLimits {
  const config = vscode.workspace.getConfiguration('spyglass');
  return normalizeSearchLimits({
    maxResults: config.get('maxResults'),
    maxMatchesPerFile: config.get('maxMatchesPerFile'),
    maxFileSize: config.get('maxFileSize'),
  });
}

export function buildRgArgs(
  query: string,
  useRegex: boolean,
  opts?: SearchOptions,
  files?: string[],
): string[] {
  const maxMatchesPerFile = opts?.maxMatchesPerFile ?? DEFAULT_LIMITS.maxMatchesPerFile;
  const maxFileSize = opts?.maxFileSize ?? DEFAULT_LIMITS.maxFileSize;
  const args: string[] = ['--json', '--max-count', String(maxMatchesPerFile), '--max-filesize', maxFileSize];
  args.push(...excludeGlobs(opts?.exclude, opts?.includeIgnored));
  if (opts?.includeIgnored) { args.push('--hidden', '--no-ignore'); }
  if (opts?.caseSensitive) {
    args.push('--case-sensitive');
  } else {
    args.push('--smart-case');
  }
  if (opts?.wholeWord) { args.push('--word-regexp'); }
  if (opts?.globFilter?.trim()) {
    for (const g of opts.globFilter.split(',').map(s => s.trim()).filter(Boolean)) {
      args.push('--glob', g);
    }
  }
  if (opts?.multiline) { args.push('--multiline'); }
  // a literal string cannot contain a line break, so multiline mode always means "regular expression"
  if (!useRegex && !opts?.multiline) { args.push('--fixed-strings'); }
  args.push('--', query);
  if (files?.length) { args.push(...files); } else { args.push('.'); }
  return args;
}

export function searchWithRipgrep(
  query: string,
  cwd: string,
  useRegex: boolean,
  files?: string[],
  opts?: SearchOptions,
  onChunk?: (results: SearchResult[]) => void
): CancellableSearch {
  let cancelled = false;
  let cancel = () => {};

  const promise = new Promise<SearchResult[]>((resolve, reject) => {
    const args = buildRgArgs(query, useRegex, opts, files);

    const rg = spawn(resolveRgPath(), args, { cwd });
    const results: SearchResult[] = [];
    let buffer = '';
    let errored = false;

    rg.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      const prevCount = results.length;

      for (const line of lines) {
        if (!line.trim()) { continue; }
        try {
          const msg = JSON.parse(line) as RgMatch;
          if (msg.type === 'match') {
            const result = toSearchResult(msg.data, cwd);
            if (result) { results.push(result); }
          }
        } catch {
          // ignore JSON parse errors
        }
      }

      if (onChunk && results.length > prevCount) {
        onChunk(results.slice());
      }
    });

    rg.on('error', (err) => {
      errored = true;
      reject(err);
    });

    rg.on('close', () => {
      if (cancelled) { resolve([]); return; }
      if (!errored) {
        // code 0 = matches found, code 1 = no matches, code 2 = error
        resolve(results.slice(0, opts?.maxResults ?? DEFAULT_LIMITS.maxResults));
      }
    });

    cancel = () => {
      cancelled = true;
      rg.kill();
    };
  });

  return { promise, cancel };
}

/** Arguments for listing files: the configured excludes, or (includeIgnored) everything but .git. */
export function buildFilesArgs(exclude?: string[], includeIgnored?: boolean): string[] {
  const args = ['--files', ...excludeGlobs(exclude, includeIgnored)];
  if (includeIgnored) { args.push('--hidden', '--no-ignore'); }
  return args;
}

export function listFilesWithRipgrep(cwd: string, exclude?: string[], includeIgnored?: boolean): Promise<string[]> {
  return new Promise((resolve) => {
    const args = buildFilesArgs(exclude, includeIgnored);

    const rg = spawn(resolveRgPath(), args, { cwd });
    const files: string[] = [];
    let buffer = '';

    rg.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) { files.push(path.join(cwd, line.trim())); }
      }
    });

    rg.on('error', () => resolve([]));
    rg.on('close', () => {
      if (buffer.trim()) { files.push(path.join(cwd, buffer.trim())); }
      resolve(files);
    });
  });
}

export function isRipgrepAvailable(context: vscode.ExtensionContext): Promise<boolean> {
  return ensureRipgrepPath(context);
}
