const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForTimeout(2000);
  await page.click('text=Limited access');
  await page.waitForTimeout(800);
  await page.fill('input[type=password]', '***REDACTED***');
  await page.click('button:has-text("Authenticate")');
  await page.waitForTimeout(1500);

  await page.goto('https://10.0.0.229:9090/bootc', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.click('button:has-text("Check for Updates")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'after-check.png', fullPage: true });
  console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors));
  await browser.close();
})();
