# Loom extension

## Load it
1. Chrome → `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this `extension/` folder
3. Pin the Loom icon; click it to open the side panel
4. Reload any tab that was open before installing (so the pet appears there)

## Try it (2-minute smoke test)
- Open any article or Moodle page → panel → **Break this page into steps** → **Start Focus Mode**
- **Next →** → pick a feedback face → steps adapt
- Settings → **Try a nudge now** (close the side panel to see the pet on the page)
- Settings → set "Break reminder after 1 min (demo)" to see the break screen
- Notes → add a note due in ~2 min → notification + pet heads-up
- ▶ at the bottom (rain works with no files) → 🔊 Read aloud → music lowers to 50%

## Layout
- `background.js` alarms, nudge engine, context menu
- `content.js` page text extraction + pet overlay
- `sidepanel/` the UI (app.js is the brain, music.js, tts.js)
- `shared/` config, storage, offline steps (`fallback.js`), AI client (`ai.js`), pet, nudges
- `assets/README.md` what art/music/clips to drop in
- `../docs/CONTRACT.md` API contract for the AI service

## Files
Drop, paste or choose a **PDF, Word (.docx) or .txt** file in the panel (Focus tab, "Paste text or a file"). Everything is read
locally in the panel; nothing is uploaded. PDFs open in a browser tab work too ("Break this page into steps").
`vendor/` holds pdf.js 3.11.174 (Apache-2.0) for PDF reading. Scanned PDFs (images only) can't be read yet.
