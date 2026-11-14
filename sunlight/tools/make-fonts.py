#!/usr/bin/env python3
"""make-fonts.py — dev-only. Builds sunlight/fonts/ from the open-license
sources. The woff2 files it writes are committed, so the game never needs
this script (or a network) to run.

Four voices, four hands, and the lettering on the things you press (see
README, "Hands"):

  the book   EB Garamond       the novel's cover is lettered in a Garamond;
                               narration, speech, titles, every card
  Gran       Quintessential    an upright italic hand, each letter standing
                               on its own: her pages, her labels
  Wren       Shadows Into      a twelve-year-old's careful ballpoint print:
             Light Two         the last blank page, the map
  the clock  Permanent Marker  hard square capitals: the deadlines, the
                               site-office whiteboard, the moving boxes
  buttons    Fraunces          a fat, soft old-style: toy lettering that is
                               still kin to the Garamond it sits beside

EB Garamond is cut down here rather than taken from a web-font service,
because the Latin subsets those hand out strip what this game is set with:
true small caps, old-style figures, the italic's swash capitals, the two
leaves. Three files come out of it:

  eb-garamond.woff2         the roman
  eb-garamond-italic.woff2  the italic, with its swash capitals
  eb-garamond-caps.woff2    a small-caps face for every label and button:
                            capitals stay capitals, and lower case, figures
                            and punctuation are the drawn small-cap forms
                            (so nothing is ever a shrunken capital)

A Garamond has no bold, and neither does anything you read in this game:
emphasis is italic, and labels are letterspaced small caps, the way a book
does it.

Buttons are the one place something heavier belongs, and Fraunces is a
variable face, so the one cut the buttons use is taken from it here: as
black and as soft as it goes, its "wonk" turned off, at a small optical
size so the joins stay open under an outline.

  fraunces-toy.woff2        the letters, figures and marks a button can say

The other three faces are copied unmodified from their Fontsource packages.

Setup (once, anywhere outside the repo):
    npm i @expo-google-fonts/eb-garamond @fontsource/quintessential \
          @fontsource/shadows-into-light-two @fontsource/permanent-marker \
          @fontsource-variable/fraunces
    pip install fonttools brotli
Run:
    python3 sunlight/tools/make-fonts.py /path/to/node_modules
"""
import os
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "fonts")
SRC = os.path.join("@expo-google-fonts", "eb-garamond")

# Everything the game's words use, and a little more: Basic Latin, the few
# accented letters English borrows, the dashes and quotes the novel is set
# with, the arrows and marks the interface points with, and two leaves.
TEXT = (
    list(range(0x20, 0x7F))
    + [ord(c) for c in "àáâäçèéêëíîïñóôöùúûü"]
    + [0xA0, 0xA9, 0xB0, 0xB7, 0xBD, 0xD7,
       0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2020, 0x2022, 0x2026,
       0x2032, 0x2033, 0x2039, 0x203A, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212,
       0x2248, 0x25BC, 0x25C6, 0x2619, 0x2766]
)
# kern, liga: ordinary good setting. onum + pnum: old-style figures in running
# text (the default figures are tabular lining ones, which is what a counter
# wants). case: punctuation that sits right between capitals. swsh: the
# italic's swash capitals, for the title.
TEXT_FEATURES = ["kern", "liga", "onum", "pnum", "case"]

