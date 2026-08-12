# HH Goa 2026 — Frame / ID Card Generator

A one-pass web tool for the **Hacker House Goa 2026** shortlisting task. Upload a photo,
get an instantly-rendered branded graphic (Builder ID Card **or** PFP Frame), download it,
and share to X with a pre-filled caption + **#FrameInGoa**.

![Stack](https://img.shields.io/badge/stack-Node%20%2B%20Express%20%2B%20Vanilla%20JS%20Canvas-blue) ![Status](https://img.shields.io/badge/status-READY-green)

## What it does

- **Format B — Builder ID Card** (default): landscape badge with your photo, name, stack/role and an
  auto-generated **builder title** (reroll it with the ↻ button). Green background, yellow `HACKER HOUSE`,
  pink Devanagari **गोवा** stamped over it, yellow retro sun, dates/location, `APPLY` / `CHECK HYPE` buttons.
- **Format A — PFP Frame**: 1080×1080 X-profile-picture frame that wraps your photo in the same branding.
- **Upload**: JPG, PNG and **HEIC from iPhone** (auto-converted in-browser via `heic2any`).
- **Handles real photos**: portrait/landscape/off-center, any aspect ratio — cover-crop, **drag-to-pan**,
  **pinch / button / double-tap zoom** (1×–4×), and a **⟲ recenter** — all clamped so the photo can never
  leave the frame. No crop step required.
- **Instant**: everything renders client-side on `<canvas>` (rAF-throttled for smooth dragging) — the
  result appears the moment the photo decodes.
- **Download**: real PNG file (`hh-goa-2026-builder-id.png` / `hh-goa-2026-pfp-frame.png`).
- **Share to X**: uploads the PNG to the server, gets a hosted URL, and opens
  `https://twitter.com/intent/tweet` with a pre-filled caption + `#FrameInGoa` + the link. The link's
  OG/Twitter card (`/i/:id`) serves the **actual graphic** as `summary_large_image` — the preview shows
  the generated image, not a blank thumbnail. On localhost it shares caption-only and tells you to deploy.
- **Native share**: on phones (and desktop Chrome) a **SHARE IMAGE** button attaches the PNG via the
  Web Share API so you can post it straight to X/IG/WhatsApp from the share sheet.
- **Fast input**: one-tap stack chips (Backend · AI · Design · …) and your name/stack/title/mode are
  remembered between visits (localStorage).
- No login, no signup. Mobile-first UI.

## Run it

```bash
npm install
npm start          # → http://localhost:3001
```

Requires Node 18+.

## How the share link works

1. `POST /api/image` `{ dataUrl, meta }` → stores the PNG (and a JSON sidecar with name/title) in `data/images/`,
   returns `{ url: "/i/<id>" }`.
2. `GET /i/<id>` renders a tiny HTML page with `og:image` / `twitter:card=summary_large_image` pointing at the
   stored PNG — this is what X's link preview crawls.
3. `GET /i/<id>.png` serves the raw image (immutable cache). The page also shows the image with a
   "MAKE YOUR OWN →" link back to the generator.

## Deploy (for the live link)

Any host that supports a long-running Node process + filesystem works:

- **Railway / Render / Fly.io / a VPS**: `npm start` with `PORT` env. Set the public URL in your platform settings.
- **Not Vercel Functions / serverless** (no persistent disk, and `/i/:id` pages need a runtime).

## Development / tests

The repo ships four throwaway browser-test scripts (use the local Chrome via `puppeteer-core`):

- `node test-visual.js` — renders the card + PFP and screenshots them to `/tmp`.
- `node verify.js` — pixel-asserts the branding (green bg, yellow headline, pink गोवा, sun, photo, no overflow).
- `node test-flows.js` — exercises landscape cover-crop, pan, download blob, and the share intent URL (including the localhost vs deployed behavior).
- `node test-pan.js` — asserts pan + zoom correctness: clamped offsets so the photo never leaves the frame, zoom-in creating pan room, pinch surface, double-tap zoom, and ⟲ recenter.

`Procfile` is included for Heroku/Railway-style deploys (`web: npm start`) and `/api/health` for uptime checks.

## Brand tokens

| Token | Hex | Use |
| --- | --- | --- |
| Forest Green | `#0E3B2E` | full background |
| Bright Yellow | `#FFE600` | `HACKER HOUSE`, `APPLY`, sun |
| Vibrant Pink | `#FF2E8C` | Devanagari **गोवा**, builder title |
| Off-White | `#F2EEDF` | dates, location, `CHECK HYPE`, micro-copy |
