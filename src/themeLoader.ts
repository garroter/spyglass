import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function stripJsonc(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function loadFile(filePath: string, depth: number): any {
  if (depth > 3) { return null; }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(stripJsonc(raw));

  if (parsed.include) {
    const basePath = path.resolve(path.dirname(filePath), parsed.include);
    try {
      const base = loadFile(basePath, depth + 1);
      if (base) {
        return {
          ...base,
          ...parsed,
          colors: { ...base.colors, ...parsed.colors },
          tokenColors: [...(base.tokenColors ?? []), ...(parsed.tokenColors ?? [])],
        };
      }
    } catch { /* skip bad includes */ }
  }
  return parsed;
}

export function loadCurrentTheme(): object | null {
  const themeId = vscode.workspace.getConfiguration().get<string>('workbench.colorTheme');
  for (const ext of vscode.extensions.all) {
    const themes = ext.packageJSON?.contributes?.themes as Array<{ id?: string; label?: string; path: string }> | undefined;
    if (!themes) { continue; }
    const match = themes.find(t => t.id === themeId || t.label === themeId);
    if (!match) { continue; }
    try {
      return loadFile(path.join(ext.extensionPath, match.path), 0);
    } catch { /* try next */ }
  }
  return null;
}
