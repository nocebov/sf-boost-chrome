from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = size / 128.0
    rx = max(int(24 * s), 2)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=rx, fill=(1, 118, 211, 255))

    font_size = max(int(60 * s), 8)
    font = None
    for fp in [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]:
        try:
            font = ImageFont.truetype(fp, font_size)
            break
        except Exception:
            pass
    if font is None:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), "SF", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = int(64 * s) - tw // 2 - bbox[0]
    ty = int(82 * s) - th - bbox[1]
    draw.text((tx, ty), "SF", fill=(255, 255, 255, 255), font=font)

    cx, cy, r = int(100 * s), int(28 * s), int(16 * s)
    if r >= 2:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(46, 204, 113, 255))
        p1 = (int(92 * s), int(28 * s))
        p2 = (int(98 * s), int(34 * s))
        p3 = (int(108 * s), int(22 * s))
        sw = max(int(3 * s), 1)
        draw.line([p1, p2, p3], fill=(255, 255, 255, 255), width=sw)

    return img

output_dir = os.path.join(os.path.dirname(__file__), "..", "public")
os.makedirs(output_dir, exist_ok=True)

for sz in [16, 32, 48, 128]:
    icon = create_icon(sz)
    path = os.path.join(output_dir, f"icon-{sz}.png")
    icon.save(path, "PNG", optimize=True)
    print(f"Created {path} ({sz}x{sz})")

print("All icons generated successfully.")
