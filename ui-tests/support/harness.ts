import './vscodeMock'; // must stay first: it installs the `vscode` stub the src modules require
import { mock, Uri } from './vscodeMock';
import { test as base, expect, Page } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SpyglassController, SpyglassHost } from '../../src/SpyglassController';
import type { Scope } from '../../src/types';

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(ROOT, 'ui-tests', 'fixtures', 'project');
const ORIGIN = 'https://spyglass.test';

function findRg(): string {
  const candidates = [path.join(ROOT, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg'), 'rg'];
  const rg = candidates.find(c => spawnSync(c, ['--version']).status === 0);
  if (!rg) { throw new Error('ripgrep not found: run `npm install` or put `rg` on PATH'); }
  return rg;
}
const RG = findRg();

export interface OpenOptions {
  mode?: 'popup' | 'sidebar';
  viewport?: { width: number; height: number };
  initialQuery?: string;
  /** Open straight into this scope (what a scope command does). */
  initialScope?: Scope;
  /** Reopen the last search (what Spyglass: Resume Last Search does). */
  resume?: boolean;
  /** The editor the popup was opened from; `file` is relative to the project. */
  active?: { file: string; line?: number; character?: number };
  /** Make the project a git repository with src/util.ts modified and src/new.ts untracked. */
  git?: boolean;
  /** Runs after the VS Code mock is reset and the project exists; use it to script mocked API results. */
  beforeOpen?: (project: string) => void;
  /** `spyglass.*` settings, without the prefix: { maxResults: 50 }. */
  settings?: Record<string, unknown>;
  /** Initial globalState entries, e.g. { 'spyglass.recentCommands': ['git.commit'] }. */
  globalState?: Record<string, unknown>;
  /** Initial workspaceState entries, e.g. { 'spyglass.lastScope': 'files' }; may depend on the project dir. */
  state?: Record<string, unknown> | ((project: string) => Record<string, unknown>);
}

export interface Spyglass {
  page: Page;
  controller: SpyglassController;
  /** Temp copy of ui-tests/fixtures/project; tests may modify it. */
  project: string;
  /** Files the host was asked to open / open in a split, and how often it was asked to close. */
  opened: Array<{ file: string; line: number; column?: number }>;
  openedInSplit: Array<{ file: string; line: number; column?: number }>;
  closeCount: () => number;
  /** Every message the page posted to the host. */
  fromPage: Array<Record<string, unknown>>;
  /** The extension's workspaceState. */
  state: Map<string, unknown>;
  /** The extension's globalState. */
  globalState: Map<string, unknown>;
  abs: (rel: string) => string;
  read: (rel: string) => string;
}

export const test = base.extend<{ openSpyglass: (options?: OpenOptions) => Promise<Spyglass> }>({
  openSpyglass: async ({ page }, use) => {
    const cleanups: Array<() => void> = [];
    const pageProblems: string[] = [];
    page.on('pageerror', e => pageProblems.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') { pageProblems.push(`console.error: ${m.text()}`); } });

    await use(async (options = {}) => {
      mock.reset();
      const project = fs.mkdtempSync(path.join(os.tmpdir(), 'spyglass-ui-'));
      fs.cpSync(FIXTURE, project, { recursive: true });
      cleanups.push(() => fs.rmSync(project, { recursive: true, force: true }));

      if (options.git) {
        const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: project, stdio: 'ignore' });
        git('init', '-q');
        git('add', '-A');
        git('commit', '-q', '-m', 'init');
        fs.appendFileSync(path.join(project, 'src', 'util.ts'), '// changed\n');
        fs.writeFileSync(path.join(project, 'src', 'new.ts'), 'export {};\n');
      }

      mock.folders = [{ uri: Uri.file(project) }];
      options.beforeOpen?.(project);
      mock.settings['spyglass.ripgrepPath'] = RG;
      for (const [key, value] of Object.entries(options.settings ?? {})) { mock.settings[`spyglass.${key}`] = value; }

      const initialState = typeof options.state === 'function' ? options.state(project) : options.state;
      const state = new Map<string, unknown>(Object.entries(initialState ?? {}));
      const globalState = new Map<string, unknown>(Object.entries(options.globalState ?? {}));
      const context = {
        extensionUri: Uri.file(ROOT),
        globalStorageUri: Uri.file(path.join(project, '.storage')),
        subscriptions: [],
        workspaceState: {
          get: (key: string, fallback?: unknown) => (state.has(key) ? state.get(key) : fallback),
          update: async (key: string, value: unknown) => { state.set(key, value); },
        },
        globalState: {
          get: (key: string, fallback?: unknown) => (globalState.has(key) ? globalState.get(key) : fallback),
          update: async (key: string, value: unknown) => { globalState.set(key, value); },
        },
      };

      // --- page <-> host bridge ---------------------------------------------------------------
      const fromPage: Array<Record<string, unknown>> = [];
      const listeners = new Set<(msg: unknown) => unknown>();
      await page.exposeFunction('__spyglassToHost', async (msg: Record<string, unknown>) => {
        fromPage.push(msg);
        await Promise.all([...listeners].map(l => l(msg)));
      });
      await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        w.acquireVsCodeApi = () => ({
          postMessage: (m: unknown) => { void (w.__spyglassToHost as (m: unknown) => Promise<void>)(JSON.parse(JSON.stringify(m))); },
          getState: () => undefined,
          setState: () => undefined,
        });
      });

      let html = '';
      await page.route(`${ORIGIN}/**`, async route => {
        const { pathname } = new URL(route.request().url());
        const file = path.join(ROOT, pathname);
        if (pathname === '/index.html') { return route.fulfill({ contentType: 'text/html', body: html }); }
        if (pathname.startsWith('/media/') && fs.existsSync(file)) { return route.fulfill({ path: file }); }
        return route.fulfill({ status: 404, body: '' });
      });

      // Like VS Code, hold messages posted before the page has loaded and deliver them afterwards.
      let loaded = false;
      const early: unknown[] = [];
      const deliver = (msg: unknown) => page.evaluate(data => window.postMessage(data, '*'), msg).catch(() => undefined);
      const webview = {
        get html() { return html; },
        set html(value: string) { html = value; },
        cspSource: ORIGIN,
        asWebviewUri: (uri: Uri) => ({ toString: () => `${ORIGIN}/${path.relative(ROOT, uri.fsPath).split(path.sep).join('/')}` }),
        postMessage: async (msg: unknown) => { if (loaded) { await deliver(msg); } else { early.push(msg); } return true; },
        onDidReceiveMessage: (listener: (msg: unknown) => unknown) => {
          listeners.add(listener);
          return { dispose: () => { listeners.delete(listener); } };
        },
      };

      const opened: Spyglass['opened'] = [];
      const openedInSplit: Spyglass['openedInSplit'] = [];
      let closeCount = 0;
      const host = {
        webview,
        openFile: async (file: string, line: number, column?: number) => { opened.push({ file, line, column }); },
        openFileInSplit: async (file: string, line: number, column?: number) => { openedInSplit.push({ file, line, column }); },
        close: () => { closeCount++; },
      } as unknown as SpyglassHost;

      const sidebar = options.mode === 'sidebar';
      const controller = new SpyglassController(context as never, host, {
        sidebarMode: sidebar,
        initialQuery: options.initialQuery,
        initialScope: options.initialScope,
        resume: options.resume,
      });
      if (options.active) {
        const file = path.join(project, options.active.file);
        controller.setActiveContext({ dir: path.dirname(file), file, line: options.active.line ?? 0, character: options.active.character ?? 0 });
      }
      cleanups.push(() => controller.dispose());
      if (sidebar) { controller.refreshActiveContext(); }
      controller.mount();

      await page.setViewportSize(options.viewport ?? (sidebar ? { width: 500, height: 700 } : { width: 1100, height: 700 }));
      await page.goto(`${ORIGIN}/index.html`);
      await page.waitForSelector('#query');
      loaded = true;
      for (const msg of early.splice(0)) { await deliver(msg); }

      return {
        page, controller, project, opened, openedInSplit, fromPage, state, globalState,
        closeCount: () => closeCount,
        abs: rel => path.join(project, rel),
        read: rel => fs.readFileSync(path.join(project, rel), 'utf-8'),
      };
    });

    cleanups.reverse().forEach(fn => fn());
    expect(pageProblems, 'the page must not log errors or throw').toEqual([]);
  },
});

export { expect };
