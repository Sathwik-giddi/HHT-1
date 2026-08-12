'use strict';

/* ---------------------------------- brand --------------------------------- */
const GREEN    = '#0E3B2E';
const GREEN_D  = '#0A2E23';
const GREEN_L  = '#134737';
const YELLOW   = '#FFE600';
const PINK     = '#FF2E8C';
const CREAM    = '#F2EEDF';

const F_ANTON = 'Anton, sans-serif';
const F_MUKTA = 'Mukta, sans-serif';
const F_MONO  = '"Space Mono", monospace';

/* ---------------------------------- state --------------------------------- */
const state = {
  mode: 'card',
  bmp: null,          // ImageBitmap of uploaded photo
  fileName: '',
  offX: 0,
  offY: 0,
  zoom: 1,
  title: '',
  dragging: false,
  dragStart: null,
  pointers: new Map(),
  pinchDist: 0,
  crop: null,         // photo crop rect in canvas px
  raf: 0,
  anim: null,         // smooth zoom tween { t0,dur,z0,z1,o0x,o0y,o1x,o1y }
  animTick: 0,
  momentum: null,     // glide { vx, vy } in canvas px per frame
  momentumTick: 0,
  vel: null,          // last drag velocity (canvas px per frame)
  moveT: 0,
  pos: null,          // draggable text-field baselines { name, stack, title }
  dragField: null,    // 'name' | 'stack' | 'title' | null
  hoverField: null,
  fieldDragStart: null,
};

const MIN_ZOOM = 1, MAX_ZOOM = 4, ZOOM_STEP = 0.25;
const WHEEL_ZOOM_SPEED = 0.0018;
const MOMENTUM_FRICTION = 0.9;
const MOMENTUM_MIN_VEL = 6;
const SIZES = { card: { w: 1600, h: 1000, name: 'hh-goa-2026-builder-id.png' }, pfp: { w: 1080, h: 1080, name: 'hh-goa-2026-pfp-frame.png' } };

/* --------------------------- draggable text fields -------------------------- */
const DEFAULT_POS = {
  name:  { x: 646, y: 612 },
  stack: { x: 646, y: 714 },
  title: { x: 646, y: 836 },
};
const FIELD_DEF = {
  name: {
    label: '. BUILDER NAME', labelOfs: 66,
    color: CREAM, family: F_ANTON, max: 66, width: 840, lines: 1,
  },
  stack: {
    label: '. STACK · ROLE', labelOfs: 46,
    color: CREAM, family: F_MONO, max: 36, width: 410, lines: 2, lineGap: 44,
  },
  title: {
    label: '. BUILDER TITLE', labelOfs: 52,
    color: PINK, family: F_ANTON, max: 48, width: 820, lines: 1,
  },
};

/* ---------------------------------- dom refs ------------------------------- */
const $ = (s) => document.querySelector(s);
const canvas     = $('#out');
const ctx        = canvas.getContext('2d');
const dropzone   = $('#dropzone');
const dzInner    = $('#dzInner');
const fileIn     = $('#fileInput');
const fields     = $('#fieldsPanel');
const preview    = $('#previewPanel');
const actions    = $('#actions');
const nameIn     = $('#nameInput');
const stackIn    = $('#stackInput');
const titleIn    = $('#titleInput');
const reroll     = $('#rerollBtn');
const dlBtn      = $('#downloadBtn');
const shareBtn   = $('#shareBtn');
const shareNativeBtn = $('#shareNativeBtn');
const shareCap   = $('#shareCap');
const panHint    = $('#panHint');
const zoomInBtn  = $('#zoomInBtn');
const zoomOutBtn = $('#zoomOutBtn');
const zoomBadge  = $('#zoomBadge');
const stackChips = $('#stackChips');
const changeBtn  = $('#changeBtn');

/* ------------------------------ builder titles ----------------------------- */
const NOUNS = ['ALCHEMIST','WRANGLER','PILOT','SHERPA','COWBOY','MAESTRO','OFFICER','WIZARD','FORGER','TAMER','ARCHITECT','CHRONICLER','RINGLEADER'];
const BASE  = ['DEPLOY OFFICER','API ALCHEMIST','BUG SQUASHER','HACK WRANGLER','SHIP-IT SHERPA','CURSOR COWBOY','TERMINAL TAMER','GIT WRESTLER','MIDNIGHT COMMITTER','VIBE ENGINEER','STACK OVERFLOWER','MAIN-BRANCH MERGER'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function genTitle(stack) {
  const core = (stack || '').trim().split(/[^a-zA-Z]/).filter(Boolean)[0];
  return core ? core.toUpperCase() + ' ' + pick(NOUNS) : pick(BASE);
}

/* ------------------------------ stack presets ------------------------------ */
const STACKS = ['Backend', 'AI / ML', 'Frontend', 'Full-Stack', 'Design', 'DevOps', 'Blockchain', 'App Dev', 'Security', 'Hardware'];

function buildChips() {
  stackChips.innerHTML = '';
  STACKS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = s;
    b.addEventListener('click', () => {
      stackIn.value = stackIn.value.trim().toLowerCase().startsWith(s.toLowerCase().split(' ')[0].toLowerCase()) ? '' : s;
      state.title = genTitle(stackIn.value);
      titleIn.value = state.title;
      syncChips();
      render();
      saveLS();
    });
    stackChips.appendChild(b);
  });
}
function syncChips() {
  const v = stackIn.value.trim().toLowerCase();
  stackChips.querySelectorAll('.chip').forEach((b) => {
    b.classList.toggle('active', v !== '' && b.textContent.toLowerCase().startsWith(v.split(' ')[0]));
  });
}

