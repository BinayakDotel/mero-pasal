"""Regenerates the photo-pipeline fixtures (M1 PR 7). Run: python3 e2e/fixtures/make-fixtures.py"""
from pathlib import Path
from PIL import Image, ImageDraw

here = Path(__file__).parent

# Stored sideways like a phone photo: EXIF orientation 6 (display = rotate 90° clockwise).
# The stored LEFT band becomes the displayed TOP. Carries camera + GPS tags that must be stripped.
img = Image.new("RGB", (4000, 3000), (235, 235, 225))
draw = ImageDraw.Draw(img)
draw.rectangle([0, 0, 400, 3000], fill=(200, 30, 30))  # red band on the stored left
for y in range(300, 3000, 300):
    draw.line([(600, y), (3800, y)], fill=(40, 40, 60), width=8)  # "handwriting" lines
exif = Image.Exif()
exif[0x0112] = 6  # Orientation
exif[0x010F] = "Xiaomi"  # Make
exif[0x0110] = "Redmi 15C"  # Model
gps = exif.get_ifd(0x8825)
gps[1], gps[2] = "N", (27.0, 42.0, 30.0)  # latitude (Kathmandu-ish)
gps[3], gps[4] = "E", (85.0, 19.0, 12.0)
img.save(here / "rotated.jpg", "JPEG", quality=85, exif=exif)

# A 50 MP photo, the size the Redmi's main camera can produce.
big = Image.new("RGB", (8160, 6120), (240, 240, 232))
ImageDraw.Draw(big).rectangle([0, 0, 8160, 600], fill=(30, 90, 160))
big.save(here / "huge.jpg", "JPEG", quality=80)
print("wrote rotated.jpg, huge.jpg")
