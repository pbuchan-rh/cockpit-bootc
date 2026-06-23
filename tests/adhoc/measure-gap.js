const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first().click();
  await page.fill('#account-password-input, input[type="password"]', '***REDACTED***');
  await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  await page.goto('https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html');
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const row = document.querySelector('.ct-switch-row');
    const card = row.closest('.pf-v6-c-card');
    const rowRect = row.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const cs = getComputedStyle(row);
    return {
      gapToCardBottom: cardRect.bottom - rowRect.bottom,
      paddingBlockEnd: cs.paddingBottom,
    };
  });
  console.log(result);
  await browser.close();
})();
