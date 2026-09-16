const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    console.log('Starting Puppeteer...');
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'] 
    });
    const page = await browser.newPage();
    
    // Listen for console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

    console.log('Navigating to local dev server (http://localhost:5174/)...');
    try {
      await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });
    } catch (e) {
      if (e.message.includes('ERR_ABORTED')) {
        console.log('Navigation aborted (likely due to coi-serviceworker reload). Waiting for reload...');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      } else {
        throw e;
      }
    }
    
    console.log('Creating a dummy image for testing...');
    const base64Img = "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
    const imageBuffer = Buffer.from(base64Img, 'base64');
    fs.writeFileSync('dummy.png', imageBuffer);
    
    console.log('Uploading dummy image...');
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile('dummy.png');
    
    console.log('Waiting for processing to finish (workspace to appear)...');
    await page.waitForSelector('.comparison-viewport', { timeout: 20000 });
    console.log('Workspace loaded.');

    console.log('Testing keyboard shortcuts...');
    await page.keyboard.down('Control');
    await page.keyboard.press('z');
    await page.keyboard.up('Control');
    
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('z');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    console.log('Undo/Redo shortcuts triggered without crashing.');

    console.log('Testing Wheel pan/zoom shortcuts...');
    // We can't perfectly simulate native scroll wheels easily in basic puppeteer without CDP, 
    // but we can trigger a wheel event in JS.
    await page.evaluate(() => {
      const viewport = document.querySelector('.comparison-viewport');
      if (viewport) {
        const wheelEvent = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, altKey: true, bubbles: true });
        viewport.dispatchEvent(wheelEvent);
      }
    });
    console.log('Zoom event dispatched.');

    console.log('Switching to Selection tool...');
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.tool-btn');
      for (let btn of btns) {
        if (btn.innerText.includes('Select') || btn.innerHTML.includes('Select')) btn.click();
      }
    });

    console.log('Switching to Polygon shape...');
    await page.evaluate(() => {
      const pills = document.querySelectorAll('.b-pill');
      for (let pill of pills) {
        if (pill.innerText.includes('Polygon') || pill.innerHTML.includes('Polygon')) pill.click();
      }
    });

    console.log('Simulating clicks on canvas for polygon...');
    const viewport = await page.$('.comparison-viewport');
    const box = await viewport.boundingBox();
    
    // We need to click 3 times and then close it
    await page.mouse.click(box.x + 10, box.y + 10);
    await page.mouse.click(box.x + 30, box.y + 10);
    await page.mouse.click(box.x + 30, box.y + 30);
    
    // Check if the deselect button appeared immediately like requested
    const hasSelectionEarly = await page.evaluate(() => {
      return document.querySelector('.selection-actions-group') !== null;
    });
    console.log(`Deselect actions available during draw: ${hasSelectionEarly}`);

    // Click near start to close
    await page.mouse.click(box.x + 12, box.y + 12);
    console.log('Polygon closed.');
    
    const hasSelectionClosed = await page.evaluate(() => {
      return document.querySelector('.selection-actions-group') !== null;
    });
    
    if (hasSelectionClosed) {
      console.log('SUCCESS: Polygon selection was successfully created and closed.');
    } else {
      console.error('FAIL: Selection actions group not found. Polygon logic might have failed to snap.');
    }

    console.log('Switching to Magic Wand shape...');
    await page.evaluate(() => {
      const pills = document.querySelectorAll('.b-pill');
      for (let pill of pills) {
        if (pill.innerText.includes('Magic') || pill.innerHTML.includes('Wand')) pill.click();
      }
    });
    
    await page.mouse.click(box.x + 20, box.y + 20);
    console.log('Magic wand click triggered.');

    console.log('Test completed successfully. Closing browser.');
    await browser.close();
    if (fs.existsSync('dummy.png')) fs.unlinkSync('dummy.png');
  } catch (err) {
    console.error('TEST FAILED WITH EXCEPTION:', err);
    process.exit(1);
  }
})();
