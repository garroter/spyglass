import { test, expect } from './support/harness';
import { mock } from './support/vscodeMock';

// Quick Open-style navigation in the file lists: `file:line[:column]` opens a file at a line, a
// bare `:line` goes to a line in the current file, and a leading `@` lists its symbols.
//
// src/util.ts:  1 export const needle = 'value';
//               2 export function helper() { return needle; }

const docSymbols = () => {
  mock.commandResults['vscode.executeDocumentSymbolProvider'] = [
    { name: 'main', kind: 11, selectionRange: { start: { line: 1 } } },
    { name: 'helper', kind: 11, selectionRange: { start: { line: 3 } } },
  ];
};

test('file:line opens the file at that line', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });
  await s.page.locator('#query').fill('util:2');
  await expect(s.page.locator('.result').first()).toContainText('util.ts');

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/util.ts'), line: 2, column: undefined }]);
});

test('file:line:column opens the file at that line and column', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });
  await s.page.locator('#query').fill('util:2:8');
  await expect(s.page.locator('.result').first()).toContainText('util.ts');

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/util.ts'), line: 2, column: 8 }]);
});

test('file:line previews the file at that line', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });
  await s.page.locator('#query').fill('util:2');

  await expect(s.page.locator('#preview-content .pline--cur')).toContainText('export function helper()');
});

test('file:line works in the Recent list too', async ({ openSpyglass }) => {
  const s = await openSpyglass({
    initialScope: 'recent',
    state: project => ({ 'spyglass.recentFiles': [`${project}/src/util.ts`] }),
  });
  await s.page.locator('#query').fill('util:2');
  await expect(s.page.locator('.result').first()).toContainText('util.ts');

  await s.page.locator('#query').press('Enter');

  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/util.ts'), line: 2, column: undefined }]);
});

test('a bare :line goes to that line in the current file', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files', active: { file: 'src/util.ts' } });
  await s.page.locator('#query').fill(':2');

  await expect(s.page.locator('.result')).toHaveCount(1);
  await expect(s.page.locator('.result')).toContainText('util.ts');
  await expect(s.page.locator('#preview-content .pline--cur')).toContainText('export function helper()');

  await s.page.locator('#query').press('Enter');
  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/util.ts'), line: 2, column: undefined }]);
});

test('a bare :line without an open file says so', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });
  await s.page.locator('#query').fill(':2');

  await expect(s.page.locator('#state-msg')).toContainText('Open a file to go to a line');
  await expect(s.page.locator('.result')).toHaveCount(0);
});

test('@ in Files switches to the symbols of the current file and keeps the @', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files', active: { file: 'src/app.ts' }, beforeOpen: docSymbols });
  await s.page.locator('#query').fill('@');

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'doc');
  await expect(s.page.locator('#query')).toHaveValue('@');
  await expect(s.page.locator('.result')).toHaveCount(2);
});

test('@name filters the symbols and Enter opens the one shown', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files', active: { file: 'src/app.ts' }, beforeOpen: docSymbols });
  await s.page.locator('#query').fill('@');
  await expect(s.page.locator('.result')).toHaveCount(2);

  await s.page.locator('#query').fill('@help');
  await expect(s.page.locator('.result')).toHaveCount(1);
  await expect(s.page.locator('.result')).toContainText('helper');

  await s.page.locator('#query').press('Enter');
  await expect.poll(() => s.opened).toEqual([{ file: s.abs('src/app.ts'), line: 4, column: undefined }]);
});

test('deleting the @ goes back to the file list it came from', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files', active: { file: 'src/app.ts' }, beforeOpen: docSymbols });
  await s.page.locator('#query').fill('@');
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'doc');

  await s.page.locator('#query').fill('util');

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'files');
  await expect(s.page.locator('.result').first()).toContainText('util.ts');
});

test('@ and : stay plain text in a text search', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'project' });
  await s.page.locator('#query').fill('@needle');
  await s.page.waitForTimeout(400);
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');

  await s.page.locator('#query').fill(':2');
  await s.page.waitForTimeout(400);
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');
  await expect(s.page.locator('#state-msg')).not.toContainText('Open a file to go to a line');
});
