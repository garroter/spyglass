import { test, expect } from './support/harness';
import { mock } from './support/vscodeMock';
import type { Page } from '@playwright/test';

// Keeping the popup and the sidebar uncluttered: the query box gets the room, options that do
// nothing in a scope are not shown, and the extra options live in a labelled menu.

const docSymbols = () => {
  mock.commandResults['vscode.executeDocumentSymbolProvider'] = [
    { name: 'main', kind: 11, selectionRange: { start: { line: 1 } } },
    { name: 'helper', kind: 11, selectionRange: { start: { line: 3 } } },
  ];
};

const box = (page: Page, selector: string) => page.locator(selector).evaluate(el => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, width: r.width, height: r.height };
});

// 1 ── a narrow sidebar gives the query box the room ─────────────────────────────────────────

test('in a narrow sidebar the query box keeps most of the width', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 300, height: 700 } });

  expect((await box(page, '#query')).width).toBeGreaterThan(180);
  await expect(page.locator('#regex-btn')).toBeHidden();
  await expect(page.locator('#more-btn')).toBeVisible();
});

test('in a narrow sidebar the search toggles are in the menu', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 300, height: 700 } });
  await page.locator('#more-btn').click();

  const regex = page.locator('#more-menu .menu-item[data-action="regex"]');
  await expect(regex).toBeVisible();
  await regex.click();

  await expect(regex).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#more-menu')).toBeVisible(); // stays open, like the other options
  await page.locator('#query').fill('ne.dle');
  await expect(page.locator('.result')).toHaveCount(7);
});

test('in a wide popup the search toggles stay on the bar, not in the menu', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#more-btn').click();

  await expect(page.locator('#regex-btn')).toBeVisible();
  await expect(page.locator('#more-menu .menu-item[data-action="regex"]')).toBeHidden();
});

// 2 ── tabs that do not fit ──────────────────────────────────────────────────────────────────

test('tab names stay on one line in a narrow sidebar', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 300, height: 700 } });

  // the number of lines the label is laid out on
  const lines = await page.locator('.tab[data-scope="openFiles"]').evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set(Array.from(range.getClientRects(), r => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);
});

test('tabs that do not fit are hinted at the edge', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 300, height: 700 } });

  await expect(page.locator('.tabs-wrap')).toHaveClass(/more-right/);
  await expect(page.locator('.tabs-wrap')).not.toHaveClass(/more-left/);
});

test('the active tab is scrolled into view', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 300, height: 700 } });
  await page.locator('#query').focus();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); } // project → refs
  await expect(page.locator('.tab.active')).toHaveAttribute('data-scope', 'refs');

  await expect.poll(async () => {
    const tab = await box(page, '.tab.active');
    const bar = await box(page, '.tabs');
    return tab.left >= bar.left - 1 && tab.right <= bar.right + 1;
  }).toBe(true);
  await expect(page.locator('.tabs-wrap')).toHaveClass(/more-left/);
});

// 3 ── options that do nothing in a scope are not shown ───────────────────────────────────────

test('the text search toggles are not shown in the file lists', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'files' });

  for (const id of ['#regex-btn', '#case-btn', '#word-btn', '#replace-btn']) {
    await expect(page.locator(id)).toBeHidden();
  }
  await page.locator('.tab[data-scope="project"]').click();
  for (const id of ['#regex-btn', '#case-btn', '#word-btn', '#replace-btn']) {
    await expect(page.locator(id)).toBeVisible();
  }
});

// 4 ── a labelled menu instead of a row of symbols ────────────────────────────────────────────

test('the ⋯ menu lists each option by name with its shortcut', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#more-btn').click();

  await expect(page.locator('#more-menu')).toBeVisible();
  await expect(page.locator('#ignored-btn')).toContainText(/ignored/i);
  await expect(page.locator('#ignored-btn')).toContainText('Alt+H');
  await expect(page.locator('#group-btn')).toContainText('Alt+L');
});

test('an option in the menu shows whether it is on, and the menu stays open to change another', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#more-btn').click();

  await page.locator('#group-btn').click();
  await expect(page.locator('#group-btn')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#more-menu')).toBeVisible();

  await page.locator('#group-btn').click();
  await expect(page.locator('#group-btn')).toHaveAttribute('aria-checked', 'false');
});

test('Escape closes the menu, not the popup', async ({ openSpyglass }) => {
  const s = await openSpyglass();
  await s.page.locator('#more-btn').click();
  await expect(s.page.locator('#more-menu')).toBeVisible();

  await s.page.keyboard.press('Escape');

  await expect(s.page.locator('#more-menu')).toBeHidden();
  expect(s.closeCount()).toBe(0);
});

test('a click outside closes the menu', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#more-btn').click();
  await expect(page.locator('#more-menu')).toBeVisible();

  await page.locator('#query').click();

  await expect(page.locator('#more-menu')).toBeHidden();
});

// 5 ── tooltips at the right edge ─────────────────────────────────────────────────────────────

test('toolbar tooltips open towards the inside, so the last ones are not cut off', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();

  const after = await page.locator('#preview-btn').evaluate(el => {
    const cs = getComputedStyle(el, '::after');
    return { right: cs.right, transform: cs.transform };
  });
  expect(after).toEqual({ right: '0px', transform: 'none' });
});

// 6 ── code indentation is not repeated in the result rows ────────────────────────────────────

test('result rows show the code without its indentation', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.locator('#query').fill('return needle');

  const row = page.locator('.result', { hasText: 'src/app.ts' }).locator('.result-text');
  expect(await row.evaluate(el => el.textContent)).toBe('return needle;');
  await expect(row.locator('mark')).toHaveText('return needle');
});

// 7 ── Doc rows do not repeat the file ────────────────────────────────────────────────────────

test('Doc rows show only the line, the file is always the current one', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'doc', active: { file: 'src/app.ts' }, beforeOpen: docSymbols });

  await expect(page.locator('.result .result-text').first()).toHaveText(':2');
});

// 8 ── status bar wording ─────────────────────────────────────────────────────────────────────

test('the status bar names the recent files list', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ state: p => ({ 'spyglass.recentFiles': [`${p}/src/util.ts`] }) });

  await expect(page.locator('#result-info')).toHaveText('Recent files');
});

test('opened straight into Doc, the search box says what it filters', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ initialScope: 'doc', active: { file: 'src/app.ts' }, beforeOpen: docSymbols });

  await expect(page.locator('#query')).toHaveAttribute('placeholder', /document symbols/i);
});

test('text sizes follow VS Code: the UI size for labels, the editor size for code', async ({ openSpyglass }) => {
  const { page } = await openSpyglass();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--vscode-font-size', '16px');
    document.documentElement.style.setProperty('--vscode-editor-font-size', '20px');
  });
  await page.locator('#query').fill('needle');
  await expect(page.locator('.result').first()).toBeVisible();

  const size = (sel: string) => page.locator(sel).first().evaluate(el => getComputedStyle(el).fontSize);
  expect(await size('.tab')).toBe('15px');
  expect(await size('.result .result-file')).toBe('15px');
  expect(await size('.result .result-text')).toBe('19px');
  await expect.poll(() => size('#preview-content .ptext')).toBe('20px');
});
