#!/usr/bin/env python3
"""Turns the raw art/music dropped in the project root into what the extension loads.

  pet sheets (3x2 grid, white bg)  ->  extension/assets/pets/<id>/<pose>.png   (transparent, aligned)
  background PNGs                  ->  extension/assets/backgrounds/<theme>.webp
  mp3s                             ->  extension/assets/music/<slug>.mp3        (re-encoded, smaller)

Re-run any time:  python3 tools/prepare_assets.py
Needs: Pillow, numpy, scipy, ffmpeg.
"""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "extension" / "assets"

# Sheet layout: row 1 = idle, talking, happy; row 2 = sleepy, curious, concerned
POSES = ["idle", "talking", "happy", "sleepy", "curious", "concerned"]
PET_SHEETS = {  # pet id -> sheet filename (in project root)
    "pup": "puppy_idle_talking_happy_sleepy_curious_concerned.png.png",
    "cat": "cat_idle_talking_happy_sleepy_curious_concerned.png",
    "bunny": "bunny_idle_talking_happy_sleepy_curious_concerned..png",
}
BACKGROUNDS = {  # theme id -> file
    "cozy": "cozy_room.png",
    "night": "rainy_night.png",
    "sage": "pastel_forest.png",
}
MUSIC = {  # output slug -> source file
    "focus-flow": "Focus Flow.mp3",
    "forest-chill": "Forest Chill.mp3",
    "quiet-canopy": "Quiet Canopy.mp3",
    "quiet-pause": "Quiet Pause.mp3",
}
PET_PX = 560        # final size of each pose (square); the landing poster shows the dog large
WHITE = 238         # a pixel is "background white" when all channels are >= this
PET_WHITE = {"pup": 205}  # golden fur is far from white, so cut deeper: removes the sheet's grey ground shadow


def cut_sprite(cell: Image.Image, white: int = WHITE):
    """White bg -> real transparency. Only white connected to the cell border is removed, so white
    fur / paws inside the outline stay. Edge pixels are blends of fur and white, so instead of a hard
    cut we solve  pixel = a*fur + (1-a)*white  for the alpha and repaint them with the solid fur colour:
    no light fringe on dark backgrounds. Returns (RGBA array, bbox)."""
    rgb = np.asarray(cell.convert("RGB")).astype(np.float32)
    near_white = rgb.min(axis=2) >= white
    labels, _ = ndi.label(near_white)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, border[border > 0])
    fg = ~bg

    # keep only the biggest blob (drops specks and stray shadow bits), fill pin-holes
    lab, n = ndi.label(fg)
    if n > 1:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = lab == (1 + int(np.argmax(sizes)))
    fg = ndi.binary_fill_holes(fg)

    core = ndi.binary_erosion(fg, iterations=3)                       # solid interior
    _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
    fur = rgb[iy, ix]                                                 # nearest solid colour, everywhere
    # ...but smoothed, so a bright highlight strand can't tint the whole fringe around it
    cf = core.astype(np.float32)
    num = ndi.gaussian_filter(rgb * cf[..., None], (4, 4, 0))
    dn = ndi.gaussian_filter(cf, 4)
    smooth = num / np.maximum(dn[..., None], 1e-3)
    fur = np.where((dn > 0.02)[..., None], smooth, fur)

    den = 255.0 - fur                                                 # how far each channel is from white
    ch = den.argmax(axis=2)[..., None]
    dmax = np.take_along_axis(den, ch, 2)[..., 0]
    val = np.take_along_axis(rgb, ch, 2)[..., 0]
    a_col = np.clip((255.0 - val) / np.maximum(dmax, 1.0), 0, 1)      # colour-derived alpha
    a_geo = np.clip((ndi.gaussian_filter(fg.astype(np.float32), 0.9) - 0.15) / 0.7, 0, 1)  # geometric fallback (white fur)

    ring = fg & ~core
    alpha = np.where(core, 1.0, np.where(ring & (dmax > 60), np.maximum(a_col, a_geo * 0.35), a_geo))
    alpha[~ndi.binary_dilation(fg, iterations=2)] = 0
    alpha = np.clip(ndi.gaussian_filter(alpha, 0.5), 0, 1)
    out_rgb = np.where(core[..., None], rgb, fur * 0.93)              # edge pixels take the pure fur colour, a touch deeper (reads as fur on dark)

    # light specks on the very edge (leftover white halo) are brighter than the fur beside them: drop them
    lum = lambda x: x @ np.array([0.299, 0.587, 0.114], np.float32)
    ring2 = fg & ~ndi.binary_erosion(fg, iterations=4)
    speck = ring2 & ((lum(rgb) - lum(fur)) > 26)
    alpha = np.where(speck, alpha * 0.1, alpha)
    alpha = ndi.median_filter(alpha, size=3) * 0.5 + alpha * 0.5

    # 1px tighter matte: removes the last light fringe dots along the fur
    alpha = np.clip(ndi.gaussian_filter(ndi.grey_erosion(alpha, size=(3, 3)), 0.6), 0, 1)

    # the sheet's grey ground shadow leaves a pale wedge under the paws. Grey-on-white is really
    # black-at-some-opacity, so convert it into a proper soft contact shadow.
    ys0, xs0 = np.where(alpha > 0.05)
    band = np.zeros_like(alpha, bool); band[int(ys0.max() - 0.11 * (ys0.max() - ys0.min())):] = True
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    pale = band & (mn > 175) & ((mx - mn) < 22) & ~ndi.binary_erosion(fg, iterations=7)
    sh = np.clip((1 - mn / 255.0) * 2.4, 0, 0.55)
    out_rgb = np.where(pale[..., None], 0.0, out_rgb)
    alpha = np.where(pale, np.minimum(alpha, sh), alpha)

    ys, xs = np.where(alpha > 0.05)
    bbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    out = np.dstack([out_rgb, alpha * 255]).astype(np.uint8)
    return out, bbox


