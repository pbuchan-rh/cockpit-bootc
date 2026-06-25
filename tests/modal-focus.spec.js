const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

// Regression coverage for a real bug (2026-06-24): closing a confirm modal
// returns focus to whichever button opened it. Left unblurred, a
// danger-variant button (Delete) keeps rendering its :focus style — a
// darker red than its resting state — which reads as "stuck," not "closed."
// closeConfirmModal() in app.jsx fixes this for every confirmAction trigger
// by deferring a blur to the next tick (PatternFly's own focus-restore-on-
// close logic would otherwise undo an immediate blur).
test.describe('modal focus handling', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('Cancel does not leave focus on the triggering button', async ({ page }) => {
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        const rollBackBtn = rollbackCard.locator('button:has-text("Roll Back")');

        await rollBackBtn.click();
        await expect(page.locator('text=Stage rollback?')).toBeVisible();
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('text=Stage rollback?')).not.toBeVisible();

        const isFocused = await rollBackBtn.evaluate(el => el === document.activeElement);
        expect(isFocused).toBe(false);
    });

    test('Escape does not leave focus on the triggering button', async ({ page }) => {
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        const rollBackBtn = rollbackCard.locator('button:has-text("Roll Back")');

        await rollBackBtn.click();
        await expect(page.locator('text=Stage rollback?')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('text=Stage rollback?')).not.toBeVisible();

        const isFocused = await rollBackBtn.evaluate(el => el === document.activeElement);
        expect(isFocused).toBe(false);
    });

    test('a danger-variant trigger (Delete) is not stuck in its :focus color after Cancel', async ({ page }) => {
        const toggle = page.locator('button:has-text("deployments pinned")');
        await toggle.click();

        const table = page.locator('table[aria-label="All ostree deployments"]');
        const rows = table.locator('tbody tr');
        const count = await rows.count();

        let deleteBtn = null;
        for (let i = 0; i < count; i++) {
            const candidate = rows.nth(i).locator('button:has-text("Delete")');
            if (await candidate.getAttribute('aria-disabled') === null) { deleteBtn = candidate; break; }
        }
        test.skip(!deleteBtn, 'No actionable (off-slot, unpinned) Delete button to test against');

        const before = await deleteBtn.evaluate(el => getComputedStyle(el).backgroundColor);
        await deleteBtn.click();
        await expect(page.locator('text=Delete deployment?')).toBeVisible();
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('text=Delete deployment?')).not.toBeVisible();

        const after = await deleteBtn.evaluate(el => getComputedStyle(el).backgroundColor);
        expect(after).toBe(before);
        const isFocused = await deleteBtn.evaluate(el => el === document.activeElement);
        expect(isFocused).toBe(false);
    });
});
