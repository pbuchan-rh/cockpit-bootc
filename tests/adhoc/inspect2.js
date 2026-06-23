const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
  await page.fill('#login-user-input', 'pbuchan');
  await page.fill('#login-password-input', '***REDACTED***');
  await page.click('#login-button');
  await page.waitForTimeout(2000);
  await page.click('text=Limited access');
  await page.waitForTimeout(800);
  await page.fill('input[type=password]', '***REDACTED***');
  await page.click('button:has-text("Authenticate")');
  await page.waitForTimeout(1500);
  await page.goto('https://10.0.0.229:9090/bootc', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // find the right frame
  let target = page;
  for (const f of page.frames()) {
    const has = await f.$('text=Automatic Updates').catch(() => null) || await f.$('text=Check for Updates').catch(() => null);
    if (has) { target = f; break; }
  }

  const info = await target.evaluate(() => {
    const card = document.querySelector('.pf-v6-c-card');
    const body = card ? card.querySelector('.pf-v6-c-card__body') : null;
    const flex = body ? body.firstElementChild : null;
    const cs = el => el ? (() => { const c = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { padding: c.padding, height: r.height, top: r.top, bottom: r.bottom, display: c.display, alignItems: c.alignItems }; })() : null;
    return { card: cs(card), body: cs(body), flex: cs(flex) };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
