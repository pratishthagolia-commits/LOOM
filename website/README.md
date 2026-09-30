# Loom website (landing + install + dashboard)

Plain static files, no build step and no dependencies.

- `index.html` landing page, features, install guide, download button
- `dashboard.html` stats, adaptation insights, notes, advanced settings
- `pricing.html` + `css/pricing.css` + `js/pricing.js` the dark pricing page (plans, compare table, dial, FAQ). Colours/radii are CSS variables at the top of `pricing.css`; prices and copy live in `pricing.html`
- `js/hero.js` the landing hero (spring-physics colour layers, no dependencies); `css/landing.css` its styles
- `fonts/` self-hosted Bagel Fat One (wordmark) + Inter Tight (all body/grey text)
- `loom-extension.zip` generated, **rebuild after every extension change**

## Every time you change the extension or drop in new art
```bash
website/build.sh      # re-zips ../extension and copies pet/background art into website/assets
```

## Preview locally
```bash
cd website && python3 -m http.server 8000     # http://localhost:8000
```
`localhost` is always trusted by the extension, so the dashboard connects with no setup.

## Deploy (pick one)
- **Vercel:** `cd website && npx vercel --prod`
- **Netlify:** drag the `website/` folder onto app.netlify.com/drop
- **GitHub Pages:** push the repo, Settings → Pages → deploy from a branch, folder `/website`
  (if Pages can't serve `/website`, copy its contents to `/docs`)

All links are relative, so it works under any sub-path.

## Connecting the dashboard to the extension (once per deployed address)
1. Open the deployed dashboard. It shows the exact address to allow (e.g. `https://focusflow.vercel.app`).
2. Extension side panel → Settings → Advanced → **Dashboard website address** → paste it.
3. Reload the dashboard. It says "Connected to your extension".

Until then it shows **demo data**, so judges always see a full dashboard. "Import export file" also works
(extension → Settings → Advanced → Export my data).

## How it talks to the extension
The extension's content script only answers pages that have `<meta name="focusflow-site">` **and**
whose origin is `localhost` or the address saved in the extension. It exposes stats, notes and a
whitelist of settings. It never exposes page content, the AI URL, or the session text.
