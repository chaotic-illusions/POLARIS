#!/usr/bin/env python3
"""Report whether the generated color files match palette-data.js, without writing anything.

tools/build_palette.py regenerates lcars/palette.css and the NAMED table in
trek-padd.js, but it writes in place. A review must not touch the working tree,
so this builds the expected output in memory with the same functions and compares.

Usage (from the repo root):  python .claude/skills/polaris-code-review/check_palette.py
Exit status 1 if either file has drifted.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))
import build_palette as bp  # noqa: E402

source = bp.DATA.read_text(encoding="utf-8")
colors = bp.read_colors(source)
match = bp.PICKS_RE.search(source)
picks = re.findall(r'"([a-z0-9-]+)"', match.group(1)) if match else []
missing = [p for p in picks if p not in colors]

css_ok = bp.CSS.read_text(encoding="utf-8") == bp.build_css(colors, picks)
padd = bp.PADD.read_text(encoding="utf-8")
padd_ok = bool(bp.MARKER_RE.search(padd)) and bp.build_named(colors) in padd

print(f"lcars/palette.css: {'in step' if css_ok else 'DRIFTED from palette-data.js'}")
print(f"trek-padd.js NAMED table: {'in step' if padd_ok else 'DRIFTED from palette-data.js (or markers missing)'}")
if missing:
    print(f"picks not in the color list: {', '.join(missing)}")
sys.exit(0 if css_ok and padd_ok and not missing else 1)
