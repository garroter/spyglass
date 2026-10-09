import { test, expect } from './support/harness';

test('the Files scope waits for you to type, then filters project files fuzzily', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();
  await expect(page.locator('#state-msg')).toContainText('Start typing to search files');
  await expect(page.locator('.result')).toHaveCount(0);

  await page.locator('#query').fill('utl');

  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result')).toContainText('util.ts');
});

test('the Files scope matches across path segments', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();

  await page.locator('#query').fill('ts');

  const names = await page.locator('.result').allTextContents();
  expect(names.some(n => n.includes('app.ts'))).toBe(true);
  expect(names.some(n => n.includes('util.ts'))).toBe(true);
  expect(names.some(n => n.includes('README.md'))).toBe(false);
});

test('switching scope is remembered for the next time', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('.tab[data-scope="files"]').click();

  await expect.poll(() => s.state.get('spyglass.lastScope')).toBe('files');
});

test('Spyglass reopens in the scope it was last used in', async ({ openSpyglass, page: p }) => {
  // Nothing else may redraw the list: the page has to show the right empty state by itself
  // (a late git status used to do it, so this passed or failed depending on timing).
  await p.addInitScript(() => {
    const deliver = window.postMessage.bind(window);
    window.postMessage = ((data: { type?: string }, origin: string) => {
      if (data?.type !== 'gitStatus') { deliver(data, origin); }
    }) as typeof window.postMessage;
  });
  const { page } = await openSpyglass({ state: { 'spyglass.lastScope': 'files' } });

  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'files');
  await expect(page.locator('#state-msg')).toContainText('Start typing to search files');
});

test('Tab cycles to the next scope', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');

  await s.page.locator('#query').press('Tab');

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'openFiles');
  await expect.poll(() => s.state.get('spyglass.lastScope')).toBe('openFiles');
});

test('the Dir scope searches the directory of the active file', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  s.controller.setActiveContext({ dir: s.abs('src/deep'), file: s.abs('src/deep/thing.py'), line: 0, character: 0 });

  await s.page.locator('.tab[data-scope="here"]').click();
  await s.page.locator('#query').fill('needle');

  await expect(s.page.locator('.result')).toHaveCount(2);
  await expect(s.page.locator('.result .result-file')).toHaveText(['thing.py', 'thing.py']);
});

test('the Recent scope lists recently opened files', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    state: project => ({ 'spyglass.recentFiles': [`${project}/src/util.ts`, `${project}/README.md`] }),
  });
  await page.locator('.tab[data-scope="recent"]').click();

  await expect(page.locator('.result')).toHaveCount(2);
  await expect(page.locator('.result').first()).toContainText('util.ts');
});

test('history: Ctrl+Up / Ctrl+Down walk through previous queries and back, keeping the draft', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.searchHistory': ['newest', 'older'] } });
  const query = page.locator('#query');
  await query.fill('my draft');

  await query.press('Control+ArrowUp');
  await expect(query).toHaveValue('newest');
  await query.press('Control+ArrowUp');
  await expect(query).toHaveValue('older');
  await query.press('Control+ArrowUp');
  await expect(query).toHaveValue('older'); // already at the oldest entry
  await query.press('Control+ArrowDown');
  await expect(query).toHaveValue('newest');
  await query.press('Control+ArrowDown');
  await expect(query).toHaveValue('my draft');
});

test('history: Ctrl+Down with nothing newer keeps what you typed', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.searchHistory': ['newest', 'older'] } });
  const query = page.locator('#query');
  await query.fill('my draft');

  await query.press('Control+ArrowDown');

  await expect(query).toHaveValue('my draft');
});

test('history: typing after recalling a query starts browsing from the newest again', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.searchHistory': ['newest', 'older'] } });
  const query = page.locator('#query');
  await query.press('Control+ArrowUp');
  await query.press('Control+ArrowUp');
  await expect(query).toHaveValue('older');

  await query.fill('x');
  await query.press('Control+ArrowUp');

  await expect(query).toHaveValue('newest');
});

test('history: a query typed earlier in the same session can be recalled', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar' });
  const query = page.locator('#query');
  await query.fill('TODO');
  await expect(page.locator('.result')).toHaveCount(1);
  await query.fill('');

  await query.press('Control+ArrowUp');

  await expect(query).toHaveValue('TODO');
});

