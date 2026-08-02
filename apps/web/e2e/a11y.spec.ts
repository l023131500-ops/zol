import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core');

/**
 * Accessibility gate (task 12). Runs axe-core on key public pages and fails
 * on any violation of impact "serious" or "critical" — the same threshold the
 * CI build enforces (תקן ישראלי 5568 / WCAG 2.0 AA).
 */
const PAGES = ['/', '/dev/components', '/methodology'];

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: unknown[];
}

for (const path of PAGES) {
  test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.addScriptTag({ path: axePath });
    const violations = (await page.evaluate(async () => {
      // @ts-expect-error injected global
      const results = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      return results.violations;
    })) as AxeViolation[];

    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (serious.length > 0) {
      console.error(`a11y violations on ${path}:`, JSON.stringify(serious, null, 2));
    }
    expect(serious).toEqual([]);
  });
}
