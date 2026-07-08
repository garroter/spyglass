import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

let _promise: Promise<HighlighterCore> | null = null;
let _themeName = 'spyglass-theme';
let _hasVscodeTheme = false;

const LANGS = [
  import('shiki/langs/typescript'),
  import('shiki/langs/javascript'),
  import('shiki/langs/tsx'),
  import('shiki/langs/jsx'),
  import('shiki/langs/python'),
  import('shiki/langs/rust'),
  import('shiki/langs/go'),
  import('shiki/langs/java'),
  import('shiki/langs/c'),
  import('shiki/langs/cpp'),
  import('shiki/langs/css'),
  import('shiki/langs/scss'),
  import('shiki/langs/html'),
  import('shiki/langs/json'),
  import('shiki/langs/yaml'),
  import('shiki/langs/toml'),
  import('shiki/langs/markdown'),
  import('shiki/langs/bash'),
  import('shiki/langs/fish'),
  import('shiki/langs/sql'),
  import('shiki/langs/php'),
  import('shiki/langs/ruby'),
  import('shiki/langs/swift'),
  import('shiki/langs/kotlin'),
  import('shiki/langs/lua'),
  import('shiki/langs/vue'),
  import('shiki/langs/svelte'),
  import('shiki/langs/dockerfile'),
];

export function initHighlighter(vscodeTheme: object | null): void {
  _hasVscodeTheme = !!vscodeTheme;

  // Always load github-dark/light as base (comprehensive scope coverage).
  // If a VSCode theme is provided, we'll add a composite theme on top.
  _promise = createHighlighterCore({
    themes: [
      import('shiki/themes/github-dark'),
      import('shiki/themes/github-light'),
    ],
    langs: LANGS,
    engine: createJavaScriptRegexEngine(),
  }).then(async (hl) => {
    if (vscodeTheme) {
      try {
        // Build composite: github-dark tokens as fallback base + VSCode theme on top.
        // This ensures keywords, strings, etc. are always colored even if the
        // user's theme relies on semantic tokens and has sparse tokenColors.
        const gdTheme = (hl as any).getTheme('github-dark') as any;
        const baseTokens: any[] = gdTheme?.tokenColors ?? gdTheme?.settings ?? [];
        const compositeTheme = {
          ...(vscodeTheme as any),
          name: _themeName,
          tokenColors: [
            ...baseTokens,
            ...((vscodeTheme as any).tokenColors ?? []),
          ],
        };
        await (hl as any).loadTheme(compositeTheme);
      } catch {
        _hasVscodeTheme = false;
      }
    }
    return hl;
  });
}

export function getHighlighter(): Promise<HighlighterCore> {
  if (!_promise) { initHighlighter(null); }
  return _promise!;
}

export function setHasVscodeTheme(v: boolean): void { _hasVscodeTheme = v; }

export function reinitHighlighter(newTheme: object | null): Promise<HighlighterCore> {
  _promise = null;
  initHighlighter(newTheme);
  return _promise!;
}

function resolveThemeName(): string {
  if (_hasVscodeTheme) { return _themeName; }
  return document.body.classList.contains('vscode-light') ? 'github-light' : 'github-dark';
}

const EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  mjs: 'javascript', cjs: 'javascript', mts: 'typescript', cts: 'typescript',
  py: 'python', rs: 'rust', go: 'go',
  java: 'java', c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp',
  css: 'css', scss: 'scss',
  html: 'html', htm: 'html', vue: 'vue', svelte: 'svelte',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  md: 'markdown', mdx: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish',
  sql: 'sql',
  php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin', lua: 'lua',
  dockerfile: 'dockerfile',
};

export function shikiLines(hl: HighlighterCore, content: string, ext: string): string[] {
  const lang = EXT[ext.toLowerCase()];
  if (!lang) { return escapeLines(content); }
  const theme = resolveThemeName();
  try {
    const html = hl.codeToHtml(content, { lang, theme });
    return extractLines(html);
  } catch {
    // VSCode theme failed — fall back to github-dark/light
    const fallback = document.body.classList.contains('vscode-light') ? 'github-light' : 'github-dark';
    if (theme !== fallback) {
      try {
        const html = hl.codeToHtml(content, { lang, theme: fallback });
        return extractLines(html);
      } catch { /* ignore */ }
    }
    return escapeLines(content);
  }
}

function escapeLines(content: string): string[] {
  return content.split('\n').map(l =>
    l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
}

function extractLines(html: string): string[] {
  // Find <code> (may have attributes like tabindex)
  const codeIdx = html.indexOf('<code');
  if (codeIdx === -1) { return ['']; }
  const innerStart = html.indexOf('>', codeIdx) + 1;
  const innerEnd = html.lastIndexOf('</code>');
  const inner = html.slice(innerStart, innerEnd === -1 ? undefined : innerEnd);
  // Match <span class="line"> or <span class="line highlighted"> etc.
  return inner.split('\n').map(l =>
    l.match(/^<span class="line[^"]*">(.*)<\/span>$/)?.[1] ?? l
  );
}
