const { chromium } = require('@playwright/test');
const { requestAdmin, isAdminActive, COCKPIT_URL, MODULE_PATH } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(COCKPIT_URL);
  await page.fill('#login-user-input', process.env.COCKPIT_USER);
  await page.fill('#login-password-input', process.env.COCKPIT_PASS);
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await requestAdmin(page);
  console.log('admin active:', await isAdminActive(page));
  console.log('settling for 6s before navigating...');
  await page.waitForTimeout(6000);
  await page.goto(COCKPIT_URL + MODULE_PATH);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(8000);
  console.log('module body:', await page.locator('body').innerText());
  await browser.close();
})();
