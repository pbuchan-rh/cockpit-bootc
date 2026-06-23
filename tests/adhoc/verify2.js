const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForTimeout(2000);

  await page.goto('https://10.0.0.229:9090/bootc', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Cockpit pages render inside an iframe typically when embedded in shell, but direct nav loads it standalone.
  await page.screenshot({ path: 'bootc-page-light.png', fullPage: true });
  console.log('Title:', await page.title());
  console.log('Body text snippet:', (await page.innerText('body')).slice(0, 500));
  console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors));

  await browser.close();
})();
