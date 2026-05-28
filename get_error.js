const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    await page.goto('http://localhost:5173/billing', { waitUntil: 'networkidle2' });
    // Wait a bit to ensure React renders
    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    console.error('Nav error:', err);
  } finally {
    await browser.close();
  }
})();
