const { chromium } = require('@playwright/test');
const { COCKPIT_URL, MODULE_PATH } = require('../helpers/cockpit.js');
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

  // Navigate to the module WITHOUT elevating first this time
  await page.goto(COCKPIT_URL + MODULE_PATH);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('module page body (pre-elevate):', await page.locator('body').innerText());
  const indicatorCount = await page.locator('#super-user-indicator').count();
  console.log('super-user-indicator present on module page:', indicatorCount);

  await page.screenshot({ path: '/tmp/module-no-elevate.png' });
  await browser.close();
})();
