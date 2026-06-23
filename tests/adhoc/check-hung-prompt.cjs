const { chromium } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await loginToCockpit(page);
  await page.waitForTimeout(3000);
  const dialogs = await page.locator('[role="dialog"], .pf-v6-c-modal-box, input[type="password"]').count();
  console.log('dialog/modal/password-field count:', dialogs);
  const html = await page.evaluate(() => document.body.innerHTML.length);
  console.log('body innerHTML length:', html);
  const allText = await page.evaluate(() => document.body.innerText);
  console.log('all visible text:', JSON.stringify(allText));
  // dump full HTML to a file for inspection
  const fullHtml = await page.content();
  require('fs').writeFileSync('/tmp/hung-page.html', fullHtml);
  await page.screenshot({ path: '/tmp/hung-full.png', fullPage: true });
  await browser.close();
})();
