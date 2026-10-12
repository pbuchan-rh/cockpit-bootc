const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

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

    test('the auto-update note says the target keeps its own setting, whatever the switch shows now', async ({ page }) => {
        // The off switch is a mask in /etc and /etc is per deployment, so
        // turning auto-update off before rolling back does not carry over
        // (verified live, 3.12 -> 3.11 -> 3.12). The note must not offer that
        // as protection, and must show regardless of the current switch state.
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll Back")').click();

        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(page.locator('text=Stage rollback?')).toBeVisible();
        await expect(modal).toContainText('also has its own automatic-update setting');
        await expect(modal).toContainText('After the reboot, check the Automatic updates switch');
        await expect(modal).not.toContainText('unless you turn off automatic updates first');

        await modal.locator('button:has-text("Cancel")').click();
    });
});
