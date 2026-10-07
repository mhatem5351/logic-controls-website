"""
Build-only fonts for the Open Graph cards (src/lib/og-render.ts). NOT shipped to browsers.

Static instances of the OFL variable fonts, renamed to private family names (so a system-installed Montserrat can
never be picked instead) and subset. One Han weight only (it also sets the small text on zh cards). Each output gets a `<file>.chars.txt` with every code point it covers;
og-render.ts refuses to render a card whose text has a character outside it (no silent tofu).

Sources (SIL Open Font License 1.1, see OFL-*.txt here), from https://github.com/google/fonts/tree/main/ofl :
  montserrat/Montserrat[wght].ttf, montserrat/Montserrat-Italic[wght].ttf,
  alexandria/Alexandria[wght].ttf, notosanssc/NotoSansSC[wght].ttf

Regenerate (after a zh copy change that adds new Han characters, or to change weights):
  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
  mkdir -p /tmp/ogsrc && cd /tmp/ogsrc && for f in montserrat/Montserrat%5Bwght%5D.ttf montserrat/Montserrat-Italic%5Bwght%5D.ttf \
      alexandria/Alexandria%5Bwght%5D.ttf notosanssc/NotoSansSC%5Bwght%5D.ttf; do \
      curl -sLO "https://github.com/google/fonts/raw/main/ofl/$f"; done
  /tmp/ft/bin/python src/assets/fonts/og/build.py /tmp/ogsrc .        # run from the repo root
"""
import glob, json, sys, urllib.parse
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

src = Path(sys.argv[1])
root = Path(sys.argv[2] if len(sys.argv) > 2 else ".")
out = root / "src/assets/fonts/og"


def source(name):
    for p in (src / name, src / urllib.parse.quote(name)):
        if p.exists():
            return p
    raise SystemExit(f"missing source font {name} in {src}")


def ranges(*rs):
    s = set()
    for a, b in rs:
        s.update(range(a, b + 1))
    return s


LATIN = ranges((0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x2030, 0x203A), (0x2122, 0x2122), (0x2190, 0x2193)) | {
    0x0131, 0x011E, 0x011F, 0x0130, 0x015E, 0x015F, 0x0152, 0x0153, 0x20AC, 0x2212, 0x00D7}
ARABIC = ranges((0x0600, 0x06FF), (0xFE70, 0xFEFC), (0xFB50, 0xFDFF)) | {0x200C, 0x200D, 0x200E, 0x200F}
# Every character of the Chinese copy (all namespaces), so any card text that comes from messages is covered.
zh_text = "".join(Path(f).read_text("utf8") for f in sorted(glob.glob(str(root / "src/i18n/messages/zh/*.json"))))
CJK = {ord(c) for c in zh_text if ord(c) >= 0x2E80} | ranges((0x3000, 0x303F), (0xFF01, 0xFF5E)) | {0x00B7, 0x2014, 0x2026, 0x201C, 0x201D, 0x2018, 0x2019}


def build(file, wght, family, codepoints, name):
    f = TTFont(source(file))
    f = instancer.instantiateVariableFont(f, {"wght": wght}, updateFontNames=False)
    nm = f["name"]
    for rec in list(nm.names):
        if rec.nameID not in (0, 7, 8, 9, 11, 12, 13, 14):
            nm.removeNames(nameID=rec.nameID)
    ps = family.replace(" ", "")
    for nid, val in ((1, family), (2, "Regular"), (3, f"{ps}-Regular"), (4, family), (5, "Version 1.0"), (6, f"{ps}-Regular")):
        nm.setName(val, nid, 3, 1, 0x409)
    os2 = f["OS/2"]
    os2.usWeightClass = 400
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | 0b1000000
    f["head"].macStyle = 0
    if "STAT" in f:
        del f["STAT"]
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.hinting = False
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=codepoints)
    sub.subset(f)
    # Plain TTF: the fontconfig/FreeType inside sharp's libvips does not index WOFF/WOFF2.
    dest = out / f"{name}.ttf"
    f.save(dest)
    cmap = sorted(f.getBestCmap().keys())
    (out / f"{name}.chars.txt").write_text("".join(chr(c) for c in cmap), "utf8")
    print(f"{dest}  {dest.stat().st_size // 1024} KB  {len(cmap)} chars  ({family})")


build("Montserrat-Italic[wght].ttf", 800, "LCOG Latin Display", LATIN, "latin-display")
build("Montserrat[wght].ttf", 600, "LCOG Latin Text", LATIN, "latin-text")
build("Alexandria[wght].ttf", 700, "LCOG Arabic Display", ARABIC | LATIN, "arabic-display")
build("Alexandria[wght].ttf", 500, "LCOG Arabic Text", ARABIC | LATIN, "arabic-text")
build("NotoSansSC[wght].ttf", 700, "LCOG Han Display", CJK | LATIN, "han-display")
