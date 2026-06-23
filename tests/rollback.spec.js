const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const { loginToCockpit } = require('./helpers/cockpit.js');

// cockpit.spawn()'s return value doesn't serialize cleanly through
// page.evaluate (it's not a plain native Promise) — verify real backend
// state via direct SSH instead, matching the pattern already documented in
// ../TESTING.md ("Verifying real bootc/server state directly").
function getRealRollbackQueued() {
    const hostname = process.env.COCKPIT_URL.replace(/^https?:\/\//, '').replace(/:.*$/, '');
    const user = process.env.COCKPIT_USER;
    const pass = process.env.COCKPIT_PASS;
    const out = execSync(
        `ssh -o StrictHostKeyChecking=no ${user}@${hostname} "echo '${pass}' | sudo -S bootc status --json 2>/dev/null"`
    ).toString();
    return JSON.parse(out).status.rollbackQueued;
}

test.describe('rollback', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('staging and cancelling a rollback round-trips cleanly, no reboot', async ({ page }) => {
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });

        const rollBackBtn = rollbackCard.locator('button:has-text("Roll Back")');
        await expect(rollBackBtn).toBeVisible({ timeout: 10000 });
        await rollBackBtn.click();

        // Confirm modal — default/rollback action title is "Stage rollback?"
        await expect(page.locator('text=Stage rollback?')).toBeVisible();
        await page.locator('button:has-text("Stage Rollback")').click();

        // Staged: card swaps to Reboot to Roll Back / Cancel
        await expect(rollbackCard.locator('button:has-text("Reboot to Roll Back")')).toBeVisible({ timeout: 15000 });
        const cancelBtn = rollbackCard.locator('button:has-text("Cancel")');
        await expect(cancelBtn).toBeVisible();

        // Rollback is a toggle — cancelling calls the same stageRollback() again,
        // reverting it. No reboot ever happens in this flow.
        await cancelBtn.click();
        await expect(rollBackBtn).toBeVisible({ timeout: 15000 });
        await expect(rollbackCard.locator('button:has-text("Reboot to Roll Back")')).not.toBeVisible();

        // Verify against real backend state, not just the UI — rollbackQueued
        // must actually be false again, not just visually reverted.
        expect(getRealRollbackQueued()).toBe(false);
    });
});
