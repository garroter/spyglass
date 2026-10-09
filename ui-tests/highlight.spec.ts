import { test, expect } from './support/harness';

// Syntax highlighting in the preview. Grammars are loaded on demand, one per language, so the
// popup does not parse every grammar each time it opens.

const highlighted = '#preview-content .ptext span[style]';

test('opening Spyglass loads less than 1 MB of script', async ({ openSpyglass, page }) => {
  let bytes = 0;
  page.on('response', async response => {
    if (response.request().resourceType() === 'script') { bytes += (await response.body()).length; }
  });

  const { page: p } = await openSpyglass();
  await p.locator('#query').fill('needle');
  await expect(p.locator('.result').first()).toBeVisible();

  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(1_000_000);
});

test('the preview highlights files in different languages', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files' });

  await page.locator('#query').fill('app.ts');
  await expect(page.locator('#preview-header')).toHaveText(/app\.ts/);
  await expect(page.locator(highlighted).first()).toBeVisible();

  await page.locator('#query').fill('thing.py');
  await expect(page.locator('#preview-header')).toHaveText(/thing\.py/);
  await expect(page.locator('#preview-content')).toContainText('def needle():');
  await expect(page.locator(highlighted).first()).toBeVisible();
});

test('a grammar that loads slowly does not overwrite a newer preview', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files' });
  let releasePython: () => void = () => undefined;
  let pythonRequested = false;
  const pythonHeld = new Promise<void>(resolve => { releasePython = resolve; });
  await page.route('**/media/chunks/python-*.js', async route => { pythonRequested = true; await pythonHeld; await route.fallback(); });

  await page.locator('#query').fill('thing.py');
  await expect(page.locator('.result').first()).toContainText('thing.py');
  await expect.poll(() => pythonRequested).toBe(true);
  await page.locator('#query').fill('app.ts');
  await expect(page.locator('#preview-content')).toContainText('export function main()');

  releasePython();
  await page.waitForTimeout(300);
  await expect(page.locator('#preview-header')).toHaveText(/app\.ts/);
  await expect(page.locator('#preview-content')).toContainText('export function main()');
});

test('a file without a grammar is previewed as plain text', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files' });

  await page.locator('#query').fill('notes.txt');
  await expect(page.locator('#preview-header')).toHaveText(/notes\.txt/);
  await expect(page.locator('#preview-content .pline').first()).toBeVisible();
  await expect(page.locator(highlighted)).toHaveCount(0);
});
