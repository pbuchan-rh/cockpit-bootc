const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

test.describe('update lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('Check for Updates resolves to a real Up to date / Update available badge', async ({ page }) => {
        await page.locator('button:has-text("Check for Updates")').click();
        await expect(page.locator('button:has-text("Checking")')).toHaveCount(0, { timeout: 30000 });

        const badge = page.locator('.pf-v6-c-label', { hasText: /Up to date|Update available/ });
        await expect(badge).toBeVisible();
    });

    test('badge clears while a second check is in flight', async ({ page }) => {
        // First check establishes a badge.
        await page.locator('button:has-text("Check for Updates")').click();
        await expect(page.locator('button:has-text("Checking")')).toHaveCount(0, { timeout: 30000 });
        const badge = page.locator('.pf-v6-c-label', { hasText: /Up to date|Update available/ });
        await expect(badge).toBeVisible();

        // Second check should hide the stale badge while it's running, not
        // show stale state until the new result lands.
        await page.locator('button:has-text("Check for Updates")').click();
        await expect(badge).not.toBeVisible({ timeout: 2000 });
        await expect(page.locator('button:has-text("Checking")')).toHaveCount(0, { timeout: 30000 });
        await expect(badge).toBeVisible();
    });

    test('Download Update stages a real update when one is available', async ({ page }) => {
        await page.locator('button:has-text("Check for Updates")').click();
        await expect(page.locator('button:has-text("Checking")')).toHaveCount(0, { timeout: 30000 });

        const updateAvailable = await page.locator('.pf-v6-c-label', { hasText: 'Update available' }).isVisible();
        test.skip(!updateAvailable, 'No update available against the current registry state — nothing to download');

        await page.locator('button:has-text("Download Update")').click();
        await expect(page.locator('button:has-text("Downloading")')).toHaveCount(0, { timeout: 60000 });

        const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Staged Update') });
        await expect(stagedCard.locator('text=No update staged')).not.toBeVisible();
        await expect(stagedCard.locator('button:has-text("Apply & Reboot")')).toBeVisible();

        // Clean up — discard the staged update so this test doesn't leave a
        // pending reboot behind for whatever runs next.
        await stagedCard.locator('button:has-text("Cancel")').click();
        await page.locator('button:has-text("Discard")').click();
        await expect(stagedCard.locator('text=No update staged')).toBeVisible({ timeout: 15000 });
    });
});
