const { test, expect } = require('@playwright/test');
const { COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');

// Deliberately does NOT use loginToCockpit/requestAdmin — this suite is
// specifically about the state before admin is ever unlocked.
async function loginWithoutElevating(page) {
    await page.goto(COCKPIT_URL, { waitUntil: 'networkidle' });
    await page.fill('#login-user-input', process.env.COCKPIT_USER);
    await page.fill('#login-password-input', process.env.COCKPIT_PASS);
    await page.click('#login-button');
    await page.waitForFunction(
        () => !document.getElementById('login-user-input'),
        { timeout: 15000 }
    );
    await page.goto(COCKPIT_URL + MODULE_PATH);
    await page.waitForLoadState('domcontentloaded');
}

test.describe('admin gating', () => {
    test('without admin, shows the access-required notice and no status cards', async ({ page }) => {
        await loginWithoutElevating(page);

        await expect(page.locator('text=Administrative access required')).toBeVisible({ timeout: 15000 });

        // No real status data should render at all — not a real card showing
        // stale/placeholder data, an actual absence of the Gallery.
        await expect(page.locator('text=Booted')).not.toBeVisible();
        await expect(page.locator('text=Staged Update')).not.toBeVisible();
        await expect(page.locator('text=Rollback')).not.toBeVisible();
    });

    test('mutating buttons are disabled without admin', async ({ page }) => {
        await loginWithoutElevating(page);
        await expect(page.locator('text=Administrative access required')).toBeVisible({ timeout: 15000 });

        await expect(page.locator('button:has-text("Check for Updates")')).toBeDisabled();
        await expect(page.locator('button:has-text("Download Update")')).toBeDisabled();
        await expect(page.locator('button:has-text("Switch")')).toBeDisabled();
    });
});
