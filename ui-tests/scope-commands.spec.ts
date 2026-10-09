import { test, expect } from './support/harness';
import { mock, Uri } from './support/vscodeMock';

// What the Spyglass "Find …" commands do: open (or switch) straight into a scope, load its list
// without further typing, and leave the remembered scope alone.

test('opening in a scope selects its tab without changing the remembered scope', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'files');
  await expect(s.page.locator('#query')).toHaveAttribute('placeholder', /files by name/i);
  expect(s.state.has('spyglass.lastScope')).toBe(false);
});

test('an explicit scope wins over the remembered one', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'project', state: { 'spyglass.lastScope': 'files' } });

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');
  expect(s.state.get('spyglass.lastScope')).toBe('files');
});

test('the Files scope opened directly finds files as you type', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files' });
  await page.locator('#query').fill('utl');

  await expect(page.locator('.result')).toContainText('util.ts');
});

test('the Recent scope opened directly lists recent files at once', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({
    initialScope: 'recent',
    state: project => ({ 'spyglass.recentFiles': [`${project}/README.md`, `${project}/src/util.ts`] }),
  });

  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'recent');
  await expect(page.locator('.result')).toHaveCount(2);
});

test('the Git scope opened directly lists the changed files at once', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'git', git: true });

  await expect(page.locator('.result')).toHaveCount(2);
  const names = (await page.locator('.result').allTextContents()).join(' ');
  expect(names).toContain('util.ts');
  expect(names).toContain('new.ts');
});

test('the Doc scope opened directly lists the symbols of the active file at once', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'doc', active: { file: 'src/app.ts' }, beforeOpen: () => {
    mock.commandResults['vscode.executeDocumentSymbolProvider'] = [
      { name: 'main', kind: 11, selectionRange: { start: { line: 1 } } },
      { name: 'helper', kind: 11, selectionRange: { start: { line: 3 } } },
    ];
  } });

  await expect(s.page.locator('.result')).toHaveCount(2);
  await expect(s.page.locator('.result').first()).toContainText('main');
});

test('the Refs scope opened directly lists the references at the cursor at once', async ({ openSpyglass }) => {
  const s = await openSpyglass({
    initialScope: 'refs',
    active: { file: 'src/util.ts', line: 0, character: 15 }, // inside "needle"
    beforeOpen: project => {
      const loc = (file: string, line: number, from: number) => ({
        uri: Uri.file(`${project}/${file}`),
        range: { start: { line, character: from }, end: { line, character: from + 6 } },
      });
      mock.commandResults['vscode.executeReferenceProvider'] = [loc('src/util.ts', 0, 13), loc('src/app.ts', 2, 8)];
    },
  });

  await expect(s.page.locator('.result')).toHaveCount(2);
});

test('entering the Doc scope from its tab lists the symbols without typing', async ({ openSpyglass }) => {
  const s = await openSpyglass({ active: { file: 'src/app.ts' }, beforeOpen: () => {
    mock.commandResults['vscode.executeDocumentSymbolProvider'] = [
      { name: 'main', kind: 11, selectionRange: { start: { line: 1 } } },
    ];
  } });

  await s.page.locator('.tab[data-scope="doc"]').click();

  await expect(s.page.locator('.result')).toHaveCount(1);
});

test('an already open popup can be switched to a scope by the host, leaving the remembered scope alone', async ({ openSpyglass }) => {
  const s = await openSpyglass({ state: { 'spyglass.lastScope': 'project' } });
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'project');

  s.controller.showScope('files');

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'files');
  expect(s.state.get('spyglass.lastScope')).toBe('project');
});

test('choosing a tab yourself is remembered, even after a scope command', async ({ openSpyglass }) => {
  const s = await openSpyglass({ initialScope: 'files' });

  await s.page.locator('.tab[data-scope="recent"]').click();

  await expect.poll(() => s.state.get('spyglass.lastScope')).toBe('recent');
});

test('a scope command keeps working after the popup was switched: searching uses the new scope', async ({ openSpyglass }) => {
  const s = await openSpyglass();

  s.controller.showScope('here');
  s.controller.setActiveContext({ dir: s.abs('src/deep'), file: s.abs('src/deep/thing.py'), line: 0, character: 0 });
  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'here');
  await s.page.locator('#query').fill('needle');

  await expect(s.page.locator('.result')).toHaveCount(2);
});

test('a folder picked in the Explorer becomes the directory the Dir scope searches', async ({ openSpyglass }) => {
  const s = await openSpyglass();

  s.controller.setActiveDirectory(s.abs('src/deep'));
  s.controller.showScope('here');
  await s.page.locator('#query').fill('needle');

  await expect(s.page.locator('.tab.active')).toHaveAttribute('data-scope', 'here');
  await expect(s.page.locator('.result')).toHaveCount(2);
  await expect(s.page.locator('.result .result-file')).toHaveText(['thing.py', 'thing.py']);
});

