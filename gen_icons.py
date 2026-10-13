from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "icons")

def make_icon(size, path):
    img = Image.new("RGB", (size, size), "#1e3a5f")
    d = ImageDraw.Draw(img)
    pad = int(size * 0.12)
    d.ellipse([pad, pad, size - pad, size - pad], outline="#ffffff", width=max(2, size // 32))
    cx, cy = size // 2, size // 2
    r = size // 2 - pad - size // 20
    import math
    for i in range(12):
        ang = math.radians(i * 30 - 90)
        x1 = cx + math.cos(ang) * (r - size * 0.06)
        y1 = cy + math.sin(ang) * (r - size * 0.06)
        x2 = cx + math.cos(ang) * r
        y2 = cy + math.sin(ang) * r
        d.line([x1, y1, x2, y2], fill="#ffffff", width=max(1, size // 64))
    ang = math.radians(300 - 90)
    hx = cx + math.cos(ang) * (r - size * 0.15)
    hy = cy + math.sin(ang) * (r - size * 0.15)
    d.line([cx, cy, hx, hy], fill="#ffd166", width=max(2, size // 24))
    d.ellipse([cx - size * 0.03, cy - size * 0.03, cx + size * 0.03, cy + size * 0.03], fill="#ffd166")
    img.save(path, "PNG")

make_icon(192, os.path.join(OUT, "icon-192.png"))
make_icon(512, os.path.join(OUT, "icon-512.png"))
print("done")
