const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('../helpers/cockpit.js');
const { DESTRUCTIVE, bootcStatus, hostSudo, timerActive } = require('../helpers/host.js');

// Ad-hoc (BOOTC_ADHOC=1): light-mode screenshots of the 1.2 changes and of
// the five wordiest dialogs, into SHOTS_DIR (default tests/test-results/shots).
// Asserts only what it needs to reach each screen. The rollback-reboot,
// discard and download shots stage things on the host, so they also need
// BOOTC_DESTRUCTIVE=1 (and the auto-update timer stopped); they undo what
// they stage.
const DIR = process.env.SHOTS_DIR || `${__dirname}/../test-results/shots`;
fs.mkdirSync(`${DIR}/wordiness`, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png` });
const modalShot = async (page, name) => {
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await page.waitForTimeout(400); // modal open animation
    await shot(page, name);
};
const cancelModal = page => page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for screenshots');

test('limited access empty state', async ({ page }) => {
    await page.goto(COCKPIT_URL, { waitUntil: 'networkidle' });
    await page.fill('#login-user-input', process.env.COCKPIT_USER);
    await page.fill('#login-password-input', process.env.COCKPIT_PASS);
    await page.click('#login-button');
    await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
    await page.goto(COCKPIT_URL + MODULE_PATH);
    await expect(page.locator('.pf-v6-c-empty-state')).toBeVisible({ timeout: 15000 });
    await shot(page, '03-limited-access');
});

test('page, dialogs that need no staging', async ({ page }) => {
    await loginToCockpit(page);
    await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.pf-v6-c-label', { hasText: /^(Up to date|Update available)$/ })).toBeVisible({ timeout: 15000 });
    await shot(page, '02-auto-check-on-load');
    await shot(page, '05-visual-batch');

    const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('.pf-v6-c-label', { hasText: /^Rollback$/ }) });
    await rollbackCard.locator('button:has-text("Roll back")').click();
    await modalShot(page, '04-roll-back-step1');
    fs.copyFileSync(`${DIR}/04-roll-back-step1.png`, `${DIR}/wordiness/1-roll-back-stage.png`);
    await cancelModal(page);

    const toggle = page.locator('#bootc-auto-update-switch');
    if (!(await toggle.isChecked())) {
        await toggle.click({ force: true });
        await modalShot(page, 'wordiness/3-enable-auto-updates');
        await cancelModal(page);
    }

    await page.locator('button:has-text("deployments pinned")').click();
    const rows = page.locator('table[aria-label="All ostree deployments"] tbody tr');
    for (let i = 0; i < await rows.count(); i++) {
        const del = rows.nth(i).locator('button:has-text("Delete")');
        if (await del.getAttribute('aria-disabled') === null) {
            await del.click();
            await modalShot(page, 'wordiness/4-delete-deployment');
            await cancelModal(page);
            break;
        }
    }
});

test('dialogs and progress that need staging', async ({ page }) => {
    test.skip(!DESTRUCTIVE || timerActive(), 'needs BOOTC_DESTRUCTIVE=1 and the auto-update timer stopped');
    test.setTimeout(10 * 60000);
    await loginToCockpit(page);
    await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 15000 });
    expect(bootcStatus().staged).toBeNull();

    // Step 2 of a rollback, then undo it.
    const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('.pf-v6-c-label', { hasText: /^Rollback$/ }) });
    await rollbackCard.locator('button:has-text("Roll back")').click();
    await page.locator('.pf-v6-c-modal-box button:has-text("Stage rollback")').click();
    await rollbackCard.locator('button:has-text("Reboot to roll back")').click();
    await modalShot(page, '04-roll-back-step2');
    fs.copyFileSync(`${DIR}/04-roll-back-step2.png`, `${DIR}/wordiness/2-roll-back-reboot.png`);
    await cancelModal(page);
    await rollbackCard.locator('button:has-text("Cancel")').click();
    await expect(rollbackCard.locator('button:has-text("Roll back")')).toBeVisible({ timeout: 15000 });
    expect(bootcStatus().rollbackQueued).toBe(false);

    // A pull with progress (PROGRESS_TAG_REF: an image not on disk yet).
    const ref = process.env.PROGRESS_TAG_REF;
    test.skip(!ref, 'set PROGRESS_TAG_REF to an image not in the store for the progress shot');
    const original = JSON.parse(hostSudo('bootc status --json')).spec.image.image;
    await page.fill('#switch-image-ref', ref);
    await page.locator('button:has-text("Inspect")').click();
    await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 30000 });
    await page.locator('.ct-switch-row button:has-text("Switch")').click();
    await page.locator('.pf-v6-c-modal-box button:has-text("Switch")').click();
    const bar = page.locator('#bootc-pull-progress');
    await expect(bar).toContainText(/ of .*layers/, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await bar.scrollIntoViewIfNeeded();
    await shot(page, '01-download-progress');
    await expect(page.locator('button:has-text("Switching")')).toHaveCount(0, { timeout: 8 * 60000 });

    // Discard dialog, then discard for real.
    const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('.pf-v6-c-label', { hasText: /^Staged update$/ }) });
    await stagedCard.locator('button:has-text("Cancel")').click();
    await modalShot(page, 'wordiness/5-discard-staged');
    await page.locator('.pf-v6-c-modal-box button:has-text("Discard")').click();
    await expect(stagedCard.locator('text=No update staged')).toBeVisible({ timeout: 30000 });
    expect(JSON.parse(hostSudo('bootc status --json')).spec.image.image).toBe(original);
});
