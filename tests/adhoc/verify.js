const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, ignoreHTTPSErrors: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'after-login.png' });
  console.log('URL after login:', page.url());
  console.log('Title:', await page.title());
  console.log('CONSOLE_ERRORS_LOGIN:', JSON.stringify(consoleErrors));

  await browser.close();
})();
