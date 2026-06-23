const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
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
  await page.click('.pf-v6-c-modal-box button:has-text("Switch")');

  for (let i = 0; i < 30; i++) {
    const stillSwitching = await page.locator('button:has-text("Switching…")').count();
    if (stillSwitching === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'history-image-tab.png', fullPage: true });
  const activityTab = page.locator('button[role="tab"]:has-text("Activity")');
  await activityTab.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'history-activity-tab.png', fullPage: true });

  const downloadPromise = page.waitForEvent('download');
  await page.click('button:has-text("Download")');
  const download = await downloadPromise;
  console.log('Downloaded filename:', download.suggestedFilename());
  const content = await download.createReadStream();
  let text = '';
  for await (const chunk of content) text += chunk;
  console.log('Log content preview:', text.slice(0, 200));

  await browser.close();
})();
