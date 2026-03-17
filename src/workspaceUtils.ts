import * as path from 'path';

export function cwdForFile(filePath: string, cwdList: string[], fallback: string): string {
  return cwdList.find(cwd =>
    filePath.startsWith(cwd + path.sep) || filePath.startsWith(cwd + '/')
  ) ?? fallback;
}

export function makeRelative(filePath: string, cwdList: string[], fallback: string): string {
  const cwd = cwdForFile(filePath, cwdList, fallback);
  const rel = path.relative(cwd, filePath).replace(/\\/g, '/');
  return cwdList.length > 1 ? path.basename(cwd) + '/' + rel : rel;
}
