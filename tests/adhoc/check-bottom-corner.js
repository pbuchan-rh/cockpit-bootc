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
  let frame = page.frames().find(f => f.url().includes('@localhost/podman/index.html'));
  let box = await frame.evaluate(() => {
    const mc = document.querySelector('.pf-v6-c-page__main-container');
    const r = mc.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, borderRadius: getComputedStyle(mc).borderRadius };
  });
  console.log('podman main-container box:', box);
  await page.screenshot({ path: 'podman-bottom-corner.png', clip: { x: box.x, y: box.y + box.height - 60, width: 200, height: 100 } });

  await page.click('a:has-text("Image Updates")');
  await page.waitForTimeout(2000);
  frame = page.frames().find(f => f.url().includes('@localhost/bootc/index.html'));
  box = await frame.evaluate(() => {
    const mc = document.querySelector('.pf-v6-c-page__main-container');
    const r = mc.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, borderRadius: getComputedStyle(mc).borderRadius };
  });
  console.log('bootc main-container box:', box);
  await page.screenshot({ path: 'bootc-bottom-corner.png', clip: { x: box.x, y: box.y + box.height - 60, width: 200, height: 100 } });

  await browser.close();
})();
