import { test, expect, type OpenOptions, type Spyglass } from './support/harness';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Moving around without leaving the home row, the way Telescope and Emacs do it, plus paging,
// jumping to the ends, scrolling the preview, and going back a tab.
//
// "needle" matches 7 lines in the fixture project.

const selectedIndex = (page: import('@playwright/test').Page) =>
  page.locator('.result').evaluateAll(rows => rows.findIndex(r => r.classList.contains('selected')));

async function sevenResults(openSpyglass: (options?: OpenOptions) => Promise<Spyglass>, viewport?: { width: number; height: number }) {
  const s = await openSpyglass(viewport ? { viewport } : {});
  await s.page.locator('#query').fill('needle');
  await expect(s.page.locator('.result')).toHaveCount(7);
  return s;
}

test('Ctrl+J and Ctrl+N move down, Ctrl+K and Ctrl+P move up, from the query box', async ({ openSpyglass }) => {
  const { page } = await sevenResults(openSpyglass);
  const q = page.locator('#query');

  await q.press('Control+j');
  expect(await selectedIndex(page)).toBe(1);
  await q.press('Control+n');
  expect(await selectedIndex(page)).toBe(2);
  await q.press('Control+k');
  expect(await selectedIndex(page)).toBe(1);
  await q.press('Control+p');
  expect(await selectedIndex(page)).toBe(0);
});

test('PageDown and PageUp move a page of results at a time', async ({ openSpyglass }) => {
  const { page } = await sevenResults(openSpyglass, { width: 1100, height: 420 });
  const q = page.locator('#query');

  await q.press('PageDown');
  const afterDown = await selectedIndex(page);
  expect(afterDown).toBeGreaterThan(1);

  await q.press('PageUp');
  expect(await selectedIndex(page)).toBe(0);
});

test('Ctrl+End and Ctrl+Home jump to the last and the first result', async ({ openSpyglass }) => {
  const { page } = await sevenResults(openSpyglass);
  const q = page.locator('#query');

  await q.press('Control+End');
  expect(await selectedIndex(page)).toBe(6);
  await q.press('Control+Home');
  expect(await selectedIndex(page)).toBe(0);
});

test('Ctrl+D and Ctrl+U scroll the preview down and up', async ({ openSpyglass }) => {
  const s = await openSpyglass({
    initialScope: 'files',
    viewport: { width: 1100, height: 400 },
    beforeOpen: project => {
      const lines = Array.from({ length: 300 }, (_, i) => `export const line${i + 1} = ${i + 1};`);
      fs.writeFileSync(path.join(project, 'src', 'long.ts'), lines.join('\n') + '\n');
    },
  });
  await s.page.locator('#query').fill('long.ts');
  await expect(s.page.locator('#preview-content')).toContainText('line300');
  const scrollTop = () => s.page.locator('#preview-content').evaluate(el => el.scrollTop);
  const start = await scrollTop();

  await s.page.locator('#query').press('Control+d');
  await expect.poll(scrollTop).toBeGreaterThan(start);
  const down = await scrollTop();

  await s.page.locator('#query').press('Control+u');
  await expect.poll(scrollTop).toBeLessThan(down);
});

test('Shift+Tab goes back a tab, wrapping around', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files' });
  const q = page.locator('#query');

  await q.press('Shift+Tab');
  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'openFiles');
  await q.press('Shift+Tab');
  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');
  await q.press('Shift+Tab');
  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'refs');
});

test('the same keys work when the result list has the focus', async ({ openSpyglass }) => {
  const { page } = await sevenResults(openSpyglass);
  await page.locator('.result').nth(0).click({ modifiers: ['Control'] }); // focus leaves the query box
  await page.locator('body').focus();

  await page.keyboard.press('Control+End');
  expect(await selectedIndex(page)).toBe(6);
  await page.keyboard.press('Control+k');
  expect(await selectedIndex(page)).toBe(5);
});

test('the keyboard shortcuts list names the new keys', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  const help = page.locator('#shortcuts-overlay');

  await expect(help).toContainText('Ctrl');
  for (const key of ['J', 'K', 'N', 'P', 'PgDn', 'Home', 'End', 'D', 'U']) {
    await expect(help.locator('kbd', { hasText: new RegExp(`^${key}$`) }).first()).toHaveCount(1);
  }
  await expect(help).toContainText(/previous scope/i);
  await expect(help).toContainText(/resume/i);
});
