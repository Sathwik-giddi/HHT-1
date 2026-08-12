const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });

  const upload = async (w, h) => {
    await page.evaluate(async (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#112233'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffcc00'; g.fillRect(Math.floor(w / 2) - 20, Math.floor(h / 2) - 20, 40, 40);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([b], 't.png', { type: 'image/png' }));
      const i = document.querySelector('#fileInput');
      i.files = dt.files; i.dispatchEvent(new Event('change'));
    }, w, h);
    await new Promise((r) => setTimeout(r, 600));
  };

  const hash = () => page.evaluate(() => document.querySelector('#out').toDataURL('image/png'));

  const drag = async (dxf, dyf) => {
    const holder = await page.$('#canvasHolder');
    const bb = await holder.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * dxf, bb.y + bb.height * dyf, { steps: 6 });
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 250));
  };

  // 1) square image, square pfp crop -> no pan room at zoom 1
  await page.click('.mode-btn[data-mode="pfp"]');
  await upload(600, 600);
  const canPan = await page.evaluate(() => document.querySelector('#canvasHolder').classList.contains('can-pan'));
  const h0 = await hash();
  await drag(0.3, 0.4);
  const h1 = await hash();
  const off1 = await page.evaluate(() => state.offX);
  console.log((canPan === true ? 'PASS' : 'FAIL') + '  touch-action disabled (can-pan) for any loaded photo — pinch enabled');
  console.log((h0 === h1 && Math.abs(off1) < 1e-6 ? 'PASS' : 'FAIL') + '  at zoom 1 with no room, drag leaves the photo unchanged');

  // 2) zoom in via button -> pan room appears, then drag moves photo (clamped)
  await page.click('#zoomInBtn');
  await new Promise((r) => setTimeout(r, 250));
  const z1 = await page.evaluate(() => ({ zoom: state.zoom, maxX: state.maxX, badgeTxt: document.querySelector('#zoomBadge').textContent, badgeVis: !document.querySelector('#zoomBadge').hidden }));
  const h2 = await hash();
  await drag(0.3, 0.4);
  const h3 = await hash();
  const o2 = await page.evaluate(() => ({ offX: state.offX, offY: state.offY, maxX: state.maxX, maxY: state.maxY }));
  console.log((z1.zoom === 1.25 && z1.maxX > 0 && z1.badgeVis && z1.badgeTxt === '125%' ? 'PASS' : 'FAIL') + '  zoom button → 1.25, badge "' + z1.badgeTxt + '", pan room appears');
  console.log((h2 !== h3 && Math.abs(o2.offX) <= o2.maxX + 0.5 && Math.abs(o2.offY) <= o2.maxY + 0.5 ? 'PASS' : 'FAIL') + '  after zoom, drag moves photo, clamped to (' + o2.offX.toFixed(1) + ',' + o2.offY.toFixed(1) + ')');

  // 3) double-click zooms in further
  const holder = await page.$('#canvasHolder');
  const bb = await holder.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { clickCount: 2 });
  await new Promise((r) => setTimeout(r, 250));
  const z2 = await page.evaluate(() => state.zoom);
  console.log((z2 > z1.zoom ? 'PASS' : 'FAIL') + '  double-click zooms in (1.25 -> ' + z2 + ')');

  // 4) recenter resets zoom + offsets
  await page.click('#recenterBtn');
  await new Promise((r) => setTimeout(r, 250));
  const z3 = await page.evaluate(() => ({ zoom: state.zoom, offX: state.offX, badgeHidden: document.querySelector('#zoomBadge').hidden }));
  console.log((z3.zoom === 1 && z3.offX === 0 && z3.badgeHidden ? 'PASS' : 'FAIL') + '  recenter resets zoom=1, offsets=0, badge hidden');

  // 5) landscape photo, card mode -> pan + clamp
  await page.click('.mode-btn[data-mode="card"]');
  await upload(1400, 500);
  const h4 = await hash();
  await drag(0.2, 0.5);
  const h5 = await hash();
  const lim = await page.evaluate(() => ({ offX: state.offX, maxX: state.maxX }));
  console.log((h4 !== h5 && Math.abs(lim.offX) <= lim.maxX + 0.5 ? 'PASS' : 'FAIL') + '  card landscape pan clamps offX within ±' + lim.maxX.toFixed(1) + ' (' + lim.offX.toFixed(1) + ')');

  await browser.close();
})();
