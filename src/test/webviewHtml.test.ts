import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { language: 'en', appRoot: '/mock/vscode' },
}));

import { renderWebviewHtml, getNonce, WebviewConfig } from '../webviewHtml';
import { getUiStrings } from '../i18n';

function makeConfig(overrides: Partial<WebviewConfig> = {}): WebviewConfig {
  return {
    KB: {
      navigateDown: 'ArrowDown', navigateUp: 'ArrowUp', open: 'Enter', close: 'Escape',
      toggleRegex: 'shift+alt+r', togglePreview: 'shift+alt+p',
    },
    INITIAL_QUERY: '',
    INITIAL_HISTORY: [],
    RECENT_FILES: [],
    PINNED_FILES: [],
    MAX_RESULTS: 200,
    DEFAULT_SCOPE: 'project',
    GROUP_RESULTS: false,
    BUTTON_PREFS: {
      useRegex: false, caseSensitive: false, wholeWord: false,
      replaceMode: false, showPreview: true, sortBy: 'default', includeMode: false, includeIgnored: false, multiline: false,
    },
    SAVED_SEARCHES: [],
    STRINGS: getUiStrings(),
    THEME: null,
    ...overrides,
  };
}

function render(over: { sidebarMode?: boolean; config?: Partial<WebviewConfig>; nonce?: string } = {}): string {
  return renderWebviewHtml({
    cspSource: 'vscode-webview://test',
    cssUri: 'vscode-webview://test/media/webview.css',
    jsUri: 'vscode-webview://test/media/webview.js',
    nonce: over.nonce ?? 'NONCE123',
    sidebarMode: over.sidebarMode ?? false,
    config: makeConfig(over.config),
  });
}

/** Reads back the object the page would see as `window.__spyglass`. */
function injectedConfig(html: string): WebviewConfig {
  const m = html.match(/window\.__spyglass = (.*?);<\/script>/s);
  if (!m) { throw new Error('config script not found'); }
  return JSON.parse(m[1]);
}

describe('renderWebviewHtml — mode', () => {
  it('marks the sidebar with the sidebar-mode body class', () => {
    expect(render({ sidebarMode: true })).toContain('<body class="sidebar-mode">');
  });

  it('leaves the popup body without the sidebar-mode class', () => {
    const html = render({ sidebarMode: false });
    expect(html).toContain('<body>');
    expect(html).not.toContain('sidebar-mode');
  });
});

describe('renderWebviewHtml — CSP and assets', () => {
  it('allows only the nonce-tagged inline script plus scripts from the webview origin', () => {
    const html = render({ nonce: 'abc123' });
    expect(html).toContain("script-src vscode-webview://test 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
    expect(html).toContain("default-src 'none'");
  });

  it('links the stylesheet and script it was given', () => {
    const html = render();
    expect(html).toContain('<link rel="stylesheet" href="vscode-webview://test/media/webview.css">');
    expect(html).toContain('<script src="vscode-webview://test/media/webview.js"></script>');
  });
});

describe('renderWebviewHtml — injected config', () => {
  it('round-trips the config the webview script reads', () => {
    const config = makeConfig({ INITIAL_QUERY: 'needle', MAX_RESULTS: 750, DEFAULT_SCOPE: 'files' });
    const html = renderWebviewHtml({
      cspSource: 'x', cssUri: 'c', jsUri: 'j', nonce: 'n', sidebarMode: false, config,
    });
    expect(injectedConfig(html)).toEqual(config);
  });

  it('cannot be broken out of by a query containing </script>', () => {
    const hostile = '</script><img src=x onerror=alert(1)>';
    const html = render({ config: { INITIAL_QUERY: hostile } });
    // the page's own two script tags are the only closing tags
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(injectedConfig(html).INITIAL_QUERY).toBe(hostile);
  });
});

describe('renderWebviewHtml — localized text and tooltips', () => {
  it('renders the localized strings it is given', () => {
    const strings = { ...getUiStrings(), searchPlaceholder: 'PLACEHOLDER-SENTINEL' };
    expect(render({ config: { STRINGS: strings } })).toContain('placeholder="PLACEHOLDER-SENTINEL"');
  });

  it('shows the configured shortcut in the regex and preview tooltips', () => {
    const s = getUiStrings();
    const html = render({ config: { KB: { ...makeConfig().KB, toggleRegex: 'ctrl+r', togglePreview: 'ctrl+p' } } });
    expect(html).toContain(`data-tooltip="${s.regex} — ctrl+r"`);
    expect(html).toContain(`data-tooltip="${s.togglePreview} — ctrl+p"`);
  });

  it('falls back to the default shortcut in tooltips when none is configured', () => {
    const s = getUiStrings();
    const html = render({ config: { KB: { ...makeConfig().KB, toggleRegex: '', togglePreview: '' } } });
    expect(html).toContain(`data-tooltip="${s.regex} — Shift+Alt+R"`);
    expect(html).toContain(`data-tooltip="${s.togglePreview} — Shift+Alt+P"`);
  });
});

describe('getNonce', () => {
  it('returns 32 alphanumeric characters', () => {
    expect(getNonce()).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('differs between calls', () => {
    expect(getNonce()).not.toBe(getNonce());
  });
});
