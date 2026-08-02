import { test, expect } from '@playwright/test';

/**
 * Task 28 guardrail: the household profile is stored in localStorage only and
 * must NEVER be sent to the server. We fill it, save, and assert no outgoing
 * request body carries the entered values.
 */
test('household profile is never sent to the server', async ({ page }) => {
  const leaked: string[] = [];
  const SENTINEL_PEOPLE = '7';
  const SENTINEL_CHILDREN = '3';

  page.on('request', (req) => {
    const body = req.postData() ?? '';
    const url = req.url();
    if (body.includes(`"people":"${SENTINEL_PEOPLE}"`) || body.includes(`"children":"${SENTINEL_CHILDREN}"`)) {
      leaked.push(`${req.method()} ${url}`);
    }
  });

  await page.goto('/hatzor-haglilit');
  await page.getByLabel('נפשות במשק הבית').fill(SENTINEL_PEOPLE);
  await page.getByLabel('ילדים', { exact: true }).fill(SENTINEL_CHILDREN);
  await page.getByRole('button', { name: 'שמור בדפדפן' }).click();
  await page.waitForTimeout(800);

  // It IS persisted locally…
  const stored = await page.evaluate(() => window.localStorage.getItem('kesef.household'));
  expect(stored).toContain(SENTINEL_PEOPLE);

  // …and NEVER transmitted.
  expect(leaked).toEqual([]);
});
