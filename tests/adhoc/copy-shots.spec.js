const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('../helpers/cockpit.js');
const { hostSudo } = require('../helpers/host.js');
const { fakeSpawns, argvText, PRINT, FAIL } = require('../helpers/fake-spawn.js');

// Ad-hoc (BOOTC_ADHOC=1): one light-mode screenshot per dialog/alert of the
// copy-trim job (WORDINESS.md #1-#13), cropped to the dialog or alert, plus
// its text, into SHOTS_DIR (default tests/test-results/copy-shots) and
// SHOTS_DIR/index.json. Run it on the build before and after a copy change
// to get matching pairs.
//
// Changes nothing on the host. States the host isn't in (an update staged, a
// rollback queued, a /usr overlay, an off-slot deployment, the timer off, a
// registry error, a finished pull) are shown by faking that spawn's output
// (helpers/fake-spawn.js); every dialog is closed with Cancel.
const DIR = process.env.SHOTS_DIR || path.join(__dirname, '..', 'test-results', 'copy-shots');
fs.mkdirSync(DIR, { recursive: true });
const INDEX = `${DIR}/index.json`;

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for screenshots');

const words = text => text.split(/\s+/).filter(Boolean).length;

function record(entry) {
    const all = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : [];
    const rest = all.filter(e => e.file !== entry.file);
    rest.push(entry);
    rest.sort((a, b) => a.file.localeCompare(b.file));
    fs.writeFileSync(INDEX, JSON.stringify(rest, null, 2) + '\n');
}

async function capture(locator, n, name, file, { titleLoc, bodyLoc } = {}) {
    await expect(locator).toBeVisible({ timeout: 30000 });
    await locator.page().waitForTimeout(500); // open animation
    await locator.screenshot({ path: `${DIR}/${file}` });
    // PatternFly's screen-reader prefix ("Warning alert:") isn't shown.
    const title = titleLoc ? (await titleLoc.innerText()).replace(/^\w+ alert:\s*/, '').trim() : '';
    const body = (await (bodyLoc || locator).innerText()).replace(/\s+/g, ' ').trim();
    record({ n, name, file, title, text: body, words: words(body) });
}

const modal = page => page.locator('.pf-v6-c-modal-box');
const captureModal = (page, n, name, file) => capture(modal(page), n, name, file, {
    titleLoc: modal(page).locator('.pf-v6-c-modal-box__title'),
    bodyLoc: modal(page).locator('.pf-v6-c-modal-box__body'),
});
const cancelModal = async page => {
    await modal(page).locator('button:has-text("Cancel")')
            .click();
    await expect(modal(page)).toHaveCount(0);
};
const card = (page, label) => page.locator('.pf-v6-c-card', { has: page.locator('.pf-v6-c-label', { hasText: new RegExp(`^${label}$`) }) });

const isStatus = argv => argv[0] === 'bootc' && argv[1] === 'status';
const isOstreeList = argv => argv[0] === 'ostree' && argv[1] === 'admin' && argv[2] === 'status';
const isSkopeo = argv => argv[0] === 'skopeo';
const isTimerShow = argv => argv[0] === 'systemctl' && argv[1] === 'show';

let real; // the host's real `bootc status --json`
const clone = o => JSON.parse(JSON.stringify(o));
const FAKE_DIGEST = 'sha256:' + 'f'.repeat(64);

// Status as it looks with an update staged (a 3.14 of the tracked image).
function withStaged() {
    const s = clone(real);
    const staged = clone(s.status.booted);
    staged.image.version = '3.14';
    staged.image.imageDigest = FAKE_DIGEST;
    staged.ostree.checksum = 'e'.repeat(64);
    staged.pinned = false;
    s.status.staged = staged;
    return s;
}

async function open(page, rules) {
    await loginToCockpit(page);
    await fakeSpawns(page, rules);
    await page.goto(COCKPIT_URL + MODULE_PATH);
}
const statusRule = s => ({ match: isStatus, script: PRINT, args: [JSON.stringify(s)] });