test('history: recalling a query runs it', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: { 'spyglass.searchHistory': ['TODO', 'needle'] } });
  const query = s.page.locator('#query');

  await query.press('Control+ArrowUp');

  await expect(query).toHaveValue('TODO');
  await expect(s.page.locator('.result')).toHaveCount(1);
  await expect(s.page.locator('.result .result-file')).toHaveText('src/app.ts');
  await query.press('Enter');
  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/app.ts'), line: 3 }]);
});

test('history: going back to the draft runs the draft again', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.searchHistory': ['TODO'] } });
  const query = page.locator('#query');
  await query.fill('NEEDLE');
  await expect(page.locator('.result .result-file')).toHaveText('src/deep/thing.py');

  await query.press('Control+ArrowUp');
  await expect(page.locator('.result .result-file')).toHaveText('src/app.ts');
  await query.press('Control+ArrowDown');

  await expect(query).toHaveValue('NEEDLE');
  await expect(page.locator('.result .result-file')).toHaveText('src/deep/thing.py');
});

test('history: a recalled query is not recorded again, so your place in the list holds still', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: { 'spyglass.searchHistory': ['TODO', 'needle', 'NEEDLE'] } });
  const query = s.page.locator('#query');

  await query.press('Control+ArrowUp');
  await query.press('Control+ArrowUp');
  await expect(query).toHaveValue('needle');
  await expect(s.page.locator('.result')).toHaveCount(7); // the recalled search has finished
  await query.press('Control+ArrowDown');

  await expect(query).toHaveValue('TODO'); // still one step from the newest entry
  expect(s.state.get('spyglass.searchHistory')).toEqual(['TODO', 'needle', 'NEEDLE']);
});

test('history: Ctrl+Up skips the entry that is exactly what is already in the box', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  const query = page.locator('#query');
  await query.fill('TODO');
  await expect(page.locator('.result')).toHaveCount(1);
  await query.fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);

  // "needle" is now both the text on screen and the newest history entry
  await query.press('Control+ArrowUp');

  await expect(query).toHaveValue('TODO');
});

test('spyglass.maxResults also caps the Files list', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ settings: { maxResults: 3 } });
  await page.locator('.tab[data-scope="files"]').click();

  await page.locator('#query').fill('t'); // 5 of the fixture's files contain a "t": more than the cap of 3

  await expect(page.locator('.result')).toHaveCount(3);
  await expect(page.locator('#result-info')).toHaveText('3+ files');
});

test('Files shows the best match first', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();

  await page.locator('#query').fill('app'); // src/app.ts starts with it; other paths only contain the letters

  await expect(page.locator('.result').first()).toContainText('app.ts');
});

test('Files matches capital letters in a path when you type them in lower case', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();

  await page.locator('#query').fill('readme'); // the file is README.md

  await expect(page.locator('.result')).toContainText('README.md');
});

test('Files matches file names with non-ASCII letters', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();

  await page.locator('#query').fill('pl.t');

  await expect(page.locator('.result')).toContainText('pl.txt');
});

test('narrowing the query by typing and widening it by deleting keeps the list right', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();
  const query = page.locator('#query');

  await query.pressSequentially('src/u');
  await expect(page.locator('.result')).toHaveCount(1);       // src/util.ts
  await query.press('Backspace');
  await query.press('Backspace');
  await expect(page.locator('.result').first()).toContainText('src');
  const wide = await page.locator('.result').count();
  expect(wide).toBeGreaterThan(1);                             // "src" matches several files again
  await query.press('Backspace');
  await query.press('Backspace');
  await query.press('Backspace');
  await expect(page.locator('#state-msg')).toContainText('Start typing');
});

test('pinned files come first in Recent, and the query still filters them', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    state: project => ({
      'spyglass.recentFiles': [`${project}/src/app.ts`, `${project}/README.md`, `${project}/src/util.ts`],
      'spyglass.pinnedFiles': [`${project}/src/util.ts`],
    }),
  });
  await page.locator('.tab[data-scope="recent"]').click();

  await expect(page.locator('.result')).toHaveCount(3);
  await expect(page.locator('.result').first()).toContainText('util.ts');
  await expect(page.locator('.result').first().locator('.pin-icon')).toBeVisible();

  await page.locator('#query').fill('app');
  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result')).toContainText('app.ts');
});

test('spyglass.maxResults also caps Recent when nothing is typed', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    settings: { maxResults: 2 },
    state: project => ({ 'spyglass.recentFiles': [`${project}/src/app.ts`, `${project}/README.md`, `${project}/src/util.ts`] }),
  });
  await page.locator('.tab[data-scope="recent"]').click();

  await expect(page.locator('.result')).toHaveCount(2);
});

