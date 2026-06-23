const { chromium } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await loginToCockpit(page);
  await page.waitForTimeout(5000);
  const bodyText = await page.locator('body').innerText();
  console.log('body text (real chrome):', bodyText.slice(0, 300));
  await browser.close();
})();
