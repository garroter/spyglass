import { test, expect } from './support/harness';
import type { Page } from '@playwright/test';

// The fixture project also holds files that are normally out of sight:
//   .env (hidden)   generated.txt (hidden by .ignore)   dist/bundle.js (in the default spyglass.exclude)
// each containing "needle", so a project search finds 7 lines normally and 10 with everything included.

const files = (page: Page) => page.locator('.result .result-file').allTextContents();

test('by default hidden, ignored and excluded files stay out of the results', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');

  await expect(page.locator('.result')).toHaveCount(7);
  const names = await files(page);
  expect(names).not.toContain('.env');
  expect(names).not.toContain('generated.txt');
  expect(names).not.toContain('dist/bundle.js');
});

test('the toolbar button includes them, and turning it off hides them again', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);

  await page.locator('#more-btn').click();
  await page.locator('#ignored-btn').click();

  await expect(page.locator('.result')).toHaveCount(10);
  expect((await files(page)).sort()).toEqual(expect.arrayContaining(['.env', 'dist/bundle.js', 'generated.txt']));
  await expect(page.locator('#ignored-btn')).toHaveClass(/active/);

  await page.locator('#ignored-btn').click();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('#ignored-btn')).not.toHaveClass(/active/);
});

test('Alt+H toggles it from the query box', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result')).toHaveCount(7);

  await page.locator('#query').press('Alt+h');
  await expect(page.locator('.result')).toHaveCount(10);

  await page.locator('#query').press('Alt+h');
  await expect(page.locator('.result')).toHaveCount(7);
});

test('the menu item says what it does and which key toggles it', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();

  await expect(page.locator('#ignored-btn')).toContainText(/ignored/i);
  await expect(page.locator('#ignored-btn')).toContainText('Alt+H');
  await expect(page.getByRole('menuitemcheckbox', { name: /ignored/i, includeHidden: true })).toHaveCount(1);
});

test('an active toggle is visible even while the menu is closed', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await expect(page.locator('body')).not.toHaveClass(/include-ignored/);

  await page.locator('#query').press('Alt+h');

  await expect(page.locator('#more-menu')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/include-ignored/);
});

test('the choice is remembered with the other toolbar preferences', async ({ openSpyglass }) => {
  const s = await openSpyglass();

  await s.page.locator('#query').press('Alt+h');

  await expect.poll(() => (s.state.get('spyglass.buttonPrefs') as { includeIgnored?: boolean } | undefined)?.includeIgnored).toBe(true);
});

test('a remembered choice is applied when Spyglass reopens', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.buttonPrefs': { includeIgnored: true } } });
  await page.locator('#query').fill('needle');

  await expect(page.locator('.result')).toHaveCount(10);
  await expect(page.locator('body')).toHaveClass(/include-ignored/);
});

test('the Files scope lists hidden and ignored files once included', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('.tab[data-scope="files"]').click();
  await page.locator('#query').fill('env');
  await expect(page.locator('.result')).toHaveCount(0);

  await page.locator('#query').press('Alt+h');

  await expect(page.locator('.result')).toContainText('.env');
});

test('switching it inside the Files scope re-lists the files', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: { 'spyglass.buttonPrefs': { includeIgnored: true } } });
  await page.locator('.tab[data-scope="files"]').click();
  await page.locator('#query').fill('gener');
  await expect(page.locator('.result')).toContainText('generated.txt');

  await page.locator('#query').press('Alt+h');

  await expect(page.locator('.result')).toHaveCount(0);
});

test('a file list made for the other choice is dropped when it arrives late', async ({ openSpyglass }) => {
  const s = await openSpyglass(); // ignored files are not included
  await s.page.locator('.tab[data-scope="files"]').click();

  // e.g. a list requested before the toggle was flipped, delivered afterwards
  s.controller.post({ type: 'fileList', files: [{ file: `${s.project}/stale.txt`, rel: 'stale.txt' }], includeIgnored: true });
  await s.page.locator('#query').fill('stale');

  await expect(s.page.locator('.result')).toHaveCount(0);
});

test('a file list made for the current choice is used', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('.tab[data-scope="files"]').click();

  s.controller.post({ type: 'fileList', files: [{ file: `${s.project}/fresh.txt`, rel: 'fresh.txt' }], includeIgnored: false });
  await s.page.locator('#query').fill('fresh');

  await expect(s.page.locator('.result')).toContainText('fresh.txt');
});

test('.git is never searched, even with everything included', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ git: true, state: { 'spyglass.buttonPrefs': { includeIgnored: true } } });
  await page.locator('#query').fill('init'); // the commit message sits in .git/COMMIT_EDITMSG and .git/logs

  await expect(page.locator('#result-info')).toHaveText('0 results');
  await expect(page.locator('.result')).toHaveCount(0);
});

test('Replace preview covers exactly the files the search shows', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('needle');
  await s.page.locator('#query').press('Alt+r');
  await s.page.locator('#replace-input').fill('pin');

  await s.page.locator('#replace-all-btn').click();
  const overlay = s.page.locator('#replace-preview-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).not.toContainText('generated.txt');
  await s.page.locator('#rp-cancel-btn').click();

  await s.page.locator('#query').press('Alt+h');
  await expect(s.page.locator('.result')).toHaveCount(10);
  await s.page.locator('#replace-all-btn').click();
  await expect(overlay).toContainText('generated.txt');
  await expect(overlay).toContainText('.env');
  await expect(overlay).toContainText('dist/bundle.js');
});

test('Apply also rewrites the ignored and hidden files that were included', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#query').fill('needle');
  await s.page.locator('#query').press('Alt+h');
  await expect(s.page.locator('.result')).toHaveCount(10);
  await s.page.locator('#query').press('Alt+r');
  await s.page.locator('#replace-input').fill('pin');
  await s.page.locator('#replace-all-btn').click();
  await expect(s.page.locator('#replace-preview-overlay')).toBeVisible();

  await s.page.locator('#rp-apply-btn').click();

  await expect.poll(() => s.read('generated.txt')).toContain('pin generated output');
  expect(s.read('.env')).toContain('pin_KEY=1'); // the replace is case-insensitive: NEEDLE_KEY -> pin_KEY
  expect(s.read('dist/bundle.js')).toContain('var pin = 1;');
});
