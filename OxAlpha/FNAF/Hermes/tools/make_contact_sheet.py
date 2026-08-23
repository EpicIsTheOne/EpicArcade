# make_contact_sheet.py — tile screenshots into labeled grids for single-pass visual QA.
import os, sys
from PIL import Image, ImageDraw

SHOTS = r"C:\Users\Epic\Documents\ChatGPT\Ox model test\FNAF-Hermes\screenshots"
OUT   = os.path.join(SHOTS, "contact")
os.makedirs(OUT, exist_ok=True)

def sheet(prefix, out_name, cols=3, cell=(640, 400)):
    files = sorted(f for f in os.listdir(SHOTS)
                   if f.startswith(prefix) and f.lower().endswith(".png"))
    if not files:
        print("no files for", prefix); return
    rows = (len(files) + cols - 1) // cols
    W, H = cols * cell[0], rows * (cell[1] + 26)
    canvas = Image.new("RGB", (W, H), (10, 12, 16))
    d = ImageDraw.Draw(canvas)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(SHOTS, f)).convert("RGB").resize(cell)
        x, y = (i % cols) * cell[0], (i // cols) * (cell[1] + 26)
        canvas.paste(im, (x, y + 26))
        d.text((x + 6, y + 6), f, fill=(140, 255, 190))
    out = os.path.join(OUT, out_name)
    canvas.save(out)
    print("wrote", out, f"({len(files)} tiles)")

if __name__ == "__main__":
    sheet("vs_", "sheet_vs.png")            # all visual-sweep shots
    sheet("qa_0", "sheet_qa.png", cols=2)   # qa suite shots (menu/monitor/death/blackout)
