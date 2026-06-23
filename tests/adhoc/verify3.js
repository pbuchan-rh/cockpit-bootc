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
  // check "reuse password for privileged tasks" if present
  const reuseBox = await page.$('#authorized-input');
  if (reuseBox) await reuseBox.check();
  await page.click('#login-button');
  await page.waitForTimeout(2000);

  await page.goto('https://10.0.0.229:9090/bootc', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'bootc-page-2.png', fullPage: true });

  // Try clicking "Limited access" to unlock superuser if still limited
  const limited = await page.$('text=Limited access');
  if (limited) {
    await limited.click();
    await page.waitForTimeout(1000);
    const pwInput = await page.$('#superuser-password-dialog input[type=password], input#password');
    console.log('pwInput found:', !!pwInput);
    await page.screenshot({ path: 'superuser-dialog.png', fullPage: true });
  }
  console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors));
  await browser.close();
})();
