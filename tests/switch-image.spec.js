const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

const ORIGINAL_REF = '10.0.0.208:5000/bootc-cockpit-demo:latest';
const OTHER_TAG_REF = '10.0.0.208:5000/bootc-cockpit-demo:1.0';

test.describe('switch image', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('Preview shows real registry data before any commitment', async ({ page }) => {
        await page.fill('#switch-image-ref', OTHER_TAG_REF);
        await page.locator('button:has-text("Preview")').click();
        await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 20000 });

        const preview = page.locator('.ct-switch-preview');
        await expect(preview).toBeVisible();
        await expect(preview.locator('text=/sha256:/')).toBeVisible();

        // Nothing committed yet — Staged Update card must still be empty.
        const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Staged Update') });
        await expect(stagedCard.locator('text=No update staged')).toBeVisible();
    });

    test('Switch stages the new image, then switching back restores original state', async ({ page }) => {
        // --- Switch to the other tag ---
        await page.fill('#switch-image-ref', OTHER_TAG_REF);
        await page.locator('button:has-text("Preview")').click();
        await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 20000 });
        await page.locator('button:has-text("Switch")').click();

        await expect(page.locator('text=Switch image?')).toBeVisible();
        await page.locator('.pf-v6-c-modal-box button:has-text("Switch")').click();
        await expect(page.locator('button:has-text("Switching")')).toHaveCount(0, { timeout: 60000 });

        await expect(page.locator(`code:has-text("${OTHER_TAG_REF}")`).first()).toBeVisible({ timeout: 15000 });
        const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Staged Update') });
        await expect(stagedCard.locator('text=No update staged')).not.toBeVisible();

        // --- Switch back to the original ref to leave the appliance clean ---
        await page.fill('#switch-image-ref', ORIGINAL_REF);
        await page.locator('button:has-text("Preview")').click();
        await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 20000 });
        await page.locator('button:has-text("Switch")').click();
        await expect(page.locator('text=Switch image?')).toBeVisible();
        await page.locator('.pf-v6-c-modal-box button:has-text("Switch")').click();
        await expect(page.locator('button:has-text("Switching")')).toHaveCount(0, { timeout: 60000 });

        await expect(page.locator(`code:has-text("${ORIGINAL_REF}")`).first()).toBeVisible({ timeout: 15000 });

        // Switching always stages a new deployment, even back to a ref whose
        // digest matches what's already booted — discard it so this test
        // doesn't leave a (harmless but real) pending reboot behind for
        // whatever runs next.
        await stagedCard.locator('button:has-text("Cancel")').click();
        await page.locator('button:has-text("Discard")').click();
        await expect(stagedCard.locator('text=No update staged')).toBeVisible({ timeout: 15000 });
    });
});
