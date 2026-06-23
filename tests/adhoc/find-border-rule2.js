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
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1381, height: 865 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await login(page);
  await page.click('a:has-text("Image Updates")');
  await page.waitForTimeout(2000);
  const frame = page.frames().find(f => f.url().includes('@localhost/bootc/index.html'));
  const result = await frame.evaluate(() => {
    const c = document.querySelector('.pf-v6-c-card');
    const sheets = Array.from(document.styleSheets);
    const matches = [];
    for (const sheet of sheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (!rule.selectorText) continue;
        try {
          if (c.matches(rule.selectorText) && /border/i.test(rule.style.cssText)) {
            matches.push({ href: sheet.href, selector: rule.selectorText, css: rule.style.cssText });
          }
        } catch {}
      }
    }
    return matches;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
