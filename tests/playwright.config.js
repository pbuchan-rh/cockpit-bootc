// @ts-check
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: __dirname + '/.env' });

module.exports = defineConfig({
    testDir: __dirname,
    testMatch: '**/*.spec.js',
    timeout: 120000,
    expect: { timeout: 30000 },
    fullyParallel: false, // Cockpit session is shared state
    workers: 1,
    reporter: [
        ['html', { outputFolder: __dirname + '/report', open: 'never' }],
    ],
    use: {
        baseURL: process.env.COCKPIT_URL,
        ignoreHTTPSErrors: true,
        screenshot: 'on',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        actionTimeout: 30000,
    },
    outputDir: __dirname + '/screenshots',
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    ],
});
