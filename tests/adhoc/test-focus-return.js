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

  await page.fill('input[placeholder*="registry.example.com"]', '10.0.0.208:5000/bootc-cockpit-demo:v6');
  await page.click('button:has-text("Switch")');
  await page.waitForTimeout(800);

  // close via Escape this time
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const active = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.tagName + ':' + (el.textContent || '').trim().slice(0, 30)) : 'none';
  });
  console.log('focus after Escape-close:', active);

  // also test Cancel button explicitly
  await page.click('button:has-text("Switch")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(500);
  const active2 = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.tagName + ':' + (el.textContent || '').trim().slice(0, 30)) : 'none';
  });
  console.log('focus after Cancel-click:', active2);
  await browser.close();
})();
