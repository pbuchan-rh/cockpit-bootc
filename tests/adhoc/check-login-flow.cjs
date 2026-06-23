const { chromium } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await loginToCockpit(page);
  await page.waitForTimeout(2000);
  console.log('URL after login flow:', page.url());
  const indicatorText = await page.locator('#super-user-indicator').textContent().catch(() => '(not found - probably inside module page now)');
  console.log('indicator text (top-level, likely n/a after nav):', indicatorText);
  const bodyText = await page.locator('main, #app, body').first().innerText().catch(() => '(error)');
  console.log('module body text (first 500 chars):', bodyText.slice(0, 500));
  await page.screenshot({ path: '/tmp/login-flow-check.png' });
  await browser.close();
})();
