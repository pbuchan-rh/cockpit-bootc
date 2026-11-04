const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');
const { bootcStatus, hostSudo } = require('./helpers/host.js');
const { fakeSpawns, PRINT } = require('./helpers/fake-spawn.js');

const AUTO_UPDATE_HINT = 'Automatic updates can undo a rollback: check the switch after the reboot.';
const rollbackName = target => target.image.version || target.image.imageDigest.replace(/^sha256:/, '').slice(0, 12);

test.describe('rollback confirm warnings', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('the /etc-revert warning is always present', async ({ page }) => {
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll Back")').click();

        const modal = page.locator('.pf-v6-c-modal-box', { hasText: /Roll back to .+\?/ });
        await expect(modal).toBeVisible();
        await expect(modal.locator('strong')).toHaveText(/^\/etc goes back to .+'s copy; changes made since are lost\.$/);

        // Never actually confirm — staging a real rollback isn't needed to
        // verify the modal's wording, and rollback.spec.js already covers
        // the real stage/cancel round-trip.
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('.pf-v6-c-modal-box', { hasText: /Roll back to .+\?/ })).not.toBeVisible();
    });

    test('the title names the version being rolled back to', async ({ page }) => {
        // From bootc status's rollback entry: its version label, or the
        // short digest when the image has none.
        const target = bootcStatus().rollback;
        test.skip(!target, 'no rollback deployment on this host');
        const name = rollbackName(target);

        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll back")').click();
        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(modal.locator('.pf-v6-c-modal-box__title')).toHaveText(`Roll back to ${name}?`);
        await modal.locator('button:has-text("Cancel")').click();
    });

    test('the auto-update note says the target keeps its own setting, whatever the switch shows now', async ({ page }) => {
        // The off switch is a mask in /etc and /etc is per deployment, so
        // turning auto-update off before rolling back does not carry over
        // (verified live, 3.12 -> 3.11 -> 3.12). The note must not offer that
        // as protection, and must show regardless of the current switch state.
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Roll Back")').click();

        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(page.locator('.pf-v6-c-modal-box', { hasText: /Roll back to .+\?/ })).toBeVisible();
        await expect(modal).toContainText(AUTO_UPDATE_HINT);
        await expect(modal).not.toContainText('unless you turn off automatic updates first');

        await modal.locator('button:has-text("Cancel")').click();
    });

    // States the host isn't in, from a faked `bootc status` (nothing is
    // staged on the host; every dialog is cancelled).
    test('the reboot step names the version, the /etc loss and the auto-update hint', async ({ page }) => {
        // Reachable without the first step: a rollback queued from another
        // session or the CLI shows "Reboot to roll back" straight away.
        const real = JSON.parse(hostSudo('bootc status --json'));
        test.skip(!real.status.rollback, 'no rollback deployment on this host');
        real.status.rollbackQueued = true;
        await fakeSpawns(page, [{ match: argv => argv[0] === 'bootc' && argv[1] === 'status', script: PRINT, args: [JSON.stringify(real)] }]);
        await page.goto(COCKPIT_URL + MODULE_PATH);

        const name = rollbackName(real.status.rollback);
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Rollback') });
        await rollbackCard.locator('button:has-text("Reboot to roll back")').click();
        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(modal.locator('.pf-v6-c-modal-box__title')).toHaveText(`Reboot to roll back to ${name}?`);
        await expect(modal.locator('strong')).toHaveText('Changes to /etc made since then are lost.');
        await expect(modal).toContainText(`The system reboots into ${name}.`);
        await expect(modal).toContainText(AUTO_UPDATE_HINT);
        await modal.locator('button:has-text("Cancel")').click();
        await expect(modal).toHaveCount(0);
    });

    test('with an update staged, the stage step says the staged update is discarded', async ({ page }) => {
        const real = JSON.parse(hostSudo('bootc status --json'));
        test.skip(!real.status.rollback, 'no rollback deployment on this host');
        const staged = JSON.parse(JSON.stringify(real.status.booted));
        staged.image.version = '9.99';
        staged.image.imageDigest = 'sha256:' + 'f'.repeat(64);
        staged.ostree.checksum = 'e'.repeat(64);
        real.status.staged = staged;
        await fakeSpawns(page, [{ match: argv => argv[0] === 'bootc' && argv[1] === 'status', script: PRINT, args: [JSON.stringify(real)] }]);
        await page.goto(COCKPIT_URL + MODULE_PATH);

        const name = rollbackName(real.status.rollback);
        const rollbackCard = page.locator('.pf-v6-c-card', { has: page.locator('.pf-v6-c-label', { hasText: /^Rollback$/ }) });
        await rollbackCard.locator('button:has-text("Roll back")').click();
        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(modal.locator('.pf-v6-c-modal-box__body p').first())
                .toHaveText(`The staged update (9.99) is discarded. ${name} is staged for the next boot. /etc goes back to ${name}'s copy; changes made since are lost.`);
        await expect(modal).toContainText(AUTO_UPDATE_HINT);
        await modal.locator('button:has-text("Cancel")').click();
        await expect(modal).toHaveCount(0);
    });
});