/* ------------------------------ persistence -------------------------------- */
const LS_KEY = 'hhgoa26';
function saveLS() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ name: nameIn.value, stack: stackIn.value, title: state.title, mode: state.mode, pos: state.pos })); } catch (e) {}
}
function loadLS() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY));
    if (!d) return;
    if (typeof d.name === 'string') nameIn.value = d.name;
    if (typeof d.stack === 'string') { stackIn.value = d.stack; syncChips(); }
    if (typeof d.title === 'string' && d.title) { state.title = d.title; titleIn.value = d.title; }
    if (d.pos && d.pos.name && d.pos.stack && d.pos.title) {
      state.pos = { name: { ...d.pos.name }, stack: { ...d.pos.stack }, title: { ...d.pos.title } };
    }
    if (d.mode === 'pfp' || d.mode === 'card') {
      state.mode = d.mode;
      document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    }
  } catch (e) {}
}

/* ------------------------------ fonts + init ------------------------------- */
async function ensureFonts() {
  const faces = [
    '100px Anton', '800 100px Mukta', '700 100px Mukta',
    '400 30px "Space Mono"', '700 30px "Space Mono"',
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})));
}

async function init() {
  await ensureFonts();
  buildChips();
  state.pos = { name: { ...DEFAULT_POS.name }, stack: { ...DEFAULT_POS.stack }, title: { ...DEFAULT_POS.title } };
  loadLS();
  if (!state.title) state.title = genTitle(stackIn.value);
  titleIn.value = state.title;
  render();
  saveLS();
}
init();

/* ------------------------------ file handling ------------------------------ */
dropzone.addEventListener('click', () => fileIn.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });

['dragover', 'dragenter'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });

fileIn.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) loadFile(f); fileIn.value = ''; });
changeBtn.addEventListener('click', () => fileIn.click());

