import { test, expect } from './support/harness';

const files = (page: import('@playwright/test').Page) => page.locator('.result .result-file').allTextContents();

test('Recent lists the files you use most first, not only the newest', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    state: project => ({
      // most recently opened first: util, README, app - but app is the one you keep coming back to
      'spyglass.recentFiles': [`${project}/src/util.ts`, `${project}/README.md`, `${project}/src/app.ts`],
      'spyglass.fileFrecency': { [`${project}/src/app.ts`]: { score: 9, last: Date.now() } },
    }),
  });
  await page.locator('.tab[data-scope="recent"]').click();

  await expect(page.locator('.result')).toHaveCount(3);
  expect((await files(page))[0]).toContain('app.ts');
});

test('Recent with no frecency data keeps the plain recency order', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    state: project => ({ 'spyglass.recentFiles': [`${project}/README.md`, `${project}/src/util.ts`, `${project}/src/app.ts`] }),
  });
  await page.locator('.tab[data-scope="recent"]').click();

  const names = await files(page);
  expect(names.map(n => n.split('/').pop())).toEqual(['README.md', 'util.ts', 'app.ts']);
});

test('the sidebar re-reads Recent when you enter the scope, so files opened meanwhile show up', async ({ openSpyglass }) => {
  const s = await openSpyglass({
    mode: 'sidebar',
    state: project => ({ 'spyglass.recentFiles': [`${project}/src/util.ts`] }),
  });
  // the sidebar stays open while you work: these were opened after it was built
  s.state.set('spyglass.recentFiles', [`${s.project}/README.md`, `${s.project}/src/app.ts`, `${s.project}/src/util.ts`]);

  await s.page.locator('.tab[data-scope="recent"]').click();

  await expect(s.page.locator('.result')).toHaveCount(3);
});

test('Recent keeps filtering fuzzily as you type', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    state: project => ({ 'spyglass.recentFiles': [`${project}/README.md`, `${project}/src/util.ts`, `${project}/src/app.ts`] }),
  });
  await page.locator('.tab[data-scope="recent"]').click();
  await expect(page.locator('.result')).toHaveCount(3);

  await page.locator('#query').fill('utl');

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result')).toContainText('util.ts');
});

// With nothing typed, the Project scope lists the recent files instead of search results. They have no
// line, so they open at line 1 (search results open at their own line).
const recentState = (project: string) => ({
  'spyglass.recentFiles': [`${project}/src/util.ts`, `${project}/README.md`, `${project}/src/app.ts`],
});

test('with nothing typed, Enter opens the first recent file at line 1', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: recentState });
  await expect(s.page.locator('.result')).toHaveCount(3);

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/util.ts'), line: 1 }]);
});

test('with nothing typed, clicking a recent file opens it at line 1', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: recentState });
  await expect(s.page.locator('.result')).toHaveCount(3);

  await s.page.locator('.result').nth(1).click();

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('README.md'), line: 1 }]);
});

test('with nothing typed, Ctrl+Enter opens the selected recent file in a split at line 1', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: recentState });
  await expect(s.page.locator('.result')).toHaveCount(3);
  await s.page.locator('#query').press('ArrowDown');

  await s.page.locator('#query').press('Control+Enter');

  await expect.poll(() => s.openedInSplit).toEqual([{ file: s.abs('README.md'), line: 1 }]);
});

test('with nothing typed, recent files selected with Ctrl+Space all open at line 1', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: recentState });
  const query = s.page.locator('#query');
  await expect(s.page.locator('.result')).toHaveCount(3);

  await query.press('Control+Space');   // util.ts
  await query.press('ArrowDown');
  await query.press('ArrowDown');
  await query.press('Control+Space');   // app.ts
  await query.press('Shift+Enter');

  await expect.poll(() => s.opened.length).toBe(2);
  expect(s.opened).toEqual([
    { file: s.abs('src/util.ts'), line: 1 },
    { file: s.abs('src/app.ts'), line: 1 },
  ]);
});

test('with nothing typed, the preview asks for the selected recent file from line 1', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: recentState });
  await expect(s.page.locator('.result')).toHaveCount(3);

  await expect.poll(() => s.fromPage.filter(m => m.type === 'preview').at(-1)).toEqual({ type: 'preview', file: s.abs('src/util.ts'), line: 1 });
});

test('with nothing typed, moving the selection previews that recent file', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: recentState });
  await expect(s.page.locator('.result')).toHaveCount(3);

  await s.page.locator('#query').press('ArrowDown');

  await expect.poll(() => s.fromPage.filter(m => m.type === 'preview').at(-1)).toEqual({ type: 'preview', file: s.abs('README.md'), line: 1 });
});

