const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const OUT = '/var/folders/2y/nbg4jzw970z0kjk57jlf68tr0000gn/T/opencode/hhgoa-shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=430,900', '--force-device-scale-factor=2'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });

  // inject a test "photo" via the file input
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 1250; // portrait
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1000, 1250);
    grad.addColorStop(0, '#ffb07c'); grad.addColorStop(1, '#7c6bff');
    g.fillStyle = grad; g.fillRect(0, 0, 1000, 1250);
    // fake subject head off-center (right side) to test off-center crops
    g.fillStyle = '#e68a5a';
    g.beginPath(); g.arc(720, 520, 240, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.fillRect(520, 820, 400, 430);
    g.fillStyle = '#fff';
    g.font = '140px sans-serif'; g.textAlign = 'center';
    g.fillText('TEST', 500, 300);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'test-photo.png', { type: 'image/png' }));
    document.querySelector('#fileInput').files = dt.files;
    document.querySelector('#fileInput').dispatchEvent(new Event('change'));
  });

  await new Promise((r) => setTimeout(r, 800));
  await page.type('#nameInput', 'Priya Sharma');
  await page.type('#stackInput', 'Backend');
  await new Promise((r) => setTimeout(r, 500));

  // card shot
  await page.screenshot({ path: path.join(OUT, 'card.png') });

  // switch to pfp
  await page.click('.mode-btn[data-mode="pfp"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'pfp.png') });

  // render full-size canvas images directly too
  const cardPng = await page.evaluate(async () => {
    const c = document.querySelector('#out');
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'card-full.png'), Buffer.from(cardPng.split(',')[1], 'base64'));

  await page.click('.mode-btn[data-mode="card"]');
  await new Promise((r) => setTimeout(r, 300));
  const pfpPng = await page.evaluate(async () => {
    const c = document.querySelector('#out');
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'pfp-full.png'), Buffer.from(pfpPng.split(',')[1], 'base64'));

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  console.log('shots in', OUT);
})();
