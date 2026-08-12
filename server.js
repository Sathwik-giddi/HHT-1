'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

/* writable dir: /tmp on Vercel/Lambda (project dir is read-only), ./data/images locally */
const DATA_DIR = path.join(process.env.RENDER_DISK_PATH || os.tmpdir(), 'hh-goa-images');
fs.mkdirSync(DATA_DIR, { recursive: true });

app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'heic2any', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

const ID_HEX = /^[0-9a-f]{16}$/;
const ID_SHORT = /^[0-9a-z]{12}$/;

function shortId(len = 12) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const buf = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function storeImage(dataUrl, meta = {}) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('bad_image');
  const ext = m[1] === 'jpeg' ? 'jpg' : 'png';
  const id = shortId();
  const base = path.join(DATA_DIR, id);
  fs.writeFileSync(base + '.' + ext, Buffer.from(m[2], 'base64'));
  fs.writeFileSync(base + '.json', JSON.stringify({ ext, createdAt: Date.now(), ...meta }));
  return { id, ext };
}

app.post('/api/image', (req, res) => {
  try {
    const { dataUrl, meta } = req.body || {};
    const { id, ext } = storeImage(dataUrl, meta);
    const url = `/s/${id}`;
    res.json({ id, ext, url });
  } catch (e) {
    console.error('image upload failed:', e.message);
    res.status(400).json({ error: 'invalid image payload' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'hh-goa-2026-frame-id', uptime: Math.floor(process.uptime()) });
});

app.get('/api/image/:id', (req, res) => {
  const { id } = req.params;
  if (!ID_HEX.test(id) && !ID_SHORT.test(id)) return res.status(404).json({ error: 'not found' });
  const base = path.join(DATA_DIR, id);
  if (!fs.existsSync(base + '.png') && !fs.existsSync(base + '.jpg')) {
    return res.status(404).json({ error: 'not found' });
  }
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(base + '.json', 'utf8')); } catch (e) {}
  res.json({ id, ext: meta.ext || 'png', meta });
});

function serveImageFile(req, res) {
  const file = path.join(DATA_DIR, req.params[0] + '.' + req.params[2]);
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file);
}

function serveSharePage(req, res) {
  const id = req.params[0];
  const base = path.join(DATA_DIR, id);
  const ext = fs.existsSync(base + '.png') ? 'png' : fs.existsSync(base + '.jpg') ? 'jpg' : null;
  if (!ext) return res.status(404).send('not found');

  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(base + '.json', 'utf8')); } catch (e) {}
  meta = meta || {};

  const host = req.get('host') || 'localhost:3001';
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const origin = `${proto}://${host}`;
  const prefix = req.path.indexOf('/s/') === 0 ? '/s' : '/i';
  const imgUrl = `${origin}${prefix}/${id}.${ext}`;
  const pageUrl = `${origin}${prefix}/${id}`;

  const name = meta.name ? ` for ${escapeHtml(meta.name)}` : '';
  const title = meta.title ? ` · ${escapeHtml(meta.title)}` : '';
  const ogTitle = `HH Goa 2026 Builder ID${name}`;
  const ogDesc = `My HH Goa 2026 frame${title} — minted with the Frame/ID generator. #FrameInGoa`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ogTitle}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:image" content="${imgUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<meta name="twitter:image" content="${imgUrl}">
<style>
  :root{--green:#0E3B2E;--yellow:#FFE600;--pink:#FF2E8C;--cream:#F2EEDF}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:radial-gradient(900px 400px at 90% -10%,rgba(255,46,140,.16),transparent 60%),linear-gradient(160deg,#0A2E23,var(--green));color:var(--cream);font-family:ui-monospace,Menlo,monospace;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:24px;gap:18px}
  h1{font-family:Anton,Arial,Helvetica,sans-serif;letter-spacing:1px;color:var(--yellow);font-size:26px;text-align:center}
  h1 span{color:var(--pink)}
  img{max-width:min(92vw,720px);border:6px solid var(--yellow);box-shadow:12px 12px 0 rgba(0,0,0,.25);display:block}
  .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
  a.btn,.btn{background:var(--yellow);color:var(--green);text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;font-size:14px;letter-spacing:.5px;box-shadow:4px 4px 0 var(--pink);border:none;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px}
  a.btn:hover,.btn:hover{transform:translate(-1px,-1px)}
  .btn.out{background:transparent;color:var(--cream);box-shadow:0 0 0 2px var(--cream)}
  .cap{max-width:min(92vw,720px);text-align:center;font-size:13px;line-height:1.6;color:var(--cream);word-break:break-word;background:rgba(10,46,35,.5);border:1px dashed rgba(242,238,223,.3);padding:12px 16px;border-radius:10px}
  .cap b{color:var(--pink)}
  p.small{font-size:11px;opacity:.6}
  #copied{opacity:0;transition:opacity .3s;font-size:12px;color:var(--yellow)}
</style>
</head>
<body>
  <h1>HACKER HOUSE <span>गोवा</span></h1>
  <img src="${imgUrl}" alt="HH Goa 2026 frame">
  <div class="row">
    <a class="btn" href="${origin}/">MAKE YOUR OWN →</a>
    <a class="btn out" href="${imgUrl}" download="hh-goa-2026.png">DOWNLOAD</a>
    <button class="btn out" id="copyBtn" type="button">COPY CAPTION</button>
  </div>
  <div class="cap" id="cap">${ogDesc}</div>
  <span id="copied">caption copied ✓</span>
  <p class="small">#FrameInGoa · HH Goa 2026</p>
<script>
  var cap = document.getElementById('cap').textContent.trim();
  document.getElementById('copyBtn').addEventListener('click', function () {
    var t = cap + '\\n\\n#FrameInGoa #HackerHouse #Goa2026';
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
      .then(function(){ document.getElementById('copied').style.opacity = 1; setTimeout(function(){ document.getElementById('copied').style.opacity = 0; }, 2000); })
      .catch(function(){ window.prompt('Copy the caption:', t); });
  });
</script>
</body>
</html>`);
}

/* short links (new) + legacy 16-hex ids */
app.get(/^\/(?:s\/([0-9a-z]{12})|i\/([0-9a-f]{16}))\.(png|jpg)$/, (req, res) => {
  req.params[0] = req.params[0] || req.params[1];
  serveImageFile(req, res);
});
app.get(/^\/(?:s\/([0-9a-z]{12})|i\/([0-9a-f]{16}))$/, (req, res) => {
  req.params[0] = req.params[0] || req.params[1];
  serveSharePage(req, res);
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HH Goa 2026 Frame/ID generator → http://localhost:${PORT}`);
  });
}

module.exports = app;
