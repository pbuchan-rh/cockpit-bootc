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
        return ex.stdout.toString().trim();
    }
}

test.describe('rollback confirm warnings', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('the /etc-revert warning is always present', async ({ page }) => {
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll Back")').click();

        await expect(page.locator('text=Stage rollback?')).toBeVisible();
        await expect(page.locator('text=reverts', { exact: false })).toBeVisible();
        await expect(page.locator('code:has-text("/etc")')).toBeVisible();

        // Never actually confirm — staging a real rollback isn't needed to
        // verify the modal's wording, and rollback.spec.js already covers
        // the real stage/cancel round-trip.
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('text=Stage rollback?')).not.toBeVisible();
    });

    test('the auto-update-will-undo-rollback warning appears only while the timer is active', async ({ page }) => {
        const wasActive = getRealTimerState() === 'active';
        test.skip(!wasActive, 'Timer is not active right now — the extra warning would not render');

        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll Back")').click();

        await expect(page.locator('text=Stage rollback?')).toBeVisible();
        await expect(page.locator('text=Automatic updates are currently', { exact: false })).toBeVisible();
        await expect(page.locator('text=will likely re-check, re-stage, and re-apply', { exact: false })).toBeVisible();

        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    });
});
