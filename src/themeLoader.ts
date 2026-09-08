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

/**
 * Resolves the effective theme id, honoring VSCode's auto light/dark and
 * high-contrast switching (window.autoDetectColorScheme / autoDetectHighContrast),
 * which override workbench.colorTheme with workbench.preferredLight/Dark/
 * HighContrast(Light)ColorTheme depending on the OS appearance.
 *
 * `kind` should come from vscode.window.activeColorTheme.kind, which already
 * reflects VSCode's own resolution of the OS appearance — we just need to map
 * it back to the right *ThemeId* setting.
 */
export function resolveThemeId(
  get: <T>(key: string) => T | undefined,
  kind: vscode.ColorThemeKind
): string | undefined {
  const base = () => get<string>('workbench.colorTheme');
  const autoHC = get<boolean>('window.autoDetectHighContrast') ?? true;
  const autoColor = get<boolean>('window.autoDetectColorScheme') ?? false;

  if (autoHC && kind === vscode.ColorThemeKind.HighContrast) {
    return get<string>('workbench.preferredHighContrastColorTheme') ?? base();
  }
  if (autoHC && kind === vscode.ColorThemeKind.HighContrastLight) {
    return get<string>('workbench.preferredHighContrastLightColorTheme') ?? base();
  }
  if (autoColor && kind === vscode.ColorThemeKind.Light) {
    return get<string>('workbench.preferredLightColorTheme') ?? base();
  }
  if (autoColor && kind === vscode.ColorThemeKind.Dark) {
    return get<string>('workbench.preferredDarkColorTheme') ?? base();
  }
  return base();
}

export function loadCurrentTheme(): object | null {
  const config = vscode.workspace.getConfiguration();
  const themeId = resolveThemeId(
    <T,>(key: string) => config.get<T>(key),
    vscode.window.activeColorTheme.kind
  );
  if (!themeId) { return null; }
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
