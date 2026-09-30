# Assets

Raw art/music go in the **project root**, then run:

    python3 tools/prepare_assets.py

It fills this folder (transparent pet poses, webp backgrounds, re-encoded mp3s).
Filenames it expects are listed at the top of `tools/prepare_assets.py`.

Everything is optional. Missing files fall back gracefully (emoji pets, gradient backgrounds,
generated rain / brown noise, breathing animation instead of a break clip).

| Folder | What | Where it is wired |
|---|---|---|
| `pets/<id>/<pose>.png` | idle, talking, happy, sleepy, curious, concerned | `PETS` in `shared/config.js` |
| `backgrounds/<theme>.webp` | cozy, night, sage | `THEMES` in `shared/config.js` |
| `music/<slug>.mp3` | background tracks | `TRACKS` in `shared/config.js` |
| `breaks/break1..3.mp4` | 10-20 s calm clips (optional) | `BREAKS` in `shared/config.js` |
| `icons/icon{16,32,48,128}.png` | extension icon (placeholder) | `manifest.json` |

Add a pet: put a 3x2 sheet in the root, add it to `PET_SHEETS` in the script, add a row to `PETS`
in `shared/config.js` and in `website/js/common.js`.

Music credits: tracks are tagged "obstinateflamenco485". Check the licence/terms of wherever
they were generated before publishing beyond the hackathon.
