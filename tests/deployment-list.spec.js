const { test, expect } = require('@playwright/test');
const { loginToCockpit } = require('./helpers/cockpit.js');

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
        expect(offSlotRow, 'expected at least one off-slot deployment to test against').not.toBeNull();

        const deleteBtn = offSlotRow.locator('button:has-text("Delete")');
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
        await deleteBtn.click();
        await expect(page.locator('text=Delete deployment?')).toBeVisible();
        await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
        await expect(page.locator('text=Delete deployment?')).not.toBeVisible();
        await expect(offSlotRow).toBeVisible();

        // Restore original pin state.
        await pinBtn.click();
        await expect(pinBtn).toHaveText('Unpin', { timeout: 10000 });
    });
});
