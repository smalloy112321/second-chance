"""Build docs/slides/slides.html from slides-source.html. Every IMG:/FONT: path (relative to the repo
root) is embedded as a data URI, and DIAGRAM is replaced by the agent diagram from the report, so the
deck opens by double-clicking with every image showing. reveal.js itself loads from a CDN.
Run from anywhere:  python docs/slides/build_slides.py   (needs Pillow)"""
import base64, io, re
from pathlib import Path
from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MAX_W = 2400  # pixels; sharp on a projector or full-screen laptop

TINT = (232, 234, 246)  # slide background colour of the screenshot boards

def trim_slide(im):
    """Screenshot boards are padded out to 16:9 with plain tint; cut that padding to a thin margin."""
    if max(abs(a - b) for a, b in zip(im.getpixel((0, 0)), TINT)) > 4: return im
    diff = ImageChops.difference(im, Image.new("RGB", im.size, TINT)).convert("L").point(lambda v: 255 if v > 12 else 0)
    box = diff.getbbox()
    if not box: return im
    pad = round(im.width * 0.01)
    return im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))

def img_uri(rel: str) -> str:
    im = Image.open(ROOT / rel)
    if rel.endswith(".png"):
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

report = (ROOT / "docs/report/report-source.html").read_text(encoding="utf-8")
diagram = re.search(r"<svg viewBox=\"0 0 860 560\".*?</svg>", report, re.S).group(0)

src = (HERE / "slides-source.html").read_text(encoding="utf-8")
src = src.replace("<!--DIAGRAM-->", diagram)
src = re.sub(r'IMG:([^"\)]+)', lambda m: img_uri(m.group(1)), src)
src = re.sub(r'FONT:([^\)]+)', lambda m: font_uri(m.group(1)), src)
(HERE / "slides.html").write_text(src, encoding="utf-8")
print("slides.html", round(len(src) / 1e6, 2), "MB")
