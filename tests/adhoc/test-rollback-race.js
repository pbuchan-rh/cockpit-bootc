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

  console.log('Check for Updates disabled BEFORE:', await page.isDisabled('button:has-text("Check for Updates")'));

  // Stage rollback
  await page.click('button:has-text("Roll Back")');
  await page.waitForTimeout(800);
  await page.click('.pf-v6-c-modal-box button:has-text("Stage Rollback")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'race-after-stage.png', fullPage: true });
  console.log('Check for Updates disabled AFTER staging rollback:', await page.isDisabled('button:has-text("Check for Updates")'));

  // Now click "Roll Back" again on the SAME card (now showing as the un-stage toggle) WITHOUT reloading
  await page.click('button:has-text("Roll Back")');
  await page.waitForTimeout(800);
  await page.click('.pf-v6-c-modal-box button:has-text("Stage Rollback")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'race-after-unstage.png', fullPage: true });
  console.log('Check for Updates disabled AFTER un-staging (same session, no reload):', await page.isDisabled('button:has-text("Check for Updates")'));

  await browser.close();
})();
