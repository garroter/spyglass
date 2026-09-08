import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
}));

import * as vscode from 'vscode';
import { resolveThemeId } from '../themeLoader';

// Builds a `get` function backed by a plain settings object, matching the
// shape vscode.WorkspaceConfiguration#get<T> would produce.
const configOf = (settings: Record<string, unknown>) =>
  <T,>(key: string): T | undefined => settings[key] as T | undefined;

describe('resolveThemeId', () => {
  it('uses workbench.colorTheme when auto-detect is disabled, even if preferred themes are set', () => {
    const get = configOf({
      'workbench.colorTheme': 'my-dark',
      'workbench.preferredLightColorTheme': 'my-light',
      'window.autoDetectColorScheme': false,
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.Light)).toBe('my-dark');
  });

  it('uses preferredLightColorTheme when auto-detect is on and kind is Light', () => {
    const get = configOf({
      'workbench.colorTheme': 'eye-care-owl-noitalic-dark',
      'workbench.preferredLightColorTheme': 'eye-care-owl-noitalic-light',
      'workbench.preferredDarkColorTheme': 'eye-care-dark',
      'window.autoDetectColorScheme': true,
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.Light)).toBe('eye-care-owl-noitalic-light');
  });

  it('uses preferredDarkColorTheme when auto-detect is on and kind is Dark', () => {
    const get = configOf({
      'workbench.colorTheme': 'eye-care-owl-noitalic-dark',
      'workbench.preferredLightColorTheme': 'eye-care-owl-noitalic-light',
      'workbench.preferredDarkColorTheme': 'eye-care-dark',
      'window.autoDetectColorScheme': true,
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.Dark)).toBe('eye-care-dark');
  });

  it('falls back to workbench.colorTheme when auto-detect is on but no preferred theme is configured', () => {
    const get = configOf({
      'workbench.colorTheme': 'my-theme',
      'window.autoDetectColorScheme': true,
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.Light)).toBe('my-theme');
  });

  it('prefers workbench.preferredHighContrastColorTheme for HighContrast kind (autoDetectHighContrast defaults true)', () => {
    const get = configOf({
      'workbench.colorTheme': 'my-dark',
      'workbench.preferredHighContrastColorTheme': 'my-hc-dark',
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.HighContrast)).toBe('my-hc-dark');
  });

  it('prefers workbench.preferredHighContrastLightColorTheme for HighContrastLight kind', () => {
    const get = configOf({
      'workbench.colorTheme': 'my-dark',
      'workbench.preferredHighContrastLightColorTheme': 'my-hc-light',
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.HighContrastLight)).toBe('my-hc-light');
  });

  it('does not apply high-contrast preferences when autoDetectHighContrast is explicitly disabled', () => {
    const get = configOf({
      'workbench.colorTheme': 'my-dark',
      'workbench.preferredHighContrastColorTheme': 'my-hc-dark',
      'window.autoDetectHighContrast': false,
    });
    expect(resolveThemeId(get, vscode.ColorThemeKind.HighContrast)).toBe('my-dark');
  });
});
