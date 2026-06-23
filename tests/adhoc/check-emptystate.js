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
    const text = document.evaluate("//*[contains(text(),'No VM is running')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const chain = [];
    let el = text ? text.closest('div') : null;
    for (let i = 0; i < 6 && el; i++) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      chain.push({ tag: el.tagName, cls: el.className, height: r.height, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, display: cs.display, justifyContent: cs.justifyContent, alignItems: cs.alignItems });
      el = el.parentElement;
    }
    return chain;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
