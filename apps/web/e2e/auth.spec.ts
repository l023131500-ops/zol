import { test, expect } from '@playwright/test';

/**
 * Task 6/7 guardrail: an anonymous user hitting /admin is redirected to login.
 */
test('anonymous access to /admin redirects to login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('login page renders in Hebrew RTL', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'כניסה' })).toBeVisible();
});