async function loadFile(file) {
  try {
    let blob = file;
    const isHeic = /heic|heif/i.test(file.type) || /\.heic$/i.test(file.name);
    if (isHeic) {
      if (typeof heic2any === 'undefined') throw new Error('HEIC converter not loaded');
      blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      blob = Array.isArray(blob) ? blob[0] : blob;
    }
    const bmp = await createImageBitmap(blob);
    state.bmp = bmp;
    state.fileName = file.name;
    state.offX = 0;
    state.offY = 0;
    state.zoom = 1;

    dropzone.classList.add('has-image');
    changeBtn.hidden = false;
    dzInner.innerHTML =
      '<p class="dz-title">✓ PHOTO UPLOADED</p>' +
      '<p class="dz-sub">' + file.name.replace(/\.(heic|heif|jpe?g|png)$/i, '').slice(0, 20).toUpperCase() + ' · TAP TO REPLACE</p>';

    fields.hidden = state.mode !== 'card';
    preview.hidden = false;
    actions.hidden = false;
    shareCap.hidden = true;

    render();
    const scrollTarget = state.mode === 'card' ? fields : preview;
    setTimeout(() => scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    setTimeout(ensureCanvasVisible, 240);
  } catch (err) {
    dzInner.innerHTML = '<p class="dz-title" style="color:var(--pink)">⚠ COULD NOT READ THAT FILE</p><p class="dz-sub">try a JPG, PNG or HEIC photo</p>';
    console.error(err);
  }
}

/* ------------------------------- photo controls ---------------------------- */
const holder = $('#canvasHolder');
const recenterBtn = $('#recenterBtn');
const resetLayoutBtn = $('#resetLayoutBtn');

function hasPanRoom() {
  return (state.maxX > 0.5 || state.maxY > 0.5);
}

function zoomLimits() {
  const bw = state.bmp.width, bh = state.bmp.height;
  const { rw, rh } = state.crop || { rw: 1, rh: 1 };
  const s = Math.max(rw / bw, rh / bh) * state.zoom;
  const dw = bw * s, dh = bh * s;
  return { maxX: Math.max(0, (dw - rw) / 2), maxY: Math.max(0, (dh - rh) / 2) };
}

function clampOffsets() {
  const { maxX, maxY } = zoomLimits();
  const px = state.offX, py = state.offY;
  state.offX = clamp(state.offX, -maxX, maxX);
  state.offY = clamp(state.offY, -maxY, maxY);
  if (state.momentum) {                    // glide dies at the edge — no re-bounce
    if (state.offX !== px) state.momentum.vx = 0;
    if (state.offY !== py) state.momentum.vy = 0;
  }
}

function cancelTweens() {
  if (state.anim) state.anim = null;
  if (state.animTick) { cancelAnimationFrame(state.animTick); state.animTick = 0; }
  if (state.momentum) state.momentum = null;
  if (state.momentumTick) { cancelAnimationFrame(state.momentumTick); state.momentumTick = 0; }
}

function applyZoom(newZoom, px, py) {      // instant — used while pinching
  newZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  cancelTweens();
  if (!state.crop) { state.zoom = newZoom; return; }
  const { rw, rh } = state.crop;
  const bw = state.bmp.width, bh = state.bmp.height;
  const u = clamp(px - state.crop.rx, 0, rw);
  const v = clamp(py - state.crop.ry, 0, rh);
  const s0 = Math.max(rw / bw, rh / bh);
  const s1 = s0 * state.zoom, s2 = s0 * newZoom;
  const srcX = (u - (rw - bw * s1) / 2 - state.offX) / s1;
  const srcY = (v - (rh - bh * s1) / 2 - state.offY) / s1;
  state.zoom = newZoom;
  state.offX = u - (rw - bw * s2) / 2 - srcX * s2;
  state.offY = v - (rh - bh * s2) / 2 - srcY * s2;
  clampOffsets();
  requestRender();
}

function instantZoom(newZoom, px, py) {            // buttons / wheel / double-click
  newZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  if (!state.crop) { state.zoom = newZoom; requestRender(); return; }
  const { rw, rh } = state.crop;
  const bw = state.bmp.width, bh = state.bmp.height;
  const u = clamp(px - state.crop.rx, 0, rw);
  const v = clamp(py - state.crop.ry, 0, rh);
  const s0 = Math.max(rw / bw, rh / bh);
  // keep the source pixel under the cursor fixed while the scale changes
  const s1 = s0 * state.zoom;
  const srcX = (u - (rw - bw * s1) / 2 - state.offX) / s1;
  const srcY = (v - (rh - bh * s1) / 2 - state.offY) / s1;
  const s2 = s0 * newZoom;
  const toX = u - (rw - bw * s2) / 2 - srcX * s2;
  const toY = v - (rh - bh * s2) / 2 - srcY * s2;
  const mx = Math.max(0, (bw * s2 - rw) / 2), my = Math.max(0, (bh * s2 - rh) / 2);
  cancelTweens();
  // the scale level (and the badge that reads it) is applied INSTANTLY so it
  // is exact and deterministic; only the pan offset is eased for polish
  state.zoom = newZoom;
  const o0x = state.offX, o0y = state.offY;
  const o1x = clamp(toX, -mx, mx), o1y = clamp(toY, -my, my);
  if (Math.abs(o1x - o0x) < 0.5 && Math.abs(o1y - o0y) < 0.5) {
    state.offX = o1x; state.offY = o1y; render();
  } else {
    state.anim = { t0: performance.now(), dur: 130, o0x, o0y, o1x, o1y };
    tickOffset(performance.now());
  }
  ensureCanvasVisible();
}

function tickOffset(now) {
  const a = state.anim;
  if (!a) { state.animTick = 0; return; }
  if (now == null) now = performance.now();
  const t = Math.min(1, (now - a.t0) / a.dur);
  const e = 1 - Math.pow(1 - t, 3);        // easeOutCubic
  state.offX = a.o0x + (a.o1x - a.o0x) * e;
  state.offY = a.o0y + (a.o1y - a.o0y) * e;
  render();
  if (t < 1) state.animTick = requestAnimationFrame(tickOffset);
  else { state.anim = null; state.animTick = 0; }
}

function startMomentum() {
  if (!state.vel) return;
  const vx = state.vel.x, vy = state.vel.y;
  state.vel = null;
  if (Math.hypot(vx, vy) < MOMENTUM_MIN_VEL || !hasPanRoom()) return;
  state.momentum = { vx, vy };
  tickMomentum();
}

function tickMomentum() {
  const m = state.momentum;
  if (!m) { state.momentumTick = 0; return; }
  state.offX += m.vx;
  state.offY += m.vy;
  m.vx *= MOMENTUM_FRICTION;
  m.vy *= MOMENTUM_FRICTION;
  clampOffsets();
  render();
  if (Math.hypot(m.vx, m.vy) > 0.6) state.momentumTick = requestAnimationFrame(tickMomentum);
  else { state.momentum = null; state.momentumTick = 0; }
}

function resetPan() {
  cancelTweens();
  state.offX = 0;
  state.offY = 0;
  state.zoom = 1;
  requestRender();
  ensureCanvasVisible();
}

function ensureCanvasVisible() {
  if (!state.bmp || !holder) return;
  const r = holder.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  if (r.top < 32 || r.bottom > h - 32) {
    holder.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

function updatePanUI() {
  const room = hasPanRoom();
  holder.classList.toggle('can-pan', !!state.bmp);
  zoomBadge.hidden = !state.bmp || state.zoom <= MIN_ZOOM;
  if (!zoomBadge.hidden) zoomBadge.textContent = Math.round(state.zoom * 100) + '%';
}

function requestRender() {
  if (state.raf) return;
  state.raf = requestAnimationFrame(() => { state.raf = 0; render(); });
}

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect(), hr = holder.getBoundingClientRect();
  return { x: (e.clientX - hr.left) * (canvas.width / r.width), y: (e.clientY - hr.top) * (canvas.height / r.height) };
}

function isControl(e) {
  return recenterBtn.contains(e.target) || zoomInBtn.contains(e.target) || zoomOutBtn.contains(e.target);
}

holder.addEventListener('pointerdown', (e) => {
  if (!state.bmp) return;
  if (isControl(e)) return;                 // let the control buttons handle their own clicks
  cancelTweens();
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (state.pointers.size === 1) {
    const fp = canvasPoint(e);
    const f = fieldAtPoint(fp.x, fp.y);
    if (f) {                                // grab a text field, not the photo
      state.dragField = f;
      state.hoverField = f;
      state.fieldDragStart = { x: e.clientX, y: e.clientY, fx: state.pos[f].x, fy: state.pos[f].y };
      holder.setPointerCapture(e.pointerId);
      canvas.classList.add('dragging', 'field-drag');
      updateFieldOverlay();
      e.preventDefault();
      return;
    }
    state.dragging = true;
    state.vel = null;
     holder.setPointerCapture(e.pointerId);
     state.dragStart = { x: e.clientX, y: e.clientY, ox: state.offX, oy: state.offY };
     canvas.classList.add('dragging');
  } else if (state.pointers.size === 2) {
    const pts = [...state.pointers.values()];
    state.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    state.pinchZoom = state.zoom;
  }
});
holder.addEventListener('pointermove', (e) => {
  if (state.bmp) {
    const hp = canvasPoint(e);
    const hf = state.dragField || fieldAtPoint(hp.x, hp.y);
    if (hf !== state.hoverField) { state.hoverField = hf; updateFieldOverlay(); }
    canvas.classList.toggle('field-hover', !state.dragField && !!hf);
    canvas.classList.toggle('field-drag', !!state.dragField);
  }
  if (!state.bmp || !state.pointers.has(e.pointerId)) return;
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (state.dragField) {
    const cssW = canvas.getBoundingClientRect().width || 1;
    const scale = cssW / canvas.width;
    const nx = state.fieldDragStart.fx + (e.clientX - state.fieldDragStart.x) / scale;
    const ny = state.fieldDragStart.fy + (e.clientY - state.fieldDragStart.y) / scale;
    const np = clampFieldPos(state.dragField, nx, ny);
    state.pos[state.dragField].x = np.x;
    state.pos[state.dragField].y = np.y;
    updateFieldOverlay();
    requestRender();
    return;
  }

  if (state.pointers.size >= 2) {
    const pts = [...state.pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (state.pinchDist > 0) {
      const mid = canvasPoint({ clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 });
      applyZoom(state.pinchZoom * (d / state.pinchDist), mid.x, mid.y);
    }
    return;
  }

  if (!state.dragging || !state.dragStart) return;
  const cssW = canvas.getBoundingClientRect().width || 1;
  const scale = cssW / canvas.width;
  const nx = state.dragStart.ox + (e.clientX - state.dragStart.x) / scale;
  const ny = state.dragStart.oy + (e.clientY - state.dragStart.y) / scale;
  const now = performance.now();
  const dt = now - (state.moveT || now);
  state.moveT = now;
  if (dt > 0) {
    state.vel = { x: (nx - state.offX) / dt * 16.67, y: (ny - state.offY) / dt * 16.67 };
  }
  state.offX = nx;
  state.offY = ny;
   clampOffsets();                            // photo can never leave the frame
   requestRender();
});
const endDrag = (e) => {
  state.pointers.delete(e.pointerId);
  if (state.dragField) {
    state.dragField = null;
    state.hoverField = null;
    canvas.classList.remove('field-drag');
    updateFieldOverlay();
    saveLS();
  }
  if (state.dragging) {
    state.dragging = false;
   canvas.classList.remove('dragging');
    startMomentum();                 /* kicks off the glide loop (own rAF) */
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    render();                        /* commit the final dragged position so it's never lost between frames */
  }
  if (state.pointers.size < 2) state.pinchDist = 0;
};
holder.addEventListener('pointerup', endDrag);
holder.addEventListener('pointercancel', endDrag);
holder.addEventListener('pointerleave', (e) => {
  if (state.dragging && !state.pointers.has(e.pointerId)) endDrag(e);
  if (!state.dragField && state.pointers.size === 0) {
    state.hoverField = null;
    canvas.classList.remove('field-hover');
    updateFieldOverlay();
  }
});
holder.addEventListener('wheel', (e) => {
  if (!state.bmp) return;
  e.preventDefault();
  const p = canvasPoint(e);
  instantZoom(state.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED), p.x, p.y);
}, { passive: false });
function canvasCenter() {                // anchor the photo center while zooming (canvas-px space)
  if (!state.crop) return { x: canvas.width / 2, y: canvas.height / 2 };
  return { x: state.crop.rx + state.crop.rw / 2, y: state.crop.ry + state.crop.rh / 2 };
}
recenterBtn.addEventListener('click', (e) => { e.stopPropagation(); resetPan(); });
resetLayoutBtn.addEventListener('click', (e) => { e.stopPropagation(); resetLayout(); });
zoomInBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const p = canvasCenter();
  instantZoom(state.zoom + ZOOM_STEP, p.x, p.y);
});
zoomOutBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const p = canvasCenter();
  instantZoom(state.zoom - ZOOM_STEP, p.x, p.y);
});
  holder.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const p = canvasPoint(e);
  instantZoom(state.zoom >= 2 ? MIN_ZOOM : state.zoom + 1, p.x, p.y);
});

