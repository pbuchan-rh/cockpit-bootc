const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, TIMER_ACTIVE_SKIP_REASON, timerActive, bootcStatus } = require('./helpers/host.js');

// cancelStagedUpdate() works around bootc having no direct "discard the
// stage" command by calling `bootc rollback` twice (a toggle) — verify the
// real backend ends up clean, not just that the UI looks clean. Same
// SSH-truth pattern as rollback.spec.js's getRealRollbackQueued().
function getRealStatus() {
    return bootcStatus();
}

test.describe('cancel staged update', () => {
    test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);

    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('Download then Cancel returns to neutral with no rollback queued', async ({ page }) => {
        test.skip(timerActive(), TIMER_ACTIVE_SKIP_REASON);
        await page.locator('button:has-text("Check for Updates")').click();
        await expect(page.locator('button:has-text("Checking")')).toHaveCount(0, { timeout: 30000 });

        const updateAvailable = await page.locator('.pf-v6-c-label', { hasText: 'Update available' }).isVisible();
        test.skip(!updateAvailable, 'No update available against the current registry state — nothing to download');

        await page.locator('button:has-text("Download Update")').click();
        await expect(page.locator('button:has-text("Downloading")')).toHaveCount(0, { timeout: 60000 });

        const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Staged Update') });
        await expect(stagedCard.locator('button:has-text("Apply and reboot")')).toBeVisible();
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
