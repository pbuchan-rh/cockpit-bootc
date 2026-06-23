const { chromium } = require('@playwright/test');
const { requestAdmin, isAdminActive } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(process.env.COCKPIT_URL);
  await page.fill('#login-user-input', process.env.COCKPIT_USER);
  await page.fill('#login-password-input', process.env.COCKPIT_PASS);
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  console.log('admin active BEFORE requestAdmin:', await isAdminActive(page));
  await requestAdmin(page);
  console.log('admin active AFTER requestAdmin:', await isAdminActive(page));
  await page.screenshot({ path: '/tmp/elevate-check.png' });
  await browser.close();
})();
