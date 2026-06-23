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
    await page.goto(COCKPIT_URL);
    await page.locator('#login-user-input').waitFor({ timeout: 10000 });
    await page.fill('#login-user-input', COCKPIT_USER);
    await page.fill('#login-password-input', COCKPIT_PASS);
    await page.click('#login-button');
    await page.waitForFunction(
        () => !document.getElementById('login-user-input'),
        { timeout: 15000 }
    );
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
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
    const shellSelectors = [
        'a:has-text("Limited access")',
        '#super-user-indicator a',
        '#super-user-indicator button',
        'button:has-text("Turn on administrative access")',
    ];
    for (const sel of shellSelectors) {
        const el = page.locator(sel).first();
        // waitFor (not isVisible) — isVisible is immediate and ignores the timeout option
        const visible = await el.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
        if (visible) {
            await el.click();
            const pwField = page.locator('input[type="password"]').last();
            if (await pwField.isVisible({ timeout: 3000 }).catch(() => false)) {
                await pwField.fill(COCKPIT_PASS);
                await page.keyboard.press('Enter');
            }
            await page.locator('a:has-text("Limited access"), button:has-text("Limited access")')
                .waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
            break;
        }
    }
}

// Returns true if the Cockpit privileged bridge appears active via the shell indicator.
async function isAdminActive(page) {
    const limited = page.locator('a:has-text("Limited access"), button:has-text("Limited access")');
    const visible = await limited.isVisible({ timeout: 2000 }).catch(() => false);
    return !visible;
}

module.exports = { loginToCockpit, requestAdmin, isAdminActive, COCKPIT_URL, MODULE_PATH };
