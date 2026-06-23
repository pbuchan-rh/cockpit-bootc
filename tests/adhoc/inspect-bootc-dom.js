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

  await page.click('a:has-text("Image Updates")');
  await page.waitForTimeout(2000);

  const frame = page.frames().find(f => f.url().includes('@localhost/bootc/index.html'));

  const result = await frame.evaluate(() => {
    function describe(el) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className,
        bg: cs.backgroundColor,
        border: cs.border,
        height: Math.round(r.height),
      };
    }
    const out = [];
    function walk(node, depth) {
      if (!node || depth > 5) return;
      out.push({ depth, ...describe(node) });
      Array.from(node.children).slice(0, 5).forEach(child => walk(child, depth + 1));
    }
    walk(document.body, 0);
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
