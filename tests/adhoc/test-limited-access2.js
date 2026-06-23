const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 700 } });
  const page = await context.newPage();

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.goto('https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html');
  await page.waitForTimeout(2000);

  await page.fill('input[placeholder*="registry.example.com"]', '10.0.0.208:5000/bootc-cockpit-demo:v6');
  await page.waitForTimeout(300);
  const previewDisabled = await page.isDisabled('button:has-text("Preview")');
  const switchDisabled = await page.isDisabled('button:has-text("Switch")');
  console.log('Preview disabled:', previewDisabled, '| Switch disabled:', switchDisabled);

  // actually click preview to confirm it works without admin
  await page.click('button:has-text("Preview")');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'preview-no-admin.png', fullPage: true });
  await browser.close();
})();
