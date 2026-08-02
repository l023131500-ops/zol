import { test, expect } from '@playwright/test';

/**
 * Task 8 guardrail: refusing cookies must prevent any analytics request.
 * We fail the test if a request to a known analytics host is ever made after
 * choosing "רק הכרחיות".
 */
test('refusing cookies blocks analytics network requests', async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/plausible\.io|google-analytics\.com|googletagmanager\.com/.test(url)) {
      analyticsRequests.push(url);
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'רק הכרחיות' }).click();
  await page.waitForTimeout(1000);

  expect(analyticsRequests).toEqual([]);
});

test('cookie choice persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'רק הכרחיות' }).click();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'הודעת עוגיות' })).toHaveCount(0);
});
