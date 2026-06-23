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

async function mcInfo(frame) {
  return frame.evaluate(() => {
    const main = document.querySelector('.pf-v6-c-page__main-container');
    const cs = getComputedStyle(main);
    const sectionEl = document.querySelector('.pf-v6-c-page__main-section');
    const scs = sectionEl ? getComputedStyle(sectionEl) : null;
    return {
      className: main.className,
      height: cs.height,
      minHeight: cs.minHeight,
      display: cs.display,
      flexDirection: cs.flexDirection,
      sectionClassName: sectionEl ? sectionEl.className : null,
      sectionHeight: scs ? scs.height : null,
      sectionFlexGrow: scs ? scs.flexGrow : null,
      sectionBg: scs ? scs.backgroundColor : null,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1381, height: 865 } });
  const page = await context.newPage();
  await login(page);

  await page.click('a:has-text("Virtual machines")');
  await page.waitForTimeout(2000);
  const vmFrame = page.frames().find(f => f.url().includes('@localhost/machines/index.html'));
  console.log('machines:', JSON.stringify(await mcInfo(vmFrame), null, 2));

  await page.click('a:has-text("Image Updates")');
  await page.waitForTimeout(2000);
  const bootcFrame = page.frames().find(f => f.url().includes('@localhost/bootc/index.html'));
  console.log('bootc:', JSON.stringify(await mcInfo(bootcFrame), null, 2));

  await browser.close();
})();
