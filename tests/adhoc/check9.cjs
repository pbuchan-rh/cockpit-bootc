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

  // First check to establish a badge
  await page.locator('button:has-text("Check for Updates")').click();
  for (let i = 0; i < 15; i++) {
    if (await page.locator('button:has-text("Checking")').count() === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(500);
  const badgeAfterFirst = await page.locator('.pf-v6-c-label').count();
  console.log('badge present after first check:', badgeAfterFirst);

  // Click again and check mid-flight state
  await page.locator('button:has-text("Check for Updates")').click();
  await page.waitForTimeout(50);
  const badgeDuringCheck = await page.locator('.pf-v6-c-label').count();
  console.log('badge present during second check:', badgeDuringCheck);

  for (let i = 0; i < 15; i++) {
    if (await page.locator('button:has-text("Checking")').count() === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(300);

  // Hover the badge to trigger the tooltip
  await page.locator('.pf-v6-c-label').first().hover();
  await page.waitForTimeout(600);
  const tooltipText = await page.locator('.pf-v6-c-tooltip').first().textContent().catch(() => null);
  console.log('tooltip text:', tooltipText);

  await page.screenshot({ path: '/tmp/badge-tooltip-check.png' });
  await browser.close();
})();
