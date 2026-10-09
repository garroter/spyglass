import { test, expect } from './support/harness';

// src/app.ts, lines 3-4:
//   const needle = helper(); // TODO: rename needle
//   return needle;
// so this regex matches from the end of line 3 into line 4.
const SPANNING = 'rename needle\\n\\s+return';

test('without multiline, a pattern that spans lines finds nothing', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#regex-btn').click();
  await page.locator('#query').fill(SPANNING);

  await expect(page.locator('#result-info')).toHaveText('0 results');
  await expect(page.locator('.result')).toHaveCount(0);
});

test('Alt+M lets a pattern match across lines', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill(SPANNING);
  await page.locator('#query').press('Alt+m');

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result .result-file')).toHaveText('src/app.ts');
  await expect(page.locator('.result .result-line')).toHaveText(':3');
});

test('multiline uses regular expressions even when the regex toggle is off', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await expect(page.locator('#regex-btn')).not.toHaveClass(/active/);
  await page.locator('#query').fill(SPANNING);

  await page.locator('#query').press('Alt+m');

  await expect(page.locator('.result')).toHaveCount(1);
});

test('the row shows the first line, highlights what matched there, and says how many lines follow', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill(SPANNING);
  await page.locator('#query').press('Alt+m');
  await expect(page.locator('.result')).toHaveCount(1);

  await expect(page.locator('.result .result-text')).toContainText('const needle = helper(); // TODO: rename needle');
  await expect(page.locator('.result .result-text')).not.toContainText('return needle;');
  await expect(page.locator('.result mark')).toHaveText('rename needle');
  await expect(page.locator('.result .ml-badge')).toHaveText('+1');
});

test('a single-line result carries no badge', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('TODO');
  await page.locator('#query').press('Alt+m');

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result .ml-badge')).toHaveCount(0);
});

test('the badge also shows in the grouped list', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill(SPANNING);
  await page.locator('#query').press('Alt+m');
  await page.locator('#query').press('Alt+l');

  await expect(page.locator('.result--grouped .ml-badge')).toHaveText('+1');
});

test('Enter opens a multiline match at its first line', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill(SPANNING);
  await s.page.locator('#query').press('Alt+m');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/app.ts'), line: 3 }]);
});

test('turning multiline off goes back to line-by-line matching', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill(SPANNING);
  await page.locator('#query').press('Alt+m');
  await expect(page.locator('.result')).toHaveCount(1);

  await page.locator('#query').press('Alt+m');

  await expect(page.locator('.result')).toHaveCount(0);
});

test('the toolbar button toggles it and says which key does', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill(SPANNING);
  await expect(page.locator('#multiline-btn')).toHaveAttribute('data-tooltip', /multiline.*Alt\+M/i);

  await page.locator('#more-btn').click();
  await page.locator('#multiline-btn').click();

  await expect(page.locator('#multiline-btn')).toHaveClass(/active/);
  await expect(page.locator('.result')).toHaveCount(1);
});

test('an active toggle is visible even while the secondary toolbar is collapsed', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await expect(page.locator('body')).not.toHaveClass(/multiline/);

  await page.locator('#query').press('Alt+m');

  await expect(page.locator('#secondary-toolbar')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/multiline/);
});

test('the choice is remembered with the other toolbar preferences', async ({ openSpyglass }) => {
  const s = await openSpyglass();

  await s.page.locator('#query').press('Alt+m');

  await expect.poll(() => (s.state.get('spyglass.buttonPrefs') as { multiline?: boolean } | undefined)?.multiline).toBe(true);
});

test('a remembered choice is applied when Spyglass reopens', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.buttonPrefs': { multiline: true } } });
  await page.locator('#query').fill(SPANNING);

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('#multiline-btn')).toHaveClass(/active/);
});

test('replace is unavailable in multiline mode: the mode switches off and its button is disabled', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').press('Alt+r');
  await expect(page.locator('#replace-row')).toBeVisible();

  await page.locator('#query').press('Alt+m');

  await expect(page.locator('#replace-row')).toBeHidden();
  await expect(page.locator('#replace-btn')).toBeDisabled();
});

test('Alt+R does not bring replace back while multiline is on, and explains why', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').press('Alt+m');

  await page.locator('#query').press('Alt+r');

  await expect(page.locator('#replace-row')).toBeHidden();
  await expect(page.locator('#spyglass-toast')).toContainText(/multiline/i);
});

test('a saved combination of replace and multiline reopens with multiline only', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.buttonPrefs': { replaceMode: true, multiline: true } } });

  await expect(page.locator('#multiline-btn')).toHaveClass(/active/);
  await expect(page.locator('#replace-row')).toBeHidden();
  await expect(page.locator('#replace-btn')).toBeDisabled();
});

test('replace works again once multiline is off', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').press('Alt+m');
  await page.locator('#query').press('Alt+m');

  await expect(page.locator('#replace-btn')).toBeEnabled();
  await page.locator('#query').press('Alt+r');
  await expect(page.locator('#replace-row')).toBeVisible();
});

test('multiline does not apply to the Files scope, whose button is disabled there', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();

  await expect(page.locator('#multiline-btn')).toBeDisabled();
});
