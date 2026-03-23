#!/usr/bin/env python3
"""
Generate installer bitmaps for electron-builder NSIS.
  installer-sidebar.bmp   164 x 314   (MUI welcome/directory left panel)
  uninstaller-sidebar.bmp 164 x 314
  header.bmp              150 x  57   (MUI header image, top-right)
"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON  = os.path.join(ROOT, "icon.png")
OUT   = os.path.dirname(os.path.abspath(__file__))

# ── Palette ─────────────────────────────────────────────────────────────────
BG       = (13,  19,  36)   # #0d1324
MID      = (18,  28,  60)   # #121c3c
BLUE     = (36,  99, 235)   # #2463eb
BLUE_LT  = (99, 155, 255)   # #639bff
WHITE    = (255, 255, 255)
DIM      = (120, 140, 180)  # muted text

def lerp_color(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ════════════════════════════════════════════════════════════════════════════
#  SIDEBAR  164 × 314
# ════════════════════════════════════════════════════════════════════════════
W, H = 164, 314
img  = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# Vertical gradient background
grad = Image.new("RGB", (W, H))
for y in range(H):
    t   = y / (H - 1)
    col = lerp_color(BG, MID, t * 0.85)
    for x in range(W):
        grad.putpixel((x, y), col)
img.paste(grad)
draw = ImageDraw.Draw(img)

# Right-edge accent stripe 3 px
for y in range(H):
    for x in range(W - 3, W):
        t = y / (H - 1)
        col = lerp_color(BLUE, BLUE_LT, 1 - t)
        img.putpixel((x, y), col)

# Subtle horizontal rule at 60 %
rule_y = int(H * 0.60)
for x in range(0, W - 3):
    alpha_fade = min(1.0, (W - 3 - x) / 60)
    col = lerp_color(img.getpixel((x, rule_y)), BLUE, 0.18 * alpha_fade)
    img.putpixel((x, rule_y), col)

# ── Embed the app icon ──────────────────────────────────────────────────────
ICON_SIZE = 72
icon_src  = Image.open(ICON).convert("RGBA")
icon_src  = icon_src.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)

# Glow layer (blurred tinted copy behind icon)
glow = Image.new("RGBA", (ICON_SIZE + 40, ICON_SIZE + 40), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse([10, 10, ICON_SIZE + 30, ICON_SIZE + 30],
                  fill=(36, 99, 235, 80))
glow = glow.filter(ImageFilter.GaussianBlur(12))
gx = (W - 3 - (ICON_SIZE + 40)) // 2
gy = 30
img.paste(glow, (gx, gy), glow)

ix = (W - 3 - ICON_SIZE) // 2
iy = 50
img.paste(icon_src, (ix, iy), icon_src)

# ── "LStack" text using basic bitmap font ───────────────────────────────────
# We use a large-ish truetype if available, else a simple pixel render
try:
    from PIL import ImageFont
    # Try a few system font paths
    FONT_PATHS = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    title_font = None
    sub_font   = None
    for fp in FONT_PATHS:
        if os.path.exists(fp):
            title_font = ImageFont.truetype(fp, 20)
            sub_font   = ImageFont.truetype(fp, 11)
            break

    if title_font:
        txt      = "LStack"
        bbox     = draw.textbbox((0, 0), txt, font=title_font)
        tw       = bbox[2] - bbox[0]
        tx       = (W - 3 - tw) // 2
        ty       = iy + ICON_SIZE + 12
        draw.text((tx, ty), txt, font=title_font, fill=WHITE)

        subtxt   = "Local Dev Stack"
        sbbox    = draw.textbbox((0, 0), subtxt, font=sub_font)
        sw       = sbbox[2] - sbbox[0]
        sx       = (W - 3 - sw) // 2
        sy       = ty + 26
        draw.text((sx, sy), subtxt, font=sub_font, fill=DIM)
except Exception:
    pass  # No font: still looks fine with just the icon

img.save(os.path.join(OUT, "installer-sidebar.bmp"), "BMP")
img.save(os.path.join(OUT, "uninstaller-sidebar.bmp"), "BMP")
print(f"  installer-sidebar.bmp   {W}x{H}")
print(f"  uninstaller-sidebar.bmp {W}x{H}")


# ════════════════════════════════════════════════════════════════════════════
#  HEADER   150 × 57
# ════════════════════════════════════════════════════════════════════════════
HW, HH = 150, 57
hdr = Image.new("RGB", (HW, HH), BG)
for x in range(HW):
    t   = x / (HW - 1)
    col = lerp_color(BG, MID, t * 0.6)
    for y in range(HH):
        hdr.putpixel((x, y), col)

# Bottom accent line 2 px
for x in range(HW):
    t   = x / (HW - 1)
    col = lerp_color(BLUE_LT, BLUE, t)
    hdr.putpixel((x, HH - 2), col)
    hdr.putpixel((x, HH - 1), col)

# Small icon at right side
HICON = 38
hi_src = Image.open(ICON).convert("RGBA")
hi_src = hi_src.resize((HICON, HICON), Image.LANCZOS)
hx = HW - HICON - 8
hy = (HH - HICON) // 2
hdr.paste(hi_src, (hx, hy), hi_src)

hdr.save(os.path.join(OUT, "header.bmp"), "BMP")
print(f"  header.bmp              {HW}x{HH}")
print("Done.")
