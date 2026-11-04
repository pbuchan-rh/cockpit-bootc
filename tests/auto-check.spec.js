const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');

// The update check runs by itself once per page open, after the status cards
// render, and fails quietly when the registry can't be reached.
const BADGE = /^(Up to date|Update available)$/;

// Rewrite the registry in every `skopeo inspect` the page spawns. Cockpit
// sends a channel's spawn argv in its "open" control message over the
// WebSocket, so this changes what runs on the host without touching it.
async function redirectSkopeo(page, unreachable) {
    await page.routeWebSocket(/\/cockpit\/socket$/, ws => {
        const server = ws.connectToServer();
        ws.onMessage(message => {
            if (typeof message === 'string' && message.includes('"skopeo"') && message.includes('docker://')) {
                message = message.replace(/docker:\/\/[^/"]+\//g, `docker://${unreachable}/`);
            }
            server.send(message);
        });
        server.onMessage(message => ws.send(message));
    });
}

const errorAlert = page => page.locator('.pf-v6-c-alert.pf-m-danger');
const statusCards = page => page.locator('.ct-status-gallery');
// First button in the header: "Check for updates", or "Checking…" while it runs.
const checkButton = page => page.locator('#ct-image-ref-header button').first();

test.describe('automatic update check', () => {
    test('runs on page load without clicking Check for updates', async ({ page }) => {
        await loginToCockpit(page);
        await expect(statusCards(page)).toBeVisible({ timeout: 15000 });
        await expect(page.locator('.pf-v6-c-label', { hasText: BADGE })).toBeVisible({ timeout: 15000 });
        await expect(errorAlert(page)).toHaveCount(0);
    });

    // Refused connection: skopeo fails at once.
    test('an unreachable registry fails quietly: no error, no badge', async ({ page }) => {
        await loginToCockpit(page);
        await redirectSkopeo(page, '127.0.0.1:1');
        await page.goto(COCKPIT_URL + MODULE_PATH);
        await expect(statusCards(page)).toBeVisible({ timeout: 15000 });

        const button = checkButton(page);
        await expect(button).toBeEnabled({ timeout: 15000 });
        await expect(errorAlert(page)).toHaveCount(0);
        await expect(page.locator('.pf-v6-c-label', { hasText: BADGE })).toHaveCount(0);

        // The manual button still reports the failure.
        await button.click();
        await expect(errorAlert(page)).toContainText('Checking for updates failed', { timeout: 30000 });
    });

    // Black hole (TEST-NET-1, RFC 5737): nothing answers, so only the 10 s
    // limit ends the check. The cards must not wait for it.
    test('a registry that never answers times out quietly without delaying the cards', async ({ page }) => {
        await loginToCockpit(page);
        await redirectSkopeo(page, '192.0.2.1:5000');
        const t0 = Date.now();
        await page.goto(COCKPIT_URL + MODULE_PATH);
        await expect(statusCards(page)).toBeVisible({ timeout: 15000 });
        const cardsMs = Date.now() - t0;

        const button = checkButton(page);
        await expect(button).toBeDisabled(); // checking
        await expect(button).toBeEnabled({ timeout: 20000 });
        const checkMs = Date.now() - t0;
        console.log(`AUTOCHECK-TIMEOUT cards=${cardsMs}ms checkEnded=${checkMs}ms`);
        expect(cardsMs).toBeLessThan(5000);
        expect(checkMs).toBeGreaterThan(9000);
        expect(checkMs).toBeLessThan(16000);
        await expect(errorAlert(page)).toHaveCount(0);
        await expect(page.locator('.pf-v6-c-label', { hasText: BADGE })).toHaveCount(0);
    });
});
