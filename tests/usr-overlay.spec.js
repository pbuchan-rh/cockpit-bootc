const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, hostSudo, bootcStatus } = require('./helpers/host.js');

// Creates a real transient /usr overlay on the host, which stays until the
// next reboot (this spec never reboots). That changes what every other spec
// sees until then, hence the BOOTC_DESTRUCTIVE opt-in.
function setUsrOverlay() {
    hostSudo('bootc usr-overlay');
}

function hasUsrOverlay() {
    return !!bootcStatus().usrOverlay;
}

test.describe('usr-overlay warning', () => {
    test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);

    test.beforeAll(() => {
        if (!DESTRUCTIVE) return;
        if (!hasUsrOverlay()) setUsrOverlay();
    });

    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('drift warning shows, dismisses, and Reboot to Clear opens the right confirmation', async ({ page }) => {
        const warning = page.locator('.pf-v6-c-alert', { hasText: '/usr has a temporary overlay' });
        await expect(warning).toBeVisible({ timeout: 15000 });
        await expect(warning).toContainText('Changes under /usr will be lost at the next reboot.');

        const rebootToClear = warning.locator('button:has-text("Reboot to Clear")');
        await expect(rebootToClear).toBeVisible();
        await rebootToClear.click();

        // Confirm the right modal opened — but never actually confirm the
        // reboot itself. Rebooting the appliance is real, disruptive, and
        // not something a routine regression run should trigger; Cancel
        // verifies the modal's wiring without paying that cost.
        await expect(page.locator('text=Reboot to clear /usr overlay?')).toBeVisible();
        await expect(page.locator('.pf-v6-c-modal-box')).toContainText('The system will reboot and discard the /usr overlay.');
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('text=Reboot to clear /usr overlay?')).not.toBeVisible();

        // Dismiss (×) hides the warning without touching the overlay itself.
        await warning.getByRole('button', { name: 'Dismiss overlay warning' }).click();
        await expect(warning).not.toBeVisible({ timeout: 5000 });
    });
});
