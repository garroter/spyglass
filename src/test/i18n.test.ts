import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { language: 'en' },
}));

import * as vscode from 'vscode';
import { getUiStrings } from '../i18n';

function setLanguage(lang: string | undefined): void {
  (vscode.env as { language: string | undefined }).language = lang;
}

describe('getUiStrings', () => {
  it('returns English strings for "en"', () => {
    setLanguage('en');
    expect(getUiStrings().project).toBe('Project');
  });

  it('returns English strings for regional English variants', () => {
    setLanguage('en-US');
    expect(getUiStrings().project).toBe('Project');
  });

  it('returns Chinese strings for "zh-cn"', () => {
    setLanguage('zh-cn');
    expect(getUiStrings().project).toBe('项目');
  });

  it('matches language case-insensitively', () => {
    setLanguage('ZH-CN');
    expect(getUiStrings().project).toBe('项目');
  });

  it('maps other Chinese variants (e.g. Traditional) to the same Chinese strings', () => {
    setLanguage('zh-tw');
    expect(getUiStrings().project).toBe('项目');
  });

  it('falls back to English for unsupported languages', () => {
    setLanguage('pl');
    expect(getUiStrings().project).toBe('Project');
  });

  it('falls back to English when vscode.env.language is undefined', () => {
    setLanguage(undefined);
    expect(getUiStrings().project).toBe('Project');
  });

  it('exposes the same set of keys for every language', () => {
    setLanguage('en');
    const enKeys = Object.keys(getUiStrings()).sort();
    setLanguage('zh-cn');
    const zhKeys = Object.keys(getUiStrings()).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('has no empty string values in either language', () => {
    for (const lang of ['en', 'zh-cn']) {
      setLanguage(lang);
      const strings = getUiStrings();
      for (const [key, value] of Object.entries(strings)) {
        expect(value, `${lang}.${key} should not be empty`).not.toBe('');
      }
    }
  });
});
