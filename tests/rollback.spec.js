const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, bootcStatus } = require('./helpers/host.js');

// cockpit.spawn()'s return value doesn't serialize cleanly through
// page.evaluate (it's not a plain native Promise) — verify real backend
// state via direct SSH instead, matching the pattern already documented in
// ../TESTING.md ("Verifying real bootc/server state directly").
function getRealRollbackQueued() {
    return bootcStatus().rollbackQueued;
}

test.describe('rollback', () => {
    test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);

    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('staging and cancelling a rollback round-trips cleanly, no reboot', async ({ page }) => {
        const target = bootcStatus().rollback;
        const name = target.image.version || target.image.imageDigest.replace(/^sha256:/, '').slice(0, 12);
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        const modal = page.locator('.pf-v6-c-modal-box');

        const rollBackBtn = rollbackCard.locator('button:has-text("Roll back")');
        await expect(rollBackBtn).toBeVisible({ timeout: 10000 });
        await rollBackBtn.click();

        // Step 1 names the target version.
        await expect(modal.locator('.pf-v6-c-modal-box__title')).toHaveText(`Roll back to ${name}?`);
        await modal.locator('button:has-text("Stage rollback")').click();

        // Staged: card swaps to Reboot to roll back / Cancel
        const rebootBtn = rollbackCard.locator('button:has-text("Reboot to roll back")');
        await expect(rebootBtn).toBeVisible({ timeout: 15000 });
        const cancelBtn = rollbackCard.locator('button:has-text("Cancel")');
        await expect(cancelBtn).toBeVisible();

        // Step 2 names it too. Back out with Cancel: no reboot here.
        await rebootBtn.click();
        await expect(modal.locator('.pf-v6-c-modal-box__title')).toHaveText(`Reboot to roll back to ${name}?`);
        await modal.locator('button:has-text("Cancel")').click();
        await expect(modal).toHaveCount(0);

        // Rollback is a toggle — cancelling calls the same stageRollback() again,
        // reverting it. No reboot ever happens in this flow.
        await cancelBtn.click();
        await expect(rollBackBtn).toBeVisible({ timeout: 15000 });
        await expect(rebootBtn).not.toBeVisible();

        // Verify against real backend state, not just the UI — rollbackQueued
        // must actually be false again, not just visually reverted.
        expect(getRealRollbackQueued()).toBe(false);
    });

    // A double click on the card's Cancel used to run `bootc rollback` twice:
    // the second either failed on the lock (red error, cleared again a moment
    // later by the first call's status reload, so watch for it the whole
    // time) or, once the first had finished, queued the rollback again.
    test('a double click on Cancel cancels the rollback once', async ({ page }) => {
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll back")').click();
        await page.locator('.pf-v6-c-modal-box button:has-text("Stage rollback")').click();
        const cancelBtn = rollbackCard.locator('button:has-text("Cancel")');
        await expect(cancelBtn).toBeVisible({ timeout: 15000 });
        expect(getRealRollbackQueued()).toBe(true);

        await page.evaluate(() => {
            window.ctSawError = false;
            new MutationObserver(() => {
                if (document.querySelector('.pf-v6-c-alert.pf-m-danger')) window.ctSawError = true;
            }).observe(document.body, { childList: true, subtree: true });
        });
        await cancelBtn.dblclick();
        await expect(rollbackCard.locator('button:has-text("Roll back")')).toBeVisible({ timeout: 15000 });
        // Settle: a second, late `bootc rollback` would flip it back.
        await page.waitForTimeout(5000);
        expect(getRealRollbackQueued()).toBe(false);
        await expect(rollbackCard.locator('button:has-text("Roll back")')).toBeVisible();
        expect(await page.evaluate(() => window.ctSawError), 'an error alert appeared').toBe(false);
    });
});
