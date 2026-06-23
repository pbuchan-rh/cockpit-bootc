const { chromium } = require('@playwright/test');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(process.env.COCKPIT_URL);
  await page.fill('#login-user-input', process.env.COCKPIT_USER);
  await page.fill('#login-password-input', process.env.COCKPIT_PASS);
  await page.click('#login-button');
  await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  const indicator = page.locator('#super-user-indicator button').first();
  await indicator.waitFor({ state: 'visible', timeout: 5000 });
  await indicator.click();
  await page.waitForTimeout(1000);
  console.log('--- modal state after click ---');
  console.log(await page.locator('body').innerHTML().then(h => h.slice(0,0)).catch(()=>{}));
  const pwField = page.locator('input[type="password"]').last();
  const pwVisible = await pwField.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('password field visible:', pwVisible);
  if (pwVisible) {
    await pwField.fill(process.env.COCKPIT_PASS);
    // Look for an explicit submit/authenticate button instead of pressing Enter
    const authBtn = page.locator('button:has-text("Authenticate"), button[type="submit"]').first();
    const authVisible = await authBtn.isVisible({timeout:2000}).catch(()=>false);
    console.log('authenticate button visible:', authVisible);
    if (authVisible) {
      const text = await authBtn.textContent();
      console.log('auth button text:', text);
      await authBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
  }
  await page.waitForTimeout(2000);
  const indicatorTextAfter = await indicator.textContent().catch(() => '(gone)');
  console.log('indicator text after submit:', indicatorTextAfter);
  await page.screenshot({ path: '/tmp/indicator-after.png' });
  await browser.close();
})();
