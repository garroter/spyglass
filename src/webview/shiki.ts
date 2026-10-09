import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

let _promise: Promise<HighlighterCore> | null = null;
let _themeName = 'spyglass-theme';
let _hasVscodeTheme = false;

// Grammars by Shiki language name. Each import() is a separate file in media/chunks/, loaded the
// first time the preview shows a file in that language, so opening Spyglass parses none of them.
const LANGS: Record<string, () => Promise<unknown>> = {
  typescript: () => import('shiki/langs/typescript'),
  javascript: () => import('shiki/langs/javascript'),
  tsx: () => import('shiki/langs/tsx'),
  jsx: () => import('shiki/langs/jsx'),
  python: () => import('shiki/langs/python'),
  rust: () => import('shiki/langs/rust'),
  go: () => import('shiki/langs/go'),
  java: () => import('shiki/langs/java'),
  c: () => import('shiki/langs/c'),
  cpp: () => import('shiki/langs/cpp'),
  css: () => import('shiki/langs/css'),
  scss: () => import('shiki/langs/scss'),
  html: () => import('shiki/langs/html'),
  json: () => import('shiki/langs/json'),
  yaml: () => import('shiki/langs/yaml'),
  toml: () => import('shiki/langs/toml'),
  markdown: () => import('shiki/langs/markdown'),
  bash: () => import('shiki/langs/bash'),
  fish: () => import('shiki/langs/fish'),
  sql: () => import('shiki/langs/sql'),
  php: () => import('shiki/langs/php'),
  ruby: () => import('shiki/langs/ruby'),
  swift: () => import('shiki/langs/swift'),
  kotlin: () => import('shiki/langs/kotlin'),
  lua: () => import('shiki/langs/lua'),
  vue: () => import('shiki/langs/vue'),
  svelte: () => import('shiki/langs/svelte'),
  dockerfile: () => import('shiki/langs/dockerfile'),
};

// Languages loaded (or loading) into each highlighter; a new one is made when the theme changes.
const _loading = new WeakMap<HighlighterCore, Map<string, Promise<boolean>>>();

/** Loads the grammar for `lang` into `hl` once; resolves to whether it is available. */
function ensureLanguage(hl: HighlighterCore, lang: string): Promise<boolean> {
  let perHl = _loading.get(hl);
  if (!perHl) { perHl = new Map(); _loading.set(hl, perHl); }
  let p = perHl.get(lang);
  if (!p) {
    p = LANGS[lang]()
      .then(mod => hl.loadLanguage(mod as Parameters<HighlighterCore['loadLanguage']>[0]))
      .then(() => true, () => false);
    perHl.set(lang, p);
  }
  return p;
}

export function initHighlighter(vscodeTheme: object | null): void {
  _hasVscodeTheme = !!vscodeTheme;

  // Always load github-dark/light as base (comprehensive scope coverage).
  // If a VSCode theme is provided, we'll add a composite theme on top.
  _promise = createHighlighterCore({
    themes: [
      import('shiki/themes/github-dark'),
      import('shiki/themes/github-light'),
    ],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }).then(async (hl) => {
    if (vscodeTheme) {
      try {
        // Build composite: base tokens as fallback + VSCode theme on top.
        // This ensures keywords, strings, etc. are always colored even if the
        // user's theme relies on semantic tokens and has sparse tokenColors.
        // The base MUST match the current light/dark appearance — falling
        // back to github-dark's pale-on-dark colors on a light background
        // (or vice versa) produces low-contrast, barely-visible text.
        const baseThemeName = document.body.classList.contains('vscode-light') ? 'github-light' : 'github-dark';
        const baseTheme = (hl as any).getTheme(baseThemeName) as any;
        const baseTokens: any[] = baseTheme?.tokenColors ?? baseTheme?.settings ?? [];
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

/** The preview lines of `content`, highlighted when its extension has a grammar (loaded on demand). */
export async function highlightLines(content: string, ext: string): Promise<string[]> {
  const lang = EXT[ext.toLowerCase()];
  if (!lang) { return escapeLines(content); }
  const hl = await getHighlighter();
  if (!(await ensureLanguage(hl, lang))) { return escapeLines(content); }
  return shikiLines(hl, lang, content);
}

function shikiLines(hl: HighlighterCore, lang: string, content: string): string[] {
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
