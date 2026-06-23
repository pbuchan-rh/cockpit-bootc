const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

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
  await page.waitForTimeout(2000);

  await page.locator('button[role="tab"]:has-text("Activity")').click();
  await page.waitForTimeout(500);
  const rows = await page.evaluate(() => document.querySelectorAll('[aria-label="Activity log"] tbody tr').length);
  console.log('activity rows:', rows);
  const bodyText = await page.locator('[aria-label="Activity log"]').innerText().catch(e => 'ERR: ' + e.message);
  console.log('table text:', bodyText);
  await browser.close();
})();
