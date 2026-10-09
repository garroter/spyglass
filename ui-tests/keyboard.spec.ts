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

test('results that arrive after you moved keep your selection (results stream in batches)', async ({ openSpyglass, page: p }) => {
  // remember the last batch of results the extension sends, to replay it late
  await p.addInitScript(() => {
    const deliver = window.postMessage.bind(window);
    window.postMessage = ((data: { type?: string }, origin: string) => {
      if (data?.type === 'results') { (window as unknown as { __lastResults: unknown }).__lastResults = data; }
      deliver(data, origin);
    }) as typeof window.postMessage;
  });
  const { page } = await sevenResults(openSpyglass);
  await page.locator('#query').press('ArrowDown');
  await page.locator('#query').press('ArrowDown');
  expect(await selectedIndex(page)).toBe(2);

  // the final batch of the same search arrives after you moved, as it does in a big project
  await page.evaluate(() => window.postMessage((window as unknown as { __lastResults: unknown }).__lastResults, '*'));
  await page.waitForTimeout(100);

  expect(await selectedIndex(page)).toBe(2);
});

test('a row redrawn under a resting mouse does not take the selection from the keyboard', async ({ openSpyglass }) => {
  const { page } = await sevenResults(openSpyglass);
  await page.locator('.result').nth(0).hover(); // the mouse rests on the first row
  await page.locator('#query').press('Control+End');
  expect(await selectedIndex(page)).toBe(6);

  // what the browser does when the list is redrawn under the cursor: events for the new row, at
  // the same position the mouse already rests on
  const box = (await page.locator('.result').nth(0).boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, bubbles: true };
  await page.locator('.result').nth(0).dispatchEvent('mouseenter', at);
  await page.locator('.result').nth(0).dispatchEvent('mousemove', at);

  expect(await selectedIndex(page)).toBe(6);
});

test('moving the mouse over a row still selects it', async ({ openSpyglass }) => {
  const { page } = await sevenResults(openSpyglass);
  await page.locator('#query').press('Control+End');

  await page.locator('.result').nth(3).hover();

  await expect.poll(() => selectedIndex(page)).toBe(3);
});
