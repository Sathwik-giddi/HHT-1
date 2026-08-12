const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });

  // landscape photo
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1400; c.height = 700;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1400, 700);
    grad.addColorStop(0, '#4dd0e1'); grad.addColorStop(1, '#ffcc80');
    g.fillStyle = grad; g.fillRect(0, 0, 1400, 700);
    g.fillStyle = '#e68a5a';
    g.beginPath(); g.arc(1000, 350, 200, 0, Math.PI * 2); g.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'landscape.png', { type: 'image/png' }));
    const inp = document.querySelector('#fileInput');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
  });
  await new Promise((r) => setTimeout(r, 700));

  // pan the photo
  const holder = await page.$('#canvasHolder');
  const bb = await holder.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));

  // sample a pixel in the photo area to confirm a photo color (not green) survived panning
  const px = await page.evaluate(() => {
    const c = document.querySelector('#out');
    const g = c.getContext('2d');
    const d = g.getImageData(200, 700, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  const notGreen = Math.abs(px[0] - 14) + Math.abs(px[1] - 59) + Math.abs(px[2] - 46) > 100;
  console.log((notGreen ? 'PASS' : 'FAIL') + '  landscape cover-crop + pan keeps photo in frame: rgb(' + px + ')');

  // capture the download anchor + verify blob
  await page.evaluate(() => {
    const native = HTMLAnchorElement.prototype.click;
    window.__dl = null;
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = { href: this.href, download: this.download };
      native.call(this);
    };
  });
  await page.click('#downloadBtn');
  await new Promise((r) => setTimeout(r, 800));
  const dl = await page.evaluate(() => window.__dl);
  console.log((dl && /^blob:/.test(dl.href) && /\.png$/.test(dl.download) ? 'PASS' : 'FAIL') + '  download: ' + JSON.stringify(dl));

  // share -> intercept window.open to grab the intent URL
  await page.evaluate(() => { window.__open = null; window.open = (u) => { window.__open = u; return null; }; });
  await page.click('#shareBtn');
  await new Promise((r) => setTimeout(r, 2500));
  const intent = await page.evaluate(() => window.__open);
  const goodIntent = intent && intent.includes('twitter.com/intent/tweet') && intent.includes('FrameInGoa') && intent.includes('%23');
  const noLocalLink = intent && !intent.includes('%2Fapi') && !intent.includes('&url=');
  console.log((goodIntent ? 'PASS' : 'FAIL') + '  share intent URL: ' + (intent || 'none').slice(0, 130) + '…');
  console.log((noLocalLink ? 'PASS' : 'FAIL') + '  localhost run omits the non-crawlable link');

  const msg = await page.evaluate(() => document.querySelector('#shareCap').textContent);
  console.log((msg.includes('localhost') ? 'PASS' : 'FAIL') + '  shareCap warns about localhost: ' + msg.slice(0, 70));
  console.log('shareCap: ' + msg);

  await browser.close();
})();