/* --------------------------------- mode ------------------------------------ */
document.querySelectorAll('.mode-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-pressed', b === btn));
    state.mode = btn.dataset.mode;
    fields.hidden = state.mode !== 'card' || !state.bmp;
    if (state.bmp) { preview.hidden = false; actions.hidden = false; }
    shareCap.hidden = true;
    render();
    saveLS();
  }));

nameIn.addEventListener('input', () => { render(); saveLS(); });
stackIn.addEventListener('input', () => { syncChips(); render(); saveLS(); });
titleIn.addEventListener('input', () => { state.title = titleIn.value.toUpperCase(); render(); saveLS(); });
reroll.addEventListener('click', () => {
  state.title = genTitle(stackIn.value);
  titleIn.value = state.title;
  render();
  saveLS();
});

/* ------------------------------ canvas helpers ----------------------------- */
const clamp = (v, a, b) => (isFinite(v) ? Math.min(b, Math.max(a, v)) : a);

function roundRect(c, x, y, w, h, r) {
  if (typeof c.roundRect === 'function') { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function coverDraw(c, bmp, rx, ry, rw, rh, offX, offY, radius, zoom) {
  zoom = (isFinite(zoom) && zoom > 0) ? zoom : 1;
  const s = Math.max(rw / bmp.width, rh / bmp.height) * zoom;
  const dw = bmp.width * s, dh = bmp.height * s;
  const maxX = Math.max(0, (dw - rw) / 2);
  const maxY = Math.max(0, (dh - rh) / 2);
  const ox = clamp(isFinite(offX) ? offX : 0, -maxX, maxX);
  const oy = clamp(isFinite(offY) ? offY : 0, -maxY, maxY);
  c.save();
  roundRect(c, rx, ry, rw, rh, radius || 0);
  c.clip();
  c.drawImage(bmp, rx + (rw - dw) / 2 + ox, ry + (rh - dh) / 2 + oy, dw, dh);
  c.restore();
  return { maxX, maxY, dw, dh };
}

function wrapLines(c, text, font, maxWidth, maxLines, family) {
  let size = font;
  let lines;
  for (;;) {
    c.font = size + 'px ' + (family || F_ANTON);
    lines = [];
    const words = String(text).split(/\s+/);
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && c.measureText(t).width > maxWidth) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines) {
      const tooWide = lines.some((l) => c.measureText(l).width > maxWidth + 1);
      if (!tooWide) break;
    }
    size *= 0.88;
    if (size < 10) break;
  }
  return { lines: lines.slice(0, maxLines), size };
}

