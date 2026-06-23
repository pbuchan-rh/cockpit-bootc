const { chromium } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  await loginToCockpit(page);
  console.log('waiting up to 20s for status to resolve...');
  await page.waitForTimeout(20000);
  const bodyText = await page.locator('body').innerText();
  console.log('body text after wait:', bodyText.slice(0, 300));
  await browser.close();
})();
