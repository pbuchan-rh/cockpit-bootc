const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
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
    const header = document.querySelector('.pf-v6-c-card__header');
    const main = document.querySelector('.ct-image-ref-header .pf-v6-c-card__header-main');
    const actions = document.querySelector('.ct-image-ref-header .pf-v6-c-card__actions');
    const titleText = document.querySelector('.ct-image-ref-header .pf-v6-c-card__title-text');
    const cs = el => el ? getComputedStyle(el).cssText.slice(0,0) || {
        display: getComputedStyle(el).display,
        flex: getComputedStyle(el).flex,
        width: el.getBoundingClientRect().width,
        justifyContent: getComputedStyle(el).justifyContent,
        alignItems: getComputedStyle(el).alignItems,
        textAlign: getComputedStyle(el).textAlign,
    } : null;
    return {
        headerClass: header && header.className,
        headerDisplay: header && getComputedStyle(header).display,
        main: cs(main),
        actions: cs(actions),
        titleText: cs(titleText),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
