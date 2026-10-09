import { test, expect } from './support/harness';
import { mock } from './support/vscodeMock';
import type { Page } from '@playwright/test';

// The Commands list: `>` in Files or Recent (or Spyglass: Find Commands) lists VS Code commands,
// Enter runs one, recently run ones come first, and the last row hands over to VS Code's own
// Command Palette.

const gitExtension = {
  id: 'vscode.git',
  extensionPath: '/nonexistent/git',
  packageJSON: {
    name: 'git',
    displayName: 'Git',
    contributes: {
      commands: [
        { command: 'git.commit', title: 'Commit', category: 'Git' },
        { command: 'git.push', title: 'Push', category: 'Git' },
        { command: 'git.hidden', title: 'Hidden', category: 'Git' },
      ],
      menus: { commandPalette: [{ command: 'git.hidden', when: 'false' }] },
      keybindings: [{ command: 'git.commit', key: 'ctrl+enter', mac: 'cmd+enter' }],
    },
  },
};

const withCommands = () => {
  mock.extensions = [gitExtension];
  mock.commandIds = ['git.commit', 'git.push', 'git.hidden', 'workbench.action.toggleSidebarVisibility', 'editor.action.formatDocument'];
};

const labels = (page: Page) => page.locator('.result:not(.cmd-show-all) .cmd-label').allTextContents();

test('> in Files lists the commands, keeping the >', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files', beforeOpen: withCommands });
  await page.locator('#query').fill('>');

  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'commands');
  await expect(page.locator('.tab[data-scope="commands"]')).toBeVisible();
  await expect(page.locator('#query')).toHaveValue('>');
  await expect.poll(() => labels(page)).toContain('Git: Commit');
  await expect(page.locator('#query')).toHaveAttribute('placeholder', /command/i);
});

test('deleting the > goes back to the file list, and the Commands tab goes away', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files', beforeOpen: withCommands });
  await page.locator('#query').fill('>');
  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'commands');

  await page.locator('#query').fill('util');

  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'files');
  await expect(page.locator('.tab[data-scope="commands"]')).toBeHidden();
  await expect(page.locator('.result').first()).toContainText('util.ts');
});

test('the Commands tab is not there until it is used', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ beforeOpen: withCommands });

  await expect(page.locator('.tab[data-scope="commands"]')).toBeHidden();
});

test('> stays plain text in a text search', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'project', beforeOpen: withCommands });
  await page.locator('#query').fill('>needle');
  await page.waitForTimeout(300);

  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');
});

test('each row reads "Category: Title" with its key; hidden commands are left out', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });

  await expect.poll(() => labels(page)).toEqual(['Editor: Format Document', 'Git: Commit', 'Git: Push', 'View: Toggle Primary Side Bar Visibility']);
  const commit = page.locator('.result', { hasText: 'Git: Commit' });
  await expect(commit.locator('.cmd-key')).toHaveText('Ctrl+Enter');
  await expect(page.locator('#result-info')).toHaveText('4 commands');
});

test('typing filters the commands and marks the matched letters', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });
  await expect.poll(() => labels(page)).toHaveLength(4);

  await page.locator('#query').fill('gpu');

  await expect.poll(() => labels(page)).toEqual(['Git: Push']);
  await expect(page.locator('.result .cmd-label mark').first()).toHaveText('G');
});

test('Enter runs the selected command', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });
  await s.page.locator('#query').fill('commit');
  await expect.poll(() => labels(s.page)).toEqual(['Git: Commit']);

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => mock.commands.map(c => c[0])).toContain('git.commit');
  expect(s.closeCount()).toBe(1);
  await expect.poll(() => s.globalState.get('spyglass.recentCommands')).toEqual(['git.commit']);
});

test('the commands you ran come first', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    initialScope: 'commands',
    beforeOpen: withCommands,
    globalState: { 'spyglass.recentCommands': ['git.push', 'workbench.action.toggleSidebarVisibility'] },
  });

  await expect.poll(() => labels(page)).toEqual(['Git: Push', 'View: Toggle Primary Side Bar Visibility', 'Editor: Format Document', 'Git: Commit']);
});

