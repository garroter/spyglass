import { test, expect } from './support/harness';

async function prepareReplace(s: Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]['openSpyglass']>>) {
  await s.page.locator('#query').fill('needle');
  await expect(s.page.locator('.result')).toHaveCount(7);
  await s.page.locator('#query').press('Alt+r');
  await expect(s.page.locator('#replace-row')).toBeVisible();
  await s.page.locator('#replace-input').fill('pin');
}

test('Replace all shows a before/after preview and touches nothing yet', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await prepareReplace(s);

  await s.page.locator('#replace-all-btn').click();

  const overlay = s.page.locator('#replace-preview-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('const needle = helper(); // TODO: rename needle');
  await expect(overlay).toContainText('const pin = helper(); // TODO: rename pin');
  expect(s.read('README.md')).toContain('A needle in a haystack.');
});

test('Cancel in the preview leaves the files untouched', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await prepareReplace(s);
  await s.page.locator('#replace-all-btn').click();
  await expect(s.page.locator('#replace-preview-overlay')).toBeVisible();

  await s.page.locator('#rp-cancel-btn').click();

  await expect(s.page.locator('#replace-preview-overlay')).toBeHidden();
  expect(s.read('README.md')).toContain('A needle in a haystack.');
  expect(s.read('src/util.ts')).toContain("export const needle = 'value';");
});

test('Apply rewrites every matching file and leaves the others alone', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await prepareReplace(s);
  await s.page.locator('#replace-all-btn').click();
  await expect(s.page.locator('#replace-preview-overlay')).toBeVisible();

  await s.page.locator('#rp-apply-btn').click();

  await expect.poll(() => s.read('README.md')).toContain('A pin in a haystack.');
  expect(s.read('src/app.ts')).toContain('const pin = helper(); // TODO: rename pin');
  expect(s.read('src/util.ts')).toContain("export const pin = 'value';");
  expect(s.read('src/deep/thing.py')).toContain('def pin():');
  expect(s.read('notes.txt')).toBe('nothing to see here\n');
});
