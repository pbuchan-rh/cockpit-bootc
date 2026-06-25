const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const { loginToCockpit } = require('./helpers/cockpit.js');

function sshHost() {
    return process.env.COCKPIT_URL.replace(/^https?:\/\//, '').replace(/:.*$/, '');
}

function setUsrOverlay() {
    const user = process.env.COCKPIT_USER;
    const pass = process.env.COCKPIT_PASS;
    // Cheap to set up (no reboot needed) — the overlay only clears on the
    // next real reboot, which this spec deliberately never triggers (see
    // below), so this is harmless to leave in place between runs.
    execSync(`ssh -o StrictHostKeyChecking=no ${user}@${sshHost()} "echo '${pass}' | sudo -S bootc usr-overlay 2>/dev/null"`);
}

function hasUsrOverlay() {
    const user = process.env.COCKPIT_USER;
    const pass = process.env.COCKPIT_PASS;
    const out = execSync(`ssh -o StrictHostKeyChecking=no ${user}@${sshHost()} "echo '${pass}' | sudo -S bootc status --json 2>/dev/null"`).toString();
    return !!JSON.parse(out).status.usrOverlay;
}

test.describe('usr-overlay warning', () => {
    test.beforeAll(() => {
        if (!hasUsrOverlay()) setUsrOverlay();
    });

    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('drift warning shows, dismisses, and Reboot to Clear opens the right confirmation', async ({ page }) => {
        const warning = page.locator('.pf-v6-c-alert', { hasText: '/usr has a transient overlay mounted' });
        await expect(warning).toBeVisible({ timeout: 15000 });
        await expect(warning).toContainText('bootc usr-overlay');

        const rebootToClear = warning.locator('button:has-text("Reboot to Clear")');
        await expect(rebootToClear).toBeVisible();
        await rebootToClear.click();

        // Confirm the right modal opened — but never actually confirm the
        // reboot itself. Rebooting the appliance is real, disruptive, and
        // not something a routine regression run should trigger; Cancel
        // verifies the modal's wiring without paying that cost.
        await expect(page.locator('text=Reboot to clear /usr overlay?')).toBeVisible();
        await expect(page.locator('text=discarding the transient', { exact: false })).toBeVisible();
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('text=Reboot to clear /usr overlay?')).not.toBeVisible();

        // Dismiss (×) hides the warning without touching the overlay itself.
        await warning.locator('button[aria-label="Close"], button.pf-v6-c-button.pf-m-plain').first().click();
        await expect(warning).not.toBeVisible({ timeout: 5000 });
    });
});