test('the last row opens VS Code\'s own Command Palette with the same text', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });
  await s.page.locator('#query').fill('git');
  await expect(s.page.locator('.result').last()).toHaveText(/Show all commands for 'git'/);

  await s.page.locator('.result').last().click();

  await expect.poll(() => mock.commands).toContainEqual(['workbench.action.quickOpen', '>git']);
});

test('when nothing matches, only the hand-over row is left, and Enter takes it', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });
  await expect.poll(() => labels(page)).toHaveLength(4);
  await page.locator('#query').fill('zzzz');

  await expect(page.locator('.result')).toHaveCount(1);
  await page.locator('#query').press('Enter');

  await expect.poll(() => mock.commands).toContainEqual(['workbench.action.quickOpen', '>zzzz']);
});

test('the preview pane shows the selected command\'s id and where it comes from', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });
  await page.locator('#query').fill('commit');
  await expect.poll(() => labels(page)).toEqual(['Git: Commit']);

  await expect(page.locator('#preview-content')).toContainText('git.commit');
  await expect(page.locator('#preview-content')).toContainText('Git');
  await expect(page.locator('#preview-content')).toContainText('Ctrl+Enter');
});

test('the text search toolbar is hidden in Commands', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'commands', beforeOpen: withCommands });

  await expect(page.locator('#regex-btn')).toBeHidden();
  await expect(page.locator('#replace-btn')).toBeHidden();
});

test('Tab leaves Commands for the next scope, and never lands on it', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files', beforeOpen: withCommands });
  await page.locator('#query').fill('>');
  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'commands');

  await page.locator('#query').press('Tab');
  await expect(page.locator('.tab.active')).not.toHaveAttribute('data-scope', 'commands');
  await expect(page.locator('.tab[data-scope="commands"]')).toBeHidden();

  for (let i = 0; i < 10; i++) {
    await page.locator('#query').press('Tab');
    await expect(page.locator('.tab.active')).not.toHaveAttribute('data-scope', 'commands');
  }
});

test('Enter before the list has arrived does nothing', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files', beforeOpen: withCommands });
  // hold back the host's answer
  await s.page.evaluate(() => {
    // the harness delivers host messages with window.postMessage: drop the list of commands
    const deliver = window.postMessage.bind(window);
    window.postMessage = ((data: { type?: string }, origin: string) => {
      if (data?.type !== 'commands') { deliver(data, origin); }
    }) as typeof window.postMessage;
  });
  await s.page.locator('#query').fill('>');
  await s.page.locator('#query').press('Enter');
  await s.page.waitForTimeout(200);

  expect(mock.commands.map(c => c[0])).toEqual([]);
  expect(s.closeCount()).toBe(0);
});

test('after > in Files the preview pane describes the command, not a file previewed a moment before', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files', beforeOpen: withCommands });
  await expect(page.locator('.result').first()).toBeVisible(); // a file is selected; its preview is on its way
  await page.locator('#query').fill('>');
  await expect.poll(() => labels(page)).toHaveLength(4);

  await page.waitForTimeout(300); // let any late file preview arrive
  await expect(page.locator('#preview-content')).toContainText('editor.action.formatDocument');
  await expect(page.locator('#preview-content .pline')).toHaveCount(0);
});

test('file actions do nothing in Commands, even with results left from an earlier search', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'project', beforeOpen: withCommands });
  await s.page.locator('#query').fill('needle');
  await expect(s.page.locator('.result')).toHaveCount(7);
  await s.page.locator('.tab[data-scope="files"]').click();
  await s.page.locator('#query').fill('>');
  await expect.poll(() => labels(s.page)).toHaveLength(4);
  const q = s.page.locator('#query');

  await q.press('Control+Enter');  // open in split
  await q.press('Alt+y');          // copy path
  await q.press('Control+Space');  // multi-select
  await q.press('Shift+Enter');    // open all selected
  await s.page.locator('.result').first().click({ button: 'right' });
  await s.page.waitForTimeout(200);

  expect(s.openedInSplit).toEqual([]);
  expect(s.opened).toEqual([]);
  expect(mock.clipboard).toBe('');
  await expect(s.page.locator('#ctx-menu')).not.toHaveClass(/visible/);
});
