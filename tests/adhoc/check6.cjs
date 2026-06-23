const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1980, height: 1000 } });
  const page = await context.newPage();
  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  const unlock = page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first();
  await unlock.waitFor({ timeout: 5000 });
  await unlock.click();
  const pw = page.locator('#account-password-input, input[type="password"]').first();
  await pw.waitFor({ timeout: 5000 });
  await pw.fill('***REDACTED***');
  await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  await page.goto('https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html');
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const header = document.querySelector('.ct-image-ref-header');
    const main = document.querySelector('.ct-image-ref-header .pf-v6-c-card__header-main');
    const titleText = document.querySelector('.ct-image-ref-header .pf-v6-c-card__title-text');
    const cs = el => el ? {
        cls: el.className,
        rect: el.getBoundingClientRect(),
        justifyContent: getComputedStyle(el).justifyContent,
        flex: getComputedStyle(el).flex,
    } : null;
    return { header: cs(header), main: cs(main), titleText: cs(titleText) };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
