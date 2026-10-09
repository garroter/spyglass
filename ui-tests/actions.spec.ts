import { test, expect } from './support/harness';

async function blurQuery(page: import('@playwright/test').Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test('Ctrl+Click multi-selects results and Shift+Enter opens them all', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('needle');
  await expect(s.page.locator('.result')).toHaveCount(7);

  await s.page.locator('.result').nth(0).click({ modifiers: ['Control'] });
  await s.page.locator('.result').nth(2).click({ modifiers: ['Control'] });
  await expect(s.page.locator('.result.multi-sel')).toHaveCount(2);
  expect(s.opened).toEqual([]); // Ctrl+Click selects, it does not open

  await s.page.locator('#query').press('Shift+Enter');

  await expect.poll(() => s.opened.length).toBe(2);
  expect(new Set(s.opened.map(o => `${o.file}:${o.line}`)).size).toBe(2);
});

test('Ctrl+Space toggles the selection when the query box is not focused', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);
  await blurQuery(page);

  await page.keyboard.press('Control+Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+Space');

  await expect(page.locator('.result.multi-sel')).toHaveCount(2);
});

test('Ctrl+Space toggles the selection while typing in the query box', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);

  await page.locator('#query').press('Control+Space');

  await expect(page.locator('.result.multi-sel')).toHaveCount(1);
});

test('Ctrl+A selects every result when the query box is not focused', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);
  await blurQuery(page);

  await page.keyboard.press('Control+a');

  await expect(page.locator('.result.multi-sel')).toHaveCount(7);
});

test('Alt+Y copies the absolute path of the selected result', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('TODO');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('#query').press('Alt+y');

  await expect.poll(() => s.fromPage.find(m => m.type === 'copyPath')).toEqual({ type: 'copyPath', path: s.abs('src/app.ts') });
});

test('Alt+L groups the results by file', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);

  await page.locator('#query').press('Alt+l');

  await expect(page.locator('.file-group-header')).toHaveCount(4);
  const counts = await page.locator('.file-group-header .fgh-count').allTextContents();
  expect(counts.sort()).toEqual(['1', '2', '2', '2']);
});

test('Alt+B saves the search as a bookmark that survives in workspace state', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('TODO');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('#query').press('Alt+b');

  await expect.poll(() => s.state.get('spyglass.savedSearches')).toEqual([{ query: 'TODO', scope: 'project' }]);
});

test('Alt+P pins the selected file', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('TODO');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('#query').press('Alt+p');

  await expect.poll(() => s.state.get('spyglass.pinnedFiles')).toEqual([s.abs('src/app.ts')]);
});

test('toolbar toggles are remembered in workspace state', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#regex-btn').click();

  await expect.poll(() => (s.state.get('spyglass.buttonPrefs') as { useRegex: boolean } | undefined)?.useRegex).toBe(true);
});

test('regex mode interprets the query as a regular expression', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('need.e');
  await expect(page.locator('.result')).toHaveCount(0); // literal "need.e" appears nowhere

  await page.locator('#regex-btn').click();

  await expect(page.locator('.result')).toHaveCount(7);
});

test('file group headers do not follow you into another list', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);
  await page.locator('#query').press('Alt+l');
  await expect(page.locator('.file-group-header').first()).toBeVisible();

  await page.locator('.tab[data-scope="files"]').click();

  await expect(page.locator('.file-group-header')).toHaveCount(0);
});
