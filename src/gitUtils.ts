import * as path from 'path';
import { spawn } from 'child_process';

// ── Pure parsing functions (exported for testing) ──────────────────────────

export function parseGitStatus(output: string, cwdList: string[], cwd: string): Record<string, string> {
  const status: Record<string, string> = {};
  for (const line of output.split('\n')) {
    if (line.length < 4) { continue; }
    const xy = line.slice(0, 2);
    let filePath = line.slice(3);
    if (filePath.includes(' -> ')) { filePath = filePath.split(' -> ')[1]; }
    filePath = filePath.trim();
    if (!filePath) { continue; }
    let s = 'M';
    if (xy === '??')                          { s = 'U'; }
    else if (xy[0] === 'D' || xy[1] === 'D') { s = 'D'; }
    else if (xy[0] === 'A')                   { s = 'A'; }
    else if (xy[0] === 'R')                   { s = 'R'; }
    const rel = cwdList.length > 1 ? path.basename(cwd) + '/' + filePath : filePath;
    status[rel] = s;
  }
  return status;
}

export function parseGitDiff(output: string): number[] {
  const changed = new Set<number>();
  for (const line of output.split('\n')) {
    // Parse: @@ -old +new_start[,new_count] @@
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      const start = parseInt(m[1], 10);
      const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
      for (let i = 0; i < count; i++) { changed.add(start + i); }
    }
  }
  return Array.from(changed);
}

// ── Spawn-based functions ──────────────────────────────────────────────────

export function loadGitStatus(cwdList: string[]): Promise<Record<string, string>> {
  if (cwdList.length === 0) { return Promise.resolve({}); }

  const promises = cwdList.map(cwd => new Promise<Record<string, string>>(resolve => {
    const git = spawn('git', ['status', '--porcelain'], { cwd });
    let out = '';
    git.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    git.on('error', () => resolve({}));
    git.on('close', () => resolve(parseGitStatus(out, cwdList, cwd)));
  }));

  return Promise.all(promises).then(statuses => {
    const merged: Record<string, string> = {};
    for (const s of statuses) { Object.assign(merged, s); }
    return merged;
  });
}

export function getChangedLines(
  filePath: string,
  cwd: string,
  cache: Map<string, number[]>
): Promise<number[]> {
  if (cache.has(filePath)) {
    return Promise.resolve(cache.get(filePath)!);
  }
  return new Promise(resolve => {
    if (!cwd) { resolve([]); return; }
    const git = spawn('git', ['diff', 'HEAD', '--unified=0', '--', filePath], { cwd });
    let out = '';
    git.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    git.on('error', () => resolve([]));
    git.on('close', () => {
      const result = parseGitDiff(out);
      cache.set(filePath, result);
      resolve(result);
    });
  });
}
