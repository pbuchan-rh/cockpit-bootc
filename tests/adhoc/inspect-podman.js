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
  await page.click('a:has-text("Podman containers")');
  await page.waitForTimeout(2000);
  const frame = page.frames().find(f => f.url().includes('@localhost/') && f.url().includes('podman'));
  console.log('frame url:', frame ? frame.url() : 'NOT FOUND', page.frames().map(f=>f.url()));
  const result = await frame.evaluate(() => {
    function describe(el) {
      const cs = getComputedStyle(el);
      return { className: el.className, bg: cs.backgroundColor, border: cs.border, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow };
    }
    const main = document.querySelector('.pf-v6-c-page__main-container');
    const cards = Array.from(document.querySelectorAll('.pf-v6-c-card')).map(describe);
    return { main: main ? describe(main) : null, cards };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
