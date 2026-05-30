const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  
  // Wait for diagrams to load
  await page.waitForSelector('.group.border.border-border');
  
  // Click the first diagram
  await page.click('.group.border.border-border');
  
  // Wait for the editor to load
  await page.waitForSelector('.mermaid-container');
  
  // Try dragging
  const wrapper = await page.$('.react-transform-wrapper');
  if (wrapper) {
      console.log('Wrapper found');
      
      const boundingBox = await wrapper.boundingBox();
      
      // zoom in to allow panning
      await page.keyboard.down('Meta'); // command/ctrl
      await page.mouse.move(boundingBox.x + 100, boundingBox.y + 100);
      await page.mouse.wheel({ deltaY: -500 });
      await page.keyboard.up('Meta');
      
      await new Promise(r => setTimeout(r, 500));
      
      const content = await page.$('.react-transform-component');
      const box1 = await content.boundingBox();
      console.log('Box before pan:', box1);
      
      // mouse drag
      await page.mouse.move(boundingBox.x + 100, boundingBox.y + 100);
      await page.mouse.down();
      await page.mouse.move(boundingBox.x + 200, boundingBox.y + 200, { steps: 10 });
      await page.mouse.up();
      
      await new Promise(r => setTimeout(r, 500));
      
      const box2 = await content.boundingBox();
      console.log('Box after pan:', box2);
  } else {
      console.log('Wrapper not found');
  }

  await browser.close();
})();
