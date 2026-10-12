const { test, expect } = require('@playwright/test');
const { loginToCockpit, MODULE_PATH } = require('./helpers/cockpit.js');

test.describe('status', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
    });

    test('module loads with Booted/Staged/Rollback cards', async ({ page }) => {
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });

        await expect(page.locator('.pf-v6-c-label:has-text("Booted")')).toBeVisible();
        await expect(page.locator('text=Staged Update')).toBeVisible();
        await expect(page.locator('.pf-v6-c-label:has-text("Rollback")')).toBeVisible();
    });

    test('Booted card shows real image/version/digest fields, not placeholders', async ({ page }) => {
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });

        const bootedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Booted') });
        await expect(bootedCard.locator('text=Image')).toBeVisible();
        await expect(bootedCard.locator('text=Version')).toBeVisible();
        await expect(bootedCard.locator('text=Digest')).toBeVisible();
        await expect(bootedCard.locator('text=Built')).toBeVisible();

        // The digest is truncated with an ellipsis in the UI — assert the
        // sha256: prefix is present, not an exact match on the full value.
        await expect(bootedCard.locator('text=/sha256:/')).toBeVisible();
    });

    test('Booted card digest has a working copy-to-clipboard button', async ({ page, context, browserName }) => {
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });

        const bootedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Booted') });
        const copyButton = bootedCard.getByRole('button', { name: 'Copy' });
        await expect(copyButton).toBeVisible();

        // Clipboard permission grants are Chromium-only in Playwright — the
        // button still renders and is clickable in Firefox, it just can't be
        // verified via navigator.clipboard.readText() here.
        test.skip(browserName !== 'chromium', 'Clipboard read-back only supported in Chromium');

        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await copyButton.click();
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        // The card only ever displays a truncated digest (PatternFly's own
        // Truncate, since formatDigest()'s manual slicing was removed) — a
        // full, untruncated sha256 digest is exactly this shape, proving the
        // copy button grabs the real value, not the shortened display text.
        expect(copied).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    test('admin access is unlocked before the module needs it', async ({ page }) => {
        // If admin elevation in loginToCockpit failed, the module would show
        // the "Administrative access required" empty state instead of real
        // status — this should never be visible after a successful login.
        await expect(page.locator('text=Administrative access required')).not.toBeVisible();
    });
});

// H3: RHEL package-mode hosts ship the bootc binary too. The manifest
// condition (/run/ostree-booted) must hide the module there, and if the page
// is reached anyway it must show a plain empty state with no actions.
// Needs a second, package-mode host: NOTBOOTC_URL=https://<host>:9090 (same
// COCKPIT_USER/COCKPIT_PASS). NOTBOOTC_MODULE_PATH overrides where the page
// is reached, for hosts where Cockpit refuses to serve a package whose
// condition fails.
test.describe('non-bootc host', () => {
    const url = process.env.NOTBOOTC_URL;
    test.skip(!url, 'set NOTBOOTC_URL to a package-mode host with cockpit-bootc installed');

    test('is hidden from the menu, and reached directly shows only the not-bootc empty state', async ({ page }) => {
        await loginToCockpit(page, { url, modulePath: '/system' });
        await expect(page.locator('#host-apps, nav').first()).toContainText('Overview', { timeout: 15000 });
        await expect(page.locator('#host-apps a:has-text("Image Updates"), nav a:has-text("Image Updates")')).toHaveCount(0);

        await page.goto(url + (process.env.NOTBOOTC_MODULE_PATH || MODULE_PATH));
        await expect(page.locator('#ct-not-bootc')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#ct-not-bootc')).toContainText('Not a bootc system');
        await expect(page.locator('button:has-text("Check for Updates")')).toHaveCount(0);
        await expect(page.locator('#switch-image-ref')).toHaveCount(0);
        await expect(page.locator('#bootc-auto-update-switch')).toHaveCount(0);
    });
});
