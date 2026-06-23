const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loginToCockpit } = require('./helpers/cockpit.js');

test.describe('security', () => {
    test('no --tls-verify=false anywhere in the shipped source', async () => {
        // Regression guard for a real fix earlier this session: a hardcoded
        // --tls-verify=false on every skopeo inspect call, disabling cert
        // verification globally rather than scoped to the one lab registry
        // it was added for. Scanning src/ rather than dist/ so this catches
        // the regression at the source, before a build ever ships it.
        const srcDir = path.join(__dirname, '..', 'src');
        const offenders = [];
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (/\.(js|jsx)$/.test(entry.name)) {
                    const content = fs.readFileSync(full, 'utf8');
                    if (content.includes('tls-verify')) offenders.push(full);
                }
            }
        })(srcDir);
        expect(offenders).toEqual([]);
    });

    test('isSafeUrl rejects javascript: and other unsafe schemes', async () => {
        // Unit-level, not e2e — preview.source is registry-controlled label
        // data that can't be injected through a live test without modifying
        // a real registry's image content. This is the actual function the
        // SwitchImage component calls before rendering preview.source as a
        // clickable href, imported directly (not duplicated) so the test
        // tracks the real implementation.
        const { isSafeUrl } = await import('../src/lib/url-safety.js');

        expect(isSafeUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
        expect(isSafeUrl('file:///etc/passwd')).toBe(false);
        expect(isSafeUrl('not a url at all')).toBe(false);
        expect(isSafeUrl('')).toBe(false);

        expect(isSafeUrl('https://github.com/example/repo')).toBe(true);
        expect(isSafeUrl('http://internal-registry.lab/source')).toBe(true);
    });

    test('an invalid-looking ref keeps Preview/Switch disabled, never reaches the registry', async ({ page }) => {
        await loginToCockpit(page);
        await expect(page.locator('text=Container image reference')).toBeVisible({ timeout: 15000 });

        // looksLikeImageRef() gates these buttons — confirm the real live
        // behavior, not just the source function in isolation.
        await page.fill('#switch-image-ref', 'not a valid ref at all');
        await expect(page.locator('button:has-text("Preview")')).toBeDisabled();
        await expect(page.locator('button:has-text("Switch")')).toBeDisabled();
    });
});
