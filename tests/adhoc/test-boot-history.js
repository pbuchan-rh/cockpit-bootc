const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  const u = page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first();
  await u.waitFor({ timeout: 5000 });
  await u.click();
  const p = page.locator('#account-password-input, input[type="password"]').first();
  await p.waitFor({ timeout: 5000 });
  await p.fill('***REDACTED***');
  await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  await page.goto('https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'boot-history-1.png', fullPage: true });
  console.log('Body:', (await page.innerText('body')).slice(0, 800));
  await browser.close();
})();
