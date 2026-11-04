const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, timerState, timerWantedBy, hostSudo } = require('./helpers/host.js');

// RHEL bootc images enable bootc-fetch-apply-updates.timer from /usr
// (default.target.wants), so `systemctl disable` is undone at the next boot.
// 1.1.2 turns it off with a mask instead, and the switch reads both
// UnitFileState and ActiveState: on = active and not masked.
const isOn = ({ unitFileState, activeState }) =>
    activeState === 'active' && !unitFileState.startsWith('masked');

// Stopped (from the CLI, or 1.1.1's disable) but not masked: the image's
// /usr wants link starts it again at the next boot.
const backAtBoot = state => !isOn(state) && !state.unitFileState.startsWith('masked') && timerWantedBy() !== '';

test.describe('automatic updates', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('the switch shows what systemd reports', async ({ page }) => {
        const toggle = page.locator('#bootc-auto-update-switch');
        await expect(toggle).toBeEnabled({ timeout: 15000 });
        const real = timerState();
        if (isOn(real)) await expect(toggle).toBeChecked();
        else await expect(toggle).not.toBeChecked();
    });

    test('a stopped but unmasked timer shows Off with a "back on after reboot" hint', async ({ page }) => {
        const toggle = page.locator('#bootc-auto-update-switch');
        await expect(toggle).toBeEnabled({ timeout: 15000 });
        const hint = page.locator('#bootc-auto-update-hint');
        if (backAtBoot(timerState())) {
            await expect(toggle).not.toBeChecked();
            await expect(hint).toHaveText('Back on after reboot. Keep off');
        } else {
            await expect(hint).toHaveCount(0);
        }
    });

    test('Keep off masks a stopped timer, so it stays off after a reboot', async ({ page }) => {
        test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);
        const initial = timerState();
        test.skip(initial.unitFileState.startsWith('masked'), 'Timer is masked; nothing to keep off');
        try {
            // Stopped, not masked: what `systemctl stop` (or 1.1.1) leaves.
            hostSudo('systemctl stop bootc-fetch-apply-updates.timer');
            await page.reload();
            const toggle = page.locator('#bootc-auto-update-switch');
            await expect(toggle).toBeEnabled({ timeout: 15000 });
            await expect(toggle).not.toBeChecked();
            const hint = page.locator('#bootc-auto-update-hint');
            await expect(hint).toBeVisible();

            await hint.locator('button:has-text("Keep off")').click();
            await expect(hint).toHaveCount(0, { timeout: 10000 });
            await expect(toggle).not.toBeChecked();
            expect(timerState()).toEqual({ unitFileState: 'masked', activeState: 'inactive' });
        } finally {
            // Back to how it was: unmasked, and running only if it was.
            hostSudo('systemctl unmask bootc-fetch-apply-updates.timer');
            if (initial.activeState === 'active') hostSudo('systemctl start bootc-fetch-apply-updates.timer');
        }
        expect(timerState().activeState).toBe(initial.activeState);
    });

    test('Off masks the timer so it stays off after a reboot; On unmasks and starts it', async ({ page }) => {
        test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);
        test.skip(!isOn(timerState()), 'Timer is not on right now; nothing to turn off first');

        const toggle = page.locator('#bootc-auto-update-switch');
        await expect(toggle).toBeChecked({ timeout: 15000 });

        // Off: no confirmation modal, and the timer ends up masked + stopped,
        // not merely disabled (which the /usr wants link would undo at boot).
        await toggle.click({ force: true });
        await expect(page.locator('text=Enable automatic updates?')).not.toBeVisible();
        await expect(toggle).not.toBeChecked({ timeout: 10000 });
        expect(timerState()).toEqual({ unitFileState: 'masked', activeState: 'inactive' });

        // On: requires the explicit confirmation modal — enabling this is a
        // real unattended fetch+apply+reboot cycle, not just a periodic check.
        // Its schedule text has to match the unit's defaults.
        await toggle.click({ force: true });
        await expect(page.locator('text=Enable automatic updates?')).toBeVisible();
        await expect(page.locator('.pf-v6-c-modal-box')).toContainText('about 1 hour after each boot, then about 8 hours after each run');
        await page.locator('.pf-v6-c-modal-box button:has-text("Enable")').click();
        await expect(toggle).toBeChecked({ timeout: 10000 });
        const after = timerState();
        expect(after.activeState).toBe('active');
        expect(after.unitFileState).not.toMatch(/^masked/);
    });
});
