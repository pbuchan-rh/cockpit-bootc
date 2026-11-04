const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');

// Ad-hoc (no assertions about layout): prints the left edges of the header
// title and of the body content below it, and the actions block position,
// to settle the header-alignment item (usability review L4: "the header
// title is indented about 47 px relative to the body below it").
test('measure header alignment', async ({ page }) => {
    await loginToCockpit(page);
    await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 15000 });
    const box = async sel => {
        const b = await page.locator(sel).first().boundingBox();
        return b && { x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.x + b.width) };
    };
    console.log('HEADER', JSON.stringify({
        title: await box('#ct-image-ref-header .pf-v6-c-card__title-text'),
        ref: await box('.ct-tracked-ref-value'),
        switchLabel: await box('label[for="switch-image-ref"]'),
        divider: await box('.ct-tracking-divider'),
        actions: await box('#ct-image-ref-header .pf-v6-c-card__actions'),
        firstButton: await box('#ct-image-ref-header button'),
        downloadButton: await box('#ct-image-ref-header button >> nth=1'),
        autoUpdate: await box('#ct-image-ref-header .pf-v6-c-switch'),
        switchButton: await box('.ct-switch-row button:has-text("Switch")'),
    }));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
});
