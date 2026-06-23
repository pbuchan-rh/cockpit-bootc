const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

test.describe('status', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
    });

    test('module loads with Booted/Staged/Rollback cards', async ({ page }) => {
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });

        await expect(page.locator('text=Booted')).toBeVisible();
        await expect(page.locator('text=Staged Update')).toBeVisible();
        await expect(page.locator('text=Rollback')).toBeVisible();
    });

    test('Booted card shows real image/version/digest fields, not placeholders', async ({ page }) => {
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });

        const bootedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Booted') });
        await expect(bootedCard.locator('text=Image')).toBeVisible();
        await expect(bootedCard.locator('text=Version')).toBeVisible();
        await expect(bootedCard.locator('text=Digest')).toBeVisible();
        await expect(bootedCard.locator('text=Built')).toBeVisible();

        // The digest is truncated with an ellipsis in the UI — assert the
        // sha256: prefix is present, not an exact match on the full value.
        await expect(bootedCard.locator('text=/sha256:/')).toBeVisible();
    });

    test('admin access is unlocked before the module needs it', async ({ page }) => {
        // If admin elevation in loginToCockpit failed, the module would show
        // the "Administrative access required" empty state instead of real
        // status — this should never be visible after a successful login.
        await expect(page.locator('text=Administrative access required')).not.toBeVisible();
    });
});
