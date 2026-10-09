import { test } from '../../ui-tests/support/harness';
import { mock, Uri } from '../../ui-tests/support/vscodeMock';
import type { Page } from '@playwright/test';
import * as path from 'node:path';
import { CORE_COMMANDS } from '../../src/coreCommands';

// README screenshots of the popup and the sidebar, searching this repository.

const ROOT = path.resolve(__dirname, '../..');
const out = (name: string) => path.join(ROOT, 'images', `screenshot-${name}.png`);

// VS Code's default Dark Modern theme, as the webview receives it
const DARK_MODERN = `:root{
  --vscode-font-family: system-ui, "Segoe UI", sans-serif; --vscode-font-size: 13px;
  --vscode-editor-font-family: "JetBrains Mono", "DejaVu Sans Mono", monospace; --vscode-editor-font-size: 14px;
  --vscode-editor-background:#1f1f1f; --vscode-editor-foreground:#cccccc; --vscode-editorWidget-background:#202020;
  --vscode-editorWidget-border:#313131; --vscode-widget-border:#313131; --vscode-editorGroup-border:#ffffff17;
  --vscode-descriptionForeground:#9d9d9d; --vscode-input-placeholderForeground:#989898; --vscode-input-background:#313131;
  --vscode-list-hoverBackground:#2a2d2e; --vscode-list-activeSelectionBackground:#04395e; --vscode-list-activeSelectionForeground:#ffffff;
  --vscode-focusBorder:#0078d4; --vscode-scrollbarSlider-background:#79797966; --vscode-widget-shadow:#0000005c;
  --vscode-editor-lineHighlightBackground:#ffffff0a; --vscode-button-foreground:#ffffff;
  --vscode-editor-findMatchHighlightBackground:#9e6a03aa; --vscode-editorLineNumber-activeForeground:#cccccc;
  --vscode-editorGutter-modifiedBackground:#0078d4; --vscode-editorHoverWidget-background:#202020;
  --vscode-editorHoverWidget-border:#454545; --vscode-editorHoverWidget-foreground:#cccccc;
  --vscode-list-highlightForeground:#2aaaff; --vscode-list-focusHighlightForeground:#2aaaff;
} body { font-size: 13px; }`;

async function dress(page: Page): Promise<void> {
  await page.evaluate(css => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    document.body.classList.add('vscode-dark');
    document.body.classList.remove('vscode-light');
  }, DARK_MODERN);
}

// search this repository instead of the small test fixture, leaving out the screenshots script,
// the design docs and the tests so the results show the extension's own code
const thisRepo = () => {
  mock.folders = [{ uri: Uri.file(ROOT) }];
  mock.settings['spyglass.exclude'] = ['.git', 'node_modules', 'out', 'dist', 'media', '*.lock', 'scripts', 'docs', 'src/test', 'ui-tests', 'CHANGELOG.md', 'README.md', 'CONTRIBUTING.md'];
};

const settle = (page: Page) => page.waitForTimeout(900);

test('popup: text search with preview', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ viewport: { width: 1280, height: 720 }, beforeOpen: thisRepo });
  await dress(page);
  await page.locator('#query').fill('registerCommand');
  await settle(page);
  await page.locator('#query').press('ArrowDown');
  await settle(page);
  await page.screenshot({ path: out('popup-search') });
});

test('popup: go to a file at a line', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files', viewport: { width: 1280, height: 720 }, beforeOpen: thisRepo });
  await dress(page);
  await page.locator('#query').fill('esbuild:24');
  await settle(page);
  await page.screenshot({ path: out('popup-goto') });
});

test('popup: run a command', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    initialScope: 'files',
    viewport: { width: 1280, height: 720 },
    beforeOpen: () => {
      thisRepo();
      mock.extensions = [{
        id: 'vscode.git', extensionPath: '/nonexistent', packageJSON: {
          name: 'git', displayName: 'Git', contributes: {
            commands: [
              { command: 'git.commit', title: 'Commit', category: 'Git' },
              { command: 'git.push', title: 'Push', category: 'Git' },
              { command: 'git.pull', title: 'Pull', category: 'Git' },
              { command: 'git.stash', title: 'Stash', category: 'Git' },
              { command: 'git.checkout', title: 'Checkout to...', category: 'Git' },
            ],
          },
        },
      }];
      mock.commandIds = [...CORE_COMMANDS.map(c => c.id), 'git.commit', 'git.push', 'git.pull', 'git.stash', 'git.checkout'];
    },
    globalState: { 'spyglass.recentCommands': ['editor.action.toggleWordWrap', 'git.commit'] },
  });
  await dress(page);
  await page.locator('#query').fill('>tog');
  await settle(page);
  await page.screenshot({ path: out('popup-commands') });
});

test('popup: the options menu', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ viewport: { width: 1280, height: 720 }, beforeOpen: thisRepo });
  await dress(page);
  await page.locator('#query').fill('fuzzyScore');
  await settle(page);
  await page.locator('#more-btn').click();
  await page.locator('#group-btn').click();
  await page.waitForTimeout(2600); // let the "Grouped by file" toast fade
  await page.screenshot({ path: out('popup-menu') });
});

test('sidebar', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 460, height: 820 }, beforeOpen: thisRepo });
  await dress(page);
  await page.locator('#query').fill('setScope');
  await settle(page);
  await page.screenshot({ path: out('sidebar') });
});
