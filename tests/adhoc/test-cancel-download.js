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

  // Check first to enable Download Update
  await page.click('button:has-text("Check for Updates")');
  await page.waitForTimeout(2500);
  const downloadDisabled = await page.isDisabled('button:has-text("Download Update")');
  console.log('Download Update disabled after check:', downloadDisabled);
  if (downloadDisabled) {
    console.log('No update found via skopeo-diff check — cannot test this path right now');
    await browser.close();
    return;
  }

  await page.click('button:has-text("Download Update")');
  for (let i = 0; i < 60; i++) {
    const stillDownloading = await page.locator('button:has-text("Downloading…")').count();
    if (stillDownloading === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1000);
  console.log('--- staged via Download, about to cancel ---');

  await page.click('.pf-v6-c-card__footer button:has-text("Cancel")');
  await page.waitForTimeout(800);
  await page.click('.pf-v6-c-modal-box button:has-text("Discard")');
  await page.waitForTimeout(3000);

  console.log('Check for Updates disabled (UI) after cancel:', await page.isDisabled('button:has-text("Check for Updates")'));
  await browser.close();
})();
