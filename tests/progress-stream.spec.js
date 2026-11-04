const { test, expect } = require('@playwright/test');
const { loginToCockpit, COCKPIT_URL, MODULE_PATH } = require('./helpers/cockpit.js');
const { bootcStatus } = require('./helpers/host.js');
const { fakeSpawns, argvText } = require('./helpers/fake-spawn.js');

// bootc's --progress-fd JSON records and its own text share one stream.
// Every JSON record (Start, ProgressBytes, ProgressSteps, and any type a
// later bootc adds) feeds the bar or is dropped; only bootc's text reaches
// the log, also when a line arrives split across chunks. The switch spawn is
// replaced by a script that prints such a stream in pieces, so nothing on
// the host changes (helpers/fake-spawn.js).

const bytes = (done, steps) => JSON.stringify({
    type: 'ProgressBytes',
    task: 'pulling',
    description: 'Pulling image',
    id: 'pull',
    bytesCached: 0,
    bytes: done,
    bytesTotal: 150000000,
    stepsCached: 0,
    steps,
    stepsTotal: 5,
    subtasks: [],
});
const steps = (task, n, total) => JSON.stringify({
    type: 'ProgressSteps',
    task,
    description: task,
    id: task,
    stepsCached: 0,
    steps: n,
    stepsTotal: total,
    subtasks: [],
});
const START = JSON.stringify({ type: 'Start', version: '0.1.0' });

// Each argument is printed as one write; the pauses make cockpit deliver
// them as separate chunks. Chunk boundaries fall inside text and JSON lines.
const CHUNKS = [
    'No changes in example.test/image:latest => sha256:c5c4\n' + START.slice(0, 12),
    START.slice(12) + '\n' + bytes(50000000, 1) + '\n',
    'Fetching layer 2\n' + bytes(100000000, 2).slice(0, 40),
    bytes(100000000, 2).slice(40) + '\n' + steps('staging', 1, 3) + '\nDeploy',
    'ing...done (4 seconds)\n' + JSON.stringify({ type: 'FutureRecord', version: '0.2.0' }) + '\n' + steps('staging', 3, 3),
];
const PAUSES = [0.5, 2.5, 0.5, 2.5, 0];
const SCRIPT = CHUNKS.map((_, i) => `printf "%s" "$${i + 1}"; sleep ${PAUSES[i]}`).join('; ');
const TEXT_LINES = ['No changes in example.test/image:latest => sha256:c5c4', 'Fetching layer 2', 'Deploying...done (4 seconds)'];

test('progress records never reach the text log, whatever the chunking', async ({ page }) => {
    const ref = bootcStatus().rollback?.image?.image?.image;
    test.skip(!ref, 'needs a rollback deployment for a valid switch target');

    const log = [];
    await loginToCockpit(page);
    await fakeSpawns(page, [{
        match: (argv, text) => text.includes('bootc switch'),
        script: SCRIPT,
        args: CHUNKS,
    }], { log });
    await page.goto(COCKPIT_URL + MODULE_PATH);

    await page.fill('#switch-image-ref', ref);
    await page.locator('button:has-text("Inspect")').click();
    await expect(page.locator('button:has-text("Inspecting")')).toHaveCount(0, { timeout: 60000 });
    await page.locator('.ct-switch-row button:has-text("Switch")').click();
    await page.locator('.pf-v6-c-modal-box button:has-text("Switch")').click();

    // The bar works as before: bytes and layers, then the deploy steps.
    const bar = page.locator('#bootc-pull-progress');
    await expect(bar).toContainText('Downloading', { timeout: 15000 });
    await expect(bar).toContainText(/ of .* \(1 of 5 layers\)/);
    await expect(bar).toContainText('Deploying', { timeout: 15000 });
    await expect(bar).toContainText('Step 2 of 3');

    await expect(page.locator('.ct-progress-done-hint')).toBeVisible({ timeout: 30000 });
    const text = await page.locator('#bootc-progress-log').innerText();
    expect(text.split('\n').filter(Boolean)).toEqual(TEXT_LINES);
    expect(text).not.toContain('{');

    // The stream really was split mid-line (the test proves nothing otherwise).
    const frames = log.filter(e => e.data !== undefined).map(e => e.data);
    expect(log.some(e => e.argv && argvText(e.argv).includes('bootc switch'))).toBe(true);
    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(frames.some(f => f.length && !f.endsWith('\n'))).toBe(true);
});
