const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1381, height: 865 }, colorScheme: 'dark' });
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

  // Navigate via the actual shell nav link, not the direct iframe URL
  await page.click('a:has-text("Image Updates")');
  await page.waitForTimeout(3000);

  const iframeInfo = await page.evaluate(() => {
    const iframe = document.querySelector('iframe.container-frame:not(.hidden), iframe[name*="bootc"]');
    if (!iframe) return { error: 'iframe not found', allIframes: Array.from(document.querySelectorAll('iframe')).map(f => ({ name: f.name, className: f.className, height: f.getBoundingClientRect().height })) };
    const r = iframe.getBoundingClientRect();
    const cs = getComputedStyle(iframe);
    return { height: r.height, cssHeight: cs.height, name: iframe.name, className: iframe.className };
  });
  console.log('iframe:', JSON.stringify(iframeInfo, null, 2));

  await page.screenshot({ path: 'via-shell-nav.png', fullPage: true });
  await browser.close();
})();
