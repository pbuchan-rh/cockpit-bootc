// Generic Cockpit login/admin-unlock/navigate helper.
//
// This file is meant to be lifted into other Cockpit modules largely as-is —
// only MODULE_PATH (and TABS, if the module has tabs) are module-specific.
// See ~/Projects/cockpit/CLAUDE.md "Testing" section for the standard this
// implements.
require('dotenv').config({ path: __dirname + '/../.env' });

const COCKPIT_URL  = process.env.COCKPIT_URL  || 'https://your-host:9090';
const COCKPIT_USER = process.env.COCKPIT_USER || 'admin';
const COCKPIT_PASS = process.env.COCKPIT_PASS || '';

// bootc has no manifest name collision worries (package.json "name": "bootc"),
// so the module path is just /bootc/.
const MODULE_PATH = '/cockpit/@localhost/bootc/index.html';

async function loginToCockpit(page) {
    // waitUntil: 'networkidle' on the initial load, and a single direct
    // selector (not a list of fallbacks each burning a full timeout waiting
    // for an element that was never going to appear) — confirmed 2026-06-22
    // that a fallback-selector-list version of this function, despite
    // eventually clicking the right element, made elevation unreliable in a
    // way a flat 2s wait + this exact sequence does not. Don't reintroduce
    // the fallback-list shape without re-verifying end-to-end.
    await page.goto(COCKPIT_URL, { waitUntil: 'networkidle' });
    await page.fill('#login-user-input', COCKPIT_USER);
    await page.fill('#login-password-input', COCKPIT_PASS);
    await page.click('#login-button');
    await page.waitForFunction(
        () => !document.getElementById('login-user-input'),
        { timeout: 15000 }
    );
    // Elevate admin on the Cockpit shell page BEFORE navigating to the module —
    // bootc requires root for every status/mutating call, so a module loaded
    // without admin already active will render the "Administrative access
    // required" empty state instead of real data.
    await requestAdmin(page);
    // Navigate directly to the module's iframe URL — this loads the module at
    // the top level (page is used directly, no frameLocator needed), the same
    // technique TESTING.md documents for manual verification.
    await page.goto(COCKPIT_URL + MODULE_PATH);
    await page.waitForLoadState('domcontentloaded');
}

async function requestAdmin(page) {
    const unlock = page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first();
    await unlock.waitFor({ timeout: 5000 });
    await unlock.click();
    const pwField = page.locator('#account-password-input, input[type="password"]').first();
    await pwField.waitFor({ timeout: 5000 });
    await pwField.fill(COCKPIT_PASS);
    await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
    // Flat settle wait, not a poll/probe — confirmed 2026-06-22 that
    // repeatedly probing with a privileged spawn call to detect "is it ready
    // yet" makes things worse (overlapping spawn attempts mid-handshake left
    // orphaned `sudo -k -A cockpit-bridge` processes stuck server-side). The
    // superuser handshake (init → Prompt → Answer → Current: sudo) needs this
    // long regardless; every privileged call hangs indefinitely (no error)
    // if you proceed before it settles.
    await page.waitForTimeout(2000);
}

// Returns true if the Cockpit privileged bridge appears active via the shell indicator.
async function isAdminActive(page) {
    const limited = page.locator('a:has-text("Limited access"), button:has-text("Limited access")');
    const visible = await limited.isVisible({ timeout: 2000 }).catch(() => false);
    return !visible;
}

module.exports = { loginToCockpit, requestAdmin, isAdminActive, COCKPIT_URL, MODULE_PATH };
