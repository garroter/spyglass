import { spawn } from 'child_process';
import * as path from 'path';
import { SearchResult } from './types';

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

export async function searchWithRipgrep(
  query: string,
  cwd: string,
  useRegex: boolean,
  files?: string[]
): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    const args: string[] = [
      '--json',
      '--max-count', '10',
      '--max-filesize', '1M',
      '--smart-case',
      '--glob', '!.git',
      '--glob', '!node_modules',
      '--glob', '!out',
      '--glob', '!dist',
      '--glob', '!*.lock',
    ];

    if (!useRegex) {
      args.push('--fixed-strings');
    }

    args.push('--', query);

    if (files?.length) {
      args.push(...files);
    } else {
      args.push('.');
    }

    const rg = spawn('rg', args, { cwd });
    const results: SearchResult[] = [];
    let buffer = '';
    let errored = false;

    rg.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

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
                relativePath: path.relative(cwd, absPath),
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
    });

    rg.on('error', () => {
      errored = true;
      resolve([]);
    });

    rg.on('close', (code) => {
      if (!errored) {
        // code 0 = matches found, code 1 = no matches, code 2 = error
        resolve(results.slice(0, 200));
      }
    });
  });
}

export function isRipgrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const rg = spawn('rg', ['--version']);
    rg.on('error', () => resolve(false));
    rg.on('close', (code) => resolve(code === 0));
  });
}
