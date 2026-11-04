const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON } = require('./helpers/host.js');

// `du -sh /ostree/repo` walks ~100k files. It runs once per page open and
// after operations that change the image store, not on every status refresh.
// Counted from the spawn requests the page sends over Cockpit's WebSocket.
async function countDuSpawns(page) {
    const counter = { du: 0 };
    await page.routeWebSocket(/\/cockpit\/socket$/, ws => {
        const server = ws.connectToServer();
        ws.onMessage(message => {
            if (typeof message === 'string' && message.includes('"spawn":["du"')) counter.du++;
            server.send(message);
        });
        server.onMessage(message => ws.send(message));
    });
    return counter;
}

test.describe('disk usage', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
    });

    test('du runs once on page load and its total is shown', async ({ page }) => {
        const counter = await countDuSpawns(page);
        await page.goto(COCKPIT_URL + MODULE_PATH);
        await expect(page.locator('.ct-status-gallery')).toBeVisible({ timeout: 15000 });

        await page.locator('button:has-text("deployments pinned")').click();
        await expect(page.locator('.ct-disk-usage-total')).toHaveText(/Total disk used by image store: [\d.,]+\s?[KMGT]/, { timeout: 15000 });
        await page.waitForTimeout(2000);
        expect(counter.du).toBe(1);
    });

    test('a status refresh (pin, then unpin) does not run du again', async ({ page }) => {
        test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);
        const counter = await countDuSpawns(page);
        await page.goto(COCKPIT_URL + MODULE_PATH);
        const bootedCard = page.locator('.ct-status-gallery .pf-v6-c-card').first();
        await expect(bootedCard).toBeVisible({ timeout: 15000 });
        await expect.poll(() => counter.du, { timeout: 15000 }).toBe(1);

        const pinBtn = bootedCard.locator('.pf-v6-c-card__footer button');
        const before = (await pinBtn.innerText()).trim();
        const flipped = before === 'Pin' ? 'Unpin' : 'Pin';
        await pinBtn.click();
        await expect(pinBtn).toHaveText(flipped, { timeout: 15000 });
        await pinBtn.click();
        await expect(pinBtn).toHaveText(before, { timeout: 15000 });
        await page.waitForTimeout(2000);
        expect(counter.du).toBe(1);
    });
});
