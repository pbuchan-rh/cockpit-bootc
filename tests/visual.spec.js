const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

// Usability review L4: PatternFly/Cockpit sentence case, a neutral Rollback
// label (red reads as an error), and a header lined up with the body.
test.describe('visual', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 15000 });
    });

    test('buttons and labels use sentence case', async ({ page }) => {
        // Exact, case-sensitive text: has-text() alone ignores case.
        const header = page.locator('#ct-image-ref-header');
        await expect(header.getByRole('button', { name: 'Check for updates', exact: true })).toBeVisible({ timeout: 20000 });
        await expect(header.getByRole('button', { name: 'Download update', exact: true })).toBeVisible();
        await expect(page.locator('.pf-v6-c-label', { hasText: /^Staged update$/ })).toBeVisible();
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('.pf-v6-c-label', { hasText: /^Rollback$/ }) });
        await expect(rollbackCard.getByRole('button', { name: 'Roll back', exact: true })).toBeVisible();
    });

    test('the Rollback label is neutral, not red', async ({ page }) => {
        const label = page.locator('.ct-status-gallery .pf-v6-c-label', { hasText: /^Rollback$/ });
        await expect(label).toBeVisible();
        await expect(label).not.toHaveClass(/pf-m-red/);
    });

    test('the header lines up with the body below it', async ({ page }) => {
        const title = await page.locator('#ct-image-ref-header .pf-v6-c-card__title-text').boundingBox();
        const label = await page.locator('label[for="switch-image-ref"]').boundingBox();
        const lastAction = await page.locator('#ct-image-ref-header button').nth(1).boundingBox();
        const switchBtn = await page.locator('.ct-switch-row button', { hasText: /^Switch$/ }).boundingBox();
        expect(Math.abs(title.x - label.x)).toBeLessThanOrEqual(2);
        expect(Math.abs((lastAction.x + lastAction.width) - (switchBtn.x + switchBtn.width))).toBeLessThanOrEqual(2);
    });
});
