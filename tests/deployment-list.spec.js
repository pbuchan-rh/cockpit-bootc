const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');
const { DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, hostSudo } = require('./helpers/host.js');
const { fakeSpawns, PRINT } = require('./helpers/fake-spawn.js');

test.describe('deployment list', () => {
    test.beforeEach(async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });
    });

    test('off-slot rows show a real version string, not a bare hash', async ({ page }) => {
        const toggle = page.locator('button:has-text("deployments pinned")');
        await expect(toggle).toBeVisible({ timeout: 15000 });
        await toggle.click();

        const table = page.locator('table[aria-label="All ostree deployments"]');
        await expect(table).toBeVisible();

        const rows = table.locator('tbody tr');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i++) {
            const versionCell = rows.nth(i).locator('td').nth(1);
            // A bare hash fallback renders as a 12-char monospace span with this
            // class — bootc status's otherDeployments should give every row a
            // real version string instead, so this class should never appear.
            await expect(versionCell.locator('.ct-tracked-ref-value')).toHaveCount(0);
        }
    });

    test('Pin/Unpin round-trips, and Delete is gated to off-slot + unpinned rows only', async ({ page }) => {
        test.skip(!DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON);
        const toggle = page.locator('button:has-text("deployments pinned")');
        await toggle.click();

        const table = page.locator('table[aria-label="All ostree deployments"]');
        const rows = table.locator('tbody tr');
        const count = await rows.count();

        let offSlotRow = null;
        for (let i = 0; i < count; i++) {
            const slotText = await rows.nth(i).locator('td').nth(2).innerText();
            if (slotText === '—') { offSlotRow = rows.nth(i); break; }
        }
        // Needs a deployment that is not booted, staged or the rollback; the
        // test never creates one (that would mean staging on the host).
        test.skip(offSlotRow === null, 'no off-slot deployment on this host');

        const deleteBtn = offSlotRow.locator('button:has-text("Delete")');
        const offSlotIndex = (await offSlotRow.locator('td').nth(0).innerText()).trim();
        const offSlotVersion = (await offSlotRow.locator('td').nth(1).innerText()).trim();
        const pinBtn = offSlotRow.locator('button').first();
        const wasPinned = (await pinBtn.innerText()) === 'Unpin';

        // Active-slot rows (Booted/Rollback) must always be delete-disabled,
        // regardless of pin state — checked once up front since they don't
        // change during this test.
        for (let i = 0; i < count; i++) {
            const slotText = await rows.nth(i).locator('td').nth(2).innerText();
            if (slotText !== '—') {
                await expect(rows.nth(i).locator('button:has-text("Delete")')).toHaveAttribute('aria-disabled', 'true');
            }
        }

        if (!wasPinned) {
            // Get to a known pinned state first so the round-trip below is symmetric.
            await pinBtn.click();
            await expect(pinBtn).toHaveText('Unpin', { timeout: 10000 });
        }
        await expect(deleteBtn).toHaveAttribute('aria-disabled', 'true');

        // Unpin — Delete should become actionable.
        await pinBtn.click();
        await expect(pinBtn).toHaveText('Pin', { timeout: 10000 });
        await expect(deleteBtn).not.toHaveAttribute('aria-disabled', 'true');

        // Open the confirm modal, then back out via Cancel — verifies the
        // modal's content without actually consuming one of a finite number
        // of real test deployments on the demo registry. The destructive
        // confirm path itself was verified live by hand against the
        // appliance (not re-run here on purpose); see DESIGN.md / session
        // notes for that verification.
        // The title names the target by index (two rows can share a version),
        // the body by version, and says it can't be undone.
        await deleteBtn.click();
        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(modal).toContainText(`Delete deployment ${offSlotIndex}?`);
        await expect(modal.locator('.pf-v6-c-modal-box__body')).toHaveText(`${offSlotVersion} will be deleted from this system. This can't be undone.`);
        await expect(modal).not.toContainText('frees its disk space immediately');
        await modal.locator('button:has-text("Cancel")').click();
        await expect(modal).not.toBeVisible();
        await expect(offSlotRow).toBeVisible();

        // Restore original pin state.
        await pinBtn.click();
        await expect(pinBtn).toHaveText('Unpin', { timeout: 10000 });
    });

    // The Delete dialog, also on a host without an off-slot deployment: an
    // unpinned 3.9-style row from a faked `bootc status` and `ostree admin
    // status`. Changes nothing (Cancel only; fake-spawn blocks undeploy).
    test('Delete dialog names the version and says it cannot be undone', async ({ page }) => {
        const status = JSON.parse(hostSudo('bootc status --json'));
        const list = JSON.parse(hostSudo('ostree admin status --json'));
        const other = JSON.parse(JSON.stringify(status.status.booted));
        other.image.version = '0.0-fake';
        other.ostree.checksum = 'd'.repeat(64);
        other.pinned = false;
        status.status.otherDeployments = [other];
        const index = list.deployments.length;
        list.deployments.push({ ...list.deployments[0], checksum: other.ostree.checksum, index, booted: false, rollback: false, staged: false, pending: false, pinned: false });
        await fakeSpawns(page, [
            { match: argv => argv[0] === 'bootc' && argv[1] === 'status', script: PRINT, args: [JSON.stringify(status)] },
            { match: argv => argv[0] === 'ostree' && argv[2] === 'status', script: PRINT, args: [JSON.stringify(list)] },
        ]);
        await page.goto(COCKPIT_URL + MODULE_PATH);

        await page.locator('button:has-text("deployments pinned")').click();
        const row = page.locator('table[aria-label="All ostree deployments"] tbody tr', { hasText: '0.0-fake' });
        await row.locator('button:has-text("Delete")').click();
        const modal = page.locator('.pf-v6-c-modal-box');
        await expect(modal.locator('.pf-v6-c-modal-box__title')).toHaveText(`Delete deployment ${index}?`);
        await expect(modal.locator('.pf-v6-c-modal-box__body')).toHaveText("0.0-fake will be deleted from this system. This can't be undone.");
        await modal.locator('button:has-text("Cancel")').click();
        await expect(modal).toHaveCount(0);
        await expect(row).toBeVisible();
    });
});
