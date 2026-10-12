"""Textures for the story assets, painted with PIL (no downloads)."""
import random, math
from PIL import Image, ImageDraw, ImageFilter

def plaster(path, base=(243, 234, 216), size=512, seed=1):
    r = random.Random(seed)
    im = Image.new('RGB', (size, size), base)
    d = ImageDraw.Draw(im)
    for _ in range(9000):
        x, y = r.randrange(size), r.randrange(size)
        k = r.uniform(-14, 10)
        d.point((x, y), fill=tuple(int(max(0, min(255, c + k))) for c in base))
    for _ in range(40):  # soft stains
        x, y, rad = r.randrange(size), r.randrange(size), r.randrange(20, 70)
        ov = Image.new('L', (size, size), 0)
        ImageDraw.Draw(ov).ellipse((x - rad, y - rad, x + rad, y + rad), fill=r.randrange(6, 16))
        ov = ov.filter(ImageFilter.GaussianBlur(rad / 2))
        im = Image.composite(Image.new('RGB', (size, size), tuple(int(c * 0.9) for c in base)), im, ov)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(path, quality=88)

def cells(path, size=512):
    im = Image.new('RGB', (size, size), (205, 212, 220))
    d = ImageDraw.Draw(im)
    n, pad = 6, 4
    cw = (size - pad) / n
    for i in range(n):
        for j in range(n):
            x0, y0 = pad + i * cw, pad + j * cw
            for k in range(int(cw - pad)):
                t = k / (cw - pad)
                col = (int(26 + 16 * t), int(52 + 22 * t), int(102 + 30 * t))
                d.line((x0, y0 + k, x0 + cw - pad, y0 + k), fill=col)
            for b in range(1, 4):  # the thin silver busbars
                bx = x0 + b * (cw - pad) / 4
                d.line((bx, y0, bx, y0 + cw - pad), fill=(150, 165, 185), width=1)
    im.save(path, quality=90)

def wood(path, base=(118, 74, 44), size=256, seed=2):
    r = random.Random(seed)
    im = Image.new('RGB', (size, size), base)
    d = ImageDraw.Draw(im)
    for x in range(size):
        k = math.sin(x * 0.21 + math.sin(x * 0.05) * 3) * 10 + r.uniform(-6, 6)
        d.line((x, 0, x, size), fill=tuple(int(max(0, min(255, c + k))) for c in base))
    im = im.filter(ImageFilter.GaussianBlur(0.7))
    im.save(path, quality=88)

def tin(path, base=(160, 168, 174), size=256, seed=3, rust=0.25):
    r = random.Random(seed)
    im = Image.new('RGB', (size, size), base)
    d = ImageDraw.Draw(im)
    for _ in range(int(60 * rust)):
        x, y = r.randrange(size), r.randrange(size)
        L = r.randrange(10, 70)
        d.rectangle((x, y, x + r.randrange(2, 6), y + L), fill=(150, 90, 55))
    for _ in range(3000):
        x, y = r.randrange(size), r.randrange(size)
        k = r.uniform(-12, 12)
        d.point((x, y), fill=tuple(int(max(0, min(255, c + k))) for c in base))
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    im.save(path, quality=88)

def leaf(path, size=(512, 256), seed=4, dry=False):
    """A banana leaf, transparent around it, torn along the edges as real banana leaves are."""
    r = random.Random(seed)
    W, H = size
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    top, bot = [], []
    for i in range(0, W + 1, 4):
        t = i / W
        w = (H / 2 - 6) * math.sin(math.pi * min(1, t * 1.05 + 0.02)) ** 0.6
        top.append((i, H / 2 - w)); bot.append((i, H / 2 + w))
    d.polygon(top + bot[::-1], fill=(70, 140, 50, 255) if not dry else (150, 128, 70, 255))
    px = im.load()
    for y in range(H):
        for x in range(W):
            if px[x, y][3]:
                t = abs(y - H / 2) / (H / 2)
                g = 1.0 - 0.25 * t + 0.07 * math.sin(x * 0.9 + (1 if y < H / 2 else -1) * y * 0.35)
                c = px[x, y]
                px[x, y] = (int(c[0] * g), int(min(255, c[1] * g)), int(c[2] * g), 255)
    # the veins: slanted lines from the midrib to the edge
    veins = Image.new('RGBA', size, (0, 0, 0, 0)); dv = ImageDraw.Draw(veins)
    for x0 in range(10, W, 7):
        for s in (-1, 1):
            dv.line((x0, H / 2, x0 + 26, H / 2 + s * H / 2), fill=(40, 95, 32, 90), width=1)
    mask = im.split()[3]
    veins.putalpha(Image.composite(veins.split()[3], Image.new('L', size, 0), mask))
    im = Image.alpha_composite(im, veins); d = ImageDraw.Draw(im); px = im.load()
    d.rectangle((0, H / 2 - 4, W, H / 2 + 4), fill=(200, 214, 140, 255) if not dry else (190, 170, 110, 255))  # midrib
    # tears: cuts from the edge toward the midrib
    for _ in range(16):
        x = r.randrange(40, W - 30)
        s = r.choice((-1, 1))
        d.polygon([(x, H / 2 + s * H / 2), (x + r.randrange(3, 8), H / 2 + s * H / 2), (x + 14, H / 2 + s * r.randrange(8, 30))], fill=(0, 0, 0, 0))
    # brown, dry tips
    for x in range(W - 70, W):
        for y in range(H):
            c = px[x, y]
            if c[3]:
                k = (x - (W - 70)) / 70
                px[x, y] = (int(c[0] + (150 - c[0]) * k * 0.7), int(c[1] + (120 - c[1]) * k * 0.7), int(c[2] + (60 - c[2]) * k * 0.7), 255)
    im.save(path)

def kraft(path, size=256, seed=5):
    r = random.Random(seed)
    im = Image.new('RGB', (size, size), (197, 154, 102))
    d = ImageDraw.Draw(im)
    for _ in range(2500):
        x, y = r.randrange(size), r.randrange(size)
        d.line((x, y, x + 1, y + r.randrange(1, 4)), fill=(255, 240, 210) if r.random() < 0.5 else (110, 70, 30))
    im = Image.blend(Image.new('RGB', (size, size), (197, 154, 102)), im, 0.25)
    d = ImageDraw.Draw(im)
    d.rectangle((size / 2 - 20, 0, size / 2 + 20, size), fill=(214, 198, 160))
    d.rectangle((26, 150, 106, 214), fill=(251, 250, 246))
    for i in range(4):
        d.rectangle((34, 162 + i * 12, 74 + (i % 2) * 20, 167 + i * 12), fill=(41, 50, 59))
    im.save(path, quality=88)
