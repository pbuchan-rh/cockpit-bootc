const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, TIMER_ACTIVE_SKIP_REASON, timerActive, bootcStatus, hostSudo } = require('./helpers/host.js');

// A pull shows real progress from bootc's --progress-fd JSON stream: a bar
// with bytes downloaded of the total still to fetch, and layers done of
// needed. Needs a tag whose layers are not on disk yet, or there is nothing
// to download and bootc reports no byte progress at all: take the first
// candidate the image store doesn't hold. A discarded stage leaves its image
// in the store until bootc's next stage prunes it, so consecutive runs
// alternate between candidates. PROGRESS_TAG_REF overrides the choice.
const REPO = '10.0.0.208:5000/bootc-cockpit-demo';
const CANDIDATE_TAGS = ['3.11', '3.10', '3.8'];

function pickUncachedRef() {
    if (process.env.PROGRESS_TAG_REF) return process.env.PROGRESS_TAG_REF;
    const stored = hostSudo('ostree container image list --repo=/ostree/repo');
    const tag = CANDIDATE_TAGS.find(t => !stored.includes(`${REPO}:${t}\n`));
    return tag ? `${REPO}:${tag}` : null;
}

test.describe('download progress', () => {
    test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);

    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('switching to an image not on disk shows bytes and layers as they download', async ({ page }) => {
        test.setTimeout(10 * 60000);
        test.skip(timerActive(), TIMER_ACTIVE_SKIP_REASON);
        const before = bootcStatus();
        expect(before.staged, 'nothing may be staged before this test').toBeNull();
        const originalRef = before.booted.image.image.image;
        // Staging GCs every unpinned deployment except the booted one; the
        // rollback must survive this test.
        expect(before.rollback?.pinned, 'pin the rollback deployment before running destructive specs').toBe(true);
        const PULL_REF = pickUncachedRef();
        expect(PULL_REF, 'every candidate tag is already in the image store').not.toBeNull();

        await page.fill('#switch-image-ref', PULL_REF);
        await page.locator('button:has-text("Inspect")').click();
        await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 30000 });
        await page.locator('.ct-switch-row button:has-text("Switch")').click();
        await page.locator('.pf-v6-c-modal-box button:has-text("Switch")').click();

        const bar = page.locator('#bootc-pull-progress');
        await expect(bar).toBeVisible({ timeout: 60000 });
        await expect(bar).toContainText('Downloading');
        await expect(bar).toContainText(/[\d.]+ [kMG]B of [\d.]+ [kMG]B \(\d+ of \d+ layers\)/);
        const valueNow = Number(await bar.locator('[role="progressbar"]').getAttribute('aria-valuenow'));
        expect(valueNow).toBeGreaterThanOrEqual(0);
        expect(valueNow).toBeLessThanOrEqual(100);

        await expect(page.locator('button:has-text("Switching")')).toHaveCount(0, { timeout: 8 * 60000 });
        await expect(bar).toHaveCount(0);
        // The JSON lines never reach the text log.
        await expect(page.locator('#bootc-progress-log')).not.toContainText('ProgressBytes');

        const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=/Staged update/i') });
        await expect(stagedCard.locator('text=No update staged')).not.toBeVisible({ timeout: 15000 });

        // Clean up: discard the stage, then make sure the host tracks the
        // original ref again.
        await stagedCard.locator('button:has-text("Cancel")').click();
        await page.locator('.pf-v6-c-modal-box button:has-text("Discard")').click();
        await expect(stagedCard.locator('text=No update staged')).toBeVisible({ timeout: 30000 });
        const after = bootcStatus();
        expect(after.staged).toBeNull();
        expect(after.rollbackQueued).toBe(false);
        expect(after.booted.image.image.image).toBe(originalRef);
        expect(JSON.parse(hostSudo('bootc status --json')).spec.image.image).toBe(originalRef);
    });
});
