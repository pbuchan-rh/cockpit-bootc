const { chromium } = require('@playwright/test');
const { requestAdmin, isAdminActive, COCKPIT_URL } = require('../helpers/cockpit.js');
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

  console.log('attempting a real privileged cockpit.spawn from the SHELL page itself...');
  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('TIMEOUT after 10s'), 10000);
      // cockpit global is available on the shell page itself
      window.cockpit.spawn(['whoami'], { superuser: 'require' })
        .then(out => { clearTimeout(timeout); resolve('OK: ' + out); })
        .catch(err => { clearTimeout(timeout); resolve('ERROR: ' + JSON.stringify(err)); });
    });
  });
  console.log('privileged call result:', result);
  await browser.close();
})();