# The caps face: these characters get their small-cap drawing.
SC = dict(zip("abcdefghijklmnopqrstuvwxyz", ["%s.sc" % c for c in "abcdefghijklmnopqrstuvwxyz"]))
SC.update({
    "0": "zero.sc", "1": "one.sc", "2": "two.sc", "3": "three.sc", "4": "four.sc",
    "5": "five.sc", "6": "six.sc", "7": "seven.sc", "8": "eight.sc", "9": "nine.sc",
    ".": "period.sc", ",": "comma.sc", ":": "colon.sc", ";": "semicolon.sc",
    "!": "exclam.sc", "?": "question.sc", "-": "hyphen.sc", "(": "parenleft.sc",
    ")": "parenright.sc", "'": "quotesingle.sc", "&": "ampersand.sc",
    "%": "percent.sc", "/": "slash.sc", "@": "at.sc", "·": "periodcentered.sc",
})
# ...and these stay as they are drawn.
CAPS_PLAIN = (
    list(range(0x41, 0x5B))
    + [0x20, 0xA0, 0x22, 0x23, 0x2A, 0x2B, 0x3D, 0xD7,
       0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026,
       0x2039, 0x203A, 0x2190, 0x2191, 0x2192, 0x2193, 0x25BC, 0x25C6, 0x2619, 0x2766]
)

# The buttons' face: where on Fraunces's four axes it is cut, and what it can say.
TOY_SRC = "@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"
TOY_AT = {"wght": 900, "SOFT": 100, "WONK": 0, "opsz": 24}
TOY_TEXT = list(range(0x20, 0x7F)) + [0xA0, 0xB7, 0xD7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026]

AS_IS = [
    ("@fontsource/quintessential/files/quintessential-latin-400-normal.woff2", "quintessential.woff2"),
    ("@fontsource/shadows-into-light-two/files/shadows-into-light-two-latin-400-normal.woff2", "shadows-into-light-two.woff2"),
    ("@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2", "permanent-marker.woff2"),
]


def options(features):
    o = subset.Options()
    o.flavor = "woff2"
    o.layout_features = features
    o.hinting = False
    o.notdef_outline = True
    o.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]     # keep the copyright and the license
    o.drop_tables += ["DSIG"]
    return o


def report(dst, font):
    path = os.path.join(OUT, dst)
    font.save(path)
    print("%-30s %5.1f KB  %d glyphs" % (dst, os.path.getsize(path) / 1024, len(font.getGlyphOrder())))


def text_face(nm, src, dst, features):
    font = TTFont(os.path.join(nm, SRC, src))
    s = subset.Subsetter(options(features))
    s.populate(unicodes=TEXT)
    s.subset(font)
    report(dst, font)


def caps_face(nm, src, dst):
    font = TTFont(os.path.join(nm, SRC, src))
    names = set(font.getGlyphOrder())
    missing = [g for g in SC.values() if g not in names]
    if missing:
        sys.exit("the small-cap glyphs have moved: " + ", ".join(missing))
    s = subset.Subsetter(options(["kern"]))
    s.populate(unicodes=CAPS_PLAIN, glyphs=sorted(SC.values()))
    s.subset(font)
    # point each lower-case letter, figure and mark at its small-cap drawing
    for table in font["cmap"].tables:
        if table.isUnicode():
            for ch, glyph in SC.items():
                table.cmap[ord(ch)] = glyph
    report(dst, font)


def toy_face(nm, dst):
    font = instancer.instantiateVariableFont(TTFont(os.path.join(nm, TOY_SRC)), TOY_AT)
    s = subset.Subsetter(options(["kern", "liga"]))
    s.populate(unicodes=TOY_TEXT)
    s.subset(font)
    report(dst, font)


def main():
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        sys.exit(__doc__)
    nm = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    text_face(nm, "400Regular/EBGaramond_400Regular.ttf", "eb-garamond.woff2", TEXT_FEATURES)
    text_face(nm, "400Regular_Italic/EBGaramond_400Regular_Italic.ttf", "eb-garamond-italic.woff2", TEXT_FEATURES + ["swsh"])
    caps_face(nm, "600SemiBold/EBGaramond_600SemiBold.ttf", "eb-garamond-caps.woff2")
    toy_face(nm, "fraunces-toy.woff2")
    for src, dst in AS_IS:
        shutil.copyfile(os.path.join(nm, src), os.path.join(OUT, dst))
        print("%-30s %5.1f KB  (unmodified)" % (dst, os.path.getsize(os.path.join(OUT, dst)) / 1024))


if __name__ == "__main__":
    main()
