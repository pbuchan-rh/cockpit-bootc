const { chromium } = require('@playwright/test');
const { loginToCockpit } = require('../helpers/cockpit.js');
require('dotenv').config({ path: __dirname + '/../.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await loginToCockpit(page);
  await page.waitForTimeout(1000);
  const stagedCard = page.locator('.pf-v6-c-card', { has: page.locator('text=Staged Update') });
  const cancelBtn = stagedCard.locator('button:has-text("Cancel")');
  if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.locator('button:has-text("Discard")').click();
    await page.waitForTimeout(2000);
    console.log('discarded staged update');
  } else {
    console.log('no staged update to discard');
  }
  await browser.close();
})();
