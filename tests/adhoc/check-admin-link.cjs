const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto('https://10.0.0.229:9090/');
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.waitForTimeout(2000);
  const html = await page.evaluate(() => {
    const el = document.querySelector('#super-user-indicator') || document.body;
    return el.outerHTML.slice(0, 1500);
  });
  console.log(html);
  await browser.close();
})();