def do_pets():
    for pet, fname in PET_SHEETS.items():
        src = ROOT / fname
        if not src.exists():
            print(f"  skip {pet}: {fname} not found")
            continue
        sheet = Image.open(src)
        cw, ch = sheet.width // 3, sheet.height // 2
        sprites = []
        for i, pose in enumerate(POSES):
            r, c = divmod(i, 3)
            arr, bb = cut_sprite(sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), PET_WHITE.get(pet, WHITE))
            sprites.append((pose, Image.fromarray(arr).crop(bb)))
        pad = 14
        side = max(max(s.width, s.height) for _, s in sprites) + 2 * pad
        d = OUT / "pets" / pet
        d.mkdir(parents=True, exist_ok=True)
        for pose, spr in sprites:
            canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            # centred horizontally, standing on a shared baseline so poses don't jump
            canvas.alpha_composite(spr, ((side - spr.width) // 2, side - spr.height))  # feet touch the bottom edge
            canvas.resize((PET_PX, PET_PX), Image.LANCZOS).save(d / f"{pose}.png", optimize=True)
        print(f"  {pet}: 6 poses ({side}px source canvas)")


def do_backgrounds():
    d = OUT / "backgrounds"
    d.mkdir(parents=True, exist_ok=True)
    for theme, fname in BACKGROUNDS.items():
        src = ROOT / fname
        if not src.exists():
            print(f"  skip {theme}: {fname} not found")
            continue
        im = Image.open(src).convert("RGB")
        im = im.resize((1600, round(1600 * im.height / im.width)), Image.LANCZOS)
        im.save(d / f"{theme}.webp", quality=78, method=6)
        print(f"  {theme}.webp  {(d / f'{theme}.webp').stat().st_size // 1024} KB")


def do_music():
    d = OUT / "music"
    d.mkdir(parents=True, exist_ok=True)
    for slug, fname in MUSIC.items():
        src = ROOT / fname
        if not src.exists():
            print(f"  skip {slug}: {fname} not found")
            continue
        dst = d / f"{slug}.mp3"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-map_metadata", "-1",
                        "-codec:a", "libmp3lame", "-b:a", "112k", "-ac", "2", str(dst)], check=True)
        print(f"  {slug}.mp3  {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    import sys
    steps = {"pets": do_pets, "backgrounds": do_backgrounds, "music": do_music}
    for name in (sys.argv[1:] or steps):   # e.g.  python3 tools/prepare_assets.py pets
        print(name.capitalize())
        steps[name]()
