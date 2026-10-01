#!/usr/bin/env python3
"""
Trim the site's variable Archivo to the widths it uses (ADR 0012).

The Latin file Google Fonts serves covers widths 62-125%. The site only uses
62-100% (--stretch-display, --stretch-label, 85% and normal), so the wider
half of the width axis is dropped: 90 KB down to 63 KB on every first visit,
with identical rendering at every width and weight the site uses (checked
pixel for pixel when this was made).

    python3 scripts/trim-web-font.py

Needs fonttools and brotli (pip install fonttools brotli). Reads the
original from src/assets/fonts/source/ and writes the trimmed file the site
loads. If a design change needs a width over 100%, raise WDTH_MAX, re-run,
and update the font-stretch range in src/styles/fonts.css to match.
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = Path("src/assets/fonts/source/archivo-normal-latin.woff2")
OUT = Path("src/assets/fonts/archivo-normal-latin.woff2")
WDTH_MIN, WDTH_MAX = 62, 100

font = instancer.instantiateVariableFont(TTFont(SOURCE), {"wdth": (WDTH_MIN, WDTH_MAX)})
font.flavor = "woff2"
font.save(OUT)
print(f"{OUT}: {OUT.stat().st_size:,} bytes (from {SOURCE.stat().st_size:,}), width {WDTH_MIN}-{WDTH_MAX}%")
