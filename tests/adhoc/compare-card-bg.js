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

  await page.click('a:has-text("Overview")');
  await page.waitForTimeout(2000);
  const ovFrame = page.frames().find(f => f.url().includes('@localhost/system/index.html'));
  const ovInfo = await ovFrame.evaluate(() => {
    const card = document.querySelector('.pf-v6-c-card');
    const cs = getComputedStyle(card);
    const mc = document.querySelector('.pf-v6-c-page__main-container');
    return { cardBg: cs.backgroundColor, cardBorder: cs.border, cardBoxShadow: cs.boxShadow, mainContainerBg: getComputedStyle(mc).backgroundColor };
  });
  console.log('=== Overview ===', JSON.stringify(ovInfo, null, 2));

  await page.click('a:has-text("Image Updates")');
  await page.waitForTimeout(2000);
  const bootcFrame = page.frames().find(f => f.url().includes('@localhost/bootc/index.html'));
  const bcInfo = await bootcFrame.evaluate(() => {
    const card = document.querySelector('.pf-v6-c-card');
    const cs = getComputedStyle(card);
    const mc = document.querySelector('.pf-v6-c-page__main-container');
    return { cardBg: cs.backgroundColor, cardBorder: cs.border, cardBoxShadow: cs.boxShadow, mainContainerBg: getComputedStyle(mc).backgroundColor };
  });
  console.log('=== bootc ===', JSON.stringify(bcInfo, null, 2));

  await browser.close();
})();
