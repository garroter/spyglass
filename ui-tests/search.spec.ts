import { test, expect } from './support/harness';

// Fixture project (ui-tests/fixtures/project), matches for "needle" (smart-case, one result per line):
//   src/app.ts:3,4   src/util.ts:1,2   src/deep/thing.py:1,2 ("NEEDLE" on line 2)   README.md:3

test('typing a query lists every matching line in the project', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');

  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('#result-info')).toHaveText('7 results');
  const files = await page.locator('.result .result-file').allTextContents();
  expect(files.sort()).toEqual([
    'README.md',
    'src/app.ts', 'src/app.ts',
    'src/deep/thing.py', 'src/deep/thing.py',
    'src/util.ts', 'src/util.ts',
  ]);
});

test('an uppercase letter in the query makes the search case-sensitive (smart-case)', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('NEEDLE');

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result .result-file')).toHaveText('src/deep/thing.py');
});

test('Alt+C forces case-sensitive matching', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);

  await page.locator('#query').press('Alt+c');

  await expect(page.locator('.result')).toHaveCount(6); // thing.py's "NEEDLE" no longer matches
  await expect(page.locator('#case-btn')).toHaveClass(/active/);
});

test('an inline glob narrows the search to matching files', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle *.py');

  await expect(page.locator('.result')).toHaveCount(2);
  await expect(page.locator('.result .result-file')).toHaveText(['src/deep/thing.py', 'src/deep/thing.py']);
});

test('a query with no matches shows no results', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('zzzqqq');

  await expect(page.locator('#result-info')).toHaveText('0 results');
  await expect(page.locator('.result')).toHaveCount(0);
});

test('spyglass.maxResults caps the list and says so', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ settings: { maxResults: 3 } });
  await page.locator('#query').fill('needle');

  await expect(page.locator('.result')).toHaveCount(3);
  await expect(page.locator('#result-info')).toHaveText('3+ results');
  await expect(page.locator('#state-msg')).toContainText('Showing first 3 results');
});

test('the arrow keys move the selection', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  const query = page.locator('#query');
  await query.fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('.result').nth(0)).toHaveClass(/selected/);

  await query.press('ArrowDown');
  await expect(page.locator('.result').nth(1)).toHaveClass(/selected/);
  await expect(page.locator('.result.selected')).toHaveCount(1);

  await query.press('ArrowUp');
  await expect(page.locator('.result').nth(0)).toHaveClass(/selected/);
});

test('Enter opens the selected match at its line', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('TODO');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/app.ts'), line: 3 }]);
});

test('clicking a result opens it', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('NEEDLE');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('.result').click();

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/deep/thing.py'), line: 2 }]);
});

test('Ctrl+Enter opens the match in a split', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('TODO');
  await expect(s.page.locator('.result')).toHaveCount(1);

  await s.page.locator('#query').press('Control+Enter');

  await expect.poll(() => s.openedInSplit).toEqual([{ file: s.abs('src/app.ts'), line: 3 }]);
  expect(s.opened).toEqual([]);
});

test('the preview shows the file around the selected match', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('TODO');

  await expect(page.locator('#preview-content')).toContainText('const needle = helper();');
  await expect(page.locator('#preview-header')).toHaveText(/src\s*\/\s*app\.ts/);
});

test('Escape asks the host to close the popup', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').press('Escape');

  await expect.poll(() => s.closeCount()).toBe(1);
});

test('a selection containing </script> is shown as text and does not break the page', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialQuery: '</script><b id="injected">x</b>' });

  await expect(page.locator('#query')).toHaveValue('</script><b id="injected">x</b>');
  await expect(page.locator('#injected')).toHaveCount(0);
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);
});

test('highlights the right characters in a line with non-ASCII text', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('gęślą'); // src/pl.txt: "zażółć gęślą jaźń"

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result mark')).toHaveText('gęślą');
});

test('moving the selection previews the selected match at its own line', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('needle');
  await expect(s.page.locator('.result')).toHaveCount(7);

  await s.page.locator('#query').press('ArrowDown');
  await s.page.locator('#query').press('ArrowDown');

  // whichever match is third in the list, the preview must be for that one
  const row = s.page.locator('.result').nth(2);
  await expect(row).toHaveClass(/selected/);
  const rel = (await row.locator('.result-file').textContent())!;
  const line = Number((await row.locator('.result-line').textContent())!.replace(':', ''));
  await expect.poll(() => s.fromPage.filter(m => m.type === 'preview').at(-1)).toEqual({ type: 'preview', file: s.abs(rel), line });
});

