const { chromium } = require('playwright');

async function login(page) {
  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first().click();
  await page.fill('#account-password-input, input[type="password"]', '***REDACTED***');
  await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1381, height: 865 } });
  const page = await context.newPage();
  await login(page);
  await page.click('a:has-text("Virtual machines")');
  await page.waitForTimeout(2000);
  const frame = page.frames().find(f => f.url().includes('@localhost/machines/index.html'));

  const result = await frame.evaluate(() => {
    // Find every element and report any with suspiciously large/explicit height,
    // 0-size invisible elements, or min-height set directly (not via flex-grow)
    const all = Array.from(document.querySelectorAll('body *'));
    const suspects = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const inlineMinHeight = el.style.minHeight;
      const computedMinHeight = cs.minHeight;
      if (inlineMinHeight || (computedMinHeight && computedMinHeight !== '0px' && computedMinHeight !== 'auto')) {
        suspects.push({
          tag: el.tagName, cls: el.className,
          inlineMinHeight, computedMinHeight,
          height: r.height, width: r.width,
          visible: r.width > 0 && r.height > 0,
        });
      }
    }
    return suspects;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