test.beforeAll(() => {
    real = JSON.parse(hostSudo('bootc status --json'));
    expect(real.status.staged, 'nothing may be staged').toBeNull();
    expect(real.status.rollback, 'needs a rollback deployment').not.toBeNull();
});

test('01 roll back, stage step', async ({ page }) => {
    await open(page, []);
    await card(page, 'Rollback').locator('button:has-text("Roll back")')
            .click();
    await captureModal(page, 1, 'Roll back (step 1)', '01-roll-back-stage.png');
    await cancelModal(page);
});

test('01b roll back, stage step, update staged', async ({ page }) => {
    await open(page, [statusRule(withStaged())]);
    await card(page, 'Rollback').locator('button:has-text("Roll back")')
            .click();
    await captureModal(page, 1, 'Roll back (step 1, update staged)', '01b-roll-back-stage-staged.png');
    await cancelModal(page);
});

test('02 roll back, reboot step', async ({ page }) => {
    const s = clone(real);
    s.status.rollbackQueued = true;
    await open(page, [statusRule(s)]);
    await card(page, 'Rollback').locator('button:has-text("Reboot to roll back")')
            .click();
    await captureModal(page, 2, 'Roll back (step 2, reboot)', '02-roll-back-reboot.png');
    await cancelModal(page);
});

test('03 enable automatic updates', async ({ page }) => {
    await open(page, [{
        match: isTimerShow,
        script: PRINT,
        args: ['UnitFileState=enabled\nActiveState=inactive\nWantedBy=timers.target\n'],
    }]);
    const toggle = page.locator('#bootc-auto-update-switch');
    await expect(toggle).not.toBeChecked({ timeout: 15000 });
    await toggle.click({ force: true });
    await captureModal(page, 3, 'Enable automatic updates', '03-enable-auto-updates.png');
    await cancelModal(page);
});

test('04 delete deployment', async ({ page }) => {
    // An unpinned off-slot deployment (version 3.9) next to booted + rollback.
    const s = clone(real);
    const other = clone(s.status.rollback);
    other.image.version = '3.9';
    other.ostree.checksum = 'd'.repeat(64);
    other.pinned = false;
    s.status.otherDeployments = [other];
    const list = JSON.parse(hostSudo('ostree admin status --json'));
    list.deployments.push({ ...list.deployments[list.deployments.length - 1], checksum: other.ostree.checksum, index: list.deployments.length, booted: false, rollback: false, staged: false, pending: false, pinned: false });
    await open(page, [statusRule(s), { match: isOstreeList, script: PRINT, args: [JSON.stringify(list)] }]);
    await page.locator('button:has-text("deployments pinned")').click();
    const row = page.locator('table[aria-label="All ostree deployments"] tbody tr', { hasText: '3.9' });
    await row.locator('button:has-text("Delete")').click();
    await captureModal(page, 4, 'Delete deployment', '04-delete-deployment.png');
    await cancelModal(page);
});

const overlayStatus = () => {
    const s = clone(real);
    s.status.usrOverlay = { accessMode: 'readWrite', persistence: 'transient' };
    return s;
};

test('05 /usr overlay alert', async ({ page }) => {
    await open(page, [statusRule(overlayStatus())]);
    const alert = page.locator('.pf-v6-c-alert.pf-m-warning');
    await capture(alert, 5, '/usr overlay alert', '05-usr-overlay-alert.png', {
        titleLoc: alert.locator('.pf-v6-c-alert__title'),
        bodyLoc: alert.locator('.pf-v6-c-alert__description'),
    });
});

test('06 discard staged update', async ({ page }) => {
    await open(page, [statusRule(withStaged())]);
    await card(page, 'Staged update').locator('button:has-text("Cancel")')
            .click();
    await captureModal(page, 6, 'Discard staged update', '06-discard-staged.png');
    await cancelModal(page);
});

test('07 switch image', async ({ page }) => {
    // Inspect for real (read-only); the rollback's own ref is a valid target.
    const ref = real.status.rollback.image.image.image;
    await open(page, []);
    await page.fill('#switch-image-ref', ref);
    await page.locator('button:has-text("Inspect")').click();
    await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 60000 });
    await page.locator('.ct-switch-row button:has-text("Switch")').click();
    await captureModal(page, 7, 'Switch image', '07-switch-image.png');
    await cancelModal(page);
});

