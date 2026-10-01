#!/usr/bin/env python3
"""
Static Archivo instances for the poster engine (PLAN.md section 4.1).

Satori takes TTF, OTF or WOFF (not WOFF2) and doesn't interpolate variable
font axes, so the posters use fixed cuts of Archivo, made here with
fonttools' instancer and subset to Latin. The output is committed in
src/assets/fonts/poster/, so this only needs re-running to change the set.

    python3 scripts/make-poster-fonts.py

Needs fonttools (pip install fonttools). The source is Google's variable
Archivo, pinned to a commit and checked by SHA-256.
"""
import hashlib
import shutil
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

COMMIT = "6c70c829f09ea345d3590406693220ea35c6553f"
BASE = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/archivo"
SOURCE = {"name": "Archivo[wdth,wght].ttf", "url": f"{BASE}/Archivo%5Bwdth%2Cwght%5D.ttf",
          "sha256": "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053"}

CACHE = Path(".cache/fonts")
OUT = Path("src/assets/fonts/poster")

# Display weight at six widths: the fit-to-width ladder. Long venue names
# step down to narrower cuts so every poster fills its frame.
WIDTHS = [62, 75, 87.5, 100, 112.5, 125]
INSTANCES = {f"display-{str(w).replace('.', '')}": {"wght": 900, "wdth": w} for w in WIDTHS}
INSTANCES.update({
    "label": {"wght": 800, "wdth": 75},  # small caps lines: billing, act, URL
    "text": {"wght": 600, "wdth": 100},  # time and town
})

# Latin, as in the site's self-hosted subset, plus the typographic quotes and dashes venue names use.
UNICODES = [*range(0x20, 0x7F), *range(0xA0, 0x100), 0x131, 0x152, 0x153, 0x2C6, 0x2DA, 0x2DC,
            *range(0x2010, 0x2028), 0x2030, 0x2039, 0x203A, 0x20AC, 0x2122]


def source() -> Path:
    path = CACHE / SOURCE["name"]
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {SOURCE['url']}")
        urllib.request.urlretrieve(SOURCE["url"], path)
        urllib.request.urlretrieve(f"{BASE}/OFL.txt", CACHE / "OFL.txt")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SOURCE["sha256"]:
        raise SystemExit(f"Checksum mismatch for {path}: {digest}")
    return path


def main() -> None:
    src = source()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, axes in INSTANCES.items():
        font = instancer.instantiateVariableFont(TTFont(src), axes)
        options = subset.Options()
        # Kerning only. Posters set capitals, which need no substitutions, and
        # opentype.js (used to measure) can't read some of Archivo's GSUB lookups.
        options.layout_features = ["kern"]
        options.name_IDs = ["*"]
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        out = OUT / f"Archivo-{name}.ttf"
        font.save(out)
        print(f"{out}  {out.stat().st_size // 1024} KB  {axes}")
    shutil.copy(CACHE / "OFL.txt", OUT / "OFL.txt")


if __name__ == "__main__":
    main()
