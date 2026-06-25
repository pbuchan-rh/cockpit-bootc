const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const { loginToCockpit } = require('./helpers/cockpit.js');

// cancelStagedUpdate() works around bootc having no direct "discard the
// stage" command by calling `bootc rollback` twice (a toggle) — verify the
// real backend ends up clean, not just that the UI looks clean. Same
// SSH-truth pattern as rollback.spec.js's getRealRollbackQueued().
function getRealStatus() {
    const hostname = process.env.COCKPIT_URL.replace(/^https?:\/\//, '').replace(/:.*$/, '');
    const user = process.env.COCKPIT_USER;
    const pass = process.env.COCKPIT_PASS;
    const out = execSync(
        `ssh -o StrictHostKeyChecking=no ${user}@${hostname} "echo '${pass}' | sudo -S bootc status --json 2>/dev/null"`
    ).toString();
    return JSON.parse(out).status;
}

test.describe('cancel staged update', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('Download then Cancel returns to neutral with no rollback queued', async ({ page }) => {
        await page.locator('button:has-text("Check for Updates")').click();
        await expect(page.locator('button:has-text("Checking")')).toHaveCount(0, { timeout: 30000 });

        const updateAvailable = await page.locator('.pf-v6-c-label', { hasText: 'Update available' }).isVisible();
        test.skip(!updateAvailable, 'No update available against the current registry state — nothing to download');

        await page.locator('button:has-text("Download Update")').click();
        await expect(page.locator('button:has-text("Downloading")')).toHaveCount(0, { timeout: 60000 });

        const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Staged Update') });
        await expect(stagedCard.locator('button:has-text("Apply & Reboot")')).toBeVisible();
        expect(getRealStatus().staged).not.toBeNull();

        await stagedCard.locator('button:has-text("Cancel")').click();
        await expect(page.locator('text=Discard staged update?')).toBeVisible();
        await expect(page.locator('text=No reboot happens, and the booted image is unaffected', { exact: false })).toBeVisible();
        await page.locator('button:has-text("Discard")').click();
        await expect(stagedCard.locator('text=No update staged')).toBeVisible({ timeout: 15000 });

        // The part a UI-only check can't see: cancelStagedUpdate()'s double
        // `bootc rollback` must net out to truly neutral, not "staged
        // update traded for a queued rollback."
        const real = getRealStatus();
        expect(real.staged).toBeNull();
        expect(real.rollbackQueued).toBe(false);
    });
});
