const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1381, height: 865 } });
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
    function info(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { selector: sel, height: r.height, bg: cs.backgroundColor, minHeight: cs.minHeight, display: cs.display };
    }
    return {
      htmlHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.scrollHeight,
      windowInnerHeight: window.innerHeight,
      html: info('html'),
      body: info('body'),
      app: info('#app'),
      page: info('.pf-v6-c-page'),
      mainSection: info('.pf-v6-c-page__main-section'),
      pageMain: info('.pf-v6-c-page__main'),
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