function drawSun(c, cx, cy, r, color, holeColor, spikes) {
  spikes = spikes || 12;
  const len = r * 0.55;
  c.save();
  c.translate(cx, cy);
  c.fillStyle = color;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const half = (Math.PI * 2 / spikes) * 0.32;
    const rayLen = (i % 2 === 0) ? len : len * 0.6;   // alternating long/short rays
    c.beginPath();
    c.moveTo(Math.cos(a - half) * r, Math.sin(a - half) * r);
    c.lineTo(Math.cos(a) * (r + rayLen), Math.sin(a) * (r + rayLen));
    c.lineTo(Math.cos(a + half) * r, Math.sin(a + half) * r);
    c.closePath();
    c.fill();
  }
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  if (holeColor) {
    c.fillStyle = holeColor;
    c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.fill();
    c.strokeStyle = color; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

function bgTexture(c, w, h) {
  // retro halftone dots
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 22; x < w; x += 52) {
    for (let y = 22; y < h; y += 52) {
      c.beginPath();
      c.arc(x, y, 2.4, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function checkerBand(c, x, y, w, h, cell, alpha) {
  c.fillStyle = 'rgba(255,230,0,' + (alpha == null ? 0.16 : alpha) + ')';
  for (let cy = y; cy < y + h; cy += cell) {
    for (let cx = x; cx < x + w; cx += cell) {
      if ((((cx - x) / cell) + ((cy - y) / cell)) % 2 === 0) c.fillRect(cx, cy, cell, cell);
    }
  }
}

function dashedLine(c, x1, y1, x2, y2, dash, width) {
  c.setLineDash(dash || [12, 10]);
  c.lineWidth = width || 3;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.setLineDash([]);
}

function drawSparkle(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.fillStyle = YELLOW;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    c.quadraticCurveTo(Math.cos(a) * s, Math.sin(a) * s, Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
    c.quadraticCurveTo(Math.cos(a + Math.PI / 4) * s * 0.32, Math.sin(a + Math.PI / 4) * s * 0.32, Math.cos(a + Math.PI / 2) * s, Math.sin(a + Math.PI / 2) * s);
  }
  c.fill();
  c.restore();
}

/* --------------------------- art helpers / textures ------------------------ */
function radialGlow(c, x, y, r, rgb, alpha) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function vignette(c, w, h, strength) {
  strength = strength || 0.13;
  const R = Math.max(w, h) * 0.8;
  const g = c.createRadialGradient(w / 2, h / 2, R * 0.42, w / 2, h / 2, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function bgSheen(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,255,255,0.045)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.03)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function hashDot(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function bgGrain(c, w, h) {
  c.fillStyle = 'rgba(242,238,223,0.045)';
  for (let y = 4; y < h; y += 7) {
    for (let x = 4; x < w; x += 7) {
      if (x < 30 || y < 30 || x > w - 45 || y > h - 30) continue;
      if (hashDot(x, y) > 0.82) c.fillRect(x, y, 1.7, 1.7);
    }
  }
}

function headlineGrad(c, x0, y0, x1, y1) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#FFEB2E');
  g.addColorStop(0.5, '#FFE600');
  g.addColorStop(1, '#FFC400');
  return g;
}

function diamond(c, x, y, s, color) {
  c.fillStyle = color;
  c.save();
  c.translate(x, y);
  c.rotate(Math.PI / 4);
  c.fillRect(-s, -s, s * 2, s * 2);
  c.restore();
}

function stub(c, x, y, w, h, label, outline, text) {
  c.strokeStyle = outline;
  c.lineWidth = 3;
  c.setLineDash([7, 6]);
  roundRect(c, x, y, w, h, 10);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = text;
  c.font = '19px ' + F_MONO;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, x + w / 2, y + h / 2 + 1);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
}

function fieldLabel(c, text, x, y, ruleTo) {
  c.font = '24px ' + F_MONO;
  c.letterSpacing = '3px';
  c.fillText(text, x, y);
  const w = c.measureText(text).width;
  c.letterSpacing = '0px';
  c.strokeStyle = 'rgba(242,238,223,0.20)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x + w + 18, y);
  c.lineTo(Math.min(ruleTo, x + w + 18 + 320), y);
  c.stroke();
}

function fieldValue(key) {
  if (key === 'name') return (nameIn.value.trim() || 'YOUR NAME').toUpperCase();
  if (key === 'stack') return (stackIn.value.trim() || 'FULL STACK').toUpperCase();
  return state.title || 'VIBE ENGINEER';
}

function drawField(c, key) {
  const d = FIELD_DEF[key];
  const p = state.pos[key];
  c.fillStyle = YELLOW;
  fieldLabel(c, d.label, p.x, p.y - d.labelOfs, SIZES.card.w - 88);
  const text = fieldValue(key);
  c.fillStyle = d.color;
  const f = wrapLines(c, text, d.max, d.width, d.lines, d.family === F_MONO ? F_MONO : undefined);
  c.font = f.size + 'px ' + d.family;
  if (key === 'stack') f.lines.forEach((l, i) => c.fillText(l, p.x, p.y + i * d.lineGap));
  else c.fillText(f.lines[0], p.x, p.y);
  c.letterSpacing = '0px';
}

function fieldBox(key) {
  const d = FIELD_DEF[key];
  const p = state.pos[key];
  ctx.font = '24px ' + F_MONO; ctx.letterSpacing = '3px';
  const lw = ctx.measureText(d.label).width;
  ctx.letterSpacing = '0px';
  ctx.font = d.max + 'px ' + d.family;
  const tw = ctx.measureText(fieldValue(key)).width;
  const w = Math.max(tw, lw) + 60;
  const h = d.labelOfs + 18 + d.max + (key === 'stack' ? d.lineGap : 0);
  return { x: p.x - 24, y: p.y - d.labelOfs - 18, w, h };
}

function fieldAtPoint(x, y) {
  if (state.mode !== 'card') return null;
  for (const k of ['title', 'stack', 'name']) {
    const b = fieldBox(k);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
  }
  return null;
}

function clampFieldPos(key, x, y) {
  const b = fieldBox(key);
  const M = 64;
  return {
    x: clamp(x, M - 24, SIZES.card.w - M - b.w + 24),
    y: clamp(y, M - 18, SIZES.card.h - M - b.h + 18),
  };
}

function updateFieldOverlay() {
  const el = $('#fieldSel');
  const f = state.dragField || state.hoverField;
  if (!el || !f || state.mode !== 'card' || !state.bmp) { if (el) el.hidden = true; return; }
  const b = fieldBox(f);
  const r = canvas.getBoundingClientRect();
  const s = r.width / canvas.width;
  el.hidden = false;
  el.style.left = b.x * s + 'px';
  el.style.top = b.y * s + 'px';
  el.style.width = b.w * s + 'px';
  el.style.height = b.h * s + 'px';
  el.classList.toggle('dragging', state.dragField === f);
  $('#fieldSelTag').textContent = f.toUpperCase();
}

function resetLayout() {
  state.pos = { name: { ...DEFAULT_POS.name }, stack: { ...DEFAULT_POS.stack }, title: { ...DEFAULT_POS.title } };
  state.dragField = null; state.hoverField = null;
  updateFieldOverlay();
  render();
  saveLS();
}

/* --------------------------------- render ---------------------------------- */
function render() {
  if (!state.bmp) return;
  if (state.mode === 'card') drawCard();
  else drawPfp();
  updatePanUI();
  updateFieldOverlay();
}

function drawCard() {
  const W = SIZES.card.w, H = SIZES.card.h;
  canvas.width = W; canvas.height = H;
  const c = ctx;

  /* ----- background ----- */
  c.fillStyle = GREEN; c.fillRect(0, 0, W, H);
  bgTexture(c, W, H);
  bgSheen(c, W, H);
  bgGrain(c, W, H);
  radialGlow(c, W / 2, 300, 360, '255,230,0', 0.10);
  radialGlow(c, 120, H - 80, 260, '255,46,140', 0.06);
  vignette(c, W, H);

  c.strokeStyle = 'rgba(242,238,223,0.4)'; c.lineWidth = 3;
  c.strokeRect(16, 16, W - 32, H - 32);
  checkerBand(c, 32, 32, W - 64, 24, 24, 0.16);

  /* corner ticks */
  c.strokeStyle = YELLOW; c.lineWidth = 5; c.lineCap = 'round';
  const tick = (x, y, dx, dy) => {
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * 14, y); c.moveTo(x, y); c.lineTo(x, y + dy * 14); c.stroke();
  };
  tick(26, 26, 1, 1); tick(W - 26, 26, -1, 1); tick(26, H - 26, 1, -1); tick(W - 26, H - 26, -1, -1);
  c.lineCap = 'butt';

  /* ----- header strip ----- */
  c.fillStyle = CREAM;
  c.font = '22px ' + F_MONO;
  c.textBaseline = 'alphabetic';
  c.letterSpacing = '3px';
  c.fillText('HACKER HOUSE PRESENTS · BUILDER PASS', 88, 112);
  c.textAlign = 'right';
  c.fillText('HH // GOA · 2026', W - 88, 112);
  c.textAlign = 'left';
  c.letterSpacing = '0px';
  diamond(c, 870, 112, 4, YELLOW);
  diamond(c, 930, 112, 6, PINK);
  diamond(c, 990, 112, 4, YELLOW);

  /* ----- headline: HACKER HOUSE + pink गोवा stamped below it ----- */
  const hx = W / 2;
  c.textAlign = 'center';
  c.font = '204px ' + F_ANTON;
  c.letterSpacing = '3px';
  c.fillStyle = headlineGrad(c, 0, 150, 0, 340);
  c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowOffsetY = 7; c.shadowBlur = 12;
  c.fillText('HACKER HOUSE', hx, 322);
  c.shadowBlur = 0; c.shadowOffsetY = 0;
  c.letterSpacing = '0px';

  c.font = '800 150px ' + F_MUKTA;
  c.textBaseline = 'alphabetic';
  c.save();
  c.translate(hx, 0);
  c.rotate(-0.03);
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillText('गोवा', 7, 456);
  c.strokeStyle = CREAM; c.lineWidth = 9;
  c.strokeText('गोवा', 0, 448);
  c.fillStyle = PINK;
  c.fillText('गोवा', 0, 448);
  c.restore();
  c.textAlign = 'left';

  /* ----- dashed divider + sparkle ----- */
  c.strokeStyle = 'rgba(255,46,140,0.55)';
  dashedLine(c, 88, 484, W - 88, 484, [14, 10], 3);
  drawSparkle(c, W / 2, 484, 16);
  c.strokeStyle = 'rgba(242,238,223,0.18)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(W / 2 - 40, 484); c.lineTo(W / 2 + 40, 484); c.stroke();

  /* ----- polaroid photo block ----- */
  const fx = 90, fy = 512, fsize = 410;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(fx + 12, fy + 14, fsize, fsize);
  c.fillStyle = 'rgba(0,0,0,0.14)';
  c.fillRect(fx + 17, fy + 20, fsize, fsize);
  c.fillStyle = YELLOW;
  roundRect(c, fx, fy, fsize, fsize, 14); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 4;
  roundRect(c, fx + 3, fy + 3, fsize - 6, fsize - 6, 12); c.stroke();

  const rect = { x: fx + 22, y: fy + 22, w: fsize - 44, h: 306, rx: fx + 22, ry: fy + 22, rw: fsize - 44, rh: 306 };
  if (state.bmp) {
    state.crop = rect;
    c.fillStyle = CREAM;
    roundRect(c, rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10, 10); c.fill();
    const lim = coverDraw(c, state.bmp, rect.x, rect.y, rect.w, rect.h, state.offX, state.offY, 8, state.zoom);
    state.maxX = lim.maxX; state.maxY = lim.maxY;
    c.strokeStyle = 'rgba(10,46,35,0.5)'; c.lineWidth = 3;
    roundRect(c, rect.x, rect.y, rect.w, rect.h, 8); c.stroke();
  }
  /* polaroid caption tab */
  c.fillStyle = CREAM;
  roundRect(c, rect.x, fy + fsize - 72, rect.w, 72, 0); c.fill();
  c.fillStyle = GREEN_D;
  c.font = '24px ' + F_MONO; c.letterSpacing = '3px'; c.textBaseline = 'alphabetic';
  c.fillText('GOA · 26 · SNAP', rect.x + 26, fy + fsize - 26);
  c.letterSpacing = '0px';
  drawSun(c, rect.x + rect.w - 34, fy + fsize - 30, 15, YELLOW, GREEN_D, 10);
  drawSparkle(c, rect.x + rect.w - 16, fy + 14, 10);
  c.fillStyle = YELLOW;
  c.beginPath(); c.arc(rect.x + 18, fy + fsize - 54, 3.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(rect.x + rect.w - 18, fy + fsize - 54, 3.5, 0, Math.PI * 2); c.fill();

  /* ----- ticket perforation edge + info column ----- */
  const perX = 612;
  c.strokeStyle = 'rgba(255,230,0,0.65)';
  dashedLine(c, perX, 512, perX, 880, [8, 10], 3);
  c.fillStyle = CREAM;
  c.beginPath(); c.arc(perX, 512, 9, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(perX, 880, 9, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 3; c.setLineDash([2, 6]);
  c.beginPath(); c.arc(perX, 696, 16, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);

  const ix = 646, colR = W - 88;

  /* ----- pass details panel ----- */
  const pTop = 520, pBot = 912;
  c.save();
  c.fillStyle = 'rgba(19,71,55,0.55)';
  roundRect(c, ix - 8, pTop, colR - ix + 16, pBot - pTop, 14); c.fill();
  c.strokeStyle = 'rgba(242,238,223,0.26)'; c.lineWidth = 2;
  roundRect(c, ix - 8, pTop, colR - ix + 16, pBot - pTop, 14); c.stroke();
  c.strokeStyle = 'rgba(242,238,223,0.12)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(ix - 2, pTop + 2); c.lineTo(colR + 2, pTop + 2); c.stroke();
  c.strokeStyle = YELLOW; c.lineWidth = 3; c.lineCap = 'round';
  [[ix - 8, pTop], [colR + 8, pTop], [ix - 8, pBot], [colR + 8, pBot]].forEach(([x, y]) => {
    const dx = x <= ix ? 1 : -1, dy = y <= pTop ? 1 : -1;
    c.beginPath(); c.moveTo(x, y + dy * 16); c.lineTo(x, y); c.lineTo(x + dx * 16, y); c.stroke();
  });
  c.restore();

  /* ----- fields ----- */
  drawField(c, 'name');
  drawField(c, 'stack');
  drawField(c, 'title');
  c.letterSpacing = '0px';

  /* CTA buttons */
  const by = 848;
  c.fillStyle = headlineGrad(c, 0, by, 0, by + 54);
  roundRect(c, ix, by, 216, 54, 12); c.fill();
  c.strokeStyle = PINK; c.lineWidth = 4;
  roundRect(c, ix, by, 216, 54, 12); c.stroke();
  c.fillStyle = GREEN_D; c.font = '28px ' + F_ANTON; c.textAlign = 'center';
  c.fillText('APPLY →', ix + 108, by + 36);
  c.strokeStyle = CREAM; c.lineWidth = 3;
  roundRect(c, ix + 236, by, 236, 54, 12); c.stroke();
  c.fillStyle = YELLOW;
  c.beginPath(); c.arc(ix + 236 + 22, by + 27, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = CREAM;
  c.fillText('CHECK THE HYPE', ix + 354, by + 36);
  c.textAlign = 'left';

  /* ----- footer ----- */
  c.fillStyle = CREAM;
  c.font = '28px ' + F_MONO; c.letterSpacing = '1px';
  c.textAlign = 'left';
  c.fillText('GOA · INDIA', 88, 944);
  c.textAlign = 'center';
  c.font = '20px ' + F_MONO; c.letterSpacing = '6px';
  c.fillText('#FRAMEINGOA', W / 2, 968);
  c.letterSpacing = '0px';
  c.textAlign = 'left';
  diamond(c, 56, 944, 4, YELLOW);
  diamond(c, W - 56, 944, 4, PINK);
}

function drawPfp() {
  const S = 1080;
  canvas.width = S; canvas.height = S;
  const c = ctx;
  const cx = S / 2;

  /* ----- background ----- */
  c.fillStyle = GREEN; c.fillRect(0, 0, S, S);
  bgTexture(c, S, S);
  bgSheen(c, S, S);
  bgGrain(c, S, S);
  radialGlow(c, cx, 280, 340, '255,230,0', 0.09);
  radialGlow(c, 90, S - 90, 220, '255,46,140', 0.05);
  vignette(c, S, S);

  checkerBand(c, 40, 40, S - 80, 20, 20, 0.14);

  /* ----- frame: hairline + clean corner ticks ----- */
  c.strokeStyle = 'rgba(242,238,223,0.30)'; c.lineWidth = 3;
  c.strokeRect(38, 38, S - 76, S - 76);
  c.strokeStyle = 'rgba(242,238,223,0.12)'; c.lineWidth = 1.5;
  c.strokeRect(50, 50, S - 100, S - 100);
  c.strokeStyle = YELLOW; c.lineWidth = 7; c.lineCap = 'round';
  const tick = (x, y, dx, dy) => {
    c.beginPath();
    c.moveTo(x + dx * 54, y); c.lineTo(x + dx * 16, y);
    c.lineTo(x, y + dy * 16); c.lineTo(x, y + dy * 54);
    c.stroke();
  };
  tick(62, 62, 1, 1); tick(S - 62, 62, -1, 1);
  tick(62, S - 62, 1, -1); tick(S - 62, S - 62, -1, -1);
  c.lineCap = 'butt';

  diamond(c, 120, 164, 4, YELLOW);
  diamond(c, S - 120, 164, 4, YELLOW);

  /* ----- headline ----- */
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = '86px ' + F_ANTON; c.letterSpacing = '2px';
  c.fillStyle = headlineGrad(c, 0, 90, 0, 180);
  c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowOffsetY = 5; c.shadowBlur = 10;
  c.fillText('HACKER HOUSE', cx, 166);
  c.shadowBlur = 0; c.shadowOffsetY = 0;
  c.letterSpacing = '0px';

  c.font = '800 74px ' + F_MUKTA;
  c.save();
  c.translate(cx, 0); c.rotate(-0.028);
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillText('गोवा', 6, 252);
  c.strokeStyle = CREAM; c.lineWidth = 7;
  c.strokeText('गोवा', 0, 244);
  c.fillStyle = PINK;
  c.fillText('गोवा', 0, 244);
  c.restore();

  c.fillStyle = CREAM;
  c.font = '20px ' + F_MONO; c.letterSpacing = '5px';
  c.fillText('FRAME // HH GOA', cx, 292);
  c.letterSpacing = '0px';
  diamond(c, cx - 168, 284, 4, PINK);
  diamond(c, cx + 168, 284, 4, PINK);

  /* photo: clean matted frame */
  const fx = 165, fy = 315, fs = 720;
  c.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(c, fx + 12, fy + 16, fs, fs, 26); c.fill();
  c.fillStyle = YELLOW;
  roundRect(c, fx, fy, fs, fs, 26); c.fill();
  c.fillStyle = GREEN_L;
  roundRect(c, fx + 12, fy + 12, fs - 24, fs - 24, 20); c.fill();
  if (state.bmp) {
    const rect = { x: fx + 28, y: fy + 28, w: fs - 56, h: fs - 56, rx: fx + 28, ry: fy + 28, rw: fs - 56, rh: fs - 56 };
    state.crop = rect;
    const lim = coverDraw(c, state.bmp, rect.x, rect.y, rect.w, rect.h, state.offX, state.offY, 18, state.zoom);
    state.maxX = lim.maxX; state.maxY = lim.maxY;
    c.strokeStyle = 'rgba(10,46,35,0.45)'; c.lineWidth = 4;
    roundRect(c, rect.x, rect.y, rect.w, rect.h, 18); c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3;
  roundRect(c, fx + 6, fy + 6, fs - 12, fs - 12, 24); c.stroke();

  /* bottom */
  radialGlow(c, cx, 970, 90, '255,230,0', 0.13);
  c.fillStyle = CREAM;
  c.font = '22px ' + F_MONO; c.letterSpacing = '6px';
  c.fillText('— FRAME IN GOA —', cx, 982);
  c.letterSpacing = '0px';
  diamond(c, cx - 220, 974, 5, YELLOW);
  diamond(c, cx + 220, 974, 5, YELLOW);
  c.fillStyle = 'rgba(242,238,223,0.55)';
  c.font = '18px ' + F_MONO; c.letterSpacing = '4px';
  c.fillText('GOA · INDIA · EST 2026 · HH', cx, 1038);
  c.letterSpacing = '0px';
  drawSparkle(c, 248, 972, 11);
  drawSparkle(c, 832, 968, 9);
  c.textAlign = 'left';
}

/* --------------------------------- actions --------------------------------- */
function canvasToBlob() {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
}

dlBtn.addEventListener('click', async () => {
  dlBtn.disabled = true;
  try {
    const blob = await canvasToBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = SIZES[state.mode].name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } finally {
    dlBtn.disabled = false;
  }
});

/* ------------------------------ native share ------------------------------- */
if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] })) {
  shareNativeBtn.hidden = false;
}
shareNativeBtn.addEventListener('click', async () => {
  shareNativeBtn.disabled = true;
  try {
    const blob = await canvasToBlob();
    const file = new File([blob], SIZES[state.mode].name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText() });
    } else {
      shareCap.hidden = false;
      shareCap.innerHTML = 'your browser can\u2019t attach images here — use Download instead.';
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') console.error(e);
  } finally {
    shareNativeBtn.disabled = false;
  }
});

function shareText() {
  const name = nameIn.value.trim();
  const card = state.mode === 'card';
  const first = card
    ? 'Just minted my HH Goa 2026 builder ID' + (name ? ' for ' + name : '') + '. See you on the beach, hackers \uD83C\uDFD6\uFE0F'
    : 'New X pfp loading — HH Goa 2026 \uD83C\uDFD6\uFE0F';
  return first + '\n\n#FrameInGoa #HackerHouse #Goa2026';
}

shareBtn.addEventListener('click', async () => {
  shareBtn.disabled = true;
  shareCap.hidden = false;
  shareCap.innerHTML = 'preparing your graphic…';
  try {
    const blob = await canvasToBlob();
    const meta = {
      name: nameIn.value.trim() || '',
      title: state.title || '',
      mode: state.mode,
    };
    const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
    let link = '';
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      const r = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, meta }),
      });
      if (r.ok) {
        const j = await r.json();
        link = new URL(j.url, location.origin).href;
      } else {
        console.warn('image upload failed', r.status);
      }
    } catch (e) {
      console.warn('image upload failed', e);
    }

    const text = shareText() + (link ? '\n\n' + link : '');
    const file = new File([blob], 'hh-goa-2026.png', { type: 'image/png' });

    /* 1) attach the actual image when the platform supports file sharing (X picks it up) */
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        shareCap.innerHTML = 'share sheet opened — your image and caption are ready to post.';
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') { shareCap.innerHTML = 'share cancelled — nothing was posted.'; return; }
        /* share sheet unusable — fall back to the X composer */
      }
    }

    /* 2) desktop: copy the image to the clipboard, then open the X composer with caption + link */
    let copied = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
        copied = true;
      }
    } catch (e) { /* clipboard unavailable/blocked */ }

    const intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    window.open(intent, '_blank', 'noopener');
    if (copied) {
      shareCap.innerHTML = 'X is opening — press <b>Ctrl/⌘+V</b> in the post box to paste your image. Caption and link are already filled in.'
        + (isLocal ? ' (X can\u2019t show the link card while on localhost.)' : '');
    } else {
      shareCap.innerHTML = isLocal
        ? 'X can\u2019t preview localhost links — the card appears once this is deployed. Your link is in the tweet text: <b>' + link + '</b>'
        : (link
            ? 'opening X… your unique link is attached (<b>' + link.replace(/^https?:\/\//, '') + '</b>) — the image card shows on the posted tweet.'
            : 'could not host the image — sharing with caption only. <b>#FrameInGoa</b>');
    }
  } catch (e) {
    console.error(e);
    shareCap.innerHTML = 'something went wrong — try downloading instead.';
  } finally {
    shareBtn.disabled = false;
  }
});