test('08 apply update and reboot', async ({ page }) => {
    await open(page, [statusRule(withStaged())]);
    await card(page, 'Staged update').locator('button:has-text("Apply and reboot")')
            .click();
    await captureModal(page, 8, 'Apply update and reboot', '08-apply-reboot.png');
    await cancelModal(page);
});

test('09 not a bootc system', async ({ page }) => {
    const s = clone(real);
    s.status.booted = null;
    await open(page, [statusRule(s)]);
    const empty = page.locator('#ct-not-bootc');
    await capture(empty, 9, 'Not a bootc system', '09-not-bootc.png', {
        titleLoc: empty.locator('.pf-v6-c-empty-state__title'),
        bodyLoc: empty.locator('.pf-v6-c-empty-state__body'),
    });
});

test('10 registry denied access', async ({ page }) => {
    const repo = real.spec.image.image.replace(/:[^:/]+$/, '');
    const ref = `${repo}-private:latest`;
    const registry = repo.split('/')[0];
    const repoPath = repo.slice(registry.length + 1);
    const err = `time="2026-11-04T12:00:00Z" level=fatal msg="Error parsing image name \\"docker://${ref}\\": reading manifest latest in ${registry}/${repoPath}-private: requested access to the resource is denied"\n`;
    await open(page, [{ match: argv => isSkopeo(argv) && argvText(argv).includes('-private'), script: FAIL, args: [err] }]);
    await page.fill('#switch-image-ref', ref);
    await page.locator('button:has-text("Inspect")').click();
    const block = page.locator('.ct-switch-preview-error-block');
    await capture(block, 10, 'Registry denied access', '10-registry-denied.png', {
        bodyLoc: block.locator('.ct-switch-preview-error'),
    });
});

test('11 reboot to clear /usr overlay', async ({ page }) => {
    await open(page, [statusRule(overlayStatus())]);
    await page.locator('.pf-v6-c-alert.pf-m-warning button:has-text("Reboot to clear")').click();
    await captureModal(page, 11, 'Reboot to clear /usr overlay', '11-reboot-clear-overlay.png');
    await cancelModal(page);
});

const PULL_OK = 'printf "%s\\n" "Fetching ostree-unverified-registry:image" "Deploying...done (3 seconds)"';

test('12 download done hint', async ({ page }) => {
    await open(page, [
        { match: argv => isSkopeo(argv) && argv.includes('--no-tags'), script: PRINT, args: [JSON.stringify({ Digest: FAKE_DIGEST })] },
        { match: (argv, text) => text.includes('bootc upgrade --download-only'), script: PULL_OK },
    ]);
    await expect(page.locator('.pf-v6-c-label', { hasText: /^Update available$/ })).toBeVisible({ timeout: 30000 });
    await page.locator('button:has-text("Download update")').click();
    const block = page.locator('.ct-progress-log-block');
    await expect(block.locator('.ct-progress-done-hint')).toBeVisible({ timeout: 30000 });
    await capture(block, 12, 'Download done hint', '12-download-done.png', { bodyLoc: block.locator('.ct-progress-done-hint') });
});

test('13 switch done hint', async ({ page }) => {
    const ref = real.status.rollback.image.image.image;
    await open(page, [{ match: (argv, text) => text.includes('bootc switch'), script: PULL_OK }]);
    await page.fill('#switch-image-ref', ref);
    await page.locator('button:has-text("Inspect")').click();
    await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 60000 });
    await page.locator('.ct-switch-row button:has-text("Switch")').click();
    await modal(page).locator('button:has-text("Switch")')
            .click();
    const block = page.locator('.ct-progress-log-block');
    await expect(block.locator('.ct-progress-done-hint')).toBeVisible({ timeout: 30000 });
    await capture(block, 13, 'Switch done hint', '13-switch-done.png', { bodyLoc: block.locator('.ct-progress-done-hint') });
});
