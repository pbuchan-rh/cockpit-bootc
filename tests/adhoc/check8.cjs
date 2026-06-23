const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  const unlock = page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first();
  await unlock.waitFor({ timeout: 5000 });
  await unlock.click();
  const pw = page.locator('#account-password-input, input[type="password"]').first();
  await pw.waitFor({ timeout: 5000 });
  await pw.fill('***REDACTED***');
  await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  await page.goto('https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/before-check.png' });
  const before = await page.locator('button:has-text("Check for Updates")').boundingBox();

  await page.locator('button:has-text("Check for Updates")').click();
  for (let i = 0; i < 15; i++) {
    const stillChecking = await page.locator('button:has-text("Checking")').count();
    if (stillChecking === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/after-check.png' });
  const after = await page.locator('button:has-text("Check for Updates")').boundingBox();

  console.log(JSON.stringify({ before, after }));
  await browser.close();
})();
