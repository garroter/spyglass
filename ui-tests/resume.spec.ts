import { test, expect } from './support/harness';

// Spyglass: Resume Last Search reopens the popup with the last query, scope and selected result,
// like :Telescope resume - for working through a list of results one by one.

const selectedIndex = (page: import('@playwright/test').Page) =>
  page.locator('.result').evaluateAll(rows => rows.findIndex(r => r.classList.contains('selected')));

test('the query, scope and selected result are remembered as you go', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('needle');
  await expect(s.page.locator('.result')).toHaveCount(7);

  await s.page.locator('#query').press('ArrowDown');
  await s.page.locator('#query').press('ArrowDown');

  await expect.poll(() => s.state.get('spyglass.lastSession')).toEqual({ query: 'needle', scope: 'project', selected: 2 });
});

test('the raw text is remembered, file:line and globs included', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });
  await s.page.locator('#query').fill('util:2');

  await expect.poll(() => s.state.get('spyglass.lastSession')).toEqual({ query: 'util:2', scope: 'files', selected: 0 });
});

test('resuming reopens the last query, in its scope, at the result that was selected', async ({ openSpyglass }) => {
  const s = await openSpyglass({
    resume: true,
    state: { 'spyglass.lastScope': 'files', 'spyglass.lastSession': { query: 'needle', scope: 'project', selected: 2 } },
  });

  await expect(s.page.locator('#query')).toHaveValue('needle');
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');
  await expect(s.page.locator('.result')).toHaveCount(7);
  await expect.poll(() => selectedIndex(s.page)).toBe(2);
});

test('resuming a file:line query keeps the line', async ({ openSpyglass }) => {
  const s = await openSpyglass({ resume: true, state: { 'spyglass.lastSession': { query: 'util:2', scope: 'files', selected: 0 } } });
  await expect(s.page.locator('.result').first()).toContainText('util.ts');

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/util.ts'), line: 2, column: undefined }]);
});

test('a selected result past the end of the list is clamped to the last one', async ({ openSpyglass }) => {
  const s = await openSpyglass({ resume: true, state: { 'spyglass.lastSession': { query: 'needle', scope: 'project', selected: 40 } } });

  await expect(s.page.locator('.result')).toHaveCount(7);
  await expect.poll(() => selectedIndex(s.page)).toBe(6);
});

test('with nothing to resume, Spyglass opens as usual', async ({ openSpyglass }) => {
  const s = await openSpyglass({ resume: true });

  await expect(s.page.locator('#query')).toHaveValue('');
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');
});
