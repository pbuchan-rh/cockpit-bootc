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

  const frame = page.frame({ url: 'https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html#/' });
  await frame.click('button:has-text("Apply & Reboot")');
  await page.waitForTimeout(1000);
  await frame.locator('.pf-v6-c-modal-box button:has-text("Reboot")').click();
  console.log('clicked reboot confirm');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'after-apply-click.png', fullPage: true });
  await browser.close();
})();
