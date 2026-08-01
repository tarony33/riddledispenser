# The Enigma — Riddle Dispenser (deployable site)

A single-page React site (Vite). The riddle machine, the 100-riddle library,
the render mode for clip generation, and AdSense-ready ad slots are all wired.

## Run locally
```
npm install
npm run dev
```
Open the URL it prints. `npm run build` outputs a static site to `dist/`.

## Deploy (Vercel — easiest)
1. Push this folder to a GitHub repo.
2. In Vercel: New Project → import the repo. Framework preset: **Vite**.
   Build command `npm run build`, output dir `dist`. Deploy.
3. (Netlify is identical: build `npm run build`, publish `dist`.)
4. Point your domain at the project in the host's Domains settings.

## Ad slots (Google AdSense)
Slots are already the standard IAB sizes (728×90, 300×250) and show house
placeholders until you add your details in `src/config.js`:
```
export const ADSENSE_CLIENT = "ca-pub-XXXXXXXXXXXXXXXX";
export const AD_SLOTS = { leaderboard: "1234567890", rectangle: "0987654321" };
```
AdSense needs a live site with some real traffic before it approves you — so
deploy first, run the shorts to build visits, then apply. Until then the
placeholders keep the layout intact.

## Assets
`/public/machine.mp4`, `/public/poster.jpg`, `/public/fairground.jpg` are the
hosted files the page points at (same-origin, so the video plays cleanly).
Swap `machine.mp4` for a higher-res baked clip anytime — keep the same filename.

## Render mode (for the clip factory)
`/?render=1&r=<url-encoded riddle>&a=<url-encoded answer>&t=30&hook=1`
- hides all chrome, goes full-bleed 9:16, auto-runs hook → riddle → countdown → answer
- sets `window.__renderComplete = true` when done (and `window.__renderDuration`)
- your headless recorder (Playwright/Remotion in n8n) waits on that flag, records the MP4.

## Riddles
`src/riddles.json` — 100 riddles (35 easy / 35 medium / 30 hard). The live site
serves them at random; the clip factory can read the same file to pick the next one.
