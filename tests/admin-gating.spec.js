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
    // Same pattern as Cockpit's own pages (e.g. Diagnostic Reports): a
    // PatternFly empty state with the button that turns administrative
    // access on, and nothing else.
    const emptyState = page => page.locator('.pf-v6-c-empty-state', { hasText: 'Administrative access required' });
    const unlockButton = page => emptyState(page).locator('button:has-text("Turn on administrative access")');

    test('without admin, shows the access-required empty state and no status cards', async ({ page }) => {
        await loginWithoutElevating(page);

        await expect(emptyState(page)).toBeVisible({ timeout: 15000 });
        await expect(unlockButton(page)).toBeVisible();

        // No real status data should render at all — not a real card showing
        // stale/placeholder data, an actual absence of the Gallery.
        await expect(page.locator('text=Booted')).not.toBeVisible();
        await expect(page.locator('text=/Staged update/i')).not.toBeVisible();
        await expect(page.locator('text=Rollback')).not.toBeVisible();
    });

    test('no mutating controls are offered without admin', async ({ page }) => {
        await loginWithoutElevating(page);
        await expect(emptyState(page)).toBeVisible({ timeout: 15000 });

        await expect(page.locator('button:has-text("Check for updates")')).toHaveCount(0);
        await expect(page.locator('button:has-text("Download update")')).toHaveCount(0);
        await expect(page.locator('#switch-image-ref')).toHaveCount(0);
        await expect(page.locator('#bootc-auto-update-switch')).toHaveCount(0);
    });

    test('the empty state button turns admin on and the status loads', async ({ page }) => {
        await loginWithoutElevating(page);
        await unlockButton(page).click({ timeout: 15000 });

        // A sudo password prompt, a "You now have administrative access."
        // dialog with only a Close button, or (NOPASSWD sudo, as on the test host)
        // no dialog left open at all.
        const gallery = page.locator('.ct-status-gallery');
        const pwField = page.locator('.pf-v6-c-modal-box input[type="password"]');
        const closeButton = page.locator('.pf-v6-c-modal-box button:has-text("Close")');
        await expect(pwField.or(closeButton).or(gallery).first()).toBeVisible({ timeout: 15000 });
        if (await pwField.isVisible()) {
            await pwField.fill(process.env.COCKPIT_PASS);
            await page.locator('.pf-v6-c-modal-box button:has-text("Authenticate")').click();
        } else if (await closeButton.isVisible()) {
            await closeButton.click();
        }

        await expect(gallery).toBeVisible({ timeout: 30000 });
        await expect(emptyState(page)).toHaveCount(0);
        await expect(page.locator('.pf-v6-c-alert.pf-m-danger')).toHaveCount(0);
    });
});
