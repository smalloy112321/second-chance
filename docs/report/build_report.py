"""Build docs/report/report.html from report-source.html: every IMG:/FONT: path (relative to the
repo root) is embedded as a data URI so the report opens by double-clicking, with nothing missing.
Run from anywhere:  python docs/report/build_report.py   (needs Pillow)"""
import base64, io, re
from pathlib import Path
from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MAX_W = 1800  # pixels; sharp in print at page width, small enough to keep the file light

TINT = (232, 234, 246)  # slide background colour

def trim_slide(im):
    """Slides are padded out to 16:9 with plain tint; in the report, cut that padding to a thin margin."""
    if max(abs(a - b) for a, b in zip(im.getpixel((0, 0)), TINT)) > 4: return im
    diff = ImageChops.difference(im, Image.new("RGB", im.size, TINT)).convert("L").point(lambda v: 255 if v > 12 else 0)
    box = diff.getbbox()
    if not box: return im
    pad = round(im.width * 0.02)
    return im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))

def img_uri(rel: str) -> str:
    im = Image.open(ROOT / rel)
    if im.mode in ("RGBA", "LA", "P") and rel.endswith(".png"):
        im = im.convert("RGBA")
        if im.width > MAX_W: im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); mime = "image/png"
    else:
        im = trim_slide(im.convert("RGB"))
        if im.width > MAX_W: im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True); mime = "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()

def font_uri(rel: str) -> str:
    return "data:font/woff2;base64," + base64.b64encode((ROOT / rel).read_bytes()).decode()

src = (HERE / "report-source.html").read_text(encoding="utf-8")
src = re.sub(r'IMG:([^"\)]+)', lambda m: img_uri(m.group(1)), src)
src = re.sub(r'FONT:([^\)]+)', lambda m: font_uri(m.group(1)), src)
(HERE / "report.html").write_text(src, encoding="utf-8")
print("report.html", round(len(src) / 1e6, 2), "MB")
