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

async function shootBottomCorner(page, linkText, pkgName, outFile) {
  await page.click(`a:has-text("${linkText}")`);
  await page.waitForTimeout(2000);
  const target = `@localhost/${pkgName}/index.html`;
  const frame = page.frames().find(f => f.url().includes(target));
  if (!frame) {
    console.log('NO FRAME for', pkgName, page.frames().map(f => f.url()));
    return;
  }
  const iframeEl = await page.$(`iframe[src*="${pkgName}"]`);
  const iframeBox = iframeEl ? await iframeEl.boundingBox() : null;
  const mcBox = await frame.evaluate(() => {
    const mc = document.querySelector('.pf-v6-c-page__main-container');
    const r = mc.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  console.log(outFile, 'iframeBox:', iframeBox, 'mcBox:', mcBox);
  const absX = (iframeBox ? iframeBox.x : 0) + mcBox.x;
  const absY = (iframeBox ? iframeBox.y : 0) + mcBox.y + mcBox.height - 40;
  await page.screenshot({ path: outFile, clip: { x: Math.max(0, absX), y: Math.max(0, absY), width: 250, height: 80 } });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1381, height: 865 } });
  const page = await context.newPage();
  await login(page);

  await shootBottomCorner(page, 'Podman containers', 'podman', 'podman-corner2.png');
  await shootBottomCorner(page, 'Image Updates', 'bootc', 'bootc-corner2.png');

  await browser.close();
})();
