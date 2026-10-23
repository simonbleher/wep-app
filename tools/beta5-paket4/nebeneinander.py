#!/usr/bin/env python3
"""Zwei Seitenbilder nebeneinander mit Beschriftung: nebeneinander.py links.png rechts.png aus.png "Titel links" "Titel rechts" """
import sys
from PIL import Image, ImageDraw, ImageFont
a, b, out, tl, tr = sys.argv[1:6]
A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
kopf, rand = 34, 12
h = max(A.height, B.height) + kopf
C = Image.new('RGB', (A.width + B.width + 3 * rand, h + rand), (235, 235, 235))
d = ImageDraw.Draw(C)
try:
    schrift = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except OSError:
    schrift = ImageFont.load_default()
d.text((rand, 10), tl, fill=(0, 0, 0), font=schrift)
d.text((A.width + 2 * rand, 10), tr, fill=(0, 0, 0), font=schrift)
C.paste(A, (rand, kopf))
C.paste(B, (A.width + 2 * rand, kopf))
C.save(out)
