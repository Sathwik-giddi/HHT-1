const puppeteer = require('puppeteer-core');

const near = (c, t, tol = 70) => Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]) < tol;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });

  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 1250;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1000, 1250);
    grad.addColorStop(0, '#ffb07c'); grad.addColorStop(1, '#7c6bff');
    g.fillStyle = grad; g.fillRect(0, 0, 1000, 1250);
    g.fillStyle = '#e68a5a';
    g.beginPath(); g.arc(720, 520, 240, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.fillRect(520, 820, 400, 430);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'test-photo.png', { type: 'image/png' }));
    const inp = document.querySelector('#fileInput');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.type('#nameInput', 'Priya Sharma');
  await page.type('#stackInput', 'Backend');
  await new Promise((r) => setTimeout(r, 400));

  const GREEN = [14, 59, 46], YELLOW = [255, 230, 0], PINK = [255, 46, 140], CREAM = [242, 238, 223];

  async function analyze(label, regionChecks) {
    const res = await page.evaluate(({ label, regionChecks }) => {
      const c = document.querySelector('#out');
      const g = c.getContext('2d');
      const w = c.width, h = c.height;
      const px = g.getImageData(0, 0, w, h).data;
      const at = (x, y) => [px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]];
      const count = (x0, y0, x1, y1, target, tol, step) => {
        step = step || 4; let n = 0;
        for (let y = y0; y < y1; y += step)
          for (let x = x0; x < x1; x += step) {
            const p = at(x, y);
            if (Math.abs(p[0] - target[0]) + Math.abs(p[1] - target[1]) + Math.abs(p[2] - target[2]) < tol) n++;
          }
        return n;
      };
      const out = { w, h };
      for (const rc of regionChecks) {
        if (rc.type === 'count') out[rc.name] = count(rc.x0, rc.y0, rc.x1, rc.y1, rc.target, rc.tol);
        if (rc.type === 'at') { const p = at(rc.x, rc.y); out[rc.name] = [p[0], p[1], p[2]]; }
        if (rc.type === 'notgreen') { const p = at(rc.x, rc.y); out[rc.name] = Math.abs(p[0] - 14) + Math.abs(p[1] - 59) + Math.abs(p[2] - 46) > 100; }
      }
      return out;
    }, { label, regionChecks });
    console.log('--- ' + label + ' (' + res.w + 'x' + res.h + ')');
    for (const rc of regionChecks) {
      if (rc.type === 'count') {
        const ok = (rc.max == null) ? res[rc.name] >= rc.min : res[rc.name] <= rc.max;
        console.log((ok ? 'PASS' : 'FAIL') + '  ' + rc.name + ': ' + res[rc.name] + (ok ? '' : (rc.max == null ? ' (min ' + rc.min + ')' : ' (max ' + rc.max + ')')));
      } else {
        let ok;
        if (rc.type === 'notgreen') ok = res[rc.name];
        else ok = near(res[rc.name], rc.expect, rc.tol || 70);
        console.log((ok ? 'PASS' : 'FAIL') + '  ' + rc.name + (rc.type === 'notgreen' ? ': photo present' : ': rgb(' + res[rc.name] + ')') + (ok ? '' : ' (expected non-bg)'));
      }
    }
    return res;
  }

  // CARD (1600x1000)
  await analyze('CARD', [
    { type: 'at', name: 'bg-corner', x: 30, y: 30, expect: GREEN },
    { type: 'count', name: 'yellow-headline', x0: 200, y0: 120, x1: 1400, y1: 340, target: YELLOW, tol: 110, min: 400 },
    { type: 'count', name: 'pink-goa', x0: 550, y0: 330, x1: 1050, y1: 470, target: PINK, tol: 110, min: 80 },
    { type: 'count', name: 'yellow-frame', x0: 80, y0: 500, x1: 160, y1: 950, target: YELLOW, tol: 90, min: 300 },
    { type: 'notgreen', name: 'photo-center', x: 300, y: 680 },
    { type: 'at', name: 'polaroid-tab', x: 150, y: 912, expect: CREAM, tol: 70 },
    { type: 'at', name: 'checker-cell', x: 92, y: 44, expect: [53, 86, 39], tol: 45 },
    { type: 'at', name: 'checker-gap', x: 68, y: 44, expect: GREEN, tol: 40 },
    { type: 'count', name: 'footer-text', x0: 60, y0: 925, x1: 1540, y1: 980, target: CREAM, tol: 60, min: 70 },
    { type: 'count', name: 'no-footer-sun', x0: 700, y0: 905, x1: 900, y1: 990, target: YELLOW, tol: 90, max: 15 },
    { type: 'count', name: 'pink-title', x0: 640, y0: 760, x1: 1200, y1: 845, target: PINK, tol: 110, min: 80 },
    { type: 'count', name: 'right-edge-clean', x0: 1570, y0: 0, x1: 1600, y1: 1000, target: GREEN, tol: 40, min: 400 },
  ]);

  await page.click('.mode-btn[data-mode="pfp"]');
  await new Promise((r) => setTimeout(r, 400));

  // PFP (1080x1080)
  await analyze('PFP', [
    { type: 'at', name: 'bg-corner', x: 20, y: 20, expect: GREEN },
    { type: 'count', name: 'yellow-headline', x0: 150, y0: 80, x1: 930, y1: 180, target: YELLOW, tol: 110, min: 200 },
    { type: 'count', name: 'pink-goa', x0: 350, y0: 150, x1: 730, y1: 260, target: PINK, tol: 110, min: 80 },
    { type: 'count', name: 'yellow-frame', x0: 160, y0: 290, x1: 205, y1: 1030, target: YELLOW, tol: 90, min: 400 },
    { type: 'notgreen', name: 'photo-present', x: 540, y: 620 },
    { type: 'count', name: 'yellow-sun', x0: 470, y0: 900, x1: 610, y1: 990, target: YELLOW, tol: 90, min: 100 },
    { type: 'count', name: 'right-edge-clean', x0: 1060, y0: 0, x1: 1080, y1: 1080, target: GREEN, tol: 40, min: 100 },
  ]);

  await browser.close();
  console.log('done');
})();
