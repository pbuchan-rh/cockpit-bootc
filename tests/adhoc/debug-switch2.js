const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

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

  console.log('Frame count:', page.frames().length);
  for (const f of page.frames()) {
    console.log('frame url:', f.url());
  }
  await browser.close();
})();
