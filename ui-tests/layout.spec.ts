import { test, expect } from './support/harness';

async function boxes(page: import('@playwright/test').Page) {
  const left = await page.locator('#left-panel').boundingBox();
  const right = await page.locator('#right-panel').boundingBox();
  return { left, right };
}

test('sidebar: a narrow view (<420px) shows results only, no preview', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 360, height: 700 } });

  await expect(page.locator('#right-panel')).toBeHidden();
  await expect(page.locator('#left-panel')).toBeVisible();
});

test('sidebar: a medium view (420-599px) stacks the preview below the results', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 500, height: 700 } });

  await expect(page.locator('#right-panel')).toBeVisible();
  const { left, right } = await boxes(page);
  expect(right!.y).toBeGreaterThan(left!.y + left!.height - 1);
  expect(Math.abs(right!.x - left!.x)).toBeLessThan(2);
});

test('sidebar: a wide view (>=600px) puts the preview beside the results', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 800, height: 700 } });

  await expect(page.locator('#right-panel')).toBeVisible();
  const { left, right } = await boxes(page);
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(2);
});

test('sidebar: resizing the view re-flows the layout', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'sidebar', viewport: { width: 800, height: 700 } });
  await expect(page.locator('#right-panel')).toBeVisible();

  await page.setViewportSize({ width: 360, height: 700 });

  await expect(page.locator('#right-panel')).toBeHidden();
});

test('popup: the preview sits beside the results', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'popup' });

  await expect(page.locator('body')).not.toHaveClass(/sidebar-mode/);
  const { left, right } = await boxes(page);
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
});

test('the preview panel can be toggled off with Shift+Alt+P', async ({ openSpyglass }) => {
  const { page } = await openSpyglass({ mode: 'popup' });
  await expect(page.locator('#right-panel')).toBeVisible();

  await page.locator('#query').press('Shift+Alt+P');

  await expect(page.locator('#right-panel')).toBeHidden();
});
