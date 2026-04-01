import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { SearchResult } from './types';

function resolveRgPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  // Prefer VS Code's own ripgrep — always present, correct platform
  const vscodeRg = path.join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', `rg${ext}`);
  if (fs.existsSync(vscodeRg)) {
    return vscodeRg;
  }
  // Fallback: bundled via npm (may fail cross-platform)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@vscode/ripgrep') as { rgPath: string }).rgPath;
  } catch {
    return `rg${ext}`;
  }
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

export interface CancellableSearch {
  promise: Promise<SearchResult[]>;
  cancel: () => void;
}

const DEFAULT_EXCLUDES = ['.git', 'node_modules', 'out', 'dist', '*.lock'];

export function buildRgArgs(
  query: string,
  useRegex: boolean,
  opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string; exclude?: string[] },
  files?: string[],
): string[] {
  const excludes = opts?.exclude ?? DEFAULT_EXCLUDES;
  const args: string[] = ['--json', '--max-count', '10', '--max-filesize', '1M'];
  for (const e of excludes) {
    args.push('--glob', e.startsWith('!') ? e : `!${e}`);
  }
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
  if (!useRegex) { args.push('--fixed-strings'); }
  args.push('--', query);
  if (files?.length) { args.push(...files); } else { args.push('.'); }
  return args;
}

export function searchWithRipgrep(
  query: string,
  cwd: string,
  useRegex: boolean,
  files?: string[],
  opts?: { caseSensitive?: boolean; wholeWord?: boolean; globFilter?: string; exclude?: string[] },
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
            const { path: filePath, lines: lineData, line_number, submatches } = msg.data;
            if (submatches.length > 0) {
              const absPath = path.isAbsolute(filePath.text)
                ? filePath.text
                : path.join(cwd, filePath.text);
              results.push({
                file: absPath,
                relativePath: path.relative(cwd, absPath).replace(/\\/g, '/'),
                line: line_number,
                text: lineData.text.trimEnd(),
                matchStart: submatches[0].start,
                matchEnd: submatches[0].end,
              });
            }
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
        resolve(results.slice(0, 200));
      }
    });

    cancel = () => {
      cancelled = true;
      rg.kill();
    };
  });

  return { promise, cancel };
}

export function listFilesWithRipgrep(cwd: string, exclude?: string[]): Promise<string[]> {
  return new Promise((resolve) => {
    const excludes = exclude ?? DEFAULT_EXCLUDES;
    const args = ['--files'];
    for (const e of excludes) {
      args.push('--glob', e.startsWith('!') ? e : `!${e}`);
    }

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

export function isRipgrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const rg = spawn(resolveRgPath(), ['--version']);
    rg.on('error', () => resolve(false));
    rg.on('close', (code) => resolve(code === 0));
  });
}
