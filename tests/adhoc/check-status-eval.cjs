const { chromium } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await loginToCockpit(page);
  await page.waitForTimeout(1000);
  const raw = await page.evaluate(() => {
    return window.cockpit.spawn(['bootc', 'status', '--json'], { superuser: 'require' });
  });
  console.log('raw type:', typeof raw);
  console.log('raw (first 500 chars):', JSON.stringify(raw).slice(0, 500));
  await browser.close();
})();
