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
  await page.screenshot({ path: 'apply-modal.png', fullPage: true });
  // confirm in the modal
  const frames = page.frames();
  for (const f of frames) {
    const btn = await f.$('button:has-text("Reboot")');
    if (btn) { await btn.click(); console.log('clicked reboot confirm in frame', f.url()); break; }
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'after-apply-click.png', fullPage: true });
  await browser.close();
})();
