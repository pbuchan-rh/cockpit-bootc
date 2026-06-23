const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const { loginToCockpit } = require('./helpers/cockpit.js');

function getRealTimerState() {
    const hostname = process.env.COCKPIT_URL.replace(/^https?:\/\//, '').replace(/:.*$/, '');
    const user = process.env.COCKPIT_USER;
    const pass = process.env.COCKPIT_PASS;
    try {
        return execSync(
            `ssh -o StrictHostKeyChecking=no ${user}@${hostname} "echo '${pass}' | sudo -S systemctl is-active bootc-fetch-apply-updates.timer 2>/dev/null"`
        ).toString().trim();
    } catch (ex) {
        // is-active exits non-zero for "inactive" — execSync throws on non-zero exit
        return ex.stdout.toString().trim();
    }
}

test.describe('automatic updates', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('toggling off requires no confirmation; toggling back on does', async ({ page }) => {
        const wasActive = getRealTimerState() === 'active';
        test.skip(!wasActive, 'Timer is not active right now — nothing to toggle off first');

        const toggle = page.locator('#bootc-auto-update-switch');
        await expect(toggle).toBeChecked();

        // Off: no confirmation modal.
        await toggle.click({ force: true });
        await expect(page.locator('text=Enable automatic updates?')).not.toBeVisible();
        await expect(toggle).not.toBeChecked({ timeout: 10000 });
        expect(getRealTimerState()).toBe('inactive');

        // On: requires the explicit confirmation modal — enabling this is a
        // real unattended fetch+apply+reboot cycle, not just a periodic check.
        await toggle.click({ force: true });
        await expect(page.locator('text=Enable automatic updates?')).toBeVisible();
        await page.locator('button:has-text("Enable")').click();
        await expect(toggle).toBeChecked({ timeout: 10000 });
        expect(getRealTimerState()).toBe('active');
    });
});
