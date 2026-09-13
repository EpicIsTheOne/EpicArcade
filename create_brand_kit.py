from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

SRC = Path(r"C:\Users\Epic\AppData\Local\Temp\codex-clipboard-e62b0c5b-4ea1-44be-8fa6-706ce66b981e.png")
OUT = Path("ephix-brand-kit")
OUT.mkdir(exist_ok=True)
src = Image.open(SRC).convert("RGBA")
pix = src.load(); w, h = src.size

# Flood-fill only near-black pixels connected to the image edge. This keeps
# internal black counters/gaps that are enclosed by the original artwork.
seen = bytearray(w * h); stack = []
for x in range(w): stack.extend([(x, 0), (x, h - 1)])
for y in range(h): stack.extend([(0, y), (w - 1, y)])
while stack:
    x, y = stack.pop(); i = y*w+x
    if seen[i] or max(pix[x, y][:3]) > 18: continue
    seen[i] = 1
    if x: stack.append((x-1, y))
    if x+1 < w: stack.append((x+1, y))
    if y: stack.append((x, y-1))
    if y+1 < h: stack.append((x, y+1))

cut = src.copy()
for y in range(h):
    for x in range(w):
        if seen[y*w+x]: cut.putpixel((x, y), (0, 0, 0, 0))
alpha = cut.getchannel("A")
master = cut.crop(alpha.getbbox())
master.save(OUT / "ephix-primary-full-transparent.png")

word = cut.crop((45, 325, 1225, 825))
word = word.crop(word.getchannel("A").getbbox())
word.save(OUT / "ephix-logo-without-tagline-transparent.png")

def recolor(img, color):
    out = Image.new("RGBA", img.size, color + (255,))
    out.putalpha(img.getchannel("A"))
    return out

white = recolor(master, (255, 255, 255)); black = recolor(master, (0, 0, 0))
white.save(OUT / "ephix-monochrome-white-transparent.png")
black.save(OUT / "ephix-monochrome-black-transparent.png")

# Favicon uses the existing right-hand X + blue accent, cropped from source.
icon = cut.crop((930, 305, 1225, 860))
icon = icon.crop(icon.getchannel("A").getbbox())
icon = ImageOps.contain(icon, (900, 900), Image.Resampling.LANCZOS)
icon_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
icon_canvas.alpha_composite(icon, ((1024-icon.width)//2, (1024-icon.height)//2))
icon_canvas.save(OUT / "ephix-icon-favicon-transparent.png")

def fit_canvas(img, size, bg=(12, 14, 18, 255), pad=80):
    c = Image.new("RGBA", size, bg)
    f = ImageOps.contain(img, (size[0]-2*pad, size[1]-2*pad), Image.Resampling.LANCZOS)
    c.alpha_composite(f, ((size[0]-f.width)//2, (size[1]-f.height)//2))
    return c

fit_canvas(master, (1600,1600), pad=130).save(OUT / "ephix-square-social-profile.png")
fit_canvas(master, (2400,900), pad=100).save(OUT / "ephix-wide-header.png")
fit_canvas(word, (1200,520), pad=70).save(OUT / "ephix-compact-ui.png")

def transparent_fit(img, size, pad):
    f = ImageOps.contain(img, (size[0]-2*pad, size[1]-2*pad), Image.Resampling.LANCZOS)
    c = Image.new("RGBA", size, (0,0,0,0))
    c.alpha_composite(f, ((size[0]-f.width)//2, (size[1]-f.height)//2))
    return c

transparent_fit(master, (1600,1600), 130).save(OUT / "ephix-square-social-profile-transparent.png")
transparent_fit(master, (2400,900), 100).save(OUT / "ephix-wide-header-transparent.png")
transparent_fit(word, (1200,520), 70).save(OUT / "ephix-compact-ui-transparent.png")

sheet = Image.new("RGB", (2200,1700), (20,23,29)); d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("segoeui.ttf", 30); small = ImageFont.truetype("segoeui.ttf", 22)
except OSError: font = small = ImageFont.load_default()
d.text((90,55), "EPHIX BRAND ASSET KIT", fill=(245,247,250), font=font)
d.text((90,100), "Locked master variations • original artwork preserved", fill=(160,170,184), font=small)
items = [("Primary full logo", master), ("Without tagline", word), ("Monochrome white", white), ("Monochrome black", black), ("Icon / favicon", icon_canvas), ("Square social / profile", Image.open(OUT/"ephix-square-social-profile.png")), ("Wide horizontal / header", Image.open(OUT/"ephix-wide-header.png")), ("Compact UI", Image.open(OUT/"ephix-compact-ui.png"))]
cw, ch = 980, 350
for idx, (label, img) in enumerate(items):
    col, row = idx % 2, idx // 2; x, y = 90+col*1030, 165+row*370
    d.rounded_rectangle((x,y,x+cw,y+ch), radius=18, fill=(31,36,45), outline=(58,67,80), width=2)
    d.text((x+25,y+18), label, fill=(220,226,235), font=small)
    p = ImageOps.contain(img.convert("RGBA"), (cw-50,ch-75), Image.Resampling.LANCZOS)
    px, py = x+(cw-p.width)//2, y+55+(ch-75-p.height)//2
    checker = Image.new("RGB", p.size, (44,49,59)); cd = ImageDraw.Draw(checker)
    for yy in range(0,p.height,24):
        for xx in range(0,p.width,24):
            if ((xx//24)+(yy//24)) % 2 == 0: cd.rectangle((xx,yy,xx+24,yy+24), fill=(58,64,75))
    sheet.paste(checker, (px,py)); sheet.paste(p, (px,py), p)
sheet.save(OUT / "ephix-brand-kit-comparison-sheet.png")
print(f"Wrote {len(list(OUT.glob('*.png')))} PNG assets to {OUT.resolve()}")
