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

  const info = await page.evaluate(() => {
    const section = document.querySelector('.pf-v6-c-page__main-section');
    const cards = Array.from(document.querySelectorAll('.pf-v6-c-card'));
    const gallery = document.querySelector('.pf-v6-l-gallery');
    return {
      sectionStyle: section ? getComputedStyle(section).gap + ' / display=' + getComputedStyle(section).display : null,
      galleryStyle: gallery ? {
        display: getComputedStyle(gallery).display,
        gap: getComputedStyle(gallery).gap,
        margin: getComputedStyle(gallery).margin,
        gridTemplateColumns: getComputedStyle(gallery).gridTemplateColumns,
      } : null,
      cardRects: cards.map(c => c.getBoundingClientRect()),
      cardBoxShadows: cards.map(c => getComputedStyle(c).boxShadow),
      cardOutlines: cards.map(c => getComputedStyle(c).outline),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
