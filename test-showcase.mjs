import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1500);

  // Click Model Lab button
  await page.click('.btn-benchmark-nav');
  await page.waitForTimeout(1000);
  await page.waitForSelector('.showcase-page');

  // Screenshot RMBG tab
  await page.screenshot({ path: 'C:/Users/hafiz/.gemini/antigravity/brain/ce814e9f-91e4-44d5-a824-3c185bac0899/pw_showcase_rmbg.png', fullPage: true });
  console.log('Saved pw_showcase_rmbg.png');

  // Switch to IS-Net
  await page.click('button:has-text("DIS / IS-Net")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/hafiz/.gemini/antigravity/brain/ce814e9f-91e4-44d5-a824-3c185bac0899/pw_showcase_isnet.png', fullPage: true });
  console.log('Saved pw_showcase_isnet.png');

  // Switch to MODNet
  await page.click('button:has-text("MODNet")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/hafiz/.gemini/antigravity/brain/ce814e9f-91e4-44d5-a824-3c185bac0899/pw_showcase_modnet.png', fullPage: true });
  console.log('Saved pw_showcase_modnet.png');

  await browser.close();
}

run().catch(console.error);
