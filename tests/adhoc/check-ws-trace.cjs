const { chromium } = require('@playwright/test');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on('websocket', ws => {
    console.log('WS opened:', ws.url());
    ws.on('framesent', f => {
      const text = (f.payload || '').toString();
      if (text.includes('superuser') || text.includes('authorize') || text.includes('init')) {
        console.log('SENT:', text.slice(0, 300));
      }
    });
    ws.on('framereceived', f => {
      const text = (f.payload || '').toString();
      if (text.includes('superuser') || text.includes('authorize')) {
        console.log('RECV:', text.slice(0, 300));
      }
    });
  });

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
  const pwField = page.locator('input[type="password"]').last();
  await pwField.fill(process.env.COCKPIT_PASS);
  const authBtn = page.locator('button:has-text("Authenticate"), button[type="submit"]').first();
  await authBtn.click();
  await page.waitForTimeout(5000);

  console.log('--- now attempting privileged call ---');
  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve('TIMEOUT'), 8000);
      window.cockpit.spawn(['whoami'], { superuser: 'require' })
        .then(out => { clearTimeout(t); resolve('OK:' + out); })
        .catch(err => { clearTimeout(t); resolve('ERR:' + JSON.stringify(err)); });
    });
  });
  console.log('result:', result);

  await browser.close();
})();
