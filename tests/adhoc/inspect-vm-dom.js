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

  await page.click('a:has-text("Virtual machines")');
  await page.waitForTimeout(3000);

  // Find the iframe for the machines module and inspect inside it
  const frame = page.frames().find(f => f.url().includes('machines'));
  if (!frame) {
    console.log('frame not found, urls:', page.frames().map(f => f.url()));
    await browser.close();
    return;
  }

  const result = await frame.evaluate(() => {
    function describe(el, depth) {
      if (!el || depth > 6) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className,
        bg: cs.backgroundColor,
        border: cs.border,
        boxShadow: cs.boxShadow,
        height: Math.round(r.height),
      };
    }
    const root = document.querySelector('.pf-v6-c-page__main-section') || document.body;
    const out = [];
    let el = root;
    // walk down through first-children to capture structure
    function walk(node, depth) {
      if (!node || depth > 5) return;
      out.push({ depth, ...describe(node, depth) });
      Array.from(node.children).slice(0, 4).forEach(child => walk(child, depth + 1));
    }
    walk(root, 0);
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
