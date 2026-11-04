const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');

// Load timing, opt-in (BOOTC_PERF=1): it only measures, it asserts nothing
// about speed, and it takes a minute or two per browser.
//
// For each of RUNS fresh navigations to the module URL (same logged-in,
// admin-elevated session), measures ms from page.goto() start to:
//   - cards:  the Booted/Staged/Rollback gallery is visible
//   - check:  the automatic update check has a result (the Up to date /
//             Update available badge), or null if none appears within
//             CHECK_WAIT_MS (1.1.2 has no automatic check).
// Results go to the console and tests/test-results/perf-<browser>.json.
const RUNS = 5;
const CHECK_WAIT_MS = 15000;

const median = xs => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

test.describe('load timing', () => {
    test.skip(process.env.BOOTC_PERF !== '1', 'timing run; set BOOTC_PERF=1 to include it');

    test('status cards and automatic check, 5 navigations', async ({ page, browserName }) => {
        test.setTimeout(RUNS * 60000);
        await loginToCockpit(page);
        await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 30000 });

        const runs = [];
        for (let i = 0; i < RUNS; i++) {
            await page.goto('about:blank');
            const t0 = Date.now();
            await page.goto(COCKPIT_URL + MODULE_PATH);
            await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 30000 });
            const cards = Date.now() - t0;
            let check = null;
            const badge = page.locator('.pf-v6-c-label', { hasText: /^(Up to date|Update available)$/ });
            try {
                await badge.waitFor({ state: 'visible', timeout: CHECK_WAIT_MS });
                check = Date.now() - t0;
            } catch {
                check = null;
            }
            runs.push({ cards, check });
        }

        const cardTimes = runs.map(r => r.cards);
        const checkTimes = runs.map(r => r.check).filter(v => v !== null);
        const summary = {
            browser: browserName,
            runs,
            cards: { median: median(cardTimes), max: Math.max(...cardTimes) },
            check: checkTimes.length ? { median: median(checkTimes), max: Math.max(...checkTimes), n: checkTimes.length } : null,
        };
        console.log('PERF', JSON.stringify(summary));
        fs.mkdirSync(__dirname + '/test-results', { recursive: true });
        fs.writeFileSync(__dirname + `/test-results/perf-${browserName}${process.env.BOOTC_PERF_TAG ? '-' + process.env.BOOTC_PERF_TAG : ''}.json`, JSON.stringify(summary, null, 2));
    });
});
